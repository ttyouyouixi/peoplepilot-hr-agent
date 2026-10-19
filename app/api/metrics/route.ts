import { NextResponse } from "next/server";
import { getMetrics } from "@/lib/store";
export const runtime = "nodejs";
export async function GET() {
  const metrics = await getMetrics();
  const success = metrics.filter(item => item.success).length;
  const avgLatency = metrics.length ? Math.round(metrics.reduce((sum, item) => sum + item.latencyMs, 0) / metrics.length) : 0;
  const failures = Object.entries(metrics.filter(item => item.failedStep).reduce<Record<string, number>>((all, item) => ({ ...all, [item.failedStep!]: (all[item.failedStep!] || 0) + 1 }), {})).sort((a,b) => b[1]-a[1]);
  return NextResponse.json({ summary: { total: metrics.length, successRate: metrics.length ? Math.round(success / metrics.length * 100) : 0, avgLatency, handoffRate: metrics.length ? Math.round(metrics.filter(item => item.riskLevel === "high").length / metrics.length * 100) : 0 }, failures, metrics: metrics.slice(0, 50) });
}
