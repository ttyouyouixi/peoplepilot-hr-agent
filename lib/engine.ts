import type { AnnotationRecord, Conversation, EvaluationCase, JsonSchema, Plan, PlannerConfig, PromptExperiment, RunResult, Skill, ToolConfig, TraceItem } from "./types";
import { appendMetric, getConversation, getEvaluationSettings, getExperiments, getMcpServers, getPlanner, getSkills, getTools, readData, saveConversation } from "./store";
import { callMcpTool } from "./mcp";

type Json = Record<string, any>;
type Product = { id: string; name: string; category: string; tags: string[]; price: number; stock: number; rating: number; description: string };
type Activity = { id: string; name: string; type: string; threshold?: number; discount?: number; category?: string; rate?: number; enabled: boolean; description: string };
type Coupon = { id: string; name: string; threshold: number; discount: number; category?: string; enabled: boolean; stackable: boolean };

function apiConfig() {
  const key = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
  const base = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || (process.env.DEEPSEEK_API_KEY ? "https://api.deepseek.com/v1" : "https://api.openai.com/v1");
  return { key, base: base.replace(/\/$/, ""), model: process.env.AI_MODEL || process.env.OPENAI_MODEL || (process.env.DEEPSEEK_API_KEY ? "deepseek-chat" : "gpt-4o-mini") };
}

function parseJson(text: string): Json {
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(clean); } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型未返回有效 JSON");
    return JSON.parse(match[0]);
  }
}

