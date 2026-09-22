import { addMonths, differenceInCalendarMonths } from "date-fns";

export interface AmortizationRow {
  paymentNo: number;
  date: Date;
  openingBalance: number;
  interest: number;
  principal: number;
  payment: number;
  closingBalance: number;
  rateApplied: number; // annual percent
  isFixed: boolean;
}

export interface MortgageInput {
  principal: number;
  startDate: Date;
  tenorMonths: number;
  fixedRateAPR: number;
  fixedPeriodEndDate: Date;
  marginBps: number;
  eiborAssumptionBps: number;
  monthlyPayment: number;
}

export interface MortgageRecord {
  principal: number;
  startDate: Date | string;
  tenorMonths: number;
  fixedRateAPR: number;
  fixedPeriodEndDate: Date | string;
  marginBps: number;
  eiborAssumptionBps: number;
  monthlyPayment: number;
}

export function toMortgageInput(m: MortgageRecord): MortgageInput {
  return {
    principal: m.principal,
    startDate: typeof m.startDate === "string" ? new Date(m.startDate) : m.startDate,
    tenorMonths: m.tenorMonths,
    fixedRateAPR: m.fixedRateAPR,
    fixedPeriodEndDate: typeof m.fixedPeriodEndDate === "string" ? new Date(m.fixedPeriodEndDate) : m.fixedPeriodEndDate,
    marginBps: m.marginBps,
    eiborAssumptionBps: m.eiborAssumptionBps,
    monthlyPayment: m.monthlyPayment,
  };
}

/** Monthly periodic rate from an annual percentage rate, e.g. 3.99 -> 0.003325 */
export function monthlyRate(annualRatePct: number): number {
  return annualRatePct / 100 / 12;
}

/** Standard amortizing-loan payment formula: P * r / (1 - (1 + r)^-n) */
export function calcMonthlyPayment(
  principal: number,
  annualRatePct: number,
  remainingMonths: number,
): number {
  if (remainingMonths <= 0) return principal;
  const r = monthlyRate(annualRatePct);
  if (r === 0) return principal / remainingMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -remainingMonths));
}

export function variableRateFromBps(marginBps: number, eiborBps: number): number {
  return (marginBps + eiborBps) / 100;
}

export interface ScheduleOptions {
  /** Override the EIBOR assumption used once the fixed period ends (basis points). */
  eiborOverrideBps?: number;
  /** One-off extra principal payments, keyed by the payment number after which they land. */
  lumpSums?: { afterPaymentNo: number; amount: number }[];
  /** Extra amount added to every regular payment from this payment number onward. */
  extraMonthly?: number;
  extraMonthlyFromPaymentNo?: number;
  /**
   * Pins the recalculated post-reset payment to a fixed figure (typically taken
   * from the no-prepayment baseline schedule) instead of recomputing it from
   * this schedule's own, possibly lower, balance at reset. Without this, any
   * lump sum or extra payment made *before* the reset would just shrink the
   * post-reset payment to still finish exactly on the original maturity date
   * instead of shortening the loan — which defeats the point of a "months
   * cut" prepayment simulation.
   */
  postResetPayment?: number;
}

/**
 * Builds a full amortization schedule. During the fixed period the contractual
 * fixed rate and monthly payment apply. From the first payment date after the
 * fixed period ends, the rate switches to margin + EIBOR and the payment is
 * recalculated once so the remaining balance fully amortizes over the
 * remaining tenor (standard UAE bank practice at reset).
 */
export function buildAmortizationSchedule(
  input: MortgageInput,
  options: ScheduleOptions = {},
): AmortizationRow[] {
  const rows: AmortizationRow[] = [];
  let balance = input.principal;
  const eiborBps = options.eiborOverrideBps ?? input.eiborAssumptionBps;
  const variableRate = variableRateFromBps(input.marginBps, eiborBps);

  let currentPayment = input.monthlyPayment;
  let recomputedForReset = false;

  const lumpSumByPaymentNo = new Map<number, number>();
  for (const ls of options.lumpSums ?? []) {
    lumpSumByPaymentNo.set(ls.afterPaymentNo, (lumpSumByPaymentNo.get(ls.afterPaymentNo) ?? 0) + ls.amount);
  }

  for (let i = 1; i <= input.tenorMonths && balance > 0.005; i++) {
    const paymentDate = addMonths(input.startDate, i);
    const isFixed = paymentDate <= input.fixedPeriodEndDate;
    const rate = isFixed ? input.fixedRateAPR : variableRate;

    if (!isFixed && !recomputedForReset) {
      if (options.postResetPayment != null) {
        currentPayment = options.postResetPayment;
      } else {
        const remaining = input.tenorMonths - i + 1;
        currentPayment = calcMonthlyPayment(balance, rate, remaining);
      }
      recomputedForReset = true;
    }

    let payment = currentPayment;
    if (options.extraMonthly && i >= (options.extraMonthlyFromPaymentNo ?? 1)) {
      payment += options.extraMonthly;
    }

    const interest = balance * monthlyRate(rate);
    let principalPortion = payment - interest;
    if (principalPortion < 0) principalPortion = 0;
    if (principalPortion > balance) principalPortion = balance;
    const actualPayment = interest + principalPortion;
    let closingBalance = balance - principalPortion;

    const lump = lumpSumByPaymentNo.get(i) ?? 0;
    const lumpApplied = Math.min(lump, closingBalance);
    closingBalance -= lumpApplied;

    rows.push({
      paymentNo: i,
      date: paymentDate,
      openingBalance: balance,
      interest,
      principal: principalPortion + lumpApplied,
      payment: actualPayment + lumpApplied,
      closingBalance,
      rateApplied: rate,
      isFixed,
    });

    balance = closingBalance;
  }

  return rows;
}

