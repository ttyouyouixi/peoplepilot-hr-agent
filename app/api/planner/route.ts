import { NextResponse } from "next/server";
import { getPlanner, savePlanner } from "@/lib/store";
import type { PlannerConfig } from "@/lib/types";

export const runtime = "nodejs";
export async function GET() { return NextResponse.json(await getPlanner()); }
export async function PUT(req: Request) {
  try {
    const planner = await req.json() as PlannerConfig;
    await savePlanner(planner);
    return NextResponse.json({ ok: true, planner });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
