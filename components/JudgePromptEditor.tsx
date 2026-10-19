"use client";

import { useEffect, useState } from "react";

export default function JudgePromptEditor() {
  const [prompt, setPrompt] = useState(""); const [updatedAt, setUpdatedAt] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/evaluation-settings").then(response => response.json()).then(data => { setPrompt(data.judgePrompt || ""); setUpdatedAt(data.updatedAt || ""); }); }, []);
  async function save() {
    const response = await fetch("/api/evaluation-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ judgePrompt: prompt }) });
    const data = await response.json(); setMessage(response.ok ? "LLM-as-Judge Prompt 已保存，后续评测立即生效" : data.error); if (response.ok) setUpdatedAt(data.updatedAt);
  }
  return <section className="card data-section judge-prompt-editor"><div className="section-actions"><div><div className="panel-title">LLM-as-Judge Prompt</div><div className="panel-kicker">查看并修改评测裁判的系统 Prompt；用于有 Judge 标准的评测用例</div></div><button className="primary" onClick={save}>保存 Prompt</button></div>{message && <div className="save-banner">{message}</div>}<textarea value={prompt} onChange={event => setPrompt(event.target.value)}/>{updatedAt && <small>最后更新：{new Date(updatedAt).toLocaleString()}</small>}</section>;
}
