import { describe, expect, it } from "vitest";
import {
  buildAmortizationSchedule,
  buildLiveSchedule,
  calcEarlySettlementFee,
  calcMonthlyPayment,
  interestPaidToDate,
  outstandingBalance,
  simulateHigherMonthlyPayment,
  simulateLumpSum,
  totalInterest,
  type MortgageInput,
} from "./mortgage";

describe("calcMonthlyPayment", () => {
  it("matches the standard amortization formula for a known case", () => {
    // $500,000 at 5% APR over 360 months -> well-known textbook payment ~2684.11
    const payment = calcMonthlyPayment(500_000, 5, 360);
    expect(payment).toBeCloseTo(2684.108115, 4);
  });

  it("degenerates to a straight-line split at 0% interest", () => {
    expect(calcMonthlyPayment(120_000, 0, 12)).toBeCloseTo(10_000, 6);
  });
});

function baseInput(overrides: Partial<MortgageInput> = {}): MortgageInput {
  const principal = 2_000_000;
  const fixedRateAPR = 3.99;
  const tenorMonths = 300;
  const startDate = new Date("2023-01-15");
  const fixedPeriodEndDate = new Date("2026-01-15");
  return {
    principal,
    startDate,
    tenorMonths,
    fixedRateAPR,
    fixedPeriodEndDate,
    marginBps: 195,
    eiborAssumptionBps: 405,
    monthlyPayment: calcMonthlyPayment(principal, fixedRateAPR, tenorMonths),
    ...overrides,
  };
}

describe("buildAmortizationSchedule", () => {
  it("fully amortizes the loan to a zero balance by the final row", () => {
    const input = baseInput();
    const schedule = buildAmortizationSchedule(input);
    expect(schedule.length).toBeLessThanOrEqual(input.tenorMonths);
    expect(schedule[schedule.length - 1].closingBalance).toBeCloseTo(0, 2);
  });

  it("keeps the opening balance of each row equal to the prior row's closing balance", () => {
    const schedule = buildAmortizationSchedule(baseInput());
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].openingBalance).toBeCloseTo(schedule[i - 1].closingBalance, 6);
    }
  });

  it("splits payment into interest (balance * monthly rate) and principal correctly", () => {
    const schedule = buildAmortizationSchedule(baseInput());
    const row = schedule[0];
    const expectedInterest = row.openingBalance * (3.99 / 100 / 12);
    expect(row.interest).toBeCloseTo(expectedInterest, 6);
    expect(row.principal + row.interest).toBeCloseTo(row.payment, 6);
  });

  it("uses the fixed rate before the reset date and margin+EIBOR after it", () => {
    const schedule = buildAmortizationSchedule(baseInput());
    const lastFixed = schedule.find((r) => !r.isFixed);
    expect(lastFixed).toBeDefined();
    // margin 195bps + eibor 405bps = 6.00%
    expect(lastFixed!.rateApplied).toBeCloseTo(6.0, 6);
    expect(schedule[0].rateApplied).toBeCloseTo(3.99, 6);
  });

  it("recalculates the payment once at reset so the loan still fully amortizes over the remaining tenor", () => {
    const input = baseInput();
    const schedule = buildAmortizationSchedule(input);
    const resetIndex = schedule.findIndex((r) => !r.isFixed);
    const resetRow = schedule[resetIndex];
    const remainingMonths = input.tenorMonths - resetRow.paymentNo + 1;
    const expectedPayment = calcMonthlyPayment(resetRow.openingBalance, resetRow.rateApplied, remainingMonths);
    expect(resetRow.payment).toBeCloseTo(expectedPayment, 4);
  });

  it("respects a higher EIBOR scenario override", () => {
    const input = baseInput();
    const normal = buildAmortizationSchedule(input);
    const stressed = buildAmortizationSchedule(input, { eiborOverrideBps: 700 });
    const normalReset = normal.find((r) => !r.isFixed)!;
    const stressedReset = stressed.find((r) => !r.isFixed)!;
    expect(stressedReset.rateApplied).toBeGreaterThan(normalReset.rateApplied);
    expect(stressedReset.payment).toBeGreaterThan(normalReset.payment);
  });
});

