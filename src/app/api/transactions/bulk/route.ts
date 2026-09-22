import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const patchSchema = z.object({
  ids: z.array(z.string()).min(1).max(1000),
  categoryId: z.string().nullable(),
});

export async function PATCH(req: NextRequest) {
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { ids, categoryId } = parsed.data;

  const transactions = await db.transaction.findMany({ where: { id: { in: ids } } });

  await db.transaction.updateMany({
    where: { id: { in: ids } },
    data: { categoryId: categoryId ?? undefined, categoryIsManual: true },
  });

  if (categoryId) {
    const merchants = [...new Set(transactions.map((t) => t.merchantNormalized))];
    for (const merchant of merchants) {
      const learnedRule = await db.categoryRule.findFirst({ where: { pattern: merchant, source: "learned" } });
      if (learnedRule) {
        await db.categoryRule.update({
          where: { id: learnedRule.id },
          data: { categoryId, hitCount: { increment: 1 } },
        });
      } else {
        await db.categoryRule.create({
          data: { pattern: merchant, categoryId, priority: 20, source: "learned", hitCount: 1 },
        });
      }
    }
  }

  return NextResponse.json({ ok: true, updated: transactions.length });
}

const deleteSchema = z.object({
  ids: z.array(z.string()).min(1).max(1000),
});

export async function DELETE(req: NextRequest) {
  const parsed = deleteSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { count } = await db.transaction.deleteMany({ where: { id: { in: parsed.data.ids } } });
  return NextResponse.json({ ok: true, deleted: count });
}
