import { format, subMonths } from "date-fns";

export interface TxnLike {
  id: string;
  cardId: string;
  date: Date;
  amountAED: number;
  amountOriginal: number;
  currencyOriginal: string;
  fxFee: number | null;
  merchantNormalized: string;
  categoryId: string | null;
}

const monthKey = (d: Date) => format(d, "yyyy-MM");

/** Only positive amounts count as spend; negative amounts are payments/refunds/credits. */
const isSpend = (t: TxnLike) => t.amountAED > 0;

export interface MonthlyTrendPoint {
  month: string; // yyyy-MM
  total: number;
  byCard: Record<string, number>;
}

export function monthlySpendTrend(transactions: TxnLike[], months: string[]): MonthlyTrendPoint[] {
  const points = new Map<string, MonthlyTrendPoint>(months.map((m) => [m, { month: m, total: 0, byCard: {} }]));
  for (const t of transactions) {
    if (!isSpend(t)) continue;
    const key = monthKey(t.date);
    const point = points.get(key);
    if (!point) continue;
    point.total += t.amountAED;
    point.byCard[t.cardId] = (point.byCard[t.cardId] ?? 0) + t.amountAED;
  }
  return months.map((m) => points.get(m)!);
}

export function lastNMonthKeys(n: number, from: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(monthKey(subMonths(from, i)));
  return keys;
}

export interface CategoryBreakdownRow {
  categoryId: string | null;
  currentMonth: number;
  trailingAverage: number;
}

/** Spend by category for `targetMonth`, alongside the trailing average of the prior `trailingMonths`. */
export function categoryBreakdown(
  transactions: TxnLike[],
  targetMonth: string,
  trailingMonths: string[],
): CategoryBreakdownRow[] {
  const current = new Map<string | null, number>();
  const trailingSums = new Map<string | null, number>();
  const trailingSet = new Set(trailingMonths);

  for (const t of transactions) {
    if (!isSpend(t)) continue;
    const key = monthKey(t.date);
    if (key === targetMonth) {
      current.set(t.categoryId, (current.get(t.categoryId) ?? 0) + t.amountAED);
    }
    if (trailingSet.has(key)) {
      trailingSums.set(t.categoryId, (trailingSums.get(t.categoryId) ?? 0) + t.amountAED);
    }
  }

  const categoryIds = new Set([...current.keys(), ...trailingSums.keys()]);
  return Array.from(categoryIds).map((categoryId) => ({
    categoryId,
    currentMonth: current.get(categoryId) ?? 0,
    trailingAverage: (trailingSums.get(categoryId) ?? 0) / Math.max(trailingMonths.length, 1),
  }));
}

export interface MerchantSummary {
  merchantNormalized: string;
  total: number;
  count: number;
  categoryId: string | null;
}

export function topMerchants(transactions: TxnLike[], limit = 10): MerchantSummary[] {
  const byMerchant = new Map<string, MerchantSummary>();
  for (const t of transactions) {
    if (!isSpend(t)) continue;
    const existing = byMerchant.get(t.merchantNormalized);
    if (existing) {
      existing.total += t.amountAED;
      existing.count += 1;
    } else {
      byMerchant.set(t.merchantNormalized, {
        merchantNormalized: t.merchantNormalized,
        total: t.amountAED,
        count: 1,
        categoryId: t.categoryId,
      });
    }
  }
  return Array.from(byMerchant.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export interface RecurringCharge {
  merchantNormalized: string;
  categoryId: string | null;
  averageAmount: number;
  occurrences: number;
  lastDate: Date;
  cardId: string;
}

/**
 * A merchant is "recurring" if it billed the same card in at least 3 distinct
 * months with amounts that stay within ~15% of the median (subscriptions
 * rarely vary; groceries do).
 */
export function detectRecurring(transactions: TxnLike[], minMonths = 3): RecurringCharge[] {
  const groups = new Map<string, TxnLike[]>();
  for (const t of transactions) {
    if (!isSpend(t)) continue;
    const key = `${t.cardId}|${t.merchantNormalized}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const results: RecurringCharge[] = [];
  for (const [key, txns] of groups) {
    const distinctMonths = new Set(txns.map((t) => monthKey(t.date)));
    if (distinctMonths.size < minMonths) continue;

    const amounts = txns.map((t) => t.amountAED).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const withinTolerance = amounts.every((a) => Math.abs(a - median) / median <= 0.15);
    if (!withinTolerance) continue;

    const [cardId, merchantNormalized] = key.split("|");
    const sorted = [...txns].sort((a, b) => b.date.getTime() - a.date.getTime());
    results.push({
      merchantNormalized,
      cardId,
      categoryId: sorted[0].categoryId,
      averageAmount: amounts.reduce((s, a) => s + a, 0) / amounts.length,
      occurrences: txns.length,
      lastDate: sorted[0].date,
    });
  }

  return results.sort((a, b) => b.averageAmount - a.averageAmount);
}

export interface UnusualTransaction {
  transaction: TxnLike;
  reason: string;
}

/**
 * Flags statistical outliers (amount far above the typical spend) and large
 * charges from a merchant never seen before — the two patterns most likely
 * to be worth a second look on a statement.
 */
export function detectUnusual(transactions: TxnLike[]): UnusualTransaction[] {
  const spendTxns = transactions.filter(isSpend);
  if (spendTxns.length < 5) return [];

  const amounts = spendTxns.map((t) => t.amountAED).sort((a, b) => a - b);
  const median = amounts[Math.floor(amounts.length / 2)];
  const deviations = amounts.map((a) => Math.abs(a - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)] || median * 0.2;
  const outlierThreshold = median + 5 * mad;

  const merchantCounts = new Map<string, number>();
  for (const t of spendTxns) {
    merchantCounts.set(t.merchantNormalized, (merchantCounts.get(t.merchantNormalized) ?? 0) + 1);
  }
  const overallAverage = amounts.reduce((s, a) => s + a, 0) / amounts.length;

  const results: UnusualTransaction[] = [];
  for (const t of spendTxns) {
    if (t.amountAED > outlierThreshold) {
      results.push({ transaction: t, reason: "Unusually large amount" });
      continue;
    }
    const isFirstTimeMerchant = merchantCounts.get(t.merchantNormalized) === 1;
    if (isFirstTimeMerchant && t.amountAED > overallAverage * 3) {
      results.push({ transaction: t, reason: "Large charge from an unfamiliar merchant" });
    }
  }

  return results.sort((a, b) => b.transaction.amountAED - a.transaction.amountAED);
}

export interface FxSummary {
  byCurrency: { currency: string; count: number; totalAED: number; totalFee: number }[];
  totalForeignSpendAED: number;
  totalFees: number;
}

export function fxSummary(transactions: TxnLike[]): FxSummary {
  const byCurrency = new Map<string, { count: number; totalAED: number; totalFee: number }>();
  for (const t of transactions) {
    if (!isSpend(t) || t.currencyOriginal === "AED") continue;
    const existing = byCurrency.get(t.currencyOriginal) ?? { count: 0, totalAED: 0, totalFee: 0 };
    existing.count += 1;
    existing.totalAED += t.amountAED;
    existing.totalFee += t.fxFee ?? 0;
    byCurrency.set(t.currencyOriginal, existing);
  }
  const rows = Array.from(byCurrency.entries()).map(([currency, v]) => ({ currency, ...v }));
  return {
    byCurrency: rows.sort((a, b) => b.totalAED - a.totalAED),
    totalForeignSpendAED: rows.reduce((s, r) => s + r.totalAED, 0),
    totalFees: rows.reduce((s, r) => s + r.totalFee, 0),
  };
}
