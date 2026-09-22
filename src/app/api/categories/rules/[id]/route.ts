import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const patchSchema = z.object({
  pattern: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  priority: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const rule = await db.categoryRule.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ rule });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.categoryRule.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
