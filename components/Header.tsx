"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function Header({ mode }: { mode?: string }) {
  const path = usePathname();
  const [detectedMode, setDetectedMode] = useState(mode || "unknown");
  useEffect(() => {
    if (mode) { setDetectedMode(mode); return; }
    fetch("/api/status").then(response => response.json()).then(data => setDetectedMode(data.ai?.mode || "unconfigured")).catch(() => setDetectedMode("unconfigured"));
  }, [mode]);
  return <header className="topbar">
    <div className="brand"><div className="brand-mark">S</div><span>SnackOps</span></div>
    <nav className="nav"><Link className={path === "/" ? "active" : ""} href="/">Agent</Link><Link className={path.startsWith("/demo") ? "active" : ""} href="/demo">Demo</Link><Link className={path.startsWith("/planner") ? "active" : ""} href="/planner">Planner</Link><Link className={path.startsWith("/skills") ? "active" : ""} href="/skills">Skill</Link><Link className={path.startsWith("/tools") ? "active" : ""} href="/tools">Tool</Link><Link className={path.startsWith("/ops") ? "active" : ""} href="/ops">运营</Link><Link className={path.startsWith("/catalog") ? "active" : ""} href="/catalog">数据</Link></nav>
    <div className="status"><i className={`dot ${detectedMode === "ai" ? "" : "off"}`}/> {detectedMode === "ai" ? "真实模型模式" : detectedMode === "demo" ? "本地演示模式" : detectedMode === "unconfigured" ? "模型未配置" : "正在检查模型"}</div>
  </header>;
}
