import { NextResponse } from "next/server";
import { mergeEvaluationSeeds } from "@/lib/eval-seeds";
import { generateSkillDraftFromAnnotation } from "@/lib/engine";
import { getAnnotations, getEvaluationCases, getEvaluationResults, saveAnnotations, saveEvaluationCases } from "@/lib/store";
import type { AnnotationRecord, EvaluationCase } from "@/lib/types";

export const runtime = "nodejs";

const defaultQualityDimensions = () => ({
  correctness: { score: 3, note: "" },
  relevance: { score: 3, note: "" },
  completeness: { score: 3, note: "" },
  safety: { score: 3, note: "" },
  tone: { score: 3, note: "" },
  overall: { score: 3, note: "" }
});
const dimensionLabels = { correctness: "正确性", relevance: "相关性", completeness: "完整性", safety: "安全性", tone: "语气", overall: "整体质量" } as const;
function dimensionText(record: AnnotationRecord) {
  const dimensions = { ...defaultQualityDimensions(), ...(record.qualityDimensions || {}) };
  return Object.entries(dimensions).map(([key, value]) => `${dimensionLabels[key as keyof typeof dimensionLabels]} ${value.score}/5${value.note ? `，备注：${value.note}` : ""}`).join("；");
}

function normalize(record: Partial<AnnotationRecord>): AnnotationRecord {
  const now = new Date().toISOString();
  const dimensions = { ...defaultQualityDimensions(), ...(record.qualityDimensions || {}) };
  return {
    id: record.id || crypto.randomUUID(), source: record.source || "manual", sourceId: record.sourceId,
    input: record.input || "", modelResponse: record.modelResponse || "", expectedResponse: record.expectedResponse || "",
    intentLabel: record.intentLabel || "", riskLevel: record.riskLevel || "low", qualityLabel: record.qualityLabel || "uncertain",
    qualityDimensions: dimensions,
    requiredCapabilities: record.requiredCapabilities || [], expectedFacts: record.expectedFacts || [], forbiddenPhrases: record.forbiddenPhrases || [],
    status: record.status || "pending", notes: record.notes || "", createdAt: record.createdAt || now, updatedAt: now
  };
}

export async function GET() { return NextResponse.json({ records: (await getAnnotations()).map(item => normalize(item)) }); }

export async function PUT(req: Request) {
  const payload = await req.json();
  if (!Array.isArray(payload)) return NextResponse.json({ error: "标注数据必须是数组" }, { status: 400 });
  const records = payload.map(item => normalize(item));
  if (records.some(item => !item.input.trim())) return NextResponse.json({ error: "客户输入不能为空" }, { status: 400 });
  await saveAnnotations(records);
  return NextResponse.json({ ok: true, records });
}

export async function POST(req: Request) {
  const { action, id } = await req.json();
  if (action === "import_bad_cases") {
    const [records, cases, results] = await Promise.all([getAnnotations(), getEvaluationCases(), getEvaluationResults()]);
    const caseMap = new Map(mergeEvaluationSeeds(cases).map(item => [item.id, item]));
    const seenCases = new Set<string>();
    const latestBad = results.filter(result => {
      if (seenCases.has(result.caseId)) return false;
      seenCases.add(result.caseId);
      return !result.passed;
    });
    const existingSources = new Set(records.map(item => item.sourceId).filter(Boolean));
    const imported = latestBad.filter(result => !existingSources.has(result.id)).map(result => {
      const item = caseMap.get(result.caseId);
      return normalize({
        source: "bad_case", sourceId: result.id, input: item?.input || "", modelResponse: result.finalReply || "",
        intentLabel: item?.tags?.[0] || "", riskLevel: result.risk?.risk_level === "high" ? "high" : result.risk?.risk_level === "medium" ? "medium" : "low",
        qualityLabel: "bad", requiredCapabilities: item?.assertions?.expectedCapabilities || [], expectedFacts: item?.assertions?.expectedFacts || [],
        forbiddenPhrases: item?.assertions?.forbiddenPhrases || [], status: "pending", notes: result.issues.join("；")
      });
    });
    await saveAnnotations([...imported, ...records]);
    return NextResponse.json({ ok: true, imported: imported.length, records: [...imported, ...records] });
  }

  if (action === "publish_eval") {
    const records = await getAnnotations(); const record = records.find(item => item.id === id);
    if (!record) return NextResponse.json({ error: "标注记录不存在" }, { status: 404 });
    if (record.status !== "approved") return NextResponse.json({ error: "只有已审核标注可以发布为 Eval" }, { status: 400 });
    const cases = await getEvaluationCases(); const evalId = `annotation-${record.id}`;
    const evaluation: EvaluationCase = {
      id: evalId, name: `标注回归 · ${record.intentLabel || record.input.slice(0, 18)}`, input: record.input,
      expectedKeywords: [], enabled: true, tags: ["人工标注", record.intentLabel].filter(Boolean),
      judgeCriteria: record.expectedResponse ? `以下是人工标注的期望回复，评估实际回复是否语义一致且事实准确：${record.expectedResponse}\n人工六维质量标注：${dimensionText(record)}\n请特别关注低分维度是否已被修复。` : `人工六维质量标注：${dimensionText(record)}\n请特别关注低分维度是否已被修复。`,
      assertions: { expectedCapabilities: record.requiredCapabilities, forbiddenCapabilities: [], expectedFacts: record.expectedFacts, forbiddenPhrases: record.forbiddenPhrases, riskMustPass: true, maxLatencyMs: 35000 },
      qualityDimensions: record.qualityDimensions
    };
    await saveEvaluationCases([evaluation, ...cases.filter(item => item.id !== evalId)]);
    return NextResponse.json({ ok: true, evaluation });
  }

  if (action === "generate_skill_draft") {
    const record = (await getAnnotations()).find(item => item.id === id);
    if (!record) return NextResponse.json({ error: "标注记录不存在" }, { status: 404 });
    if (record.status !== "approved") return NextResponse.json({ error: "只有已审核标注可以生成 Skill Prompt 草案" }, { status: 400 });
    return NextResponse.json({ ok: true, skill: await generateSkillDraftFromAnnotation(normalize(record)) });
  }

  return NextResponse.json({ error: "未知标注操作" }, { status: 400 });
}
