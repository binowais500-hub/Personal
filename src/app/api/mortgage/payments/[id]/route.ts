import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.mortgagePayment.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
