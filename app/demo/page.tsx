"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type Message = { id: string; role: "user" | "assistant"; content: string };

const initialMessages: Message[] = [
  { id: "welcome-user-1", role: "user", content: "帮我总结张一鸣当前的工作状态，并告诉我下一步怎么管理" },
  { id: "welcome-ai-1", role: "assistant", content: "已完成员工状态总结、管理关注信号识别和行动建议。结论仅基于当前数据，最终判断需由 Leader / HR 确认。" }
];

const quickQuestions = ["帮我总结张一鸣当前的工作状态", "帮我看看研发二组当前的管理状态", "帮我准备一次关于跨团队协作的沟通"];
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const flowDonePattern = /(已|已经|预计|支持|可以|帮您|为您|建议您|申请|发起|送达|退款|退货|换货|还有|如需|希望|祝您)/;
const shouldAskRatingSoon = (reply: string) => flowDonePattern.test(reply);

export default function DemoPage() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [lastRequestId, setLastRequestId] = useState<string>();
  const [ratingVisible, setRatingVisible] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const ratingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, typing]);
  useEffect(() => () => { if (ratingTimerRef.current) clearTimeout(ratingTimerRef.current); }, []);

  function scheduleRating(reply: string) {
    if (ratingTimerRef.current) clearTimeout(ratingTimerRef.current);
    ratingTimerRef.current = setTimeout(() => setRatingVisible(true), shouldAskRatingSoon(reply) ? 1600 : 90000);
  }

  async function send(value = input) {
    const content = value.trim();
    if (!content || typing) return;
    if (ratingTimerRef.current) clearTimeout(ratingTimerRef.current);
    setMessages(current => [...current, { id: crypto.randomUUID(), role: "user", content }]);
    setInput(""); setTyping(true); setRatingDone(false); setRatingVisible(false);
    try {
      const [response] = await Promise.all([
        fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: content, sessionId }) }),
        wait(1000)
      ]);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Agent 暂时无法回复");
      setSessionId(data.sessionId);
      setLastRequestId(data.requestId);
      setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", content: data.finalReply }]);
      scheduleRating(data.finalReply);
    } catch (error) {
      setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", content: `抱歉，${error instanceof Error ? error.message : "服务暂时开了小差"}，请稍后再试。` }]);
    } finally { setTyping(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void send(); }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
  }
  async function submitRating(score: number) {
    const qaPairs = messages.reduce<Array<{ question: string; answer: string }>>((pairs, message) => {
      if (message.role === "user") return [...pairs, { question: message.content, answer: "" }];
      const last = pairs.at(-1);
      if (last && !last.answer) last.answer = message.content;
      return pairs;
    }, []).filter(pair => pair.question && pair.answer);
    const response = await fetch("/api/ratings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score, feedback: "", sessionId, requestId: lastRequestId, source: "demo", messages: messages.map(({ role, content }) => ({ role, content })), qaPairs }) });
    if (response.ok) { setRatingDone(true); setRatingVisible(false); }
  }

  return <main className="demo-shell">
    <section className="demo-chat" aria-label="人事管理助手对话">
      <header className="demo-header">
        <div className="demo-title-mark">人</div>
        <div><h1>人事管理助手</h1><p><i/>已连接 Planner 与人事数据</p></div>
        <a href="/" className="demo-console-link">Agent 工作台</a>
      </header>

      <div className="demo-quick"><span>常见管理问题</span><div>{quickQuestions.map(question => <button key={question} disabled={typing} onClick={() => void send(question)}>{question}</button>)}</div></div>

      <div className="demo-messages" aria-live="polite">
        <div className="demo-time">今天 14:30</div>
        {messages.map(message => <div className={`demo-message ${message.role}`} key={message.id}>
          {message.role === "assistant" && <div className="demo-avatar">人</div>}
          <div><div className="demo-bubble">{message.content}</div>{message.role === "assistant" && <small>AI 人事助手 · 数据已核验</small>}</div>
        </div>)}
        {typing && <div className="demo-message assistant"><div className="demo-avatar">人</div><div className="demo-bubble demo-typing"><span/><span/><span/><em>正在分析人事数据…</em></div></div>}
        {ratingVisible && !ratingDone && <div className="demo-message assistant"><div className="demo-avatar">人</div><div><div className="demo-bubble demo-rating-card"><strong>这次管理建议对你有帮助吗？</strong><div className="demo-stars">{[1, 2, 3, 4, 5].map(score => <button type="button" key={score} onClick={() => void submitRating(score)}>{score}</button>)}</div></div><small>评价会同步到运营中心</small></div></div>}
        {ratingDone && <div className="demo-message assistant"><div className="demo-avatar">人</div><div><div className="demo-bubble demo-rating-card done">感谢反馈，已同步到运营中心。</div></div></div>}
        <div ref={bottomRef}/>
      </div>

      <form className="demo-composer" onSubmit={submit}>
        <div className="demo-input-wrap"><textarea aria-label="输入管理问题" rows={1} placeholder="请输入员工或团队管理问题…" value={input} onChange={event => setInput(event.target.value)} onKeyDown={onKeyDown}/><span>Enter 发送</span></div>
        <button className="demo-send" aria-label="发送" disabled={!input.trim() || typing} type="submit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 15-7-4.8 14-2.8-5.6L4 12Zm7.4 1.4L19 5"/></svg></button>
      </form>
      <footer className="demo-footer"><i/>{ratingDone ? "感谢反馈，已同步运营中心" : "已连接 Planner、Tool 与风险检查"}</footer>
    </section>
  </main>;
}
