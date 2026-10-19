"use client";

import { useEffect, useState } from "react";

export default function ImprovementCenter() {
  const [data, setData] = useState<any>(null); const [draft, setDraft] = useState<any>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/improvement-suggestions").then(response => response.json()).then(setData); }, []);
  async function generatePrompt() { setBusy(true); const response = await fetch("/api/improvement-suggestions/generate-prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ focus: data?.summary }) }); const json = await response.json(); setDraft(json.suggestion || json); setBusy(false); }
  if (!data) return <div className="empty" style={{minHeight: 220}}>正在分析 Bad Case、低分评分和标注数据…</div>;
  return <>
    <div className="improvement-summary"><div><span>Bad Case</span><strong>{data.summary.badCases}</strong></div><div><span>低分服务</span><strong>{data.summary.lowRatings}</strong></div><div><span>待处理标注</span><strong>{data.summary.pendingAnnotations}</strong></div></div>
    {data.summary.weakestDimensions?.length > 0 && <section className="card data-section dimension-insights"><div className="panel-title">六维质量薄弱项</div><div>{data.summary.weakestDimensions.map((item: any) => <span key={item.key}>{item.label} <b>{item.lowCount}</b><small>均分 {item.average}</small></span>)}</div></section>}
    <section className="card data-section"><div className="section-actions"><div><div className="panel-title">改进建议中心</div><div className="panel-kicker">自动聚合 Eval 失败、低分服务和标注队列，给出下一步优化方向</div></div><div><button className="secondary" onClick={() => fetch("/api/improvement-suggestions").then(response => response.json()).then(setData)}>刷新</button><button className="primary" disabled={busy} onClick={generatePrompt}>{busy ? "生成中…" : "生成 Prompt 修改建议"}</button></div></div>
      <div className="improvement-list">{data.suggestions.map((item: any) => <article className={`improvement-card ${item.priority}`} key={item.id}><div><span>{item.priority}</span><strong>{item.title}</strong><small>{item.target}</small></div><p>{item.reason}</p><b>{item.action}</b>{item.evidence?.length > 0 && <ul>{item.evidence.map((value: string) => <li key={value}>{value}</li>)}</ul>}</article>)}</div>
    </section>
    {draft && <section className="card data-section prompt-draft"><div className="panel-title">Prompt 修改建议草案</div><pre>{JSON.stringify(draft, null, 2)}</pre></section>}
  </>;
}
