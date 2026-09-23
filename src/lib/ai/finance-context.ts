import "server-only";
import { startOfMonth, subMonths } from "date-fns";
import { db } from "@/lib/db";
import type { TxnLike } from "@/lib/analytics";
import { buildLiveSchedule, toMortgageInput, type AmortizationRow } from "@/lib/mortgage";

export interface FinanceContext {
  now: Date;
  transactions: TxnLike[];
  categories: { id: string; name: string }[];
  budgets: { categoryId: string; amountAED: number }[];
  mortgage: { bankName: string; schedule: AmortizationRow[] } | null;
}

/** Loads everything the chat tools need for one request, in a small fixed number of queries. */
export async function loadFinanceContext(): Promise<FinanceContext> {
  const now = new Date();
  const since = startOfMonth(subMonths(now, 24));

  const [categories, budgets, transactions, mortgage] = await Promise.all([
    db.category.findMany(),
    db.budget.findMany(),
    db.transaction.findMany({
      where: { date: { gte: since } },
      select: {
        id: true,
        cardId: true,
        date: true,
        amountAED: true,
        amountOriginal: true,
        currencyOriginal: true,
        fxFee: true,
        merchantNormalized: true,
        categoryId: true,
      },
    }) as Promise<TxnLike[]>,
    db.mortgage.findFirst({ orderBy: { createdAt: "asc" } }),
  ]);

  let mortgageCtx: FinanceContext["mortgage"] = null;
  if (mortgage) {
    const payments = await db.mortgagePayment.findMany({ where: { mortgageId: mortgage.id } });
    const input = toMortgageInput(mortgage);
    const schedule = buildLiveSchedule(
      input,
      payments.map((p) => ({ date: p.date, amount: p.amount, type: p.type, principalPortion: p.principalPortion })),
    );
    mortgageCtx = { bankName: mortgage.bankName, schedule };
  }

  return { now, transactions, categories, budgets, mortgage: mortgageCtx };
}
