import { NextResponse } from "next/server";
import { getEvaluationSettings, saveEvaluationSettings } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getEvaluationSettings());
}

export async function PUT(req: Request) {
  const payload = await req.json();
  const judgePrompt = String(payload.judgePrompt || "").trim();
  if (!judgePrompt) return NextResponse.json({ error: "LLM-as-Judge Prompt 不能为空" }, { status: 400 });
  if (judgePrompt.length > 5000) return NextResponse.json({ error: "Prompt 不能超过 5000 字符" }, { status: 400 });
  const settings = { judgePrompt, updatedAt: new Date().toISOString() };
  await saveEvaluationSettings(settings);
  return NextResponse.json(settings);
}
