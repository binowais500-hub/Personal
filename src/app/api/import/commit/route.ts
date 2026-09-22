import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { computeDedupeHash } from "@/lib/dedupe";
import { normalizeMerchant } from "@/lib/merchant";

const mappingSchema = z.object({
  fileType: z.enum(["csv", "excel", "pdf"]),
  dateColumn: z.string().optional(),
  descriptionColumn: z.string().optional(),
  amountColumn: z.string().optional(),
  currencyColumn: z.string().optional(),
  foreignAmountColumn: z.string().optional(),
  feeColumn: z.string().optional(),
  lineRegex: z.string().optional(),
  dateFormat: z.string().min(1),
  delimiter: z.string().optional(),
  skipRows: z.number().int().min(0),
  amountSign: z.enum(["spend_positive", "spend_negative"]),
});

const txnSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  amountAED: z.number(),
  amountOriginal: z.number(),
  currencyOriginal: z.string().default("AED"),
  fxFee: z.number().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  categoryIsManual: z.boolean().optional(),
});

const commitSchema = z.object({
  cardId: z.string().min(1),
  bankName: z.string().min(1),
  fileName: z.string().min(1),
  mapping: mappingSchema,
  transactions: z.array(txnSchema).min(1).max(5000),
});

export async function POST(req: NextRequest) {
  const parsed = commitSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { cardId, bankName, fileName, mapping, transactions } = parsed.data;

  const card = await db.card.findUnique({ where: { id: cardId } });
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const { fileType, dateFormat, delimiter, skipRows, amountSign, ...rest } = mapping;
  await db.columnMapping.upsert({
    where: { bankName_fileType: { bankName, fileType } },
    update: { mappingJson: JSON.stringify(rest), dateFormat, delimiter, skipRows, amountSign, cardId },
    create: { bankName, fileType, mappingJson: JSON.stringify(rest), dateFormat, delimiter, skipRows, amountSign, cardId },
  });

  const batch = await db.importBatch.create({
    data: { cardId, fileName, fileType, rowCount: 0 },
  });

  let inserted = 0;
  let skippedDuplicates = 0;
  let failed = 0;

  for (const txn of transactions) {
    const date = new Date(txn.date);
    if (Number.isNaN(date.getTime())) {
      failed++;
      continue;
    }
    const merchantNormalized = normalizeMerchant(txn.description);
    const dedupeHash = await computeDedupeHash({ date, amountAED: txn.amountAED, description: txn.description });

    try {
      await db.transaction.create({
        data: {
          cardId,
          date,
          description: txn.description,
          merchantRaw: txn.description,
          merchantNormalized,
          amountAED: txn.amountAED,
          amountOriginal: txn.amountOriginal,
          currencyOriginal: txn.currencyOriginal || "AED",
          fxFee: txn.fxFee ?? undefined,
          categoryId: txn.categoryId ?? undefined,
          categoryIsManual: txn.categoryIsManual ?? false,
          dedupeHash,
          importBatchId: batch.id,
        },
      });
      inserted++;
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
        skippedDuplicates++;
      } else {
        failed++;
      }
    }
  }

  await db.importBatch.update({
    where: { id: batch.id },
    data: { rowCount: inserted, skippedDuplicates },
  });

  return NextResponse.json({ importBatchId: batch.id, inserted, skippedDuplicates, failed });
}
