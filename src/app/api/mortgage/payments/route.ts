import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  mortgageId: z.string().min(1),
  date: z.string(),
  amount: z.number().positive(),
  type: z.enum(["scheduled", "extra", "lump_sum"]),
  principalPortion: z.number().nullable().optional(),
  interestPortion: z.number().nullable().optional(),
  feeCharged: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  const mortgageId = req.nextUrl.searchParams.get("mortgageId");
  if (!mortgageId) return NextResponse.json({ error: "mortgageId is required" }, { status: 400 });
  const payments = await db.mortgagePayment.findMany({
    where: { mortgageId },
    select: { date: true, amount: true },
  });
  return NextResponse.json({ payments });
}

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const payment = await db.mortgagePayment.create({
    data: { ...parsed.data, date: new Date(parsed.data.date) },
  });
  return NextResponse.json({ payment });
}
