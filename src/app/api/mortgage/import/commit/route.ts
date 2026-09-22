import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const mappingSchema = z.object({
  fileType: z.enum(["csv", "excel", "pdf"]),
  dateColumn: z.string().optional(),
  amountColumn: z.string().optional(),
  principalColumn: z.string().optional(),
  interestColumn: z.string().optional(),
  lineRegex: z.string().optional(),
  dateFormat: z.string().min(1),
  delimiter: z.string().optional(),
  skipRows: z.number().int().min(0),
  amountSign: z.enum(["spend_positive", "spend_negative"]),
});

const paymentSchema = z.object({
  date: z.string().min(1),
  amount: z.number().positive(),
  principalPortion: z.number().nullable().optional(),
  interestPortion: z.number().nullable().optional(),
});

const commitSchema = z.object({
  mortgageId: z.string().min(1),
  bankName: z.string().min(1),
  mapping: mappingSchema,
  payments: z.array(paymentSchema).min(1).max(2000),
});

export async function POST(req: NextRequest) {
  const parsed = commitSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { mortgageId, bankName, mapping, payments } = parsed.data;

  const mortgage = await db.mortgage.findUnique({ where: { id: mortgageId } });
  if (!mortgage) {
    return NextResponse.json({ error: "Mortgage not found" }, { status: 404 });
  }

  const { fileType, dateFormat, delimiter, skipRows, amountSign, ...rest } = mapping;
  await db.columnMapping.upsert({
    where: { bankName_fileType_context: { bankName, fileType, context: "mortgage" } },
    update: { mappingJson: JSON.stringify(rest), dateFormat, delimiter, skipRows, amountSign },
    create: { bankName, fileType, context: "mortgage", mappingJson: JSON.stringify(rest), dateFormat, delimiter, skipRows, amountSign },
  });

  // Natural-key duplicate check: same mortgage, same day, same amount.
  const existing = await db.mortgagePayment.findMany({
    where: { mortgageId },
    select: { date: true, amount: true },
  });
  const existingKeys = new Set(existing.map((p) => `${p.date.toISOString().slice(0, 10)}|${p.amount.toFixed(2)}`));

  let inserted = 0;
  let skippedDuplicates = 0;
  let failed = 0;

  for (const p of payments) {
    const date = new Date(p.date);
    if (Number.isNaN(date.getTime())) {
      failed++;
      continue;
    }
    const key = `${date.toISOString().slice(0, 10)}|${p.amount.toFixed(2)}`;
    if (existingKeys.has(key)) {
      skippedDuplicates++;
      continue;
    }
    existingKeys.add(key);

    await db.mortgagePayment.create({
      data: {
        mortgageId,
        date,
        amount: p.amount,
        type: "scheduled",
        principalPortion: p.principalPortion ?? undefined,
        interestPortion: p.interestPortion ?? undefined,
      },
    });
    inserted++;
  }

  return NextResponse.json({ inserted, skippedDuplicates, failed });
}