export function totalInterest(schedule: AmortizationRow[]): number {
  return schedule.reduce((sum, r) => sum + r.interest, 0);
}

export function interestPaidToDate(schedule: AmortizationRow[], asOf: Date): number {
  return schedule
    .filter((r) => r.date <= asOf)
    .reduce((sum, r) => sum + r.interest, 0);
}

export function outstandingBalance(schedule: AmortizationRow[], asOf: Date): number {
  const past = schedule.filter((r) => r.date <= asOf);
  if (past.length === 0) return schedule[0]?.openingBalance ?? 0;
  return past[past.length - 1].closingBalance;
}

export function nextPayment(schedule: AmortizationRow[], asOf: Date): AmortizationRow | undefined {
  return schedule.find((r) => r.date > asOf);
}

export interface PrepaySimulationResult {
  baselineSchedule: AmortizationRow[];
  scenarioSchedule: AmortizationRow[];
  monthsSaved: number;
  interestSaved: number;
  earlySettlementFee: number;
  netSavings: number;
}

/** Early settlement fee, UAE-style: a percentage of the amount prepaid, capped by the bank's policy. */
export function calcEarlySettlementFee(amountPrepaid: number, feeCapPct: number): number {
  return amountPrepaid * (feeCapPct / 100);
}

export function simulateLumpSum(
  input: MortgageInput,
  amount: number,
  afterPaymentNo: number,
  feeCapPct: number,
  eiborOverrideBps?: number,
): PrepaySimulationResult {
  const baselineSchedule = buildAmortizationSchedule(input, { eiborOverrideBps });
  const postResetPayment = baselineSchedule.find((r) => !r.isFixed)?.payment;
  const scenarioSchedule = buildAmortizationSchedule(input, {
    eiborOverrideBps,
    lumpSums: [{ afterPaymentNo, amount }],
    postResetPayment,
  });
  const fee = calcEarlySettlementFee(amount, feeCapPct);
  const interestSaved = totalInterest(baselineSchedule) - totalInterest(scenarioSchedule);
  return {
    baselineSchedule,
    scenarioSchedule,
    monthsSaved: baselineSchedule.length - scenarioSchedule.length,
    interestSaved,
    earlySettlementFee: fee,
    netSavings: interestSaved - fee,
  };
}

export function simulateHigherMonthlyPayment(
  input: MortgageInput,
  extraMonthly: number,
  fromPaymentNo: number,
  eiborOverrideBps?: number,
): PrepaySimulationResult {
  const baselineSchedule = buildAmortizationSchedule(input, { eiborOverrideBps });
  const postResetPayment = baselineSchedule.find((r) => !r.isFixed)?.payment;
  const scenarioSchedule = buildAmortizationSchedule(input, {
    eiborOverrideBps,
    extraMonthly,
    extraMonthlyFromPaymentNo: fromPaymentNo,
    postResetPayment,
  });
  const interestSaved = totalInterest(baselineSchedule) - totalInterest(scenarioSchedule);
  return {
    baselineSchedule,
    scenarioSchedule,
    monthsSaved: baselineSchedule.length - scenarioSchedule.length,
    interestSaved,
    earlySettlementFee: 0,
    netSavings: interestSaved,
  };
}

export interface LoggedPayment {
  date: Date;
  amount: number;
  type: string; // "scheduled" | "extra" | "lump_sum"
  principalPortion: number | null;
}

/**
 * Builds the schedule that reflects reality: any logged extra/lump-sum
 * payments are folded in as one-off principal reductions at the month they
 * were made, so the outstanding balance and interest-to-date account for
 * prepayments actually made rather than just the original loan terms.
 */
export function buildLiveSchedule(input: MortgageInput, payments: LoggedPayment[]): AmortizationRow[] {
  const lumpSums = payments
    .filter((p) => p.type !== "scheduled")
    .map((p) => ({
      afterPaymentNo: Math.max(1, differenceInCalendarMonths(p.date, input.startDate)),
      amount: p.principalPortion ?? p.amount,
    }));
  if (lumpSums.length === 0) return buildAmortizationSchedule(input);

  const baselinePayment = buildAmortizationSchedule(input).find((r) => !r.isFixed)?.payment;
  return buildAmortizationSchedule(input, { lumpSums, postResetPayment: baselinePayment });
}
