import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "PeoplePilot · 人事 AI 管理平台", description: "Plan + Skill + Tool 人事管理 Agent 平台" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
