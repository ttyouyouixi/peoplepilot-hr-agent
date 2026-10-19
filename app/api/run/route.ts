import { NextResponse } from "next/server";
import { runAgent } from "@/lib/engine";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const { input, sessionId, retryLimit } = await req.json();
    if (!input?.trim()) return NextResponse.json({ error: "请输入客服问题" }, { status: 400 });
    return NextResponse.json(await runAgent(input.trim(), { sessionId, retryLimit }));
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), detail: e?.cause?.message, trace: e?.trace, sessionId: e?.sessionId }, { status: 500 });
  }
}
