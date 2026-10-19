import { NextResponse } from "next/server";
import { appendServiceRating, getAnnotations, getServiceRatings, saveAnnotations } from "@/lib/store";
import type { AnnotationRecord, ServiceQaPair, ServiceRating } from "@/lib/types";

export const runtime = "nodejs";
const defaultQualityDimensions = () => ({
  correctness: { score: 2, note: "" },
  relevance: { score: 2, note: "" },
  completeness: { score: 2, note: "" },
  safety: { score: 3, note: "" },
  tone: { score: 2, note: "" },
  overall: { score: 1, note: "用户评分 1 分自动进入 Bad Case" }
});

function toQaPairs(messages: ServiceRating["messages"]): ServiceQaPair[] {
  const pairs: ServiceQaPair[] = [];
  let pendingQuestion = "";
  for (const message of messages || []) {
    if (message.role === "user") pendingQuestion = message.content;
    if (message.role === "assistant" && pendingQuestion) {
      pairs.push({ question: pendingQuestion, answer: message.content });
      pendingQuestion = "";
    }
  }
  return pairs;
}

function normalizeScore(value: unknown): 1 | 2 | 3 | 4 | 5 {
  const score = Number(value);
  if (![1, 2, 3, 4, 5].includes(score)) throw new Error("评分必须是 1-5 分");
  return score as 1 | 2 | 3 | 4 | 5;
}

export async function GET() {
  const ratings = await getServiceRatings();
  const lowScores = ratings.filter(item => item.score === 1);
  const average = ratings.length ? Number((ratings.reduce((sum, item) => sum + item.score, 0) / ratings.length).toFixed(1)) : 0;
  return NextResponse.json({
    ratings,
    summary: {
      total: ratings.length,
      average,
      badCases: lowScores.length,
      distribution: [1, 2, 3, 4, 5].map(score => ({ score, count: ratings.filter(item => item.score === score).length }))
    }
  });
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const messages = Array.isArray(payload.messages) ? payload.messages.filter((item: any) => item?.role && item?.content).map((item: any) => ({ role: item.role, content: String(item.content) })) : [];
    const qaPairs = Array.isArray(payload.qaPairs) && payload.qaPairs.length ? payload.qaPairs : toQaPairs(messages);
    if (!qaPairs.length) return NextResponse.json({ error: "缺少本次服务的 QA 对" }, { status: 400 });

    const rating: ServiceRating = {
      id: crypto.randomUUID(),
      sessionId: payload.sessionId,
      requestId: payload.requestId,
      score: normalizeScore(payload.score),
      feedback: String(payload.feedback || ""),
      qaPairs,
      messages,
      source: payload.source === "agent" ? "agent" : "demo",
      createdAt: new Date().toISOString()
    };
    await appendServiceRating(rating);

    if (rating.score === 1) {
      const latest = rating.qaPairs.at(-1)!;
      const records = await getAnnotations();
      const record: AnnotationRecord = {
        id: crypto.randomUUID(),
        source: "conversation",
        sourceId: rating.id,
        input: latest.question,
        modelResponse: latest.answer,
        expectedResponse: "",
        intentLabel: "低分服务",
        riskLevel: "medium",
        qualityLabel: "bad",
        qualityDimensions: defaultQualityDimensions(),
        requiredCapabilities: [],
        expectedFacts: [],
        forbiddenPhrases: [],
        status: "pending",
        notes: `用户评分 1 分，已自动进入 Bad Case 队列。${rating.feedback ? `反馈：${rating.feedback}` : ""}`,
        createdAt: rating.createdAt,
        updatedAt: rating.createdAt
      };
      await saveAnnotations([record, ...records.filter(item => item.sourceId !== rating.id)]);
    }

    return NextResponse.json({ ok: true, rating });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
