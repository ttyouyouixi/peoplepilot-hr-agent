"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import type { McpServerConfig, ToolConfig } from "@/lib/types";

const implementationLabel = { json_query: "本地 JSON 查询", code: "确定性代码", mcp: "MCP Streamable HTTP" } as const;
const sourceButtonLabel = { json_query: "查看 JSON", code: "查看代码", mcp: "查看 MCP 配置" } as const;
type SourcePreview = { kind: "json" | "typescript"; path: string; content: string };
const emptyServer = (): McpServerConfig => ({ id: `server_${Date.now()}`, name: "", url: "", authTokenEnv: "", enabled: true });

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolConfig[]>([]);
  const [selected, setSelected] = useState(0);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [serverDraft, setServerDraft] = useState<McpServerConfig>(emptyServer);
  const [connecting, setConnecting] = useState(false);
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const tool = tools[selected];

  useEffect(() => {
    Promise.all([fetch("/api/tools"), fetch("/api/mcp/servers")]).then(async ([toolResponse, serverResponse]) => {
      const [toolData, serverData] = await Promise.all([toolResponse.json(), serverResponse.json()]);
      if (!toolResponse.ok || !serverResponse.ok) throw new Error(toolData.error || serverData.error || "加载失败");
      setTools(toolData); setServers(serverData);
    }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  function update(patch: Partial<ToolConfig>) {
    setTools(current => current.map((item, index) => index === selected ? { ...item, ...patch } : item));
    setSaved("");
  }

  async function save() {
    setError("");
    const response = await fetch("/api/tools", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tools) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "保存失败"); return; }
    setSaved("已保存，Planner 下次执行立即生效");
    setTimeout(() => setSaved(""), 3000);
  }

  async function connectMcp() {
    if (!serverDraft.name.trim() || !serverDraft.url.trim()) { setError("请填写 MCP Server 名称和 URL"); return; }
    setConnecting(true); setError(""); setSaved("");
    try {
      const response = await fetch("/api/mcp/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(serverDraft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "MCP 连接失败");
      const toolResponse = await fetch("/api/tools");
      setTools(await toolResponse.json());
      setServers(current => [...current.filter(item => item.id !== data.server.id), data.server]);
      setSaved(`已连接 ${serverDraft.name}，导入 ${data.tools.length} 个 MCP Tool`);
      setServerDraft(emptyServer());
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setConnecting(false); }
  }

  async function viewSource() {
    if (!tool) return;
    setLoadingSource(true); setError("");
    try {
      const response = await fetch(`/api/tools/${encodeURIComponent(tool.id)}/source`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取 Tool 实现失败");
      setPreview(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoadingSource(false); }
  }

  return <div className="shell"><Header/><main className="page">
    <div className="hero-row"><div><div className="eyebrow">Local + MCP tools</div><h1>Tool 管理中心</h1><p className="sub">本地代码能力与远程 MCP Tool 使用同一套 Planner、Executor 和执行轨迹。</p></div><div className="hero-meta"><span className="pill">{tools.filter(item => item.enabled).length} 个已启用</span><span className="pill">{tools.filter(item => item.implementation === "mcp").length} 个 MCP</span><span className="pill">Streamable HTTP</span></div></div>
    {error && <div className="error" style={{marginBottom:16}}>{error}</div>}
    <section className="card mcp-config"><div className="mcp-title"><div><div className="panel-title">MCP Servers</div><div className="panel-kicker">连接后自动发现并导入远程 Tools</div></div><span className="type tool">MCP</span></div>
      <div className="mcp-form"><div className="field"><label>Server 名称</label><input placeholder="例如：订单查询服务" value={serverDraft.name} onChange={event => setServerDraft(current => ({...current, name:event.target.value}))}/></div><div className="field"><label>Streamable HTTP URL</label><input placeholder="https://example.com/mcp" value={serverDraft.url} onChange={event => setServerDraft(current => ({...current, url:event.target.value}))}/></div><div className="field"><label>Bearer Token 环境变量</label><input placeholder="可选，例如 MCP_API_TOKEN" value={serverDraft.authTokenEnv} onChange={event => setServerDraft(current => ({...current, authTokenEnv:event.target.value}))}/></div><button className="primary" disabled={connecting} onClick={connectMcp}>{connecting ? "正在发现…" : "连接并导入"}</button></div>
      {servers.length > 0 && <div className="server-chips">{servers.map(server => <button key={server.id} onClick={() => setServerDraft(server)}><i className="enabled-dot"/><span><strong>{server.name}</strong><small>{server.url}</small></span></button>)}</div>}
    </section>
    <div className="skills-grid">
      <section className="card skill-list"><div className="panel-head"><div><div className="panel-title">Tools</div><div className="panel-kicker">选择一项进行配置</div></div></div>
        {tools.map((item, index) => <button key={item.id} className={`skill-row ${index === selected ? "selected" : ""}`} onClick={() => setSelected(index)}><span className="skill-icon">{item.implementation === "mcp" ? "M" : `T${index + 1}`}</span><span><strong>{item.name}</strong><span>{item.implementation === "mcp" ? `MCP · ${item.remoteName}` : item.id}</span></span>{item.enabled && <i className="enabled-dot"/>}</button>)}
      </section>
      <section className="card editor">{tool ? <>
        <div className="editor-top"><div><h2>{tool.name}</h2><div className="editor-id">{tool.id}</div></div><div className="editor-buttons"><button className="secondary" disabled={loadingSource} onClick={viewSource}>{loadingSource ? "正在读取…" : sourceButtonLabel[tool.implementation]}</button><button aria-label="切换 Tool 启用状态" className={`switch ${tool.enabled ? "on" : ""}`} onClick={() => update({ enabled: !tool.enabled })}/></div></div>
        <div className="form-grid">
          <div className="field"><label>显示名称</label><input value={tool.name} onChange={event => update({ name: event.target.value })}/></div>
          <div className="field"><label>执行方式</label><input className="readonly-input" value={implementationLabel[tool.implementation]} readOnly/></div>
          <div className="field full"><label>能力描述</label><textarea style={{minHeight:100}} value={tool.description} onChange={event => update({ description: event.target.value })}/></div>
          <div className="field full"><label>数据源 / 实现位置</label><input className="readonly-input" value={tool.dataSource} readOnly/></div>
        </div>
        <div className="tool-rule"><span>i</span><p><strong>安全边界</strong><br/>{tool.implementation === "mcp" ? "MCP 参数会根据 inputSchema 生成，调用结果与参数完整写入 execution_trace；Token 只从服务端环境变量读取。" : "Tool ID、实现方式和数据源不可在管理页修改，避免配置绕过代码执行。停用必需 Tool 后，Planner 会拒绝相关任务并指出缺失能力。"}</p></div>
        <div className="actions"><span className="save-note">{saved}</span><button className="primary" onClick={save}>保存 Tool 配置</button></div>
      </> : <div className="empty">正在加载 Tool 配置…</div>}</section>
    </div>
  </main>
  {preview && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card file-modal"><div className="modal-head"><div><strong>{preview.kind === "typescript" ? "Tool 实现代码" : "Tool JSON 内容"}</strong><small>{preview.path}</small></div><button aria-label="关闭" onClick={() => setPreview(null)}>×</button></div><div className="source-kind">{preview.kind === "typescript" ? "TypeScript" : "JSON"}</div><pre className="skill-file-pre tool-source-pre">{preview.content}</pre></div></div>}
  </div>;
}
