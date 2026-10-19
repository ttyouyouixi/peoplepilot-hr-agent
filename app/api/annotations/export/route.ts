import { NextResponse } from "next/server";
import { getAnnotations } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const approvedOnly = url.searchParams.get("approved") !== "false";
  const records = (await getAnnotations()).filter(item => !approvedOnly || item.status === "approved");
  const lines = records.map(record => JSON.stringify({
    messages: [
      { role: "system", content: "你是零食电商客服助手。请基于已核验事实回答，不编造价格、物流、优惠和售后政策。" },
      { role: "user", content: record.input },
      { role: "assistant", content: record.expectedResponse || record.modelResponse }
    ],
    metadata: {
      id: record.id,
      intentLabel: record.intentLabel,
      source: record.source,
      riskLevel: record.riskLevel,
      qualityLabel: record.qualityLabel,
      qualityDimensions: record.qualityDimensions,
      requiredCapabilities: record.requiredCapabilities,
      expectedFacts: record.expectedFacts,
      forbiddenPhrases: record.forbiddenPhrases
    }
  })).join("\n");
  return new Response(lines + (lines ? "\n" : ""), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="annotations-${approvedOnly ? "approved" : "all"}.jsonl"`
    }
  });
}
