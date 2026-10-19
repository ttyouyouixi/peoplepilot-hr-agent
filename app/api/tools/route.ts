import { NextResponse } from "next/server";
import { getTools, saveTools } from "@/lib/store";
import type { ToolConfig } from "@/lib/types";

export const runtime = "nodejs";
const allowedIds = new Set(["query_products", "query_activities", "query_coupons", "calculate_price", "query_order_logistics", "query_return_policy"]);

export async function GET() { return NextResponse.json(await getTools()); }

export async function PUT(req: Request) {
  const tools = await req.json() as ToolConfig[];
  if (!Array.isArray(tools) || tools.some(tool => (!allowedIds.has(tool.id) && tool.implementation !== "mcp") || !tool.name || !tool.description || (tool.implementation === "mcp" && (!tool.serverId || !tool.remoteName)))) {
    return NextResponse.json({ error: "Tool 配置不完整或包含未知实现" }, { status: 400 });
  }
  await saveTools(tools);
  return NextResponse.json({ ok: true, tools });
}
