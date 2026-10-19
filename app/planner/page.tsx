"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import type { Plan, PlannerConfig } from "@/lib/types";

const splitIds = (value: string) => value.split(/[,，\n]+/).map(item => item.trim().replace(/^\$/, "")).filter(Boolean);

export default function PlannerPage() {
  const [planner, setPlanner] = useState<PlannerConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [testInput, setTestInput] = useState("预算 100 元，想买低糖的办公室零食，有什么优惠？");
  const [testPlan, setTestPlan] = useState<Plan | null>(null);
  const [testing, setTesting] = useState(false);
  const [explanation,setExplanation]=useState<any>(null); const [explaining,setExplaining]=useState(false);

  useEffect(() => { fetch("/api/planner").then(response => response.json()).then(setPlanner).catch(reason => setError(String(reason))); }, []);
  function update(patch: Partial<PlannerConfig>) { setPlanner(current => current ? { ...current, ...patch } : current); setSaved(""); setTestPlan(null); }
  function moveSkill(index:number,delta:number){if(!planner)return;const next=[...planner.requiredSkills];const target=index+delta;if(target<0||target>=next.length)return;[next[index],next[target]]=[next[target],next[index]];update({requiredSkills:next})}

  async function save() {
    if (!planner) return;
    setError("");
    const response = await fetch("/api/planner", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(planner) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "保存失败"); return; }
    setSaved("Planner 配置已保存，前台下次执行立即生效"); setTimeout(() => setSaved(""), 3000);
  }

  async function test() {
    if (!planner || !testInput.trim()) return;
    setTesting(true); setError(""); setTestPlan(null);
    const response = await fetch("/api/planner/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planner, input: testInput }) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Planner 测试失败"); else setTestPlan(data.plan);
    setTesting(false);
  }
  async function explain(){if(!planner)return;setExplaining(true);const response=await fetch("/api/explain",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"planner",payload:{planner,plan:testPlan,decisionTrace:testPlan?.decisionTrace}})});setExplanation(await response.json());setExplaining(false)}

  return <div className="shell"><Header/><main className="page">
    <div className="hero-row"><div><div className="eyebrow">Plan designer</div><h1>Planner 管理中心</h1><p className="sub">设计 Agent 如何选择 Skill 与 Tool，并在执行前校验安全规则。</p></div>{planner && <div className="hero-meta"><span className="pill">{planner.requiredSkills.length} 必经 Skills</span><span className="pill">{planner.baseTools.length + planner.priceTools.length} 规则 Tools</span><span className="pill">JSON Plan</span></div>}</div>
    {error && <div className="error" style={{marginBottom:16}}>{error}</div>}
    {planner ? <div className="planner-layout">
      <section className="card editor"><div className="editor-top"><div><h2>{planner.name}</h2><div className="editor-id">{planner.id}</div></div><div className="editor-buttons"><button className="secondary" disabled={explaining} onClick={explain}>{explaining?"正在解释…":"解释 Planner"}</button><button aria-label="切换 Planner 启用状态" className={`switch ${planner.enabled ? "on" : ""}`} onClick={() => update({ enabled: !planner.enabled })}/></div></div>
        <div className="form-grid"><div className="field"><label>Planner 名称</label><input value={planner.name} onChange={event => update({ name: event.target.value })}/></div><div className="field"><label>模型</label><input value={planner.model} onChange={event => update({ model: event.target.value })}/></div><div className="field full"><label>说明</label><input value={planner.description} onChange={event => update({ description: event.target.value })}/></div><div className="field full"><label>Planner System Prompt</label><textarea className="planner-prompt" value={planner.prompt} onChange={event => update({ prompt: event.target.value })}/></div><div className="field"><label>Temperature · {planner.temperature}</label><input type="range" min="0" max="1" step="0.1" value={planner.temperature} onChange={event => update({ temperature: Number(event.target.value) })}/></div><div className="field"><label>最大输出 Tokens</label><input type="number" min="200" max="4000" value={planner.maxTokens} onChange={event => update({ maxTokens: Number(event.target.value) })}/></div></div>
        <div className="visual-flow"><div className="panel-title">可视化编排</div><div className="panel-kicker">调整必经 Skill 顺序；风控执行时仍固定在末尾</div><div className="flow-nodes">{planner.requiredSkills.map((id,index)=><div className="flow-node" key={id}><span>{index+1}</span><strong>${id}</strong><div><button onClick={()=>moveSkill(index,-1)}>←</button><button onClick={()=>moveSkill(index,1)}>→</button></div></div>)}</div></div>
        <div className="planner-rules"><div className="panel-title">执行规则</div><div className="panel-kicker">使用逗号分隔能力 ID；$risk-check 始终强制保留在最后一步</div><div className="field"><label>必经 Skills</label><textarea value={planner.requiredSkills.map(id => `$${id}`).join(", ")} onChange={event => update({ requiredSkills: splitIds(event.target.value) })}/></div><div className="rule-columns"><div className="field"><label>基础 Tools</label><textarea value={planner.baseTools.join(", ")} onChange={event => update({ baseTools: splitIds(event.target.value) })}/></div><div className="field"><label>价格相关 Tools</label><textarea value={planner.priceTools.join(", ")} onChange={event => update({ priceTools: splitIds(event.target.value) })}/></div></div></div>
        <div className="actions"><span className="save-note">{saved}</span><button className="primary" onClick={save}>保存 Planner</button></div>
      </section>
      <div style={{display:"grid",gap:18,alignContent:"start"}}>{explanation&&<section className="card explanation-panel"><div className="panel-title">Planner 解释说明</div><p className="explanation-summary">{explanation.summary||explanation.error}</p>{explanation.sections?.map((s:any,i:number)=><div key={i}><h4>{s.title}</h4><p>{s.content}</p></div>)}</section>}<section className="card planner-test"><div className="panel-title">计划预览</div><div className="panel-kicker">使用当前未保存配置调用真实 Planner</div><textarea value={testInput} onChange={event => setTestInput(event.target.value)}/><button className="primary" disabled={testing} onClick={test}>{testing ? "正在规划…" : "生成测试计划"}</button></section>
        <section className="card"><div className="panel-head"><div><div className="panel-title">Plan 与决策过程</div><div className="panel-kicker">展示可审计依据，不展示隐藏思维链</div></div></div>{testPlan ? <div className="plan"><div className="plan-summary">{testPlan.reasoning}</div><div className="decision-flow">{testPlan.decisionTrace.map((event,index)=><div className="decision-event" key={`${event.stage}-${index}`}><span>{index+1}</span><div><strong>{event.title}</strong><p>{event.detail}</p>{event.data&&<pre>{JSON.stringify(event.data,null,2)}</pre>}</div></div>)}</div>{testPlan.steps.map((step,index) => <div className="step" key={step.id}><div className="step-num">{index + 1}</div><div><div className="step-name">{step.type === "skill" ? "$" : ""}{step.capability}</div><div className="step-purpose">{step.purpose}</div></div><span className={`type ${step.type}`}>{step.type}</span></div>)}</div> : <div className="empty" style={{minHeight:240}}><p>输入问题后生成计划预览</p></div>}</section>
      </div>
    </div> : <div className="card empty">正在加载 Planner 配置…</div>}
  </main></div>;
}
