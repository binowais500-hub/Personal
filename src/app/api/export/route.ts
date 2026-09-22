import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const [cards, transactions, categories, categoryRules, budgets, mortgage, mortgagePayments, columnMappings] =
    await Promise.all([
      db.card.findMany(),
      db.transaction.findMany(),
      db.category.findMany(),
      db.categoryRule.findMany(),
      db.budget.findMany(),
      db.mortgage.findMany(),
      db.mortgagePayment.findMany(),
      db.columnMapping.findMany(),
    ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    cards,
    transactions,
    categories,
    categoryRules,
    budgets,
    mortgage,
    mortgagePayments,
    columnMappings,
  };

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ledger-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
