import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const patchSchema = z.object({
  categoryId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const existing = await db.transaction.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  const data: { categoryId?: string | null; categoryIsManual?: boolean; notes?: string | null } = {};

  if (parsed.data.categoryId !== undefined) {
    data.categoryId = parsed.data.categoryId;
    data.categoryIsManual = true;

    // Learn from the correction: reinforce (or create) a rule so future
    // imports from this merchant get categorized the same way automatically.
    if (parsed.data.categoryId) {
      const merchant = existing.merchantNormalized;
      const learnedRule = await db.categoryRule.findFirst({
        where: { pattern: merchant, source: "learned" },
      });
      if (learnedRule) {
        await db.categoryRule.update({
          where: { id: learnedRule.id },
          data: { categoryId: parsed.data.categoryId, hitCount: { increment: 1 } },
        });
      } else {
        await db.categoryRule.create({
          data: { pattern: merchant, categoryId: parsed.data.categoryId, priority: 20, source: "learned", hitCount: 1 },
        });
      }
    }
  }

  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

  const transaction = await db.transaction.update({ where: { id }, data });
  return NextResponse.json({ transaction });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.transaction.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
