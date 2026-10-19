import { NextResponse } from "next/server";
import { testPlanner } from "@/lib/engine";
import type { PlannerConfig } from "@/lib/types";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const { planner, input } = await req.json() as { planner: PlannerConfig; input: string };
    return NextResponse.json({ plan: await testPlanner(planner, input) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
