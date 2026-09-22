import { describe, expect, it } from "vitest";
import {
  detectRecurring,
  detectUnusual,
  fxSummary,
  monthlySpendTrend,
  topMerchants,
  type TxnLike,
} from "./analytics";

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

describe("monthlySpendTrend", () => {
  it("sums positive amounts per month and ignores refunds/payments", () => {
    const txns = [
      txn({ date: new Date("2026-01-05"), amountAED: 100 }),
      txn({ date: new Date("2026-01-20"), amountAED: 50 }),
      txn({ date: new Date("2026-01-20"), amountAED: -30 }), // refund, excluded
      txn({ date: new Date("2026-02-01"), amountAED: 75 }),
    ];
    const trend = monthlySpendTrend(txns, ["2026-01", "2026-02"]);
    expect(trend[0].total).toBe(150);
    expect(trend[1].total).toBe(75);
  });
});

describe("topMerchants", () => {
  it("aggregates by normalized merchant and sorts descending", () => {
    const txns = [
      txn({ merchantNormalized: "CARREFOUR", amountAED: 100 }),
      txn({ merchantNormalized: "CARREFOUR", amountAED: 50 }),
      txn({ merchantNormalized: "NETFLIX", amountAED: 300 }),
    ];
    const result = topMerchants(txns);
    expect(result[0].merchantNormalized).toBe("NETFLIX");
    expect(result[1].merchantNormalized).toBe("CARREFOUR");
    expect(result[1].total).toBe(150);
    expect(result[1].count).toBe(2);
  });
});

describe("detectRecurring", () => {
  it("flags a merchant billing the same amount across 3+ months", () => {
    const txns = [
      txn({ merchantNormalized: "NETFLIX.COM", amountAED: 39, date: new Date("2026-01-03") }),
      txn({ merchantNormalized: "NETFLIX.COM", amountAED: 39, date: new Date("2026-02-03") }),
      txn({ merchantNormalized: "NETFLIX.COM", amountAED: 39, date: new Date("2026-03-03") }),
    ];
    const result = detectRecurring(txns);
    expect(result).toHaveLength(1);
    expect(result[0].merchantNormalized).toBe("NETFLIX.COM");
    expect(result[0].occurrences).toBe(3);
  });

  it("does not flag a merchant with wildly varying amounts", () => {
    const txns = [
      txn({ merchantNormalized: "CARREFOUR", amountAED: 100, date: new Date("2026-01-03") }),
      txn({ merchantNormalized: "CARREFOUR", amountAED: 400, date: new Date("2026-02-03") }),
      txn({ merchantNormalized: "CARREFOUR", amountAED: 60, date: new Date("2026-03-03") }),
    ];
    expect(detectRecurring(txns)).toHaveLength(0);
  });

  it("does not flag a merchant seen in fewer than 3 distinct months", () => {
    const txns = [
      txn({ merchantNormalized: "NETFLIX.COM", amountAED: 39, date: new Date("2026-01-03") }),
      txn({ merchantNormalized: "NETFLIX.COM", amountAED: 39, date: new Date("2026-01-20") }),
    ];
    expect(detectRecurring(txns)).toHaveLength(0);
  });
});

describe("detectUnusual", () => {
  it("flags a transaction far above the typical spend", () => {
    const normal = Array.from({ length: 20 }, (_, i) => txn({ merchantNormalized: `SHOP ${i}`, amountAED: 80 + i }));
    const outlier = txn({ merchantNormalized: "ROLEX BOUTIQUE", amountAED: 5000 });
    const result = detectUnusual([...normal, outlier]);
    expect(result.some((r) => r.transaction.merchantNormalized === "ROLEX BOUTIQUE")).toBe(true);
  });

  it("does not flag ordinary transactions of similar size", () => {
    const normal = Array.from({ length: 20 }, (_, i) => txn({ merchantNormalized: `SHOP ${i}`, amountAED: 80 + i }));
    const result = detectUnusual(normal);
    expect(result).toHaveLength(0);
  });
});

describe("fxSummary", () => {
  it("groups foreign-currency spend and sums fees, excluding AED", () => {
    const txns = [
      txn({ currencyOriginal: "USD", amountAED: 200, fxFee: 4 }),
      txn({ currencyOriginal: "USD", amountAED: 100, fxFee: 2 }),
      txn({ currencyOriginal: "AED", amountAED: 50, fxFee: null }),
    ];
    const summary = fxSummary(txns);
    expect(summary.byCurrency).toHaveLength(1);
    expect(summary.byCurrency[0].currency).toBe("USD");
    expect(summary.byCurrency[0].count).toBe(2);
    expect(summary.totalForeignSpendAED).toBe(300);
    expect(summary.totalFees).toBe(6);
  });
});
