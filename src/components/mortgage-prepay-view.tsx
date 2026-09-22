"use client";

import * as React from "react";
import { format, differenceInCalendarMonths } from "date-fns";
import {
  simulateHigherMonthlyPayment,
  simulateLumpSum,
  toMortgageInput,
  type MortgageRecord,
} from "@/lib/mortgage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScheduleComparisonChart } from "@/components/charts/schedule-comparison-chart";
import { formatAED, formatMonthYear } from "@/lib/utils";

type Mortgage = MortgageRecord & { fixedPeriodEndDate: string; startDate: string; earlySettlementFeeCapPct: number };

export function MortgagePrepayView({ mortgage }: { mortgage: Mortgage }) {
  const input = React.useMemo(() => toMortgageInput(mortgage), [mortgage]);
  const today = new Date();

  const [lumpAmount, setLumpAmount] = React.useState("100000");
  const [lumpDate, setLumpDate] = React.useState(format(today, "yyyy-MM-dd"));

  const [extraAmount, setExtraAmount] = React.useState("2000");
  const [extraFromDate, setExtraFromDate] = React.useState(format(today, "yyyy-MM-dd"));

  const lumpPaymentNo = Math.max(1, differenceInCalendarMonths(new Date(lumpDate), input.startDate));
  const extraFromPaymentNo = Math.max(1, differenceInCalendarMonths(new Date(extraFromDate), input.startDate));

  const lumpResult = React.useMemo(() => {
    const amount = Number(lumpAmount);
    if (!amount || amount <= 0) return null;
    return simulateLumpSum(input, amount, lumpPaymentNo, mortgage.earlySettlementFeeCapPct);
  }, [input, lumpAmount, lumpPaymentNo, mortgage.earlySettlementFeeCapPct]);

  const extraResult = React.useMemo(() => {
    const amount = Number(extraAmount);
    if (!amount || amount <= 0) return null;
    return simulateHigherMonthlyPayment(input, amount, extraFromPaymentNo);
  }, [input, extraAmount, extraFromPaymentNo]);

  return (
    <Tabs defaultValue="lump">
      <TabsList>
        <TabsTrigger value="lump">Lump sum</TabsTrigger>
        <TabsTrigger value="monthly">Higher monthly payment</TabsTrigger>
      </TabsList>

      <TabsContent value="lump" className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>One-off lump sum</CardTitle>
            <CardDescription>UAE banks typically cap the early settlement fee at 1% of the amount prepaid.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Amount (AED)</Label>
              <Input type="number" value={lumpAmount} onChange={(e) => setLumpAmount(e.target.value)} min={0} />
            </div>
            <div className="grid gap-1.5">
              <Label>Date</Label>
              <Input type="date" value={lumpDate} onChange={(e) => setLumpDate(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {lumpResult && (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label="Months cut" value={String(lumpResult.monthsSaved)} />
              <Stat label="Interest saved" value={formatAED(lumpResult.interestSaved)} tone="success" />
              <Stat label="Early settlement fee" value={formatAED(lumpResult.earlySettlementFee)} tone="warning" />
              <Stat label="Net savings" value={formatAED(lumpResult.netSavings)} tone={lumpResult.netSavings >= 0 ? "success" : "warning"} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Balance: current plan vs. with this lump sum</CardTitle>
              </CardHeader>
              <CardContent>
                <ScheduleComparisonChart data={buildComparisonData(lumpResult.baselineSchedule, lumpResult.scenarioSchedule)} />
              </CardContent>
            </Card>
          </>
        )}
      </TabsContent>

      <TabsContent value="monthly" className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Higher monthly payment</CardTitle>
            <CardDescription>Add a fixed extra amount to every payment from a given month onward.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Extra per month (AED)</Label>
              <Input type="number" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} min={0} />
            </div>
            <div className="grid gap-1.5">
              <Label>Starting from</Label>
              <Input type="date" value={extraFromDate} onChange={(e) => setExtraFromDate(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {extraResult && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Months cut" value={String(extraResult.monthsSaved)} />
              <Stat label="Interest saved" value={formatAED(extraResult.interestSaved)} tone="success" />
              <Stat label="Early settlement fee" value={formatAED(0)} sub="No fee for higher regular payments" />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Balance: current plan vs. with the higher payment</CardTitle>
              </CardHeader>
              <CardContent>
                <ScheduleComparisonChart data={buildComparisonData(extraResult.baselineSchedule, extraResult.scenarioSchedule)} />
              </CardContent>
            </Card>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

function buildComparisonData(
  baseline: { date: Date; closingBalance: number }[],
  scenario: { date: Date; closingBalance: number }[],
) {
  const scenarioByMonth = new Map(scenario.map((r) => [format(r.date, "yyyy-MM"), r.closingBalance]));
  return baseline.map((r) => {
    const key = format(r.date, "yyyy-MM");
    return { date: formatMonthYear(r.date), baseline: Math.round(r.closingBalance), scenario: scenarioByMonth.has(key) ? Math.round(scenarioByMonth.get(key)!) : 0 };
  });
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "success" | "warning" }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={
            "mt-1 text-xl font-semibold tabular-nums tracking-tight " +
            (tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "")
          }
        >
          {value}
        </p>
        {sub && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
      </CardContent>
    </Card>
  );
}
