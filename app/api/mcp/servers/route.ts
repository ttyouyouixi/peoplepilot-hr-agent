import { NextResponse } from "next/server";
import { getMcpServers, saveMcpServers } from "@/lib/store";
import type { McpServerConfig } from "@/lib/types";

export const runtime = "nodejs";
export async function GET() { return NextResponse.json(await getMcpServers()); }
export async function PUT(req: Request) {
  const servers = await req.json() as McpServerConfig[];
  if (!Array.isArray(servers)) return NextResponse.json({ error: "MCP Server 配置格式错误" }, { status: 400 });
  for (const server of servers) {
    try {
      const url = new URL(server.url);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch { return NextResponse.json({ error: `${server.name || "MCP Server"} 的 URL 无效` }, { status: 400 }); }
  }
  await saveMcpServers(servers);
  return NextResponse.json({ ok: true, servers });
}
