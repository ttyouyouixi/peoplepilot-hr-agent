"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import AnnotationWorkspace from "@/components/AnnotationWorkspace";
import HumanReviewWorkspace from "@/components/HumanReviewWorkspace";
import ImprovementCenter from "@/components/ImprovementCenter";
import JudgePromptEditor from "@/components/JudgePromptEditor";
import type { EvaluationCase, EvaluationResult, PromptExperiment, ServiceRating, Skill, VersionSnapshot } from "@/lib/types";

const split = (value: string) => value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean);
const emptyCase = (): EvaluationCase => ({
  id: crypto.randomUUID(), name: "新评测用例", input: "请输入员工或团队管理问题", expectedKeywords: [], enabled: true, tags: [], judgeCriteria: "",
  assertions: { expectedCapabilities: [], forbiddenCapabilities: [], expectedFacts: [], forbiddenPhrases: [], riskMustPass: true, maxLatencyMs: 30000 }
});
const layerLabels: Record<string, string> = { planner: "Planner", skills: "Skill", tools: "Tool", response: "回复", risk: "风控", performance: "性能" };
const scoreText = (score: number) => score <= 1 ? "Bad Case" : score <= 3 ? "需关注" : "满意";
const scoringMethodOverview = [
  { id: "exact_match", title: "精准匹配", desc: "检查关键点、Tool 事实、禁用表述和能力调用是否精确命中，适合强规则回归。", weight: "回复层 55% / 无 Judge 时 100%" },
  { id: "cosine_similarity", title: "余弦相似度", desc: "把期望答案和实际回复转成词袋/字符向量，观察表达接近程度。", weight: "辅助诊断，不进总分" },
  { id: "llm_as_judge", title: "LLM-as-Judge", desc: "配置 Judge 标准后，由模型评估相关性、完整性、事实准确性和表达质量。", weight: "回复层 45%" },
  { id: "human_review", title: "人工评估", desc: "Bad Case、服务低分和标注审核形成的人审结论，用来沉淀更高质量的回归用例。", weight: "人工复核，不自动进机器分" }
] as const;
const qualityDimensionLabels = { correctness: "正确性", relevance: "相关性", completeness: "完整性", safety: "安全性", tone: "语气", overall: "整体质量" } as const;
const expectedAnswer = (item: EvaluationCase) => {
  const parts = [
    item.expectedKeywords.length ? `回复关键点：${item.expectedKeywords.join("、")}` : "",
    item.assertions.expectedFacts.length ? `必须包含事实：${item.assertions.expectedFacts.join("、")}` : "",
    item.judgeCriteria ? `Judge 标准：${item.judgeCriteria}` : ""
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : "未配置期望答案；可展开后补充回复关键点、Tool 事实或 LLM Judge 标准。";
};
const evalDimensions = (item: EvaluationCase) => [
  "评分方法：精准匹配",
  expectedText(item) ? "评分方法：余弦相似度" : "余弦相似度待补期望答案",
  item.judgeCriteria ? "评分方法：LLM-as-Judge" : "LLM Judge 未启用",
  "评分方法：人工评估",
  ...item.assertions.expectedCapabilities.map(value => `期望能力：${value}`),
  ...item.assertions.forbiddenCapabilities.map(value => `禁止能力：${value}`),
  ...item.assertions.forbiddenPhrases.map(value => `禁用表述：${value}`),
  item.assertions.riskMustPass ? "风控必须通过" : "风控非强制",
  `最大延迟：${item.assertions.maxLatencyMs}ms`,
  ...(item.qualityDimensions ? (Object.entries(item.qualityDimensions).map(([key, value]) => `${qualityDimensionLabels[key as keyof typeof qualityDimensionLabels]}：${value.score}/5`)) : [])
];
function expectedText(item: EvaluationCase) {
  return [item.expectedKeywords.join(" "), item.assertions.expectedFacts.join(" "), item.judgeCriteria].filter(Boolean).join(" ");
}

function EvalRunCard({ result, item, onRerun, busy }: { result: EvaluationResult; item?: EvaluationCase; onRerun: (id: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false); const [openSteps, setOpenSteps] = useState<string[]>([]);
  const scores = result.layerScores || { planner: 0, skills: 0, tools: 0, response: 0, risk: 0, performance: 0 };
  return <article className={`eval-run-card ${result.passed ? "pass" : "bad"}`}>
    <div className="eval-run-head"><button className="eval-run-score" onClick={() => setOpen(value => !value)}><strong>{result.score}</strong><small>{result.passed ? "PASS" : "BAD CASE"}</small></button><div><h3>{item?.name || `已删除用例 · ${result.caseId}`}</h3><p>{new Date(result.createdAt).toLocaleString()} · {result.latencyMs}ms · {result.capabilityPath?.length || 0} 步</p></div><div className="eval-run-actions"><button className="secondary compact" onClick={() => setOpen(value => !value)}>{open ? "收起" : "查看过程"}</button>{item && <button className="secondary compact" disabled={busy} onClick={() => onRerun(item.id)}>{busy ? "重跑中…" : "重跑"}</button>}</div></div>
    <div className="eval-part-title">Part 1 · 最终结果质量</div><div className="layer-scores eval-score-part">{(["response"] as const).map(key => <span className={scores[key] >= 80 ? "pass" : "fail"} key={key}><b>{layerLabels[key]}</b>{scores[key]}</span>)}</div>
    <div className="eval-part-title">Part 2 · Agent 执行质量</div><div className="layer-scores eval-score-part">{(["planner", "skills", "tools", "performance"] as const).map(key => <span className={scores[key] >= 80 ? "pass" : "fail"} key={key}><b>{layerLabels[key]}</b>{scores[key]}</span>)}</div>
    <div className="eval-part-title">Part 3 · 质量门槛</div><div className="eval-gates"><span className={result.risk?.passed !== false ? "pass" : "fail"}>● 风控{result.risk?.passed !== false ? "通过" : "未通过"}</span><span className={result.issues.length ? "fail" : "pass"}>● 断言{result.issues.length ? `发现 ${result.issues.length} 个问题` : "通过"}</span><span className={result.capabilityPath.at(-1) === "risk-check" ? "pass" : "fail"}>● 最终风控步骤{result.capabilityPath.at(-1) === "risk-check" ? "正确" : "异常"}</span></div>
    {open && <div className="eval-run-detail">
      <div className="eval-run-columns"><div><label>评测输入</label><p>{item?.input || "用例已删除"}</p></div><div><label>最终回复</label><p>{result.finalReply || "本次执行未产生最终回复"}</p></div></div>
      {item && <div className="eval-plan-compare"><div><label>期望 Plan</label><p>{item.assertions.expectedCapabilities.join(" → ") || "未配置"}</p></div><div><label>实际 Plan</label><p>{result.capabilityPath.join(" → ") || "未产生"}</p></div><div><label>Plan 对比</label><p>{item.assertions.expectedCapabilities.every((capability, index) => result.capabilityPath[index] === capability) && result.capabilityPath.length === item.assertions.expectedCapabilities.length ? "顺序与能力完全一致" : `缺失：${item.assertions.expectedCapabilities.filter(capability => !result.capabilityPath.includes(capability)).join("、") || "无"}；多余：${result.capabilityPath.filter(capability => !item.assertions.expectedCapabilities.includes(capability)).join("、") || "无"}`}</p></div></div>}
      <div className="scoring-methods-detail"><div className="eval-trace-title">评分方法 <span>{result.scoringMethods?.length ? "本次明细" : "历史结果无明细，重跑后生成"}</span></div>{result.scoringMethods?.length ? result.scoringMethods.map(method => <div className={`scoring-method-row ${method.enabled ? "enabled" : "disabled"}`} key={method.id}><div><strong>{method.name}</strong><small>{method.enabled ? "已启用" : "未启用"}{typeof method.weight === "number" ? ` · 权重 ${method.weight}%` : ""}</small></div><span>{typeof method.score === "number" ? `${method.score}` : "—"}</span><p>{method.evidence}</p>{method.details.length > 0 && <ul>{method.details.map(detail => <li key={detail}>{detail}</li>)}</ul>}</div>) : <div className="eval-no-trace">这是旧评测结果，重跑后可看到精准匹配、余弦相似度、LLM-as-Judge 和人工评估明细。</div>}</div>
      <div className={`eval-diagnosis ${result.issues.length ? "has-issues" : ""}`}><strong>{result.issues.length ? `发现 ${result.issues.length} 个问题` : "所有断言均通过"}</strong><p>{result.issues.length ? result.issues.join("；") : "Planner、Tool、回复和风控均符合当前评测规则。"}</p></div>
      <div className="eval-trace"><div className="eval-trace-title">执行过程 <span>{result.requestId?.slice(0, 8) || "no request id"}</span></div>{result.trace?.length ? result.trace.map((step, index) => { const stepKey = `${result.id}-${step.id}`; const stepOpen = openSteps.includes(stepKey); return <div className={`eval-trace-step ${step.status}`} key={stepKey}><button onClick={() => setOpenSteps(current => current.includes(stepKey) ? current.filter(value => value !== stepKey) : [...current, stepKey])}><i>{step.status === "success" ? "✓" : "!"}</i><span><b>{index + 1}. {step.type === "skill" ? "$" : ""}{step.capability}</b><small>{step.purpose}</small></span><em>{step.attempts && step.attempts > 1 ? `重试 ${step.attempts - 1} · ` : ""}{step.durationMs}ms　{stepOpen ? "−" : "+"}</em></button>{stepOpen && <div className="eval-trace-json"><div><label>Input JSON</label><pre>{JSON.stringify(step.input, null, 2)}</pre></div><div><label>Output JSON</label><pre>{JSON.stringify(step.output, null, 2)}</pre></div></div>}</div>; }) : <div className="eval-no-trace">这是升级 Eval V2 前的历史结果，未保存执行轨迹；重跑后即可查看。</div>}</div>
    </div>}
  </article>;
}

export default function OpsPage() {
  const [tab, setTab] = useState<"monitor" | "improve" | "human" | "ratings" | "evalset" | "eval" | "annotation" | "versions" | "ab">("monitor");
  const [metrics, setMetrics] = useState<any>(null); const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [cases, setCases] = useState<EvaluationCase[]>([]); const [results, setResults] = useState<EvaluationResult[]>([]);
  const [experiments, setExperiments] = useState<PromptExperiment[]>([]); const [skills, setSkills] = useState<Skill[]>([]);
  const [ratings, setRatings] = useState<ServiceRating[]>([]); const [ratingSummary, setRatingSummary] = useState<any>(null);
  const [busy, setBusy] = useState(""); const [message, setMessage] = useState(""); const [expanded, setExpanded] = useState<string[]>([]);
  const [evalView, setEvalView] = useState<"runs" | "bad">("runs");

  async function load() {
    const [m, v, e, x, s, r] = await Promise.all([fetch("/api/metrics").then(r => r.json()), fetch("/api/versions").then(r => r.json()), fetch("/api/evaluations").then(r => r.json()), fetch("/api/experiments").then(r => r.json()), fetch("/api/skills").then(r => r.json()), fetch("/api/ratings").then(r => r.json())]);
    setMetrics(m); setVersions(v); setCases(e.cases); setResults(e.results); setExperiments(x); setSkills(s); setRatings(r.ratings || []); setRatingSummary(r.summary);
  }
  useEffect(() => { void load(); }, []);

  const latestResults = useMemo(() => new Map(cases.map(item => [item.id, results.find(result => result.caseId === item.id)])), [cases, results]);
  const summary = useMemo(() => {
    const latest = [...latestResults.values()].filter(Boolean) as EvaluationResult[];
    return { total: cases.length, run: latest.length, passRate: latest.length ? Math.round(latest.filter(item => item.passed).length / latest.length * 100) : 0, average: latest.length ? Math.round(latest.reduce((sum, item) => sum + item.score, 0) / latest.length) : 0 };
  }, [cases.length, latestResults]);
  const caseMap = useMemo(() => new Map(cases.map(item => [item.id, item])), [cases]);
  const activeResults = useMemo(() => results.filter(result => caseMap.has(result.caseId)), [results, caseMap]);
  const orphanResults = useMemo(() => results.filter(result => !caseMap.has(result.caseId)), [results, caseMap]);
  const badCases = useMemo(() => ([...latestResults.values()].filter(result => result && !result.passed) as EvaluationResult[]), [latestResults]);

  async function rollback(id: string) { setBusy(id); const response = await fetch("/api/versions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); setMessage(response.ok ? "已回滚，重新加载配置后生效" : "回滚失败"); await load(); setBusy(""); }
  async function runEval(id: string, quiet = false) {
    if (!quiet) setBusy(id);
    try {
      const response = await fetch("/api/evaluations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "评测失败");
      if (!quiet) { setMessage(`评测完成：${data.result.score} 分`); await load(); setEvalView(data.result.passed ? "runs" : "bad"); }
      return data.result as EvaluationResult;
    } finally { if (!quiet) setBusy(""); }
  }
  async function runAll() {
    const enabled = cases.filter(item => item.enabled); if (!enabled.length) return;
    setBusy("batch"); let completed = 0;
    try {
      for (const item of enabled) { setMessage(`正在评测 ${completed + 1}/${enabled.length}：${item.name}`); await runEval(item.id, true); completed += 1; }
      setMessage(`批量评测完成：${completed} 条`); await load(); setEvalView("runs");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(""); }
  }
  async function saveCases() { const response = await fetch("/api/evaluations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cases) }); const data = await response.json(); setMessage(response.ok ? "评测集已保存" : data.error); if (response.ok) setCases(data.cases); }
  async function addExperiment() { const skill = skills[0]; if (!skill) return; await fetch("/api/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "新 Prompt A/B", skillId: skill.id, variantPrompt: "在保持事实准确的前提下，让表达更简洁。", trafficPercent: 50 }) }); await load(); }
  async function saveExperiments() { await fetch("/api/experiments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(experiments) }); setMessage("A/B 实验已保存"); }
  const updateCase = (index: number, patch: Partial<EvaluationCase>) => setCases(current => current.map((value, position) => position === index ? { ...value, ...patch } : value));
  const updateAssertion = (index: number, patch: Partial<EvaluationCase["assertions"]>) => setCases(current => current.map((value, position) => position === index ? { ...value, assertions: { ...value.assertions, ...patch } } : value));
  const updateExperiment = (index: number, patch: Partial<PromptExperiment>) => setExperiments(current => current.map((value, position) => position === index ? { ...value, ...patch } : value));

  return <div className="shell"><Header/><main className="page">
    <div className="hero-row"><div><div className="eyebrow">Agent operations</div><h1>运营与质量中心</h1><p className="sub">把配置变更、分层评测、运行指标和 Prompt 实验放在同一条反馈回路里。</p></div></div>
    {message && <div className="save-banner">{message}</div>}
    <div className="ops-tabs">{[["monitor", "运行监控"], ["improve", "改进建议"], ["human", "人工评估"], ["ratings", "服务评分"], ["evalset", "评测集"], ["eval", "评测中心"], ["annotation", "数据标注"], ["versions", "版本回滚"], ["ab", "Prompt A/B"]].map(([id, label]) => <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id as any)}>{label}</button>)}</div>

    {tab === "monitor" && <><div className="metric-grid"><div className="metric-card"><span>总运行</span><strong>{metrics?.summary?.total || 0}</strong></div><div className="metric-card"><span>成功率</span><strong>{metrics?.summary?.successRate || 0}%</strong></div><div className="metric-card"><span>平均耗时</span><strong>{metrics?.summary?.avgLatency || 0}ms</strong></div><div className="metric-card"><span>人工接管率</span><strong>{metrics?.summary?.handoffRate || 0}%</strong></div></div><section className="card data-section"><div className="panel-title">最近运行</div><div className="simple-table"><div className="table-row head"><span>时间</span><span>状态</span><span>步骤</span><span>耗时</span></div>{metrics?.metrics?.map((metric: any) => <div className="table-row" key={metric.id}><span>{new Date(metric.createdAt).toLocaleString()}</span><span>{metric.success ? "成功" : "失败"}</span><span>{metric.stepCount}{metric.failedStep ? ` · ${metric.failedStep}` : ""}</span><span>{metric.latencyMs}ms</span></div>)}</div></section></>}

    {tab === "improve" && <ImprovementCenter/>}
    {tab === "human" && <HumanReviewWorkspace/>}

    {tab === "ratings" && <>
      <div className="rating-summary"><div><span>评分总数</span><strong>{ratingSummary?.total || 0}</strong></div><div><span>平均分</span><strong>{ratingSummary?.average || 0}</strong></div><div><span>1 分 Bad Case</span><strong>{ratingSummary?.badCases || 0}</strong></div><div><span>最近评分</span><strong>{ratings[0]?.score ? `${ratings[0].score}分` : "—"}</strong></div></div>
      <section className="card data-section rating-section"><div className="section-actions"><div><div className="panel-title">服务评分与 QA 对</div><div className="panel-kicker">Agent 判断流程结束或 90 秒无继续发言后自动弹出；1 分已自动进入数据标注 Bad Case 队列</div></div><button className="secondary" onClick={() => void load()}>刷新</button></div>
        <div className="rating-list">{ratings.length ? ratings.map(rating => <article className={`rating-card score-${rating.score}`} key={rating.id}>
          <div className="rating-card-head"><div><span className="rating-score">{rating.score} ★</span><strong>{scoreText(rating.score)}</strong><small>{new Date(rating.createdAt).toLocaleString()} · {rating.source === "demo" ? "Demo 用户端" : "Agent 工作台"} · {rating.sessionId?.slice(0, 8) || "无会话"}</small></div>{rating.score === 1 && <em>已入 Bad Case</em>}</div>
          {rating.feedback && <p className="rating-feedback">用户反馈：{rating.feedback}</p>}
          <div className="rating-qa">{rating.qaPairs.map((pair, index) => <div key={`${rating.id}-${index}`}><label>Q{index + 1}</label><p>{pair.question}</p><label>A{index + 1}</label><p>{pair.answer}</p></div>)}</div>
        </article>) : <div className="empty" style={{minHeight:220}}>还没有用户评分。用户端自动出现评分卡并完成评分后会出现在这里。</div>}</div>
      </section>
    </>}

    {tab === "evalset" && <>
      <div className="eval-summary"><div><span>用例总数</span><strong>{summary.total}</strong></div><div><span>已运行</span><strong>{summary.run}</strong></div><div><span>通过率</span><strong>{summary.passRate}%</strong></div><div><span>平均分</span><strong>{summary.average}</strong></div></div>
      <section className="card data-section"><div className="section-actions"><div><div className="panel-title">评测集</div><div className="panel-kicker">逐条查看场景、期望答案与评测维度；展开后可继续编辑断言</div></div><div><button className="secondary" onClick={() => setCases(current => [...current, emptyCase()])}>＋ 用例</button><button className="secondary" disabled={busy === "batch"} onClick={runAll}>{busy === "batch" ? "批量运行中…" : "运行全部"}</button><button className="primary" onClick={saveCases}>保存评测集</button></div></div>
        <div className="eval-v2-list">{cases.map((item, index) => { const last = latestResults.get(item.id); const isOpen = expanded.includes(item.id); return <article className="eval-case eval-dataset-case" key={item.id}>
          <div className="eval-case-head"><button className={`eval-status ${last?.passed ? "pass" : last ? "fail" : ""}`} onClick={() => setExpanded(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])}><span>{last ? last.score : "—"}</span><small>{last ? (last.passed ? "通过" : "未通过") : "未运行"}</small></button><div><input className="eval-name" value={item.name} onChange={event => updateCase(index, { name: event.target.value })}/><div className="eval-tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div></div><label className="eval-enabled"><input type="checkbox" checked={item.enabled} onChange={event => updateCase(index, { enabled: event.target.checked })}/>启用</label><button className="secondary compact" disabled={busy === item.id || busy === "batch"} onClick={() => void runEval(item.id)}>{busy === item.id ? "运行中…" : "运行"}</button></div>
          <div className="eval-dataset-preview">
            <div><label>场景</label><p>{item.input}</p></div>
            <div><label>期望答案</label><p>{expectedAnswer(item)}</p></div>
            <div><label>评测维度</label><div className="eval-dimension-tags">{evalDimensions(item).map(value => <span key={value}>{value}</span>)}</div></div>
          </div>
          {last && <div className="layer-scores">{Object.entries(last.layerScores).map(([key, value]) => <span className={value >= 80 ? "pass" : "fail"} key={key}><b>{layerLabels[key]}</b>{value}</span>)}</div>}
          {isOpen && <div className="eval-editor"><div className="field full"><label>用户输入 / 场景</label><textarea value={item.input} onChange={event => updateCase(index, { input: event.target.value })}/></div><div className="eval-fields">
            <div className="field"><label>标签</label><input value={item.tags.join(",")} onChange={event => updateCase(index, { tags: split(event.target.value) })}/></div><div className="field"><label>最大延迟 ms</label><input type="number" value={item.assertions.maxLatencyMs} onChange={event => updateAssertion(index, { maxLatencyMs: Number(event.target.value) })}/></div>
            <div className="field"><label>期望回复关键点</label><textarea value={item.expectedKeywords.join(",")} onChange={event => updateCase(index, { expectedKeywords: split(event.target.value) })}/></div><div className="field"><label>期望能力</label><textarea value={item.assertions.expectedCapabilities.join(",")} onChange={event => updateAssertion(index, { expectedCapabilities: split(event.target.value) })}/></div>
            <div className="field"><label>期望 Tool 事实</label><textarea value={item.assertions.expectedFacts.join(",")} onChange={event => updateAssertion(index, { expectedFacts: split(event.target.value) })}/></div><div className="field"><label>禁止能力</label><textarea value={item.assertions.forbiddenCapabilities.join(",")} onChange={event => updateAssertion(index, { forbiddenCapabilities: split(event.target.value) })}/></div>
            <div className="field"><label>禁用表述</label><textarea value={item.assertions.forbiddenPhrases.join(",")} onChange={event => updateAssertion(index, { forbiddenPhrases: split(event.target.value) })}/></div><div className="field"><label>LLM Judge 标准（可选）</label><textarea value={item.judgeCriteria} onChange={event => updateCase(index, { judgeCriteria: event.target.value })}/></div>
          </div><label className="risk-required"><input type="checkbox" checked={item.assertions.riskMustPass} onChange={event => updateAssertion(index, { riskMustPass: event.target.checked })}/>必须通过风控</label>{last && <div className="eval-last"><strong>最近结果 · {last.latencyMs}ms</strong><p>{last.issues.length ? last.issues.join("；") : "所有断言均通过。"}</p><small>{last.capabilityPath.join(" → ")}</small></div>}</div>}
        </article>; })}</div>
      </section>
    </>}

    {tab === "eval" && <>
      <div className="eval-summary"><div><span>用例总数</span><strong>{summary.total}</strong></div><div><span>已运行</span><strong>{summary.run}</strong></div><div><span>通过率</span><strong>{summary.passRate}%</strong></div><div><span>平均分</span><strong>{summary.average}</strong></div></div>
      <JudgePromptEditor/>
      <section className="card data-section scoring-method-overview"><div className="section-actions"><div><div className="panel-title">评分方法</div><div className="panel-kicker">机器规则、相似度、模型裁判和人工复核共同构成评测闭环</div></div></div><div>{scoringMethodOverview.map(method => <article key={method.id}><span>{method.title}</span><p>{method.desc}</p><small>{method.weight}</small></article>)}</div></section>
      <div className="eval-view-tabs"><button className={evalView === "runs" ? "active" : ""} onClick={() => setEvalView("runs")}>当前用例运行 <span>{activeResults.length}</span></button><button className={`${evalView === "bad" ? "active" : ""} ${badCases.length ? "has-bad" : ""}`} onClick={() => setEvalView("bad")}>Bad Cases <span>{badCases.length}</span></button></div>
      {busy && <div className="eval-running"><i/><div><strong>{busy === "batch" ? "批量评测进行中" : `正在运行：${caseMap.get(busy)?.name || busy}`}</strong><p>{message || "Agent 正在执行 Planner、Skill、Tool 和风控链路…"}</p></div></div>}
      {evalView === "runs" && <section className="card data-section"><div className="section-actions"><div><div className="panel-title">当前评测运行过程</div><div className="panel-kicker">只展示当前评测集的结果；旧用例结果已单独归档，不会混入这里。</div></div><button className="secondary" disabled={busy === "batch"} onClick={runAll}>运行全部</button></div><div className="eval-runs">{activeResults.length ? activeResults.map(result => <EvalRunCard key={result.id} result={result} item={caseMap.get(result.caseId)} busy={busy === result.caseId} onRerun={id => void runEval(id)}/>) : <div className="empty" style={{minHeight:220}}>运行一条当前评测用例后，这里会显示完整过程。</div>}</div>{orphanResults.length > 0 && <details className="eval-archive"><summary>历史归档结果（{orphanResults.length} 条，不参与当前统计）</summary><p>这些结果对应已从当前评测集移除的旧用例，仅保留作追溯，不会出现在当前用例运行列表或通过率统计中。</p>{orphanResults.slice(0, 20).map(result => <div className="eval-archive-row" key={result.id}><span>{result.passed ? "通过" : "失败"}</span><strong>{result.caseId}</strong><small>{new Date(result.createdAt).toLocaleString()}</small></div>)}</details>}</section>}
      {evalView === "bad" && <section className="card data-section bad-case-section"><div className="section-actions"><div><div className="panel-title">Bad Cases</div><div className="panel-kicker">只展示每个用例的最新失败结果；修复并重跑通过后会自动移出</div></div><span className="bad-count">{badCases.length} 个待修复</span></div><div className="eval-runs">{badCases.length ? badCases.map(result => <EvalRunCard key={result.id} result={result} item={caseMap.get(result.caseId)} busy={busy === result.caseId} onRerun={id => void runEval(id)}/>) : <div className="eval-all-pass"><span>✓</span><strong>当前没有 Bad Case</strong><p>已运行用例的最新结果均通过。</p></div>}</div></section>}
    </>}

    {tab === "annotation" && <AnnotationWorkspace/>}
    {tab === "versions" && <section className="card data-section"><div className="panel-title">配置版本</div><div className="panel-kicker">每次保存前自动创建快照</div>{versions.length ? versions.map(version => <div className="version-row" key={version.id}><span className="type">{version.kind}</span><div><strong>{version.label}</strong><small>{new Date(version.createdAt).toLocaleString()}</small></div><button className="secondary" disabled={busy === version.id} onClick={() => rollback(version.id)}>回滚</button></div>) : <div className="empty" style={{ minHeight: 200 }}>保存一次配置后会出现版本</div>}</section>}
    {tab === "ab" && <section className="card data-section"><div className="section-actions"><div><div className="panel-title">Prompt A/B 实验</div><div className="panel-kicker">按流量随机使用变体 Prompt，结果进入运行指标</div></div><div><button className="secondary" onClick={addExperiment}>＋ 实验</button><button className="primary" onClick={saveExperiments}>保存实验</button></div></div>{experiments.map((experiment, index) => <div className="experiment-row" key={experiment.id}><input value={experiment.name} onChange={event => updateExperiment(index, { name: event.target.value })}/><select value={experiment.skillId} onChange={event => updateExperiment(index, { skillId: event.target.value })}>{skills.map(skill => <option key={skill.id} value={skill.id}>${skill.id}</option>)}</select><textarea value={experiment.variantPrompt} onChange={event => updateExperiment(index, { variantPrompt: event.target.value })}/><label>流量 <input type="number" min="0" max="100" value={experiment.trafficPercent} onChange={event => updateExperiment(index, { trafficPercent: Number(event.target.value) })}/>%</label><button className={`switch ${experiment.enabled ? "on" : ""}`} onClick={() => updateExperiment(index, { enabled: !experiment.enabled })}/></div>)}</section>}
  </main></div>;
}