function demoModel(skill: Skill, input: any): Json {
  // Local deterministic fallback keeps the copied platform runnable before an API key is configured.
  if (skill.id === "people-management-planner") {
    const mandatory = input?.mandatory_capabilities || { skills: [], tools: [] };
    const query = String(input?.userInput || "");
    const teamIntent = /团队|小组|部门/.test(query);
    const nineBoxIntent = /九宫格|人才盘点/.test(query);
    const performanceIntent = /绩效/.test(query);
    const attendanceIntent = /考勤|加班|请假|出差|迟到|早退/.test(query);
    const sensitiveIntent = /薪酬|工资|奖金|收入|薪资|年终奖/.test(query);
    const strengthsIntent = /优势|长处/.test(query);
    const attentionIntent = /关注|风险|需要注意/.test(query);
    const communicationIntent = /沟通|谈话|反馈/.test(query);
    const actionIntent = /行动计划|下一步|怎么管理/.test(query);
    let selected: string[];
    if (sensitiveIntent) selected = [];
    else if (attendanceIntent) selected = ["attendance.record.query"];
    else if (teamIntent) selected = ["org.structure.query", "employee.profile.query", "attendance.record.query", "performance.record.query", "feedback.360.query", "talent.review.query", "team-summary"];
    else if (nineBoxIntent) selected = ["talent.review.query"];
    else if (performanceIntent) selected = ["performance.record.query", "employee-summary"];
    else if (strengthsIntent) selected = ["performance.record.query", "feedback.360.query", "talent.review.query", "employee-summary"];
    else if (attentionIntent) selected = ["employee.profile.query", "attendance.record.query", "performance.record.query", "feedback.360.query", "talent.review.query", "management-signal"];
    else if (communicationIntent) selected = ["employee.profile.query", "performance.record.query", "feedback.360.query", "employee-summary", "management-signal", "communication-prep"];
    else if (actionIntent) selected = ["employee.profile.query", "performance.record.query", "feedback.360.query", "employee-summary", "management-signal", "action-plan"];
    else selected = ["employee.profile.query", "attendance.record.query", "performance.record.query", "feedback.360.query", "talent.review.query", "employee-summary"];
    return {
      goal: "根据人事数据完成可审计的管理分析与建议",
      reasoning: "本地演示模式：根据问题和已启用能力组装人事管理计划。",
      steps: [
        ...selected.map((capability: string) => ({ capability, type: capability.includes(".") ? "tool" : "skill", purpose: `演示模式执行人事能力 · ${capability}` })),
        ...(mandatory.tools || []).map((capability: string) => ({ capability, type: "tool", purpose: `调用规则 Tool · ${capability}` })),
        ...(mandatory.skills || []).filter((id: string) => id !== "risk-check").map((capability: string) => ({ capability, type: "skill", purpose: `执行必经 Skill · ${capability}` }))
      ]
    };
  }
  if (skill.id === "employee-summary") { const results = Array.isArray(input?.toolResults) ? input.toolResults : []; const profile = results.find((item: Json) => item.toolId === "employee.profile.query")?.output?.employee || {}; const performance = results.find((item: Json) => item.toolId === "performance.record.query")?.output?.records || []; const latest = performance.find((item: Json) => item.status === "evaluated") || performance[0] || {}; const talent = results.find((item: Json) => item.toolId === "talent.review.query")?.output?.records?.[0]; return { summary_scope: input?.summary_scope || "full", sections: input?.sections || [], basic_info: { name: profile.name || "", position: profile.position || "", job_level: profile.level || "", department: profile.team_name || "", manager: profile.manager_name || "", responsibility_summary: latest.work_content || "", talent_summary: latest.overall_comment || "" }, recent_performance: { trend: performance, trend_conclusion: latest.overall_comment || "暂无绩效结论", data_gaps: performance.length ? [] : ["暂无绩效数据"] }, talent_review: talent || null, strengths: latest.strengths || [], development: { improvement_items: latest.weaknesses || [], suggestions: [] }, data_gaps: ["本地演示模式使用结构化数据生成摘要"], evidence_refs: input?.evidence_refs || [] }; }
  if (skill.id === "team-summary") return { team_overview: "团队数据已汇总。", people_changes: [], attention_people: [], data_gaps: [], evidence_refs: input?.evidence_refs || [] };
  if (skill.id === "management-signal") return { signals: [{ title: "需要进一步确认的管理信号", fact: "基于绩效或反馈数据发现待确认事项", severity: "medium" }], overall_attention_level: "medium", limitations: [] };
  if (skill.id === "communication-prep") return { conversation_goal: "基于事实完成一次发展沟通", facts_to_share: [], questions_to_ask: ["你如何看待当前反馈？"], sample_phrases: ["我们先一起确认事实，再讨论支持和下一步。"], phrases_to_avoid: [] };
  if (skill.id === "action-plan") return { actions: [{ action: "安排一次 1:1 并约定复盘时间", owner: "直属 Leader", success_metric: "行动项按期完成" }], requires_hr_review: false };
  if (skill.id === "response-generator") { const query = String(input?.userInput || ""); if (/薪酬|工资|奖金|收入|薪资|年终奖/.test(query)) return { reply: "薪酬及奖金属于保密信息，AI 不提供查询或回复。如有疑问，请联系 HR。" }; const summaries = Array.isArray(input?.summaries) ? input.summaries : []; const tools = Array.isArray(input?.toolResults) ? input.toolResults : []; const attendanceOutput = tools.find((item: Json) => item.toolId === "attendance.record.query")?.output; const attendance = attendanceOutput?.statistics; if (/考勤|加班|请假|出差|迟到|早退/.test(query) && attendance) return { reply: `考勤统计（${`统计范围：${attendanceOutput.time_range?.start} 至 ${attendanceOutput.time_range?.end}`}）\n\n加班：${attendance.overtime_hours || 0} 小时\n请假：${attendance.leave_days || 0} 天\n出差：${attendance.business_trip_days || 0} 天\n迟到：${attendance.late_count || 0} 次\n早退：${attendance.early_leave_count || 0} 次\n缺勤：${attendance.absence_count || 0} 次\n\n以上为指定时间范围内的考勤统计。` }; const talent = tools.find((item: Json) => item.toolId === "talent.review.query")?.output?.records?.[0]; if (/九宫格|人才盘点/.test(query) && talent?.nine_box) return { reply: `人才九宫格\n\n位置：${talent.nine_box.position}\n横轴（绩效）：${talent.nine_box.x_axis.value}\n纵轴（潜力）：${talent.nine_box.y_axis.value}\n\n结论仅基于人才盘点数据，最终管理判断需由 Leader / HR 确认。` }; const summary = summaries.find((item: Json) => item.skillId === "employee-summary")?.output; const team = summaries.find((item: Json) => item.skillId === "team-summary")?.output; if (summary) { const info = summary.basic_info || {}; const sections = summary.sections || []; const performance = summary.recent_performance?.trend_conclusion || "暂无绩效趋势结论"; const strengths = (summary.strengths || []).map((item: any) => typeof item === "string" ? item : item.title || item.summary).filter(Boolean).join("、") || "暂无已确认优势"; const gaps = (summary.development?.improvement_items || []).map((item: any) => typeof item === "string" ? item : item.title || item.fact).filter(Boolean).join("、") || "暂无明确改进项"; if (sections.length === 1 && sections[0] === "recent_performance") return { reply: `绩效情况：${performance}\n\n以上结论仅基于当前可查询数据。` }; if (sections.length === 1 && sections[0] === "strengths") return { reply: `个人优势：${strengths}\n\n以上结论仅基于当前可查询数据。` }; return { reply: `员工个人总结\n\n基本信息：${info.name || "未识别员工"}｜${info.position || "暂无岗位"}｜${info.department || "暂无团队"}\n直接上级：${info.manager || "暂无数据"}\n\n职责概括：${info.responsibility_summary || "暂无职责数据"}\n\n绩效情况：${performance}\n\n个人优势：${strengths}\n\n待改进项：${gaps}\n\n以上结论仅基于当前可查询数据，数据缺口和管理决策需由 Leader / HR 进一步确认。` }; } if (team) return { reply: `团队管理总结\n\n${team.team_overview || "团队数据已完成汇总。"}\n\n结论仅基于当前权限范围内的数据，最终管理判断需由 Leader / HR 确认。` }; return { reply: "已完成数据查询。当前没有足够的结构化分析结果，建议由 Leader / HR 进一步确认。" }; }
  if (skill.id === "risk-check") return { passed: true, risk_level: "low", issues: [], safe_reply: "", requires_human_review: false };
  return { result: "本地演示模式已完成该人事步骤。" };
}

