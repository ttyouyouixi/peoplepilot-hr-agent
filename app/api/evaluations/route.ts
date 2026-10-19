import { NextResponse } from "next/server";
import { judgeEvaluation, runAgent } from "@/lib/engine";
import { mergeEvaluationSeeds } from "@/lib/eval-seeds";
import { appendEvaluationResult, getEvaluationCases, getEvaluationResults, saveEvaluationCases } from "@/lib/store";
import type { EvaluationCase, EvaluationLayerScores, EvaluationResult, EvaluationScoringMethod, RunResult, TraceItem } from "@/lib/types";

export const runtime = "nodejs";

const defaultAssertions = () => ({
  expectedCapabilities: [], forbiddenCapabilities: [], expectedFacts: [], forbiddenPhrases: [],
  riskMustPass: true, maxLatencyMs: 30000
});
const defaultQualityDimensions = () => ({
  correctness: { score: 3, note: "" },
  relevance: { score: 3, note: "" },
  completeness: { score: 3, note: "" },
  safety: { score: 3, note: "" },
  tone: { score: 3, note: "" },
  overall: { score: 3, note: "" }
});
const dimensionLabels = { correctness: "正确性", relevance: "相关性", completeness: "完整性", safety: "安全性", tone: "语气", overall: "整体质量" } as const;

function normalizeCase(item: Partial<EvaluationCase>): EvaluationCase {
  return {
    id: item.id || crypto.randomUUID(), name: item.name || "未命名评测", input: item.input || "",
    expectedKeywords: item.expectedKeywords || [], enabled: item.enabled !== false,
    tags: item.tags || [], judgeCriteria: item.judgeCriteria || "",
    assertions: { ...defaultAssertions(), ...(item.assertions || {}) },
    qualityDimensions: item.qualityDimensions
  };
}

function normalizeResult(item: Partial<EvaluationResult>): EvaluationResult {
  return {
    id: item.id || crypto.randomUUID(), caseId: item.caseId || "unknown", passed: item.passed === true,
    score: Number(item.score) || 0, latencyMs: Number(item.latencyMs) || 0, issues: item.issues || [],
    createdAt: item.createdAt || new Date(0).toISOString(), layerScores: item.layerScores || { planner: 0, skills: 0, tools: 0, response: 0, risk: 0, performance: 0 },
    capabilityPath: item.capabilityPath || [], requestId: item.requestId, judge: item.judge, finalReply: item.finalReply,
    scoringMethods: item.scoringMethods || [], plannerReasoning: item.plannerReasoning, trace: item.trace, risk: item.risk
  };
}

function includesText(haystack: string, needle: string) { return haystack.toLowerCase().replace(/\s+/g, "").includes(needle.trim().toLowerCase().replace(/\s+/g, "")); }
function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
function tokenize(value: string) {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length > 1 ? words : Array.from(value.replace(/\s+/g, ""));
}
function cosineSimilarity(a: string, b: string) {
  const left = tokenize(a); const right = tokenize(b);
  if (!left.length || !right.length) return undefined;
  const all = new Set([...left, ...right]);
  const count = (items: string[]) => items.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item]: (acc[item] || 0) + 1 }), {});
  const lv = count(left); const rv = count(right);
  let dot = 0; let lm = 0; let rm = 0;
  all.forEach(key => { dot += (lv[key] || 0) * (rv[key] || 0); lm += (lv[key] || 0) ** 2; rm += (rv[key] || 0) ** 2; });
  return lm && rm ? clamp(dot / (Math.sqrt(lm) * Math.sqrt(rm)) * 100) : undefined;
}
function expectedText(item: EvaluationCase) {
  return [item.expectedKeywords.join(" "), item.assertions.expectedFacts.join(" "), item.judgeCriteria].filter(Boolean).join(" ");
}
function humanReviewScore(item: EvaluationCase, signals: { missingFacts: string[]; missingKeywords: string[]; forbiddenPhrases: string[]; judgeIssues: string[]; riskFailed: boolean; anyIssue: boolean }) {
  if (!item.qualityDimensions) return undefined;
  const dimensions = { ...defaultQualityDimensions(), ...item.qualityDimensions };
  const details: string[] = [];
  let penalty = 0;
  const add = (key: keyof typeof dimensions, active: boolean, reason: string) => {
    const value = dimensions[key];
    if (value.score < 3 && active) {
      const amount = (3 - value.score) * 12;
      penalty += amount;
      details.push(`${dimensionLabels[key]}原标注 ${value.score}/5，当前仍有${reason}，扣 ${amount} 分${value.note ? `；备注：${value.note}` : ""}`);
    } else {
      details.push(`${dimensionLabels[key]}原标注 ${value.score}/5${value.note ? `；备注：${value.note}` : ""}`);
    }
  };
  add("correctness", signals.missingFacts.length > 0 || signals.judgeIssues.length > 0, "事实/准确性问题");
  add("relevance", signals.missingKeywords.length > 0 || signals.judgeIssues.length > 0, "相关性问题");
  add("completeness", signals.missingKeywords.length > 0, "完整性缺口");
  add("safety", signals.riskFailed || signals.forbiddenPhrases.length > 0, "安全或禁用表述问题");
  add("tone", signals.forbiddenPhrases.length > 0 || signals.judgeIssues.length > 0, "语气/表达问题");
  add("overall", signals.anyIssue, "整体质量问题");
  return { score: clamp(100 - penalty), details };
}

