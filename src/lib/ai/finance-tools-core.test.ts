import { describe, expect, it } from "vitest";
import type { TxnLike } from "../analytics";
import { budgetStatusForMonth, categorySpendForMonth, compareMonths, resolveCategoryId, type CategoryRef } from "./finance-tools-core";

const CATEGORIES: CategoryRef[] = [
  { id: "cat-dining", name: "Dining" },
  { id: "cat-groceries", name: "Groceries" },
];

function txn(overrides: Partial<TxnLike>): TxnLike {
  return {
    id: Math.random().toString(36),
    cardId: "card-1",
    date: new Date("2026-01-15"),
    amountAED: 100,
    amountOriginal: 100,
    currencyOriginal: "AED",
    fxFee: null,
    merchantNormalized: "MERCHANT",
    categoryId: null,
    ...overrides,
  };
}

describe("resolveCategoryId", () => {
  it("matches a known category case-insensitively", () => {
    expect(resolveCategoryId(CATEGORIES, "dining")).toBe("cat-dining");
    expect(resolveCategoryId(CATEGORIES, "  DINING  ")).toBe("cat-dining");
  });

  it("treats 'uncategorized' as the null bucket, not a miss", () => {
    expect(resolveCategoryId(CATEGORIES, "Uncategorized")).toBeNull();
  });

  it("returns undefined for a name that matches nothing", () => {
    expect(resolveCategoryId(CATEGORIES, "Yachting")).toBeUndefined();
  });
});

describe("categorySpendForMonth", () => {
  it("sums the target month and averages the trailing months", () => {
    const txns = [
      txn({ date: new Date("2026-03-05"), amountAED: 200, categoryId: "cat-dining" }),
      txn({ date: new Date("2026-02-05"), amountAED: 100, categoryId: "cat-dining" }),
      txn({ date: new Date("2026-01-05"), amountAED: 300, categoryId: "cat-dining" }),
    ];
    const result = categorySpendForMonth(txns, "cat-dining", "2026-03");
    expect(result.amount).toBe(200);
    // trailing window is the 6 months before 2026-03; only Jan (300) + Feb (100) have data
    expect(result.trailingAverage).toBeCloseTo(400 / 5, 5);
  });

  it("returns zeros when there's no spend in that category/month", () => {
    const result = categorySpendForMonth([], "cat-dining", "2026-03");
    expect(result).toEqual({ amount: 0, trailingAverage: 0 });
  });
});

describe("budgetStatusForMonth", () => {
  it("flags categories over their budget", () => {
    const txns = [txn({ date: new Date("2026-03-05"), amountAED: 500, categoryId: "cat-dining" })];
    const budgets = [{ categoryId: "cat-dining", amountAED: 300 }];
    const [row] = budgetStatusForMonth(txns, budgets, CATEGORIES, "2026-03");
    expect(row).toEqual({ category: "Dining", budget: 300, actual: 500, overBudget: true });
  });

  it("does not flag a category under budget", () => {
    const txns = [txn({ date: new Date("2026-03-05"), amountAED: 100, categoryId: "cat-groceries" })];
    const budgets = [{ categoryId: "cat-groceries", amountAED: 300 }];
    const [row] = budgetStatusForMonth(txns, budgets, CATEGORIES, "2026-03");
    expect(row.overBudget).toBe(false);
  });
});

describe("compareMonths", () => {
  it("totals each month and sorts category deltas by absolute change", () => {
    const txns = [
      txn({ date: new Date("2026-03-05"), amountAED: 500, categoryId: "cat-dining" }),
      txn({ date: new Date("2026-02-05"), amountAED: 100, categoryId: "cat-dining" }),
      txn({ date: new Date("2026-03-05"), amountAED: 50, categoryId: "cat-groceries" }),
      txn({ date: new Date("2026-02-05"), amountAED: 40, categoryId: "cat-groceries" }),
    ];
    const result = compareMonths(txns, CATEGORIES, "2026-02", "2026-03");
    expect(result.monthA).toEqual({ month: "2026-02", total: 140 });
    expect(result.monthB).toEqual({ month: "2026-03", total: 550 });
    expect(result.categoryDeltas[0]).toEqual({ category: "Dining", monthA: 100, monthB: 500 });
  });
});
