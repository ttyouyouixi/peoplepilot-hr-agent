import { NextResponse } from "next/server";
import { readSkillFile } from "@/lib/store";

export const runtime = "nodejs";
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ path: `skills/${id}/SKILL.md`, content: await readSkillFile(id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }
}
