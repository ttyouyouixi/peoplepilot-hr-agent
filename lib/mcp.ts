import type { McpServerConfig } from "./types";

type JsonRpcResponse = { id?: number; result?: any; error?: { code: number; message: string; data?: unknown } };

class StreamableMcpClient {
  private requestId = 0;
  private sessionId = "";
  constructor(private server: McpServerConfig) {}

  private headers() {
    const token = this.server.authTokenEnv ? process.env[this.server.authTokenEnv] : undefined;
    if (this.server.authTokenEnv && !token) throw new Error(`MCP Token 环境变量未设置：${this.server.authTokenEnv}`);
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {})
    };
  }

  private async parseResponse(response: Response, expectedId?: number): Promise<JsonRpcResponse | null> {
    if (response.status === 202 || response.status === 204) return null;
    const text = await response.text();
    if (!response.ok) throw new Error(`MCP HTTP ${response.status}: ${text.slice(0, 300)}`);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return JSON.parse(text);
    const messages = text.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).filter(Boolean).map(line => JSON.parse(line) as JsonRpcResponse);
    return messages.find(message => expectedId === undefined || message.id === expectedId) || messages.at(-1) || null;
  }

  private async send(method: string, params?: Record<string, unknown>, notification = false) {
    const id = notification ? undefined : ++this.requestId;
    const response = await fetch(this.server.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", ...(id ? { id } : {}), method, ...(params ? { params } : {}) })
    });
    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) this.sessionId = sessionId;
    const message = await this.parseResponse(response, id);
    if (message?.error) throw new Error(`MCP ${message.error.code}: ${message.error.message}`);
    return message?.result;
  }

  async connect() {
    if (!this.server.enabled) throw new Error(`MCP Server ${this.server.name} 已停用`);
    await this.send("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "snackops-mcp-client", version: "0.1.0" }
    });
    await this.send("notifications/initialized", undefined, true);
  }

  listTools(cursor?: string) { return this.send("tools/list", cursor ? { cursor } : {}); }
  callTool(name: string, args: Record<string, unknown>) { return this.send("tools/call", { name, arguments: args }); }
  async close() {
    if (!this.sessionId) return;
    await fetch(this.server.url, { method: "DELETE", headers: this.headers() }).catch(() => {});
  }
}

export async function discoverMcpTools(server: McpServerConfig) {
  const client = new StreamableMcpClient(server);
  try {
    await client.connect();
    const discovered: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor);
      discovered.push(...(page?.tools || []).map((tool: any) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema as Record<string, unknown> })));
      cursor = page?.nextCursor;
    } while (cursor);
    return discovered;
  } finally { await client.close(); }
}

export async function callMcpTool(server: McpServerConfig, name: string, args: Record<string, unknown>) {
  const client = new StreamableMcpClient(server);
  try {
    await client.connect();
    const result = await client.callTool(name, args);
    if (result?.isError) throw new Error(`MCP Tool 返回错误：${JSON.stringify(result.content)}`);
    return { content: result?.content || [], structuredContent: result?.structuredContent ?? null };
  } finally { await client.close(); }
}
