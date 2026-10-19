import { NextResponse } from "next/server";
import { createVersion, readData, writeData } from "@/lib/store";
const files = { employees: "business/employees.json", attendance: "business/attendance.json", "feedback-360": "business/feedback-360.json", performance: "business/performance.json", "org-structure": "business/org-structure.json", "talent-reviews": "business/talent-reviews.json" } as const;
export const runtime = "nodejs";
export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) { const { kind } = await ctx.params; const file = files[kind as keyof typeof files]; if (!file) return NextResponse.json({ error: "未知数据类型" }, { status: 404 }); return NextResponse.json(await readData(file)); }
export async function PUT(req: Request, ctx: { params: Promise<{ kind: string }> }) { const { kind } = await ctx.params; const file = files[kind as keyof typeof files]; if (!file) return NextResponse.json({ error: "未知数据类型" }, { status: 404 }); const data = await req.json(); await createVersion("catalog", `保存 ${kind}`, { file, data: await readData(file) }); await writeData(file, data); return NextResponse.json({ ok: true, data }); }
