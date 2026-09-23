import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const bodySchema = z.object({
  merchant: z.string().min(1).max(200),
  categoryId: z.string().min(1),
});

/**
 * Confirms an AI-suggested category for a merchant: saves it as a learned
 * rule (same mechanism as manually recategorizing in bulk) so every future
 * transaction from that merchant — including the rest of the current
 * import batch — is categorized automatically from now on.
 */
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { merchant, categoryId } = parsed.data;

  const category = await db.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }

  const existing = await db.categoryRule.findFirst({ where: { pattern: merchant, source: "learned" } });
  const rule = existing
    ? await db.categoryRule.update({ where: { id: existing.id }, data: { categoryId, hitCount: { increment: 1 } } })
    : await db.categoryRule.create({ data: { pattern: merchant, categoryId, priority: 20, source: "learned", hitCount: 1 } });

  return NextResponse.json({ ok: true, rule });
}