describe("interestPaidToDate / outstandingBalance", () => {
  it("sums only interest from rows on or before the given date", () => {
    const input = baseInput();
    const schedule = buildAmortizationSchedule(input);
    const cutoff = schedule[11].date; // after 12 payments
    const paid = interestPaidToDate(schedule, cutoff);
    const manual = schedule.slice(0, 12).reduce((s, r) => s + r.interest, 0);
    expect(paid).toBeCloseTo(manual, 6);
  });

  it("returns the closing balance as of the most recent payment on or before the date", () => {
    const input = baseInput();
    const schedule = buildAmortizationSchedule(input);
    const cutoff = schedule[23].date;
    expect(outstandingBalance(schedule, cutoff)).toBeCloseTo(schedule[23].closingBalance, 6);
  });
});

describe("calcEarlySettlementFee", () => {
  it("applies the UAE-style percentage cap to the amount prepaid", () => {
    expect(calcEarlySettlementFee(100_000, 1)).toBeCloseTo(1_000, 6);
  });
});

describe("simulateLumpSum", () => {
  it("shortens the loan and saves interest versus the baseline, net of the settlement fee", () => {
    const input = baseInput();
    const result = simulateLumpSum(input, 200_000, 12, 1);
    expect(result.monthsSaved).toBeGreaterThan(0);
    expect(result.interestSaved).toBeGreaterThan(0);
    expect(result.earlySettlementFee).toBeCloseTo(2_000, 6);
    expect(result.netSavings).toBeCloseTo(result.interestSaved - 2_000, 6);
  });
});

describe("simulateHigherMonthlyPayment", () => {
  it("shortens the loan and saves interest with no settlement fee", () => {
    const input = baseInput();
    const result = simulateHigherMonthlyPayment(input, 2_000, 12);
    expect(result.monthsSaved).toBeGreaterThan(0);
    expect(result.interestSaved).toBeGreaterThan(0);
    expect(result.earlySettlementFee).toBe(0);
  });
});

describe("buildLiveSchedule", () => {
  it("folds a logged lump-sum payment into the schedule as a principal reduction", () => {
    const input = baseInput();
    const paymentDate = addToDate(input.startDate, 12);
    const schedule = buildLiveSchedule(input, [
      { date: paymentDate, amount: 100_000, type: "lump_sum", principalPortion: 100_000 },
    ]);
    const baseline = buildAmortizationSchedule(input);
    expect(schedule.length).toBeLessThan(baseline.length);
    expect(totalInterest(schedule)).toBeLessThan(totalInterest(baseline));
  });

  it("ignores 'scheduled' log entries — they're already the baseline payment", () => {
    const input = baseInput();
    const schedule = buildLiveSchedule(input, [
      { date: addToDate(input.startDate, 3), amount: input.monthlyPayment, type: "scheduled", principalPortion: null },
    ]);
    const baseline = buildAmortizationSchedule(input);
    expect(schedule.length).toBe(baseline.length);
    expect(totalInterest(schedule)).toBeCloseTo(totalInterest(baseline), 6);
  });
});

function addToDate(d: Date, months: number): Date {
  const copy = new Date(d);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

describe("totalInterest", () => {
  it("is less for a shorter, faster-paying-down loan than a longer one at the same rate", () => {
    const shortInput = baseInput({ tenorMonths: 120, monthlyPayment: calcMonthlyPayment(2_000_000, 3.99, 120) });
    const longInput = baseInput({ tenorMonths: 300 });
    const shortInterest = totalInterest(buildAmortizationSchedule(shortInput));
    const longInterest = totalInterest(buildAmortizationSchedule(longInput));
    expect(shortInterest).toBeLessThan(longInterest);
  });
});
