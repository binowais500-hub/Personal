import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  bankName: z.string().min(1).optional(),
  principal: z.number().positive().optional(),
  startDate: z.string().optional(),
  tenorMonths: z.number().int().positive().optional(),
  fixedRateAPR: z.number().min(0).optional(),
  fixedPeriodEndDate: z.string().optional(),
  marginBps: z.number().int().optional(),
  eiborAssumptionBps: z.number().int().optional(),
  monthlyPayment: z.number().positive().optional(),
  earlySettlementFeeCapPct: z.number().min(0).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { startDate, fixedPeriodEndDate, ...rest } = parsed.data;
  const mortgage = await db.mortgage.update({
    where: { id },
    data: {
      ...rest,
      ...(startDate ? { startDate: new Date(startDate) } : {}),
      ...(fixedPeriodEndDate ? { fixedPeriodEndDate: new Date(fixedPeriodEndDate) } : {}),
    },
  });
  return NextResponse.json({ mortgage });
}
