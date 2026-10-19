import { NextResponse } from "next/server";
import { getVersions, savePlanner, saveSkills, saveTools, writeData } from "@/lib/store";
import type { PlannerConfig, Skill, ToolConfig } from "@/lib/types";

export const runtime = "nodejs";
export async function GET() { return NextResponse.json(await getVersions()); }
export async function POST(req: Request) {
  try {
    const { id } = await req.json();
    const version = (await getVersions()).find(item => item.id === id);
    if (!version) return NextResponse.json({ error: "版本不存在" }, { status: 404 });
    if (version.kind === "skills") await saveSkills(version.payload as Skill[]);
    if (version.kind === "planner") await savePlanner(version.payload as PlannerConfig);
    if (version.kind === "tools") await saveTools(version.payload as ToolConfig[]);
    if (version.kind === "catalog") { const payload = version.payload as { file: string; data: unknown }; await writeData(payload.file, payload.data); }
    return NextResponse.json({ ok: true, version });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
