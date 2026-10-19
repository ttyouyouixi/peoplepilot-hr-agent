import { NextResponse } from "next/server";
import { mergeEvaluationSeeds } from "@/lib/eval-seeds";
import { getAnnotations, getEvaluationCases, getEvaluationResults, getServiceRatings } from "@/lib/store";

export const runtime = "nodejs";

function uniq(values: string[]) { return [...new Set(values.filter(Boolean))]; }
const dimensionLabels = { correctness: "正确性", relevance: "相关性", completeness: "完整性", safety: "安全性", tone: "语气", overall: "整体质量" } as const;
const defaultQualityDimensions = () => ({
  correctness: { score: 3, note: "" },
  relevance: { score: 3, note: "" },
  completeness: { score: 3, note: "" },
  safety: { score: 3, note: "" },
  tone: { score: 3, note: "" },
  overall: { score: 3, note: "" }
});

export async function GET() {
  const [cases, results, ratings, annotations] = await Promise.all([getEvaluationCases(), getEvaluationResults(), getServiceRatings(), getAnnotations()]);
  const caseMap = new Map(mergeEvaluationSeeds(cases).map(item => [item.id, item]));
  const seen = new Set<string>();
  const latestBad = results.filter(result => {
    if (seen.has(result.caseId)) return false;
    seen.add(result.caseId);
    return !result.passed;
  });
  const lowRatings = ratings.filter(item => item.score <= 2);
  const pendingAnnotations = annotations.filter(item => item.status === "pending" || item.status === "annotated");
  const allIssues = latestBad.flatMap(item => item.issues);
  const missingTools = uniq(allIssues.filter(item => item.includes("Tool") || item.includes("价格意图")).map(item => item.replace(/^.*：/, "")));
  const missingSkills = uniq(allIssues.filter(item => item.includes("Skill") || item.includes("Planner 缺少能力")).map(item => item.replace(/^.*：/, "")));
  const judgeIssues = allIssues.filter(item => item.startsWith("Judge"));
  const riskIssues = allIssues.filter(item => item.includes("风控") || item.includes("risk-check"));
  const dimensionStats = (Object.keys(dimensionLabels) as Array<keyof typeof dimensionLabels>).map(key => {
    const values = annotations.map(item => ({ id: item.id, input: item.input, intent: item.intentLabel, ...({ ...defaultQualityDimensions(), ...(item.qualityDimensions || {}) }[key]) }));
    const low = values.filter(item => item.score <= 2);
    const average = values.length ? Number((values.reduce((sum, item) => sum + item.score, 0) / values.length).toFixed(1)) : 0;
    return { key, label: dimensionLabels[key], average, lowCount: low.length, lowExamples: low.slice(0, 3).map(item => `${item.intent || "未标注意图"}：${item.input}${item.note ? `（${item.note}）` : ""}`) };
  });
  const weakestDimensions = dimensionStats.filter(item => item.lowCount > 0).sort((a, b) => b.lowCount - a.lowCount || a.average - b.average);

  const suggestions = [
    {
      id: "planner-routing",
      title: "优化 Planner 能力选择",
      priority: missingTools.length || missingSkills.length ? "high" : "medium",
      target: "Planner",
      reason: missingTools.length || missingSkills.length ? `发现能力缺失：${uniq([...missingTools, ...missingSkills]).join("、")}` : "当前没有明显能力缺失，但可继续观察覆盖率。",
      action: "补充 Planner 规则：价格、物流、退换货等意图必须选择对应 Tool；最终回复前必须调用 risk-check。",
      evidence: latestBad.slice(0, 5).map(item => `${caseMap.get(item.caseId)?.name || item.caseId}：${item.issues.join("；")}`)
    },
    {
      id: "response-quality",
      title: "优化回复生成与推荐理由",
      priority: judgeIssues.length || lowRatings.length || weakestDimensions.some(item => ["correctness", "relevance", "completeness", "tone", "overall"].includes(item.key)) ? "high" : "medium",
      target: "response-generator / recommendation-reason",
      reason: lowRatings.length ? `存在 ${lowRatings.length} 条 1-2 分用户评分。` : weakestDimensions.length ? `人工六维标注显示低分维度：${weakestDimensions.map(item => `${item.label}${item.lowCount}`).join("、")}` : judgeIssues.length ? `Judge 发现 ${judgeIssues.length} 个回复质量问题。` : "回复质量暂无明显异常。",
      action: "优先修复六维低分最多的质量项；把低分 QA 和 Judge 问题导入人工评估，补充理想回复，再发布为 Eval 回归用例。",
      evidence: [...weakestDimensions.flatMap(item => item.lowExamples).slice(0, 4), ...judgeIssues.slice(0, 3), ...lowRatings.slice(0, 2).map(item => `用户评分 ${item.score} 分：${item.qaPairs.at(-1)?.question || "无问题"}`)]
    },
    {
      id: "risk-policy",
      title: "加强风控兜底",
      priority: riskIssues.length || dimensionStats.find(item => item.key === "safety")!.lowCount ? "high" : "low",
      target: "risk-check",
      reason: riskIssues.length ? `发现 ${riskIssues.length} 个风控或调用顺序问题。` : dimensionStats.find(item => item.key === "safety")!.lowCount ? `人工标注中有 ${dimensionStats.find(item => item.key === "safety")!.lowCount} 条安全性低分。` : "当前风控链路整体稳定。",
      action: "检查 risk-check 是否启用、是否总在最后一步；把高风险回复加入禁用表述与人工标注。",
      evidence: [...riskIssues.slice(0, 4), ...dimensionStats.find(item => item.key === "safety")!.lowExamples]
    },
    {
      id: "eval-coverage",
      title: "补齐回归评测覆盖",
      priority: pendingAnnotations.length ? "high" : "medium",
      target: "Eval / 数据标注",
      reason: `当前有 ${pendingAnnotations.length} 条待处理标注，${latestBad.length} 条最新 Bad Case。`,
      action: "优先审核待标注数据；把低分服务和 Bad Case 发布成 Eval，形成上线前回归集。",
      evidence: pendingAnnotations.slice(0, 5).map(item => `${item.intentLabel || "未标注意图"}：${item.input}`)
    }
  ];

  return NextResponse.json({ summary: { badCases: latestBad.length, lowRatings: lowRatings.length, pendingAnnotations: pendingAnnotations.length, weakestDimensions: weakestDimensions.slice(0, 3) }, dimensionStats, suggestions });
}
