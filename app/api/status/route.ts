import { NextResponse } from "next/server";
import { getAiStatus } from "@/lib/engine";
import { getPlanner, getSkills, getTools } from "@/lib/store";
export async function GET() {
  const [skills, tools, planner] = await Promise.all([getSkills(), getTools(), getPlanner()]);
  return NextResponse.json({ ai: getAiStatus(), planner: { name: planner.name, enabled: planner.enabled }, skills: skills.filter(s => s.enabled), tools: tools.filter(t => t.enabled) });
}
