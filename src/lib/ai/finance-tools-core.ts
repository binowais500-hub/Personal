import { categoryBreakdown, lastNMonthKeys, monthlySpendTrend, type TxnLike } from "../analytics";

export interface CategoryRef {
  id: string;
  name: string;
}

/** Resolves a user-typed category name to an id. `null` means "Uncategorized" (a real bucket), `undefined` means no match. */
export function resolveCategoryId(categories: CategoryRef[], name: string): string | null | undefined {
  const trimmed = name.trim().toLowerCase();
  if (trimmed === "uncategorized") return null;
  const match = categories.find((c) => c.name.toLowerCase() === trimmed);
  return match ? match.id : undefined;
}

export function categorySpendForMonth(
  transactions: TxnLike[],
  categoryId: string | null,
  month: string,
): { amount: number; trailingAverage: number } {
  const trailing = lastNMonthKeys(6, new Date(`${month}-01T00:00:00`)).slice(0, -1);
  const rows = categoryBreakdown(transactions, month, trailing);
  const row = rows.find((r) => r.categoryId === categoryId);
  return { amount: row?.currentMonth ?? 0, trailingAverage: row?.trailingAverage ?? 0 };
}

export interface BudgetStatusRow {
  category: string;
  budget: number;
  actual: number;
  overBudget: boolean;
}

export function budgetStatusForMonth(
  transactions: TxnLike[],
  budgets: { categoryId: string; amountAED: number }[],
  categories: CategoryRef[],
  month: string,
): BudgetStatusRow[] {
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const rows = categoryBreakdown(transactions, month, []);
  const byCategory = new Map(rows.map((r) => [r.categoryId, r.currentMonth]));
  return budgets.map((b) => {
    const actual = byCategory.get(b.categoryId) ?? 0;
    return { category: categoryById.get(b.categoryId) ?? "Unknown", budget: b.amountAED, actual, overBudget: actual > b.amountAED };
  });
}

export interface MonthComparison {
  monthA: { month: string; total: number };
  monthB: { month: string; total: number };
  categoryDeltas: { category: string; monthA: number; monthB: number }[];
}

export function compareMonths(transactions: TxnLike[], categories: CategoryRef[], monthA: string, monthB: string): MonthComparison {
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const trend = monthlySpendTrend(transactions, [monthA, monthB]);
  const rowsA = new Map(categoryBreakdown(transactions, monthA, []).map((r) => [r.categoryId, r.currentMonth]));
  const rowsB = new Map(categoryBreakdown(transactions, monthB, []).map((r) => [r.categoryId, r.currentMonth]));
  const categoryIds = new Set([...rowsA.keys(), ...rowsB.keys()]);
  const categoryDeltas = Array.from(categoryIds)
    .map((id) => ({
      category: id ? (categoryById.get(id) ?? "Other") : "Uncategorized",
      monthA: rowsA.get(id) ?? 0,
      monthB: rowsB.get(id) ?? 0,
    }))
    .sort((a, b) => Math.abs(b.monthB - b.monthA) - Math.abs(a.monthB - a.monthA));
  return {
    monthA: { month: monthA, total: trend[0]?.total ?? 0 },
    monthB: { month: monthB, total: trend[1]?.total ?? 0 },
    categoryDeltas,
  };
}
