import { NextResponse } from "next/server";
import { runAgent } from "@/lib/engine";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try { const { input, sessionId } = await req.json(); return NextResponse.json(await runAgent(input, { sessionId, retryLimit: 2 })); }
  catch (error: any) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error), detail: error?.cause?.message, trace: error?.trace, sessionId: error?.sessionId }, { status: 500 }); }
}
