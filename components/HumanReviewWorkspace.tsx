"use client";

import { useEffect, useState } from "react";

const split = (value: string) => value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean);

export default function HumanReviewWorkspace() {
  const [items, setItems] = useState<any[]>([]); const [selectedId, setSelectedId] = useState(""); const [message, setMessage] = useState("");
  const [form, setForm] = useState({ expectedResponse: "", intentLabel: "人工评估", qualityLabel: "bad", riskLevel: "low", requiredCapabilities: "", expectedFacts: "", forbiddenPhrases: "", notes: "" });
  async function load() { const data = await fetch("/api/human-reviews").then(response => response.json()); setItems(data.items || []); setSelectedId(data.items?.[0]?.id || ""); }
  useEffect(() => { void load(); }, []);
  const selected = items.find(item => item.id === selectedId) || items[0];
  async function submit() {
    if (!selected) return;
    const response = await fetch("/api/human-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, source: selected.source, sourceId: selected.sourceId, input: selected.input, modelResponse: selected.modelResponse, requiredCapabilities: split(form.requiredCapabilities), expectedFacts: split(form.expectedFacts), forbiddenPhrases: split(form.forbiddenPhrases) }) });
    const data = await response.json(); setMessage(response.ok ? "已沉淀为标注数据，可到「数据标注」审核并发布 Eval" : data.error); if (response.ok) { setForm({ expectedResponse: "", intentLabel: "人工评估", qualityLabel: "bad", riskLevel: "low", requiredCapabilities: "", expectedFacts: "", forbiddenPhrases: "", notes: "" }); await load(); }
  }
  return <>
    {message && <div className="save-banner">{message}</div>}
    <section className="card annotation-toolbar"><div><div className="panel-title">人工评估</div><div className="panel-kicker">复核 Bad Case 与低分服务，写出期望回复并沉淀为标注数据</div></div><button className="secondary" onClick={load}>刷新队列</button></section>
    <div className="human-review-layout">
      <section className="card annotation-list">{items.length ? items.map(item => <button className={item.id === selected?.id ? "selected" : ""} key={item.id} onClick={() => setSelectedId(item.id)}><div><span className={`annotation-source ${item.source === "rating" ? "conversation" : "bad_case"}`}>{item.source === "rating" ? "低分服务" : "Bad Case"}</span><em className="annotation-quality bad">{item.score}分</em></div><strong>{item.title}</strong><p>{item.input}</p><small>{new Date(item.createdAt).toLocaleString()}</small></button>) : <div className="empty" style={{minHeight:280}}>当前没有待人工评估数据</div>}</section>
      <section className="card annotation-editor">{selected ? <><div className="annotation-editor-head"><div><span className={`annotation-source ${selected.source === "rating" ? "conversation" : "bad_case"}`}>{selected.source === "rating" ? "低分服务" : "Bad Case"}</span><h2>{selected.title}</h2><small>{selected.sourceId}</small></div><button className="primary" onClick={submit}>保存为标注</button></div>
        <div className="annotation-grid"><div className="field full"><label>客户问题</label><textarea readOnly className="readonly-annotation" value={selected.input}/></div><div className="field full"><label>模型回复</label><textarea readOnly className="readonly-annotation" value={selected.modelResponse}/></div><div className="field full"><label>发现的问题</label><textarea readOnly className="readonly-annotation" value={(selected.issues || []).join("；")}/></div><div className="field full"><label>人工期望回复</label><textarea value={form.expectedResponse} onChange={event => setForm({...form, expectedResponse: event.target.value})}/></div><div className="field"><label>意图标签</label><input value={form.intentLabel} onChange={event => setForm({...form, intentLabel: event.target.value})}/></div><div className="field"><label>质量标签</label><select value={form.qualityLabel} onChange={event => setForm({...form, qualityLabel: event.target.value})}><option value="bad">bad</option><option value="uncertain">uncertain</option><option value="good">good</option></select></div><div className="field"><label>风险等级</label><select value={form.riskLevel} onChange={event => setForm({...form, riskLevel: event.target.value})}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></div><div className="field"><label>必经能力</label><input value={form.requiredCapabilities} onChange={event => setForm({...form, requiredCapabilities: event.target.value})}/></div><div className="field"><label>期望 Tool 事实</label><textarea value={form.expectedFacts} onChange={event => setForm({...form, expectedFacts: event.target.value})}/></div><div className="field"><label>禁用表述</label><textarea value={form.forbiddenPhrases} onChange={event => setForm({...form, forbiddenPhrases: event.target.value})}/></div><div className="field full"><label>人工备注</label><textarea value={form.notes} onChange={event => setForm({...form, notes: event.target.value})}/></div></div>
      </> : <div className="empty">选择一条待复核数据</div>}</section>
    </div>
  </>;
}
