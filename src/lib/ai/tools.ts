import "server-only";
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { format, subMonths } from "date-fns";
import { detectRecurring, detectUnusual, fxSummary, lastNMonthKeys, monthlySpendTrend, topMerchants } from "@/lib/analytics";
import { interestPaidToDate, nextPayment, outstandingBalance } from "@/lib/mortgage";
import { budgetStatusForMonth, categorySpendForMonth, compareMonths, resolveCategoryId } from "@/lib/ai/finance-tools-core";
import type { FinanceContext } from "@/lib/ai/finance-context";

export interface ToolLogEntry {
  name: string;
  input: unknown;
  result: unknown;
}

/**
 * Builds the fixed set of local, read-only tools Claude can call to answer
 * questions in "Ask my finances". Every tool runs against `ctx` (already
 * fetched once per request) and returns only aggregates — never a raw
 * transaction list, description, or account/card number. Every call is
 * appended to `log` so the UI can show exactly what was computed.
 */
export function buildFinanceTools(ctx: FinanceContext, log: ToolLogEntry[]) {
  const categoryById = new Map(ctx.categories.map((c) => [c.id, c.name]));

  function finish(name: string, input: unknown, result: unknown): string {
    log.push({ name, input, result });
    return JSON.stringify(result);
  }

  const getCategorySpend = betaZodTool({
    name: "get_category_spend",
    description:
      "Get total spend for one category in a given month (defaults to the current month), plus the trailing 6-month average for comparison.",
    inputSchema: z.object({
      category: z.string().describe("Category name, e.g. 'Dining', 'Groceries', or 'Uncategorized'"),
      month: z.string().optional().describe("yyyy-MM, defaults to the current month"),
    }),
    run: async (input) => {
      const month = input.month ?? format(ctx.now, "yyyy-MM");
      const categoryId = resolveCategoryId(ctx.categories, input.category);
      if (categoryId === undefined) {
        return finish("get_category_spend", input, {
          found: false,
          knownCategories: ctx.categories.map((c) => c.name),
        });
      }
      const { amount, trailingAverage } = categorySpendForMonth(ctx.transactions, categoryId, month);
      return finish("get_category_spend", input, { found: true, category: input.category, month, amount, trailingAverage });
    },
  });

  const getMerchantSummary = betaZodTool({
    name: "get_merchant_summary",
    description: "Get spend history for one merchant over the last 24 months: total spent, visit count, average charge, and date range.",
    inputSchema: z.object({ merchant: z.string().describe("Merchant name or a distinctive part of it") }),
    run: async (input) => {
      const needle = input.merchant.toUpperCase();
      const matches = ctx.transactions.filter((t) => t.merchantNormalized.toUpperCase().includes(needle) && t.amountAED > 0);
      if (matches.length === 0) return finish("get_merchant_summary", input, { found: false });
      const total = matches.reduce((s, t) => s + t.amountAED, 0);
      const dates = matches.map((t) => t.date).sort((a, b) => a.getTime() - b.getTime());
      return finish("get_merchant_summary", input, {
        found: true,
        merchant: input.merchant,
        totalLast24Months: total,
        visitCount: matches.length,
        averageAmount: total / matches.length,
        firstSeen: dates[0].toISOString().slice(0, 10),
        lastSeen: dates[dates.length - 1].toISOString().slice(0, 10),
      });
    },
  });

  const compareMonthsTool = betaZodTool({
    name: "compare_months",
    description: "Compare total spend and per-category spend between two months.",
    inputSchema: z.object({
      monthA: z.string().describe("yyyy-MM"),
      monthB: z.string().describe("yyyy-MM"),
    }),
    run: async (input) => finish("compare_months", input, compareMonths(ctx.transactions, ctx.categories, input.monthA, input.monthB)),
  });

  const getMortgageStatus = betaZodTool({
    name: "get_mortgage_status",
    description: "Get the current mortgage balance, next payment amount/date, and interest paid this year.",
    inputSchema: z.object({}),
    run: async (input) => {
      if (!ctx.mortgage) return finish("get_mortgage_status", input, { hasMortgage: false });
      const { schedule, bankName } = ctx.mortgage;
      const balance = outstandingBalance(schedule, ctx.now);
      const next = nextPayment(schedule, ctx.now);
      const yearStart = new Date(ctx.now.getFullYear(), 0, 1);
      const interestThisYear = interestPaidToDate(schedule, ctx.now) - interestPaidToDate(schedule, new Date(yearStart.getTime() - 1));
      return finish("get_mortgage_status", input, {
        hasMortgage: true,
        bankName,
        balance,
        nextPaymentAmount: next?.payment ?? null,
        nextPaymentDate: next ? next.date.toISOString().slice(0, 10) : null,
        interestPaidThisYear: interestThisYear,
      });
    },
  });

  const getBudgetStatus = betaZodTool({
    name: "get_budget_status",
    description: "Get budget vs. actual spend per category for a given month (defaults to the current month).",
    inputSchema: z.object({ month: z.string().optional().describe("yyyy-MM, defaults to the current month") }),
    run: async (input) => {
      const month = input.month ?? format(ctx.now, "yyyy-MM");
      return finish("get_budget_status", input, {
        month,
        categories: budgetStatusForMonth(ctx.transactions, ctx.budgets, ctx.categories, month),
      });
    },
  });

  const listRecurringCharges = betaZodTool({
    name: "list_recurring_charges",
    description: "List detected recurring charges (subscriptions) with their typical monthly amount and category.",
    inputSchema: z.object({}),
    run: async (input) =>
      finish(
        "list_recurring_charges",
        input,
        detectRecurring(ctx.transactions).map((r) => ({
          merchant: r.merchantNormalized,
          monthlyAmount: r.averageAmount,
          category: r.categoryId ? (categoryById.get(r.categoryId) ?? null) : null,
        })),
      ),
  });

  const listUnusualTransactions = betaZodTool({
    name: "list_unusual_transactions",
    description: "List unusually large or first-time-merchant charges in the last N months (default 3).",
    inputSchema: z.object({ months: z.number().int().min(1).max(12).optional() }),
    run: async (input) => {
      const months = input.months ?? 3;
      const since = subMonths(ctx.now, months);
      const unusual = detectUnusual(ctx.transactions.filter((t) => t.date >= since)).slice(0, 15);
      return finish(
        "list_unusual_transactions",
        input,
        unusual.map((u) => ({
          merchant: u.transaction.merchantNormalized,
          amount: u.transaction.amountAED,
          date: u.transaction.date.toISOString().slice(0, 10),
          reason: u.reason,
        })),
      );
    },
  });

  const getTopMerchants = betaZodTool({
    name: "get_top_merchants",
    description: "Get the top merchants by total spend for a given month (defaults to the current month).",
    inputSchema: z.object({
      month: z.string().optional().describe("yyyy-MM, defaults to the current month"),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    run: async (input) => {
      const targetMonth = input.month ?? format(ctx.now, "yyyy-MM");
      const txns = ctx.transactions.filter((t) => format(t.date, "yyyy-MM") === targetMonth);
      const merchants = topMerchants(txns, input.limit ?? 8);
      return finish("get_top_merchants", input, {
        month: targetMonth,
        merchants: merchants.map((m) => ({ merchant: m.merchantNormalized, visits: m.count, total: m.total })),
      });
    },
  });

  const getSpendTrend = betaZodTool({
    name: "get_spend_trend",
    description: "Get total monthly spend for the last N months (default 6).",
    inputSchema: z.object({ months: z.number().int().min(1).max(24).optional() }),
    run: async (input) => {
      const n = input.months ?? 6;
      const monthKeys = lastNMonthKeys(n, ctx.now);
      const trend = monthlySpendTrend(ctx.transactions, monthKeys);
      return finish(
        "get_spend_trend",
        input,
        trend.map((p) => ({ month: p.month, total: p.total })),
      );
    },
  });

  const getFxSummary = betaZodTool({
    name: "get_fx_summary",
    description: "Get total foreign-currency spend and FX fees over the last 12 months, broken down by currency.",
    inputSchema: z.object({}),
    run: async (input) => {
      const fx = fxSummary(ctx.transactions);
      return finish("get_fx_summary", input, { totalForeignSpendAED: fx.totalForeignSpendAED, totalFees: fx.totalFees, byCurrency: fx.byCurrency });
    },
  });

  return [
    getCategorySpend,
    getMerchantSummary,
    compareMonthsTool,
    getMortgageStatus,
    getBudgetStatus,
    listRecurringCharges,
    listUnusualTransactions,
    getTopMerchants,
    getSpendTrend,
    getFxSummary,
  ];
}
