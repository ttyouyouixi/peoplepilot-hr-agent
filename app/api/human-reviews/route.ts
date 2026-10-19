import { NextResponse } from "next/server";
import { mergeEvaluationSeeds } from "@/lib/eval-seeds";
import { getAnnotations, getEvaluationCases, getEvaluationResults, getServiceRatings, saveAnnotations } from "@/lib/store";
import type { AnnotationRecord } from "@/lib/types";

export const runtime = "nodejs";
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
  const badCases = results.filter(result => {
    if (seen.has(result.caseId)) return false;
    seen.add(result.caseId);
    return !result.passed;
  }).map(result => {
    const item = caseMap.get(result.caseId);
    return {
      id: `eval-${result.id}`,
      source: "eval",
      sourceId: result.id,
      title: item?.name || result.caseId,
      input: item?.input || "",
      modelResponse: result.finalReply || "",
      issues: result.issues,
      score: result.score,
      createdAt: result.createdAt
    };
  });
  const lowRatings = ratings.filter(item => item.score <= 2).map(item => {
    const qa = item.qaPairs.at(-1);
    return {
      id: `rating-${item.id}`,
      source: "rating",
      sourceId: item.id,
      title: `用户评分 ${item.score} 分`,
      input: qa?.question || "",
      modelResponse: qa?.answer || "",
      issues: [`用户评分 ${item.score} 分`, item.feedback].filter(Boolean),
      score: item.score,
      createdAt: item.createdAt
    };
  });
  const reviewedSources = new Set(annotations.map(item => item.sourceId).filter(Boolean));
  return NextResponse.json({ items: [...badCases, ...lowRatings].filter(item => !reviewedSources.has(item.sourceId)).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)) });
}

export async function POST(req: Request) {
  const payload = await req.json();
  const now = new Date().toISOString();
  const sourceId = String(payload.sourceId || "");
  const input = String(payload.input || "").trim();
  if (!sourceId || !input) return NextResponse.json({ error: "缺少复核来源或客户输入" }, { status: 400 });
  const records = await getAnnotations();
  const record: AnnotationRecord = {
    id: crypto.randomUUID(),
    source: payload.source === "rating" ? "conversation" : "bad_case",
    sourceId,
    input,
    modelResponse: String(payload.modelResponse || ""),
    expectedResponse: String(payload.expectedResponse || ""),
    intentLabel: String(payload.intentLabel || "人工评估"),
    riskLevel: payload.riskLevel === "high" ? "high" : payload.riskLevel === "medium" ? "medium" : "low",
    qualityLabel: payload.qualityLabel === "good" ? "good" : payload.qualityLabel === "uncertain" ? "uncertain" : "bad",
    qualityDimensions: { ...defaultQualityDimensions(), ...(payload.qualityDimensions || {}) },
    requiredCapabilities: Array.isArray(payload.requiredCapabilities) ? payload.requiredCapabilities.map(String) : [],
    expectedFacts: Array.isArray(payload.expectedFacts) ? payload.expectedFacts.map(String) : [],
    forbiddenPhrases: Array.isArray(payload.forbiddenPhrases) ? payload.forbiddenPhrases.map(String) : [],
    status: payload.expectedResponse ? "annotated" : "pending",
    notes: String(payload.notes || "人工评估沉淀"),
    createdAt: now,
    updatedAt: now
  };
  await saveAnnotations([record, ...records.filter(item => item.sourceId !== sourceId)]);
  return NextResponse.json({ ok: true, record });
}