async function callModel(skill: Skill, input: unknown): Promise<Json> {
  const cfg = apiConfig();
  if (!cfg.key) return demoModel(skill, input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS || 10000));
  try {
    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: skill.model && skill.model !== "default" ? skill.model : cfg.model,
        temperature: skill.temperature,
        max_tokens: skill.maxTokens,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: skill.prompt }, { role: "user", content: JSON.stringify(input) }]
      })
    });
    if (!res.ok) throw new Error(`模型 API ${res.status}: ${(await res.text()).slice(0, 180)}`);
    const data = await res.json();
    return parseJson(data.choices?.[0]?.message?.content || "");
  } catch (error) {
    // A configured key should not make the local demo unusable when the provider
    // is unreachable (common with offline development, proxy, or DNS issues).
    if (error instanceof TypeError || (error instanceof Error && error.name === "AbortError")) {
      console.warn(`[ai] ${cfg.base} unavailable; using local demo fallback for ${skill.id}`);
      return demoModel(skill, input);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(toStringList);
  if (typeof value !== "string") return [];
  return value.split(/[,，、;；|/]+/).map(item => item.trim()).filter(Boolean);
}

function normalizeNeed(value: unknown): Json {
  const need = value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
  const budget = typeof need.budget === "number" ? need.budget : Number.parseFloat(String(need.budget ?? ""));
  const quantity = typeof need.quantity === "number" ? need.quantity : Number.parseInt(String(need.quantity ?? ""), 10);
  return {
    ...need,
    taste: toStringList(need.taste),
    categories: toStringList(need.categories),
    constraints: toStringList(need.constraints),
    budget: Number.isFinite(budget) && budget > 0 ? budget : null,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    needs_price: need.needs_price === true || need.needs_price === "true"
  };
}

function validateSchema(value: unknown, schema: JsonSchema | undefined, label: string) {
  if (!schema) return;
  if (schema.type === "object" && (!value || typeof value !== "object" || Array.isArray(value))) throw new Error(`${label} 必须是 JSON object`);
  const object = value as Record<string, unknown>;
  for (const key of schema.required || []) if (object?.[key] === undefined) throw new Error(`${label} 缺少字段：${key}`);
  for (const [key, rule] of Object.entries(schema.properties || {})) {
    const item = object?.[key]; if (item === undefined || item === null || !rule.type) continue;
    const actual = Array.isArray(item) ? "array" : typeof item;
    if (actual !== rule.type) throw new Error(`${label}.${key} 类型应为 ${rule.type}，实际为 ${actual}`);
  }
}

function needsPrice(_input: string) { return false; }
const coreSkillIds = new Set(["employee-summary", "team-summary", "management-signal", "communication-prep", "action-plan", "response-generator", "risk-check"]);

function internalSkill(id: string, prompt: string): Skill {
  return { id, name: id, description: prompt, prompt, model: apiConfig().model, temperature: 0, maxTokens: 900, enabled: true };
}

async function prepareMcpArguments(tool: ToolConfig, userInput: string, ctx: Json) {
  const result = await callModel(internalSkill("mcp_argument_builder", "你是 MCP Tool 参数生成器。严格按照 inputSchema，从用户原话和已有执行上下文生成参数。不得虚构用户未提供的敏感信息。只输出符合 schema 的参数 JSON 对象。"), {
    tool: { name: tool.remoteName, description: tool.description, inputSchema: tool.inputSchema },
    userInput,
    context: { need: ctx.need, products: ctx.products, price: ctx.price, mcpResults: ctx.mcpResults }
  });
  return result;
}

function plannerAsSkill(planner: PlannerConfig): Skill {
  return { id: planner.id, name: planner.name, description: planner.description, prompt: planner.prompt, model: planner.model, temperature: planner.temperature, maxTokens: planner.maxTokens, enabled: planner.enabled };
}

async function buildPlan(userInput: string, skills: Skill[], tools: ToolConfig[], planner: PlannerConfig, history: Conversation["messages"] = []): Promise<Plan> {
  if (!planner.enabled) throw new Error("Planner 已停用，无法生成执行计划。");
  const enabled = new Set(skills.filter(s => s.enabled).map(s => s.id));
  const enabledTools = new Set(tools.filter(tool => tool.enabled).map(tool => tool.id));
  const priceIntent = needsPrice(userInput);
  const decisionTrace: Plan["decisionTrace"] = [
    { stage: "intent", title: "识别任务特征", detail: /团队|小组|部门/.test(userInput) ? "识别为团队管理问题。" : "识别为员工管理问题。", data: { teamIntent: /团队|小组|部门/.test(userInput) } },
    { stage: "availability", title: "读取可用能力", detail: `当前有 ${enabled.size} 个启用 Skill、${enabledTools.size} 个启用 Tool。`, data: { enabledSkills: [...enabled], enabledTools: [...enabledTools] } }
  ];
  if (!enabled.has("risk-check")) throw new Error("risk-check 已停用：按平台规则，无法生成未经风控的最终回复。");
  const requiredSkills = [...new Set([...planner.requiredSkills.filter(id => id !== "risk-check"), "risk-check"])];
  const missingSkills = requiredSkills.filter(id => !enabled.has(id));
  if (missingSkills.length) throw new Error(`必经 Skill 不存在或已停用：${missingSkills.join("、")}`);
  const requiredTools = [...new Set([...planner.baseTools, ...(priceIntent ? planner.priceTools : [])])];
  const missingTools = requiredTools.filter(id => !enabledTools.has(id));
  if (missingTools.length) throw new Error(`必需 Tool 已停用：${missingTools.join("、")}。请在 Tool 管理中启用后重试。`);
  decisionTrace.push({ stage: "policy", title: "注入强制规则", detail: `锁定 ${requiredSkills.length} 个必经 Skill 和 ${requiredTools.length} 个规则 Tool；risk-check 固定为最后一步。`, data: { requiredSkills, requiredTools } });
  const proposed = await callModel(plannerAsSkill(planner), {
    userInput, conversation_history: history.slice(-8),
    available_skills: skills.filter(skill => skill.enabled).map(skill => ({ id: skill.id, name: skill.name, description: skill.description })),
    available_tools: tools.filter(tool => tool.enabled).map(tool => ({ id: tool.id, name: tool.name, description: tool.description, mode: tool.implementation })),
    mandatory_capabilities: { skills: requiredSkills, tools: requiredTools, risk_check_must_be_last: true }
  });
  const proposedSteps = Array.isArray(proposed.steps) ? proposed.steps : [];
  decisionTrace.push({ stage: "model", title: "模型生成候选计划", detail: `Planner 返回 ${proposedSteps.length} 个候选步骤。`, data: { proposedCapabilities: proposedSteps.map(step => String(step?.capability || "").replace(/^\$/, "")) } });
  const mandatory = new Set([...requiredSkills, ...requiredTools]);
  const dynamic: Array<[string, "skill" | "tool", string]> = [];
  const stepMeta = new Map<string, { dependsOn?: string[]; parallelGroup?: string; condition?: string }>();
  const seen = new Set<string>();
  const rejected: string[] = [];
  for (const raw of proposedSteps) {
    const capability = String(raw?.capability || "").replace(/^\$/, "");
    const type = raw?.type === "skill" ? "skill" : raw?.type === "tool" ? "tool" : null;
    if (!type || mandatory.has(capability) || seen.has(capability)) { if (capability && !mandatory.has(capability)) rejected.push(capability); continue; }
    if ((type === "skill" && enabled.has(capability)) || (type === "tool" && enabledTools.has(capability))) {
      dynamic.push([capability, type, String(raw?.purpose || `调用 ${capability}`)]); seen.add(capability);
      stepMeta.set(capability, { dependsOn: Array.isArray(raw?.depends_on) ? raw.depends_on.map(String) : undefined, parallelGroup: typeof raw?.parallel_group === "string" ? raw.parallel_group : undefined, condition: typeof raw?.condition === "string" ? raw.condition : undefined });
    } else rejected.push(capability);
  }
  decisionTrace.push({ stage: "validation", title: "能力白名单校验", detail: `接受 ${dynamic.length} 个动态能力，过滤 ${rejected.length} 个无效或重复建议。`, data: { accepted: dynamic.map(([id]) => id), rejected } });
  const businessRequiredSkills = requiredSkills.filter(id => id !== "risk-check" && id !== "response-generator");
  const firstSkill = businessRequiredSkills[0];
  const trailingSkills = businessRequiredSkills.slice(1);
  const calculationTools = requiredTools.filter(id => id === "calculate_price");
  const lookupTools = requiredTools.filter(id => id !== "calculate_price");
  const trailingWithCalculation = trailingSkills.flatMap(id => [
    [id, "skill", `必经 Skill · $${id}`] as [string, "skill" | "tool", string],
    ...(id === "recommendation-decision" ? calculationTools.map(toolId => [toolId, "tool", `推荐完成后确定性计价 · ${toolId}`] as [string, "skill" | "tool", string]) : [])
  ]);
  const wanted: Array<[string, "skill" | "tool", string]> = [
    ...(firstSkill ? [[firstSkill, "skill", `必经 Skill · $${firstSkill}`] as [string, "skill", string]] : []),
    ...lookupTools.map(id => [id, "tool", `规则要求 · ${id}`] as [string, "tool", string]),
    ...dynamic,
    ...trailingWithCalculation,
    ...(enabled.has("response-generator") ? [["response-generator", "skill", "最终回复组织 · response-generator"] as [string, "skill", string]] : []),
    ["risk-check", "skill", "强制最终风控审核"]
  ];
  const steps = wanted.map(([capability, type, purpose], i) => ({ id: `step_${i + 1}`, capability, type, purpose, ...stepMeta.get(capability) }));
  decisionTrace.push({ stage: "assembly", title: "组装最终计划", detail: `形成 ${steps.length} 个可执行步骤，并将风控置于末尾。`, data: { finalCapabilities: steps.map(step => step.capability) } });
  return { goal: typeof proposed.goal === "string" ? proposed.goal : "生成可审计的人事管理建议", reasoning: typeof proposed.reasoning === "string" ? proposed.reasoning : "Planner 已按启用能力和强制规则生成计划。", decisionTrace, steps };
}

async function executeLocalTool(id: string, ctx: Json): Promise<Json> {
  const inputText = String(ctx.userInput || "");
  const employeeNameMap: Record<string, string> = { "小Z": "M001", "小A": "E001", "小B": "E002", "小C": "E003", "小D": "E004", "小E": "E005", "小F": "E006", "小G": "E007", "小H": "E008", "小甲": "E009", "小乙": "E010", "小丙": "E011", "小丁": "E012" };
  const employeeId = Object.entries(employeeNameMap).find(([name]) => inputText.includes(name))?.[1] || "E001";
  if (id === "employee.profile.query") {
    const employees = await readData<Json[]>("business/employees.json");
    return { employee: employees.find(item => item.employee_id === employeeId) || employees[0] };
  }
  if (id === "attendance.record.query") {
    const records = await readData<Json[]>("business/attendance.json");
    const match = String(ctx.userInput || "").match(/(20\d{2}[-年]\d{1,2}(?:[-月]\d{1,2}日?)?)[至到-](20\d{2}[-年]\d{1,2}(?:[-月]\d{1,2}日?))/);
    const normalizeDate = (value: string) => value.replace(/[年月]/g, "-").replace(/日/g, "").replace(/-$/, "");
    const today = new Date();
    const end = today.toISOString().slice(0, 10);
    const startDate = new Date(today); startDate.setMonth(startDate.getMonth() - 1);
    const start = startDate.toISOString().slice(0, 10);
    const timeRange = match ? { start: normalizeDate(match[1]), end: normalizeDate(match[2]) } : { start, end };
    const scoped = records.filter(item => item.employee_id === employeeId);
    const filtered = scoped.filter(item => { const date = String(item.date); return date >= timeRange.start && date <= timeRange.end; });
    return { time_range: timeRange, statistics: { overtime_hours: filtered.reduce((sum, item) => sum + Number(item.overtime_hours || 0), 0), leave_days: filtered.reduce((sum, item) => sum + Number(item.leave_days || 0), 0), business_trip_days: filtered.reduce((sum, item) => sum + Number(item.business_trip_days || 0), 0), late_count: filtered.filter(item => item.status === "late").length, early_leave_count: filtered.reduce((sum, item) => sum + Number(item.early_leave_count || 0), 0), absence_count: filtered.filter(item => item.status === "absence").length } };
  }
  if (id === "feedback.360.query") {
    const records = await readData<Json[]>("business/feedback-360.json");
    const cycleMatch = String(ctx.userInput || "").match(/20\d{2}-H[12]/i);
    const filtered = records.filter(item => item.employee_id === employeeId && (!cycleMatch || item.cycle.toUpperCase() === cycleMatch[0].toUpperCase()));
    return { dimension_scores: filtered.map(item => ({ dimension: item.dimension, score: item.score })), average_score: filtered.length ? Number((filtered.reduce((sum, item) => sum + Number(item.score || 0), 0) / filtered.length).toFixed(2)) : null, strengths: filtered.filter(item => item.polarity === "positive").map(item => item.content), improvement_suggestions: filtered.filter(item => item.polarity === "negative").map(item => item.content), cycle: cycleMatch?.[0] || null };
  }
  if (id === "performance.record.query") {
    const records = await readData<Json[]>("business/performance.json");
    return { records: (records.filter(item => item.employee_id === employeeId)).map(item => ({ cycle_name: item.cycle, result: item.result, overall_comment: item.overall_comment, strengths: item.strengths || [], weaknesses: item.weaknesses || [], work_content: item.work_content, status: item.status })) };
  }
  if (id === "org.structure.query") return { teams: await readData<Json[]>("business/org-structure.json") };
  if (id === "talent.review.query") {
    const records = await readData<Json[]>("business/talent-reviews.json");
    return { records: records.filter(item => item.employee_id === employeeId).map(item => { const performance = String(item.nine_box).split("_performance")[0]; return { review_cycle: item.review_cycle, nine_box: { position: item.nine_box, x_axis: { name: "绩效", value: performance === "high" ? "高" : performance === "medium" ? "中" : "低" }, y_axis: { name: "潜力", value: item.potential_level === "high" ? "高" : item.potential_level === "medium" ? "中" : "低" } }, succession_pool: item.succession_pool, readiness: item.readiness, updated_at: item.updated_at }; }) };
  }
  throw new Error(`未知人事 Tool: ${id}`);
}

function skillInput(id: string, userInput: string, ctx: Json): Json {
  if (id === "employee-summary") {
    const partial = /绩效|考勤|360|反馈|优势|发展|九宫格|人才盘点|履历|经历/.test(userInput);
    const sections = /绩效/.test(userInput) ? ["recent_performance"] : /360|反馈/.test(userInput) ? ["strengths", "development"] : /优势/.test(userInput) ? ["strengths"] : /发展/.test(userInput) ? ["development"] : /九宫格|人才盘点/.test(userInput) ? ["talent_review"] : undefined;
    return { userInput, summary_scope: partial ? "partial" : "full", sections: sections || ["basic_info", "responsibility", "recent_performance", "talent_review", "strengths", "development"], extra_constraints: [], conversation_history: [], toolResults: ctx.toolResults, skillResults: ctx.skillResults, evidence_refs: ctx.evidence_refs };
  }
  if (["team-summary", "management-signal", "communication-prep", "action-plan"].includes(id)) return { userInput, conversation_history: [], toolResults: ctx.toolResults, skillResults: ctx.skillResults, evidence_refs: ctx.evidence_refs };
  if (id === "response-generator") return { userInput, conversation_history: ctx.history, summaries: ctx.skillResults, toolResults: ctx.toolResults, evidence_refs: ctx.evidence_refs };
  if (id === "risk-check") return { userInput, conversation_history: ctx.history, reply: ctx.reply, toolResults: ctx.toolResults, skillResults: ctx.skillResults, evidence_refs: ctx.evidence_refs };
  return { userInput, context: ctx };
}

export type RunOptions = { sessionId?: string; persistConversation?: boolean; recordMetric?: boolean; retryLimit?: number };

export async function runAgent(userInput: string, options: RunOptions = {}): Promise<RunResult> {
  const requestId = crypto.randomUUID(); const runStarted = Date.now();
  const persistConversation = options.persistConversation !== false; const recordMetric = options.recordMetric !== false;
  const sessionId = options.sessionId || crypto.randomUUID();
  const existingConversation = options.sessionId ? await getConversation(options.sessionId) : undefined;
  const conversation: Conversation = existingConversation || { id: sessionId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
  const [skills, tools, mcpServers, planner, experiments] = await Promise.all([getSkills(), getTools(), getMcpServers(), getPlanner(), getExperiments()]);
  const skillMap = new Map(skills.map(s => [s.id, s]));
  const toolMap = new Map(tools.map(tool => [tool.id, tool]));
  const serverMap = new Map(mcpServers.map(server => [server.id, server]));
  let plan: Plan;
  try { plan = await buildPlan(userInput, skills, tools, planner, conversation.messages); }
  catch (error) {
    if (recordMetric) await appendMetric({ id: crypto.randomUUID(), requestId, createdAt: new Date().toISOString(), success: false, latencyMs: Date.now() - runStarted, stepCount: 0, failedStep: "planner", sessionId });
    throw error;
  }
  const trace: TraceItem[] = []; const ctx: Json = { userInput, toolResults: [], mcpResults: [], skillResults: [], history: conversation.messages.slice(-8), experiments: [] };
  const completed = new Set<string>();
  for (const step of plan.steps) {
    const dependencyNames = step.dependsOn || [];
    const unmet = dependencyNames.filter(dependency => !completed.has(dependency) && !completed.has(plan.steps.find(candidate => candidate.capability === dependency)?.id || ""));
    if (unmet.length) throw new Error(`步骤 ${step.capability} 的依赖未完成：${unmet.join("、")}`);
    if (step.condition && !evaluatePlanCondition(step.condition, userInput, ctx)) {
      trace.push({ ...step, status: "waiting_human", input: {}, output: { skipped: true, reason: `条件未满足：${step.condition}` }, startedAt: new Date().toISOString(), durationMs: 0, attempts: 0 });
      completed.add(step.id); completed.add(step.capability);
      continue;
    }
    const started = Date.now(); let input: Json = step.type === "tool" ? { userInput, need: ctx.need, products: ctx.selectedProducts || ctx.products, activities: ctx.activities, coupons: ctx.coupons } : skillInput(step.capability, userInput, ctx);
    let attempts = 0; const retryLimit = options.retryLimit ?? 1;
    while (attempts <= retryLimit) try {
      attempts += 1;
      let output: Json;
      if (step.type === "tool") {
        const tool = toolMap.get(step.capability);
        if (!tool) throw new Error(`Tool 配置不存在：${step.capability}`);
        if (tool.implementation === "mcp") {
          const server = tool.serverId ? serverMap.get(tool.serverId) : undefined;
          if (!server) throw new Error(`MCP Server 配置不存在：${tool.serverId || "未设置"}`);
          input = await prepareMcpArguments(tool, userInput, ctx);
          validateSchema(input, tool.inputSchema as JsonSchema | undefined, `${tool.id} input`);
          output = await callMcpTool(server, tool.remoteName!, input);
          ctx.mcpResults.push({ toolId: tool.id, toolName: tool.name, output });
        } else output = await executeLocalTool(step.capability, ctx);
      }
      else {
        const skill = skillMap.get(step.capability)!;
        validateSchema(input, skill.inputSchema, `$${skill.id} input`);
        const experiment = experiments.find(item => item.enabled && item.skillId === skill.id);
        const useVariant = Boolean(experiment && Math.random() * 100 < experiment.trafficPercent);
        const activeSkill = useVariant ? { ...skill, prompt: `${skill.prompt}\n\n## Experiment Variant\n${experiment!.variantPrompt}` } : skill;
        output = await callModel(activeSkill, input);
        if (step.capability === "need-extraction") output = normalizeNeed(output);
        validateSchema(output, skill.outputSchema, `$${skill.id} output`);
        if (experiment) ctx.experiments.push({ skillId: skill.id, variant: useVariant ? "variant" : "control" });
      }
      if (step.capability === "need-extraction") {
        ctx.need = output;
      }
      if (step.capability === "query_products") ctx.products = output.products;
      if (step.capability === "query_activities") ctx.activities = output.activities;
      if (step.capability === "query_coupons") ctx.coupons = output.coupons;
      if (step.capability === "calculate_price") ctx.price = output;
      if (step.type === "tool") ctx.toolResults.push({ toolId: step.capability, output });
      if (step.capability === "recommendation-decision") { ctx.decision = output; ctx.selectedProducts = (ctx.products || []).filter((p: Product) => (output.recommended_product_ids || []).includes(p.id)); }
      if (step.capability === "recommendation-reason") ctx.reasons = output.reasons;
      if (step.capability === "response-generator") {
        ctx.reply = output.reply;
        const asksForManagement = /怎么管理|下一步|行动计划|需要关注/.test(userInput);
        const signal = ctx.skillResults.find((item: Json) => item.skillId === "management-signal")?.output;
        const action = ctx.skillResults.find((item: Json) => item.skillId === "action-plan")?.output;
        if (asksForManagement && (signal || action)) {
          const signals = (signal?.signals || []).map((item: Json) => item.title || item.fact).filter(Boolean).join("；") || "暂无需要立即处理的已确认信号";
          const actions = (action?.actions || []).map((item: Json) => item.action || item.description).filter(Boolean).join("；") || "建议由 Leader / HR 结合事实安排一次确认沟通";
          ctx.reply += `\n\n管理关注事项：${signals}\n\n下一步建议：${actions}`;
        }
      }
      if (step.capability === "risk-check") ctx.risk = output;
      if (step.capability === "human-handoff-decision") ctx.handoffDecision = output;
      if (step.type === "skill" && !["response-generator", "risk-check"].includes(step.capability)) ctx.skillResults.push({ skillId: step.capability, output });
      trace.push({ ...step, status: "success", input, output, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, attempts });
      completed.add(step.id); completed.add(step.capability);
      break;
    } catch (error) {
      if (attempts <= retryLimit) continue;
      trace.push({ ...step, status: "failed", input, output: { error: error instanceof Error ? error.message : String(error) }, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, attempts });
      if (recordMetric) await appendMetric({ id: crypto.randomUUID(), requestId, createdAt: new Date().toISOString(), success: false, latencyMs: Date.now() - runStarted, stepCount: trace.length, failedStep: step.capability, sessionId, experiments: ctx.experiments });
      throw Object.assign(new Error(`步骤 ${step.capability} 执行失败（已重试 ${attempts - 1} 次）`), { trace, cause: error, sessionId });
    }
  }
  const risk = ctx.risk || { passed: false, risk_level: "high", issues: ["风控未执行"] };
  const finalReply = risk.passed ? ctx.reply : risk.safe_reply || "抱歉，回复未通过风控审核。";
  const handoffDecision = ctx.handoffDecision as Json | undefined;
  const handoff = {
    required: handoffDecision?.required === true || risk.risk_level === "high" || !risk.passed,
    reason: handoffDecision?.reasons?.join("；") || risk.issues?.join("；") || undefined
  };
  if (persistConversation) {
    conversation.updatedAt = new Date().toISOString(); conversation.messages.push({ role: "user", content: userInput, at: new Date().toISOString() }, { role: "assistant", content: finalReply, at: new Date().toISOString() });
    await saveConversation(conversation);
  }
  if (recordMetric) await appendMetric({ id: crypto.randomUUID(), requestId, createdAt: new Date().toISOString(), success: true, latencyMs: Date.now() - runStarted, stepCount: trace.length, riskLevel: risk.risk_level, sessionId, experiments: ctx.experiments });
  return { requestId, mode: "ai", userInput, plan, executionTrace: trace, finalReply, risk, sessionId, handoff, experiments: ctx.experiments };
}

function evaluatePlanCondition(condition: string, userInput: string, ctx: Json) {
  if (/team|团队|小组|部门/i.test(condition)) return /团队|小组|部门/.test(userInput);
  if (/employee|员工|个人/i.test(condition)) return !/团队|小组|部门/.test(userInput);
  if (/has[_ -]?360|有.?360/i.test(condition)) return ctx.toolResults.some((item: Json) => item.toolId === "feedback.360.query" && item.output?.average_score !== null);
  return true;
}

export async function testSkill(skill: Skill, input: string) {
  const parsed = (() => { try { return JSON.parse(input); } catch { return { userInput: input, reply: input }; } })();
  const started = Date.now();
  const output = await callModel(skill, parsed);
  return { mode: "ai", output, durationMs: Date.now() - started };
}

export async function generateSkillDraft(request: string): Promise<Skill> {
  if (!request.trim()) throw new Error("请描述希望创建的 Skill 能力");
  const existing = await getSkills();
  const creator: Skill = {
    id: "create-skill",
    name: "Create Skill",
    description: "Generate a standard agent Skill draft.",
    prompt: "你是 Create Skill 设计器。把用户的自然语言需求转换为简洁、可复用的标准 Agent Skill。名称必须使用64字符以内的英文小写连字符格式，并避免 existing_skill_ids；description 必须同时说明能力和触发场景；instructions 使用命令式语言，包含工作流、事实边界、失败处理和明确 JSON 输出约定，不要包含 YAML frontmatter，不要创建 README 或无关文件。输出 JSON：id、display_name、description、instructions、temperature、max_tokens。",
    model: "default",
    temperature: 0.2,
    maxTokens: 1800,
    enabled: true
  };
  const result = await callModel(creator, { request, existing_skill_ids: existing.map(skill => skill.id), platform: "零食电商客服 Plan + Skill 执行平台" });
  const rawId = String(result.id || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 64);
  const id = rawId || `custom-skill-${Date.now().toString(36)}`;
  const temperature = Number(result.temperature);
  const maxTokens = Number(result.max_tokens);
  return {
    id,
    name: String(result.display_name || id),
    description: String(result.description || request).slice(0, 1024).replace(/[<>]/g, ""),
    prompt: String(result.instructions || "# Skill Instructions\n\nProcess the request and return one JSON object."),
    model: "default",
    temperature: Number.isFinite(temperature) ? Math.min(1, Math.max(0, temperature)) : 0.2,
    maxTokens: Number.isFinite(maxTokens) ? Math.min(4000, Math.max(100, Math.round(maxTokens))) : 800,
    enabled: true
  };
}

export async function generatePromptSuggestion(payload: unknown) {
  const skill: Skill = {
    id: "prompt-improvement-advisor",
    name: "Prompt 改进建议生成器",
    description: "Generate Prompt improvement suggestions from annotations and quality signals.",
    prompt: "你是零食电商客服 Agent 的 Prompt 优化顾问。根据输入中的改进建议、六维质量低分、Bad Case 和标注样本，输出可复制的 Prompt 修改建议。不要编造不存在的数据。输出 JSON：summary、target_skills（数组）、planner_rules（数组）、skill_prompt_patches（数组，每项含 skill_id、reason、patch_text）、eval_followups（数组）。",
    model: "default",
    temperature: 0.2,
    maxTokens: 1800,
    enabled: true
  };
  return callModel(skill, payload);
}

export async function generateSkillDraftFromAnnotation(record: AnnotationRecord): Promise<Skill> {
  const dimensions = Object.entries(record.qualityDimensions || {}).map(([key, value]) => `${key}:${value.score}/5 ${value.note || ""}`).join("；");
  return generateSkillDraft(`基于这条人工标注生成一个可复用 Skill 草案。客户问题：${record.input}\n模型当时回复：${record.modelResponse}\n人工期望回复：${record.expectedResponse}\n意图：${record.intentLabel}\n风险等级：${record.riskLevel}\n质量标签：${record.qualityLabel}\n六维质量：${dimensions}\n必经能力：${record.requiredCapabilities.join(",")}\n期望事实：${record.expectedFacts.join(",")}\n禁用表述：${record.forbiddenPhrases.join(",")}\n备注：${record.notes}`);
}

export async function explainArtifact(type: "agent" | "planner", payload: unknown) {
  const explainer: Skill = {
    id: "execution-explainer",
    name: "执行解释器",
    description: "Explain auditable Agent and Planner artifacts.",
    prompt: type === "agent"
      ? "你是 Agent 执行解释器。仅根据输入中的 plan、executionTrace、risk 和 finalReply，用清晰中文解释：任务目标、为何调用主要 Skill/Tool、价格与优惠的数据来源、是否发生重试、风控结果和用户可以如何核验。不要补造事实，不输出隐藏思维链。输出 JSON：summary、sections（title、content 数组）、verification_tips。"
      : "你是 Planner 配置解释器。仅根据输入中的 Planner 配置、decisionTrace 和 plan，用清晰中文解释：规划目标、必经能力、价格规则、模型候选、白名单过滤和最终顺序。指出安全兜底，但不要输出隐藏思维链。输出 JSON：summary、sections（title、content 数组）、verification_tips。",
    model: "default", temperature: 0.2, maxTokens: 1200, enabled: true
  };
  return callModel(explainer, payload);
}

export async function judgeEvaluation(item: EvaluationCase, run: RunResult) {
  if (!item.judgeCriteria.trim()) return undefined;
  const settings = await getEvaluationSettings();
  const judge = internalSkill("eval-response-judge", settings.judgePrompt);
  const toolEvidence = run.executionTrace.filter(step => step.type === "tool").map(step => ({ capability: step.capability, output: step.output }));
  const output = await callModel(judge, { userInput: item.input, finalReply: run.finalReply, criteria: item.judgeCriteria, toolEvidence });
  const score = Math.max(0, Math.min(100, Math.round(Number(output.score) || 0)));
  return { score, issues: Array.isArray(output.issues) ? output.issues.map(String).slice(0, 8) : [] };
}

export async function testPlanner(planner: PlannerConfig, userInput: string) {
  const [skills, tools] = await Promise.all([getSkills(), getTools()]);
  return buildPlan(userInput, skills, tools, planner);
}

export function getAiStatus() { const cfg = apiConfig(); return { configured: Boolean(cfg.key), mode: cfg.key ? "ai" : "demo", model: cfg.model, baseUrl: cfg.base }; }
