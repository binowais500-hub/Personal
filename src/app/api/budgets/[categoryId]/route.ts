import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const patchSchema = z.object({ amountAED: z.number().min(0) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const budget = await db.budget.upsert({
    where: { categoryId },
    update: { amountAED: parsed.data.amountAED },
    create: { categoryId, amountAED: parsed.data.amountAED },
  });
  return NextResponse.json({ budget });
}
