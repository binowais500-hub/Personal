import "server-only";
import { startOfMonth, subMonths } from "date-fns";
import { db } from "@/lib/db";
import {
  categoryBreakdown,
  detectRecurring,
  detectUnusual,
  fxSummary,
  lastNMonthKeys,
  monthlySpendTrend,
  topMerchants,
  type TxnLike,
} from "@/lib/analytics";
import { buildLiveSchedule, interestPaidToDate, nextPayment, outstandingBalance, toMortgageInput } from "@/lib/mortgage";
import type { FinancialSnapshot } from "@/lib/ai/types";

export type { FinancialSnapshot } from "@/lib/ai/types";
export { hashSnapshot } from "@/lib/ai/types";

export async function buildFinancialSnapshot(now: Date = new Date()): Promise<FinancialSnapshot> {
  const currentMonthStart = startOfMonth(now);
  const trendMonths = lastNMonthKeys(12, now);
  const since = startOfMonth(subMonths(now, 12));

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

  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const categoryName = (id: string | null) => (id ? (categoryById.get(id) ?? "Other") : "Uncategorized");

  const trend = monthlySpendTrend(transactions, trendMonths);
  const currentMonthSpend = trend[trend.length - 1]?.total ?? 0;
  const lastMonthSpend = trend[trend.length - 2]?.total ?? 0;
  const totalBudget = budgets.reduce((s, b) => s + b.amountAED, 0);

  const trailingMonths = trendMonths.slice(0, -1);
  const currentMonthKey = trendMonths[trendMonths.length - 1];
  const catBreakdown = categoryBreakdown(transactions, currentMonthKey, trailingMonths)
    .map((row) => ({ name: categoryName(row.categoryId), currentMonth: row.currentMonth, trailingAverage: row.trailingAverage }))
    .filter((row) => row.currentMonth > 0 || row.trailingAverage > 0)
    .sort((a, b) => b.currentMonth - a.currentMonth);

  const merchants = topMerchants(
    transactions.filter((t) => t.date >= currentMonthStart),
    8,
  ).map((m) => ({ merchant: m.merchantNormalized, visits: m.count, total: m.total }));

  const recurring = detectRecurring(transactions).map((r) => ({
    merchant: r.merchantNormalized,
    monthlyAmount: r.averageAmount,
    category: r.categoryId ? categoryName(r.categoryId) : null,
  }));

  const unusual = detectUnusual(transactions.filter((t) => t.date >= subMonths(now, 3)))
    .slice(0, 10)
    .map((u) => ({ merchant: u.transaction.merchantNormalized, amount: u.transaction.amountAED, reason: u.reason }));

  const fx = fxSummary(transactions);

  let mortgageSnapshot: FinancialSnapshot["mortgage"] = null;
  if (mortgage) {
    const payments = await db.mortgagePayment.findMany({ where: { mortgageId: mortgage.id } });
    const input = toMortgageInput(mortgage);
    const schedule = buildLiveSchedule(
      input,
      payments.map((p) => ({ date: p.date, amount: p.amount, type: p.type, principalPortion: p.principalPortion })),
    );
    const balance = outstandingBalance(schedule, now);
    const next = nextPayment(schedule, now);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const interestThisYear = interestPaidToDate(schedule, now) - interestPaidToDate(schedule, new Date(yearStart.getTime() - 1));
    mortgageSnapshot = {
      bankName: mortgage.bankName,
      balance,
      percentPaidOff: ((mortgage.principal - balance) / mortgage.principal) * 100,
      nextPaymentAmount: next?.payment ?? null,
      nextPaymentDate: next ? next.date.toISOString().slice(0, 10) : null,
      interestPaidThisYear: interestThisYear,
    };
  }

  return {
    periodLabel: currentMonthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    currentMonthSpend,
    lastMonthSpend,
    totalBudget,
    categories: catBreakdown,
    topMerchants: merchants,
    recurringCharges: recurring,
    unusualTransactions: unusual,
    fx: { totalForeignSpendAED: fx.totalForeignSpendAED, totalFees: fx.totalFees },
    mortgage: mortgageSnapshot,
  };
}
