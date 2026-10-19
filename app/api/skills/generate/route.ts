import { NextResponse } from "next/server";
import { generateSkillDraft } from "@/lib/engine";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const { request } = await req.json() as { request: string };
    return NextResponse.json({ skill: await generateSkillDraft(request) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
