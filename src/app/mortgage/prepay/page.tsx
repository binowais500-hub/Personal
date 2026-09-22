import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MortgagePrepayView } from "@/components/mortgage-prepay-view";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function MortgagePrepayPage() {
  const mortgage = await db.mortgage.findFirst({ orderBy: { createdAt: "asc" } });

  if (!mortgage) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>No mortgage set up yet</CardTitle>
          <CardDescription>Add your loan terms first.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/mortgage">
            <Button>Set up mortgage</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Early repayment simulator</h1>
        <p className="text-muted-foreground mt-1 text-sm">See what a lump sum or a higher monthly payment actually saves you.</p>
      </div>
      <MortgagePrepayView
        mortgage={{
          principal: mortgage.principal,
          startDate: mortgage.startDate.toISOString(),
          tenorMonths: mortgage.tenorMonths,
          fixedRateAPR: mortgage.fixedRateAPR,
          fixedPeriodEndDate: mortgage.fixedPeriodEndDate.toISOString(),
          marginBps: mortgage.marginBps,
          eiborAssumptionBps: mortgage.eiborAssumptionBps,
          monthlyPayment: mortgage.monthlyPayment,
          earlySettlementFeeCapPct: mortgage.earlySettlementFeeCapPct,
        }}
      />
    </div>
  );
}
