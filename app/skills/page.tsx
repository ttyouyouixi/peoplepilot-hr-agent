"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import type { Skill } from "@/lib/types";

function emptySkill(): Skill {
  return { id: "", name: "", description: "", prompt: "# Skill Instructions\n\nDescribe the workflow and required JSON output.", model: "default", temperature: 0.2, maxTokens: 800, enabled: true };
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState(0);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [testInput, setTestInput] = useState('{"userInput":"预算80元，想买低糖零食"}');
  const [testResult, setTestResult] = useState<unknown>(null);
  const [testing, setTesting] = useState(false);
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Skill>(emptySkill);
  const [createMode, setCreateMode] = useState<"ai" | "manual">("ai");
  const [createRequest, setCreateRequest] = useState("");
  const [generating, setGenerating] = useState(false);
  const skill = skills[selected];

  useEffect(() => { fetch("/api/skills").then(response => response.json()).then(setSkills).catch(reason => setError(String(reason))); }, []);

  function update(patch: Partial<Skill>) {
    setSkills(current => current.map((item, index) => index === selected ? { ...item, ...patch } : item));
    setSaved("");
  }
  function updateSchema(key:"inputSchema"|"outputSchema",value:string){try{update({[key]:value.trim()?JSON.parse(value):undefined});setError("")}catch{setError("Schema 必须是有效 JSON")}}

  async function save() {
    setError("");
    const response = await fetch("/api/skills", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(skills) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "保存失败"); return; }
    setSaved("已保存，SKILL.md 与运行配置均已更新");
    setTimeout(() => setSaved(""), 3000);
  }

  async function test() {
    if (!skill) return;
    setTesting(true); setTestResult(null);
    const response = await fetch("/api/skills/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skill, input: testInput }) });
    setTestResult(await response.json()); setTesting(false);
  }

  async function viewFile() {
    if (!skill) return;
    const response = await fetch(`/api/skills/${encodeURIComponent(skill.id)}`);
    const data = await response.json();
    if (!response.ok) { setError(data.error || "读取 SKILL.md 失败"); return; }
    setPreview(data);
  }

  async function create() {
    setCreating(true); setError("");
    const response = await fetch("/api/skills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "创建失败"); setCreating(false); return; }
    const next = [...skills, data.skill];
    setSkills(next); setSelected(next.length - 1); setDraft(emptySkill()); setShowCreate(false); setCreating(false);
    setSaved(`已创建 $${data.skill.id}`); setTimeout(() => setSaved(""), 3000);
  }

  async function generateDraft() {
    if (!createRequest.trim()) { setError("请先描述希望创建的 Skill"); return; }
    setGenerating(true); setError("");
    const response = await fetch("/api/skills/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: createRequest }) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Create Skill 生成失败");
    else setDraft(data.skill);
    setGenerating(false);
  }

  return <div className="shell"><Header/><main className="page">
    <div className="hero-row"><div><div className="eyebrow">Capability studio</div><h1>Skill 配置中心</h1><p className="sub">直接管理标准 SKILL.md。新增或保存后，Planner 和 Executor 会读取最新能力。</p></div><div className="hero-meta"><span className="pill">{skills.filter(item => item.enabled).length} 个已启用</span><span className="pill">SKILL.md</span></div></div>
    {error && <div className="error" style={{marginBottom:16}}>{error}</div>}
    <div className="skills-grid">
      <section className="card skill-list"><div className="panel-head"><div><div className="panel-title">Skills</div><div className="panel-kicker">标准 SKILL.md · 选择一项编辑</div></div><button className="secondary compact" onClick={() => { setDraft(emptySkill()); setCreateMode("ai"); setCreateRequest(""); setShowCreate(true); setError(""); }}>＋ 新增</button></div>
        {skills.map((item, index) => <button key={item.id} className={`skill-row ${index === selected ? "selected" : ""}`} onClick={() => { setSelected(index); setTestResult(null); }}><span className="skill-icon">{index + 1}</span><span><strong>{item.name}</strong><span>${item.id}</span></span>{item.enabled && <i className="enabled-dot"/>}</button>)}
      </section>
      <section className="card editor">{skill ? <>
        <div className="editor-top"><div><h2>{skill.name}</h2><div className="editor-id">${skill.id}</div></div><div className="editor-buttons"><button className="secondary" onClick={viewFile}>查看 SKILL.md</button><button aria-label="切换启用状态" className={`switch ${skill.enabled ? "on" : ""}`} onClick={() => update({ enabled: !skill.enabled })}/></div></div>
        <div className="form-grid"><div className="field"><label>显示名称 · agents/openai.yaml</label><input value={skill.name} onChange={event => update({ name: event.target.value })}/></div><div className="field"><label>模型</label><input value={skill.model} onChange={event => update({ model: event.target.value })}/></div><div className="field full"><label>触发描述 · SKILL.md frontmatter</label><input value={skill.description} onChange={event => update({ description: event.target.value })}/></div><div className="field full"><label>Skill 指令 · SKILL.md body</label><textarea value={skill.prompt} onChange={event => update({ prompt: event.target.value })}/></div><div className="field"><label>Temperature · {skill.temperature}</label><input type="range" min="0" max="1" step="0.1" value={skill.temperature} onChange={event => update({ temperature: Number(event.target.value) })}/></div><div className="field"><label>最大输出 Tokens</label><input type="number" min="100" max="4000" value={skill.maxTokens} onChange={event => update({ maxTokens: Number(event.target.value) })}/></div></div>
        <div className="schema-grid"><div className="field"><label>Input JSON Schema</label><textarea key={`${skill.id}-in`} defaultValue={skill.inputSchema?JSON.stringify(skill.inputSchema,null,2):""} onBlur={event=>updateSchema("inputSchema",event.target.value)} placeholder='{"type":"object","required":["field"]}'/></div><div className="field"><label>Output JSON Schema</label><textarea key={`${skill.id}-out`} defaultValue={skill.outputSchema?JSON.stringify(skill.outputSchema,null,2):""} onBlur={event=>updateSchema("outputSchema",event.target.value)} placeholder='{"type":"object","required":["result"]}'/></div></div>
        <div className="actions"><span className="save-note">{saved}</span><button className="primary" onClick={save}>保存配置</button></div>
        <div className="test-box"><h3>单独测试这个 Skill</h3><div className="test-row"><textarea value={testInput} onChange={event => setTestInput(event.target.value)}/><button className="secondary" disabled={testing} onClick={test}>{testing ? "测试中…" : "运行测试"}</button></div>{testResult != null && <div className="test-result"><pre>{JSON.stringify(testResult, null, 2)}</pre></div>}</div>
      </> : <div className="empty">正在加载 Skill 配置…</div>}</section>
    </div>
  </main>

  {preview && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card file-modal"><div className="modal-head"><div><strong>SKILL.md 原文</strong><small>{preview.path}</small></div><button onClick={() => setPreview(null)}>×</button></div><pre className="skill-file-pre">{preview.content}</pre></div></div>}

  {showCreate && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card create-modal">
    <div className="modal-head"><div><strong>新增标准 Skill</strong><small>AI Create Skill 或手动配置 · 确认后才写入文件</small></div><button onClick={() => setShowCreate(false)}>×</button></div>
    <div className="mode-tabs"><button className={createMode === "ai" ? "active" : ""} onClick={() => setCreateMode("ai")}>✦ Create Skill</button><button className={createMode === "manual" ? "active" : ""} onClick={() => setCreateMode("manual")}>手动配置</button></div>
    {error && <div className="error" style={{margin:"0 0 16px"}}>{error}</div>}
    {createMode === "ai" && <div className="create-ai-box"><div className="field"><label>描述希望创建的能力</label><textarea placeholder="例如：创建一个售后问题分类 Skill，识别退款、破损、漏发和物流问题，输出分类、优先级和处理建议。" value={createRequest} onChange={event => setCreateRequest(event.target.value)}/></div><div className="create-ai-footer"><span>将生成标准名称、触发描述、SKILL.md 指令和建议参数</span><button className="primary" disabled={generating} onClick={generateDraft}>{generating ? "正在设计…" : "生成 Skill 草稿"}</button></div></div>}
    {(createMode === "manual" || draft.id) && <><div className="draft-divider"><span>{createMode === "ai" ? "AI 生成草稿 · 可继续修改" : "手动填写"}</span></div><div className="form-grid"><div className="field"><label>Skill 名称</label><input placeholder="例如 after-sales-advice" value={draft.id} onChange={event => setDraft(current => ({ ...current, id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))}/><small>仅小写字母、数字和连字符；调用形式为 ${draft.id || "skill-name"}</small></div><div className="field"><label>显示名称</label><input placeholder="例如 售后建议" value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}/></div><div className="field full"><label>触发描述</label><textarea className="short-textarea" placeholder="说明 Skill 做什么，以及何时应该调用它。" value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}/></div><div className="field full"><label>Skill 指令</label><textarea placeholder="使用命令式语言描述工作流、约束与输出格式。" value={draft.prompt} onChange={event => setDraft(current => ({ ...current, prompt: event.target.value }))}/></div><div className="field"><label>模型</label><input value={draft.model} onChange={event => setDraft(current => ({ ...current, model: event.target.value }))}/></div><div className="field"><label>最大输出 Tokens</label><input type="number" min="100" max="4000" value={draft.maxTokens} onChange={event => setDraft(current => ({ ...current, maxTokens: Number(event.target.value) }))}/></div></div></>}
    <div className="modal-actions"><button className="secondary" onClick={() => setShowCreate(false)}>取消</button><button className="primary" disabled={creating || !draft.id} onClick={create}>{creating ? "创建中…" : "确认创建 Skill"}</button></div>
  </div></div>}
  </div>;
}
