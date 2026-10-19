import { NextResponse } from "next/server";
import { explainArtifact } from "@/lib/engine";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const { type, payload } = await req.json() as { type: "agent" | "planner"; payload: unknown };
    if (!['agent','planner'].includes(type)) return NextResponse.json({ error: "解释类型无效" }, { status: 400 });
    return NextResponse.json(await explainArtifact(type, payload));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
