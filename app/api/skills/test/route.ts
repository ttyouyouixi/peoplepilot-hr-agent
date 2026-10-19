import { NextResponse } from "next/server";
import { testSkill } from "@/lib/engine";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try { const { skill, input } = await req.json(); return NextResponse.json(await testSkill(skill, input)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
