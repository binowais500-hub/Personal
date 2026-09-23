import { createHash } from "node:crypto";

/**
 * A privacy-bounded aggregate of the user's finances: category totals,
 * trends, and merchant/subscription summaries only. Never includes raw
 * transaction descriptions, card numbers, account numbers, or transaction
 * IDs — this is the only shape sent to the Claude API.
 */
export interface FinancialSnapshot {
  periodLabel: string;
  currentMonthSpend: number;
  lastMonthSpend: number;
  totalBudget: number;
  categories: { name: string; currentMonth: number; trailingAverage: number }[];
  topMerchants: { merchant: string; visits: number; total: number }[];
  recurringCharges: { merchant: string; monthlyAmount: number; category: string | null }[];
  unusualTransactions: { merchant: string; amount: number; reason: string }[];
  fx: { totalForeignSpendAED: number; totalFees: number };
  mortgage: {
    bankName: string;
    balance: number;
    percentPaidOff: number;
    nextPaymentAmount: number | null;
    nextPaymentDate: string | null;
    interestPaidThisYear: number;
  } | null;
}

/** Stable hash of a snapshot, used to key the AI cache and detect when data has changed. */
export function hashSnapshot(snapshot: FinancialSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex").slice(0, 32);
}
