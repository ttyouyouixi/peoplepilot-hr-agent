import { NextResponse } from "next/server";
import { discoverMcpTools } from "@/lib/mcp";
import { getMcpServers, getTools, saveMcpServers, saveTools } from "@/lib/store";
import type { McpServerConfig, ToolConfig } from "@/lib/types";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const server = await req.json() as McpServerConfig;
    const url = new URL(server.url);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("只支持 HTTP/HTTPS MCP Server");
    const discovered = await discoverMcpTools({ ...server, enabled: true });
    const [servers, tools] = await Promise.all([getMcpServers(), getTools()]);
    const nextServers = [...servers.filter(item => item.id !== server.id), { ...server, enabled: true }];
    const imported: ToolConfig[] = discovered.map(tool => ({
      id: `mcp__${server.id}__${tool.name}`,
      name: tool.name,
      description: tool.description || `来自 ${server.name} 的 MCP Tool`,
      implementation: "mcp",
      dataSource: server.url,
      enabled: true,
      serverId: server.id,
      remoteName: tool.name,
      inputSchema: tool.inputSchema || { type: "object", properties: {} }
    }));
    const importedIds = new Set(imported.map(tool => tool.id));
    const nextTools = [...tools.filter(tool => !(tool.serverId === server.id && !importedIds.has(tool.id))).filter(tool => !importedIds.has(tool.id)), ...imported];
    await Promise.all([saveMcpServers(nextServers), saveTools(nextTools)]);
    return NextResponse.json({ ok: true, server: { ...server, enabled: true }, tools: imported });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
