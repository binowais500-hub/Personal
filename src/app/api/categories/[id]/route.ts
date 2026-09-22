import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  try {
    const category = await db.category.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ category });
  } catch {
    return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const category = await db.category.findUnique({ where: { id }, include: { _count: { select: { transactions: true } } } });
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  if (category.isSystem) return NextResponse.json({ error: "Default categories can't be deleted, only renamed" }, { status: 400 });
  if (category._count.transactions > 0) {
    return NextResponse.json({ error: "Recategorize its transactions before deleting this category" }, { status: 400 });
  }
  await db.category.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
