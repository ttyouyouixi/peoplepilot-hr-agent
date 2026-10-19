import { NextResponse } from "next/server";
import { createSkill, getSkills, saveSkills } from "@/lib/store";
import type { Skill } from "@/lib/types";

export const runtime = "nodejs";
export async function GET() { return NextResponse.json(await getSkills()); }
export async function PUT(req: Request) {
  try {
    const skills = await req.json() as Skill[];
    if (!Array.isArray(skills) || skills.some(s => !s.id || !s.name || !s.prompt)) return NextResponse.json({ error: "Skill 配置不完整" }, { status: 400 });
    await saveSkills(skills);
    return NextResponse.json({ ok: true, skills });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
export async function POST(req: Request) {
  try {
    const skill = await req.json() as Skill;
    return NextResponse.json({ ok: true, skill: await createSkill(skill) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: message.includes("已存在") ? 409 : 400 });
  }
}
