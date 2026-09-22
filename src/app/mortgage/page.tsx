import { format } from "date-fns";
import { db } from "@/lib/db";
import {
  buildLiveSchedule,
  interestPaidToDate,
  nextPayment,
  outstandingBalance,
  toMortgageInput,
  totalInterest,
} from "@/lib/mortgage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MortgageForm } from "@/components/mortgage-form";
import { MortgageBalanceChart } from "@/components/charts/mortgage-balance-chart";
import { PrincipalInterestChart } from "@/components/charts/principal-interest-chart";
import { AmortizationTable } from "@/components/amortization-table";
import { formatAED, formatDate, formatPercent } from "@/lib/utils";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function MortgagePage() {
  const mortgage = await db.mortgage.findFirst({ orderBy: { createdAt: "asc" } });

  if (!mortgage) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Set up your mortgage</CardTitle>
            <CardDescription>Enter your loan terms once — everything else is calculated from this.</CardDescription>
          </CardHeader>
          <CardContent>
            <MortgageForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  const payments = await db.mortgagePayment.findMany({ where: { mortgageId: mortgage.id }, orderBy: { date: "asc" } });
  const input = toMortgageInput(mortgage);
  const schedule = buildLiveSchedule(
    input,
    payments.map((p) => ({ date: p.date, amount: p.amount, type: p.type, principalPortion: p.principalPortion })),
  );

  const today = new Date();
  const balance = outstandingBalance(schedule, today);
  const interestToDate = interestPaidToDate(schedule, today);
  const totalInt = totalInterest(schedule);
  const remainingInterest = Math.max(0, totalInt - interestToDate);
  const next = nextPayment(schedule, today);

  const balanceData = schedule.map((r) => ({ date: format(r.date, "yyyy-MM"), balance: Math.round(r.closingBalance) }));
  const todayMonth = format(today, "yyyy-MM");
  const resetMonth = format(mortgage.fixedPeriodEndDate, "yyyy-MM");

  const byYear = new Map<string, { principal: number; interest: number }>();
  for (const r of schedule) {
    const y = format(r.date, "yyyy");
    const cur = byYear.get(y) ?? { principal: 0, interest: 0 };
    cur.principal += r.principal;
    cur.interest += r.interest;
    byYear.set(y, cur);
  }
  const yearlyData = Array.from(byYear.entries()).map(([year, v]) => ({
    year,
    principal: Math.round(v.principal),
    interest: Math.round(v.interest),
  }));

  const todayIndex = schedule.findIndex((r) => r.date > today);
  const scheduleForTable = schedule.map((r) => ({ ...r, date: r.date.toISOString() }));

  const percentPaid = ((mortgage.principal - balance) / mortgage.principal) * 100;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mortgage"
        description={`${mortgage.bankName} · ${formatPercent(mortgage.fixedRateAPR)} fixed until ${formatDate(mortgage.fixedPeriodEndDate)}`}
        actions={
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Pencil className="size-4" /> Edit terms
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit loan terms</DialogTitle>
                <DialogDescription>Update this if your bank changes your rate or you refinance.</DialogDescription>
              </DialogHeader>
              <MortgageForm
                mortgageId={mortgage.id}
                initial={{
                  bankName: mortgage.bankName,
                  principal: String(mortgage.principal),
                  startDate: format(mortgage.startDate, "yyyy-MM-dd"),
                  tenorMonths: String(mortgage.tenorMonths),
                  fixedRateAPR: String(mortgage.fixedRateAPR),
                  fixedPeriodEndDate: format(mortgage.fixedPeriodEndDate, "yyyy-MM-dd"),
                  marginBps: String(mortgage.marginBps / 100),
                  eiborAssumptionBps: String(mortgage.eiborAssumptionBps / 100),
                  monthlyPayment: String(mortgage.monthlyPayment),
                  earlySettlementFeeCapPct: String(mortgage.earlySettlementFeeCapPct),
                }}
              />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Outstanding balance" value={formatAED(balance)} sub={`${formatPercent(percentPaid, 1)} paid off`} />
        <StatCard label="Next payment" value={next ? formatAED(next.payment) : "—"} sub={next ? formatDate(next.date) : "Loan complete"} />
        <StatCard label="Interest paid to date" value={formatAED(interestToDate)} sub="since the loan started" />
        <StatCard label="Remaining interest" value={formatAED(remainingInterest)} sub="over the rest of the term" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Balance over time</CardTitle>
          <CardDescription>Outstanding principal, with your rate reset marked.</CardDescription>
        </CardHeader>
        <CardContent>
          <MortgageBalanceChart data={balanceData} todayMonth={todayMonth} resetMonth={resetMonth} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Principal vs. interest, by year</CardTitle>
        </CardHeader>
        <CardContent>
          <PrincipalInterestChart data={yearlyData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Amortization schedule</CardTitle>
          <CardDescription>Reflects any prepayments logged in the payment log.</CardDescription>
        </CardHeader>
        <CardContent>
          <AmortizationTable rows={scheduleForTable} todayIndex={todayIndex === -1 ? schedule.length - 1 : todayIndex} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        <p className="text-muted-foreground mt-1 text-xs">{sub}</p>
      </CardContent>
    </Card>
  );
}
