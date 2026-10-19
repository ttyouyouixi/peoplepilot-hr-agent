import { NextResponse } from "next/server";
import { getExperiments, saveExperiments } from "@/lib/store";
import type { PromptExperiment } from "@/lib/types";
export const runtime = "nodejs";
export async function GET() { return NextResponse.json(await getExperiments()); }
export async function PUT(req: Request) { const experiments = await req.json() as PromptExperiment[]; await saveExperiments(experiments); return NextResponse.json({ ok: true, experiments }); }
export async function POST(req: Request) { const input = await req.json() as Partial<PromptExperiment>; const all = await getExperiments(); const experiment: PromptExperiment = { id: crypto.randomUUID(), name: input.name || "新 Prompt 实验", skillId: input.skillId || "response-generator", variantPrompt: input.variantPrompt || "", trafficPercent: input.trafficPercent ?? 50, enabled: input.enabled ?? true, createdAt: new Date().toISOString() }; await saveExperiments([experiment, ...all]); return NextResponse.json(experiment, { status: 201 }); }
