import { NextResponse } from "next/server";
import { generatePromptSuggestion } from "@/lib/engine";
import { getAnnotations, getEvaluationResults, getServiceRatings } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}));
    const [annotations, results, ratings] = await Promise.all([getAnnotations(), getEvaluationResults(), getServiceRatings()]);
    const lowQuality = annotations.filter(item => Object.values(item.qualityDimensions || {}).some(value => value.score <= 2)).slice(0, 20);
    const badResults = results.filter(item => !item.passed).slice(0, 20);
    const lowRatings = ratings.filter(item => item.score <= 2).slice(0, 20);
    return NextResponse.json({ suggestion: await generatePromptSuggestion({ focus: payload.focus || "", lowQuality, badResults, lowRatings }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
