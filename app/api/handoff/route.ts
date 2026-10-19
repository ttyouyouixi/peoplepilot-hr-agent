import { NextResponse } from "next/server";
import { appendHandoff } from "@/lib/store";
export const runtime = "nodejs";
export async function POST(req: Request) { const body = await req.json(); const item = { id: crypto.randomUUID(), ...body, status: "pending", createdAt: new Date().toISOString() }; await appendHandoff(item); return NextResponse.json({ ok: true, handoff: item }); }
