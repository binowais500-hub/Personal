import { describe, expect, it } from "vitest";
import { hashSnapshot, type FinancialSnapshot } from "./types";

function fixture(overrides: Partial<FinancialSnapshot> = {}): FinancialSnapshot {
  return {
    periodLabel: "September 2026",
    currentMonthSpend: 7914.34,
    lastMonthSpend: 18451.23,
    totalBudget: 16300,
    categories: [{ name: "Groceries", currentMonth: 1129.9, trailingAverage: 980.5 }],
    topMerchants: [{ merchant: "CARREFOUR HYPERMARKET", visits: 3, total: 901.01 }],
    recurringCharges: [{ merchant: "NETFLIX.COM", monthlyAmount: 39, category: "Subscriptions" }],
    unusualTransactions: [{ merchant: "APPLE STORE", amount: 6090.13, reason: "Largest charge in 90 days" }],
    fx: { totalForeignSpendAED: 0, totalFees: 0 },
    mortgage: {
      bankName: "ADCB",
      balance: 1753150.76,
      percentPaidOff: 12.3,
      nextPaymentAmount: 10545.7,
      nextPaymentDate: "2026-10-22",
      interestPaidThisYear: 53160.22,
    },
    ...overrides,
  };
}

describe("hashSnapshot", () => {
  it("is deterministic for the same data", () => {
    expect(hashSnapshot(fixture())).toBe(hashSnapshot(fixture()));
  });

  it("changes when a number in the snapshot changes", () => {
    const a = hashSnapshot(fixture());
    const b = hashSnapshot(fixture({ currentMonthSpend: 8000 }));
    expect(a).not.toBe(b);
  });

  it("changes when mortgage data is added or removed", () => {
    const withMortgage = hashSnapshot(fixture());
    const withoutMortgage = hashSnapshot(fixture({ mortgage: null }));
    expect(withMortgage).not.toBe(withoutMortgage);
  });
});

describe("FinancialSnapshot shape", () => {
  // Guards against a future edit accidentally widening the snapshot sent to
  // the Claude API with a sensitive field (card numbers, account numbers,
  // transaction IDs, raw descriptions). If this test needs updating because
  // a field was intentionally added, double-check it isn't one of those.
  const ALLOWED_TOP_LEVEL = new Set([
    "periodLabel",
    "currentMonthSpend",
    "lastMonthSpend",
    "totalBudget",
    "categories",
    "topMerchants",
    "recurringCharges",
    "unusualTransactions",
    "fx",
    "mortgage",
  ]);
  const FORBIDDEN_SUBSTRINGS = ["cardId", "last4", "accountNumber", "iban", "transactionId", "merchantRaw", "description"];

  it("only exposes the allowlisted top-level fields", () => {
    const snapshot = fixture();
    expect(Object.keys(snapshot).sort()).toEqual(Array.from(ALLOWED_TOP_LEVEL).sort());
  });

  it("never serializes a forbidden key name, even nested", () => {
    const serialized = JSON.stringify(fixture());
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