async function evaluateCase(item: EvaluationCase): Promise<{ result: EvaluationResult; run?: RunResult; executionError?: string }> {
  const started = Date.now();
  try {
    const run = await runAgent(item.input, { persistConversation: false, recordMetric: false });
    const latencyMs = Date.now() - started;
    const capabilities = run.executionTrace.map(step => step.capability);
    const evidence = JSON.stringify({ finalReply: run.finalReply, trace: run.executionTrace.map(step => ({ capability: step.capability, output: step.output })) });
    const issues: string[] = [];

    const missingCapabilities = item.assertions.expectedCapabilities.filter(value => !capabilities.includes(value));
    const forbiddenCapabilities = item.assertions.forbiddenCapabilities.filter(value => capabilities.includes(value));
    missingCapabilities.forEach(value => issues.push(`Planner 缺少能力：${value}`));
    forbiddenCapabilities.forEach(value => issues.push(`Planner 误用能力：${value}`));
    const riskLast = capabilities.at(-1) === "risk-check";
    if (!riskLast) issues.push("risk-check 不是最后一步");
    const planner = clamp(100 - missingCapabilities.length * 30 - forbiddenCapabilities.length * 35 - (riskLast ? 0 : 50));

    const failedSkills = run.executionTrace.filter(step => step.type === "skill" && step.status !== "success");
    failedSkills.forEach(step => issues.push(`Skill 执行失败：${step.capability}`));
    const skills = clamp(100 - failedSkills.length * 50);

    const missingFacts = item.assertions.expectedFacts.filter(value => !includesText(evidence, value));
    missingFacts.forEach(value => issues.push(`Tool 事实未命中：${value}`));
    const priceIntent = /价格|多少钱|优惠|券|满减|预算|便宜|划算|别太贵|实惠|性价比/.test(item.input);
    const requiredPriceTools = ["query_activities", "query_coupons", "calculate_price"];
    const missingPriceTools = priceIntent ? requiredPriceTools.filter(value => !capabilities.includes(value)) : [];
    missingPriceTools.forEach(value => issues.push(`价格意图缺少 Tool：${value}`));
    const calculationIndex = capabilities.indexOf("calculate_price");
    const decisionIndex = capabilities.indexOf("recommendation-decision");
    const calculationOrderValid = calculationIndex < 0 || decisionIndex < 0 || calculationIndex > decisionIndex;
    if (!calculationOrderValid) issues.push("价格计算早于推荐决策");
    const factScore = item.assertions.expectedFacts.length ? (item.assertions.expectedFacts.length - missingFacts.length) / item.assertions.expectedFacts.length * 100 : 100;
    const tools = clamp(factScore - missingPriceTools.length * 25 - (calculationOrderValid ? 0 : 30));

    const missingKeywords = item.expectedKeywords.filter(value => !includesText(run.finalReply, value));
    const foundForbiddenPhrases = item.assertions.forbiddenPhrases.filter(value => includesText(run.finalReply, value));
    missingKeywords.forEach(value => issues.push(`回复缺少关键点：${value}`));
    foundForbiddenPhrases.forEach(value => issues.push(`回复包含禁用表述：${value}`));
    const judge = await judgeEvaluation(item, run);
    const judgeIssues = judge?.issues || [];
    if (judge) issues.push(...judgeIssues.map(value => `Judge：${value}`));
    const keywordScore = item.expectedKeywords.length ? (item.expectedKeywords.length - missingKeywords.length) / item.expectedKeywords.length * 100 : 100;
    const deterministicResponseScore = clamp(keywordScore - foundForbiddenPhrases.length * 35);
    const similarityScore = cosineSimilarity(run.finalReply, expectedText(item));
    const response = judge ? clamp(deterministicResponseScore * .55 + judge.score * .45) : deterministicResponseScore;

    if (item.assertions.riskMustPass && !run.risk.passed) issues.push(...run.risk.issues.map(value => `风控：${value}`));
    const risk = item.assertions.riskMustPass ? (run.risk.passed ? 100 : 0) : (riskLast ? 100 : 0);
    if (latencyMs > item.assertions.maxLatencyMs) issues.push(`超过延迟上限：${latencyMs}ms > ${item.assertions.maxLatencyMs}ms`);
    const performance = clamp(item.assertions.maxLatencyMs > 0 ? 100 - Math.max(0, latencyMs - item.assertions.maxLatencyMs) / item.assertions.maxLatencyMs * 100 : 100);

    const layerScores: EvaluationLayerScores = { planner, skills, tools, response, risk, performance };
    const humanReview = humanReviewScore(item, { missingFacts, missingKeywords, forbiddenPhrases: foundForbiddenPhrases, judgeIssues, riskFailed: item.assertions.riskMustPass && !run.risk.passed, anyIssue: issues.length > 0 });
    const score = humanReview ? clamp(planner * .18 + skills * .14 + tools * .23 + response * .23 + risk * .09 + performance * .03 + humanReview.score * .1) : clamp(planner * .2 + skills * .15 + tools * .25 + response * .25 + risk * .1 + performance * .05);
    const scoringMethods: EvaluationScoringMethod[] = [
      {
        id: "exact_match", name: "精准匹配", enabled: true, score: deterministicResponseScore, weight: judge ? 55 : 100,
        evidence: "用于检查期望关键点、Tool 事实、禁用表述和能力调用是否精确命中。",
        details: [
          `回复关键点命中：${item.expectedKeywords.length - missingKeywords.length}/${item.expectedKeywords.length || 0}`,
          `Tool 事实命中：${item.assertions.expectedFacts.length - missingFacts.length}/${item.assertions.expectedFacts.length || 0}`,
          `禁用表述命中：${foundForbiddenPhrases.length}`
        ]
      },
      {
        id: "cosine_similarity", name: "余弦相似度", enabled: similarityScore !== undefined, score: similarityScore,
        evidence: "用最终回复与期望答案文本构建本地词袋/字符向量，衡量语义表述的接近程度，仅作为辅助观察，不参与当前总分。",
        details: similarityScore === undefined ? ["当前用例缺少可比较的期望答案文本。"] : [`相似度：${similarityScore}/100`, "权重：0%，辅助诊断用"]
      },
      {
        id: "llm_as_judge", name: "LLM-as-Judge", enabled: Boolean(judge), score: judge?.score, weight: judge ? 45 : 0,
        evidence: item.judgeCriteria ? "根据用例中的 LLM Judge 标准评估相关性、完整性、事实准确性和表达质量。" : "未配置 Judge 标准，本次不调用 LLM Judge。",
        details: judge ? (judge.issues.length ? judge.issues : ["Judge 未发现明显问题。"]) : ["在评测集里补充 LLM Judge 标准后启用。"]
      },
      {
        id: "human_review", name: "人工评估", enabled: Boolean(humanReview), score: humanReview?.score, weight: humanReview ? 10 : 0,
        evidence: humanReview ? "该用例来自人工标注，六维质量分会根据当前是否仍存在同类问题参与总分。" : "人工评估来自 Bad Case / 数据标注 / 服务评分后的人工审核；发布为带六维标注的 Eval 后参与评分。",
        details: humanReview?.details || ["若评测失败或用户低分，可进入数据标注补充六维质量标注，再发布为 Eval 回归用例。"]
      }
    ];
    const hardFailure = missingCapabilities.length > 0 || forbiddenCapabilities.length > 0 || missingFacts.length > 0 || missingPriceTools.length > 0 || !calculationOrderValid || !riskLast || (item.assertions.riskMustPass && !run.risk.passed) || Boolean(humanReview && humanReview.score < 60);
    const result: EvaluationResult = {
      id: crypto.randomUUID(), caseId: item.id, passed: score >= 80 && !hardFailure, score, latencyMs, issues,
      createdAt: new Date().toISOString(), requestId: run.requestId, layerScores, capabilityPath: capabilities, judge, scoringMethods,
      finalReply: run.finalReply, plannerReasoning: run.plan.reasoning, trace: run.executionTrace, risk: run.risk
    };
    await appendEvaluationResult(result);
    return { result, run };
  } catch (error: any) {
    const latencyMs = Date.now() - started;
    const trace = (error?.trace || []) as TraceItem[];
    const result: EvaluationResult = {
      id: crypto.randomUUID(), caseId: item.id, passed: false, score: 0, latencyMs,
      issues: [`执行失败：${error instanceof Error ? error.message : String(error)}`, ...(error?.cause?.message ? [String(error.cause.message)] : [])],
      createdAt: new Date().toISOString(), layerScores: { planner: 0, skills: 0, tools: 0, response: 0, risk: 0, performance: 0 }, capabilityPath: trace.map(step => step.capability), trace
    };
    await appendEvaluationResult(result);
    return { result, executionError: result.issues.join("；") };
  }
}

export async function GET() {
  const cases = mergeEvaluationSeeds((await getEvaluationCases()).map(item => normalizeCase(item)));
  return NextResponse.json({ cases, results: (await getEvaluationResults()).map(item => normalizeResult(item)) });
}

export async function PUT(req: Request) {
  const payload = await req.json();
  if (!Array.isArray(payload)) return NextResponse.json({ error: "评测集必须是数组" }, { status: 400 });
  const cases = payload.map(item => normalizeCase(item));
  if (cases.some(item => !item.name.trim() || !item.input.trim())) return NextResponse.json({ error: "评测名称和输入不能为空" }, { status: 400 });
  await saveEvaluationCases(cases);
  return NextResponse.json({ ok: true, cases });
}

export async function POST(req: Request) {
  const { caseId } = await req.json();
  const item = mergeEvaluationSeeds((await getEvaluationCases()).map(value => normalizeCase(value))).find(value => value.id === caseId);
  if (!item) return NextResponse.json({ error: "评测用例不存在" }, { status: 404 });
  return NextResponse.json(await evaluateCase(item));
}
