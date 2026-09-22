import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export async function GET() {
  const mortgage = await db.mortgage.findFirst({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ mortgage });
}

const schema = z.object({
  bankName: z.string().min(1),
  principal: z.number().positive(),
  startDate: z.string(),
  tenorMonths: z.number().int().positive(),
  fixedRateAPR: z.number().min(0),
  fixedPeriodEndDate: z.string(),
  marginBps: z.number().int(),
  eiborAssumptionBps: z.number().int(),
  monthlyPayment: z.number().positive(),
  earlySettlementFeeCapPct: z.number().min(0).default(1.0),
});

export async function POST(req: NextRequest) {
  const existing = await db.mortgage.findFirst();
  if (existing) {
    return NextResponse.json({ error: "A mortgage is already set up — edit it instead." }, { status: 409 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const mortgage = await db.mortgage.create({
    data: {
      ...parsed.data,
      startDate: new Date(parsed.data.startDate),
      fixedPeriodEndDate: new Date(parsed.data.fixedPeriodEndDate),
    },
  });
  return NextResponse.json({ mortgage });
}
