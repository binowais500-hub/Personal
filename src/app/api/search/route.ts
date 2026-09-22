import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ transactions: [] });

  const transactions = await db.transaction.findMany({
    where: { OR: [{ description: { contains: q } }, { merchantNormalized: { contains: q } }] },
    include: { card: true },
    orderBy: { date: "desc" },
    take: 8,
  });

  return NextResponse.json({
    transactions: transactions.map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amountAED: t.amountAED,
      card: `${t.card.bankName} •${t.card.last4}`,
    })),
  });
}
