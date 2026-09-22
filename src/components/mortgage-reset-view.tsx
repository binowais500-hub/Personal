"use client";

import * as React from "react";
import { buildAmortizationSchedule, toMortgageInput, type MortgageRecord } from "@/lib/mortgage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { formatAED, formatDate, formatPercent } from "@/lib/utils";

export function MortgageResetView({ mortgage }: { mortgage: MortgageRecord & { fixedPeriodEndDate: string; startDate: string } }) {
  const input = React.useMemo(() => toMortgageInput(mortgage), [mortgage]);
  const [eiborBps, setEiborBps] = React.useState(mortgage.eiborAssumptionBps);

  const scenarioSchedule = React.useMemo(
    () => buildAmortizationSchedule(input, { eiborOverrideBps: eiborBps }),
    [input, eiborBps],
  );
  const resetRow = scenarioSchedule.find((r) => !r.isFixed);
  const variableRatePct = (input.marginBps + eiborBps) / 100;
  const recomputedPayment = resetRow?.payment ?? 0;
  const delta = recomputedPayment - input.monthlyPayment;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Current fixed payment" value={formatAED(input.monthlyPayment)} sub={`at ${formatPercent(input.fixedRateAPR)} fixed`} />
        <Stat
          label="Payment after reset"
          value={formatAED(recomputedPayment)}
          sub={`at ${formatPercent(variableRatePct)} (margin + EIBOR)`}
        />
        <Stat
          label="Change"
          value={`${delta >= 0 ? "+" : ""}${formatAED(delta)}`}
          sub={delta >= 0 ? "higher than today" : "lower than today"}
          tone={delta > 0 ? "warning" : "success"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>EIBOR scenario</CardTitle>
          <CardDescription>
            Fixed period ends {formatDate(mortgage.fixedPeriodEndDate)}. Slide to see what your payment becomes under
            different EIBOR assumptions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">EIBOR assumption</span>
            <span className="font-medium tabular-nums">{formatPercent(eiborBps / 100)}</span>
          </div>
          <Slider min={0} max={800} step={5} value={[eiborBps]} onValueChange={([v]) => setEiborBps(v)} />
          <div className="text-muted-foreground flex justify-between text-xs">
            <span>0%</span>
            <span>Margin: {formatPercent(input.marginBps / 100)}</span>
            <span>8%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "warning" | "success";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={
            "mt-1 text-2xl font-semibold tabular-nums tracking-tight " +
            (tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "")
          }
        >
          {value}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{sub}</p>
      </CardContent>
    </Card>
  );
}
