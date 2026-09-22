import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MortgageResetView } from "@/components/mortgage-reset-view";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function MortgageResetPage() {
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
        <h1 className="text-xl font-semibold tracking-tight">Rate reset</h1>
        <p className="text-muted-foreground mt-1 text-sm">What your payment becomes once the fixed period ends.</p>
      </div>
      <MortgageResetView
        mortgage={{
          principal: mortgage.principal,
          startDate: mortgage.startDate.toISOString(),
          tenorMonths: mortgage.tenorMonths,
          fixedRateAPR: mortgage.fixedRateAPR,
          fixedPeriodEndDate: mortgage.fixedPeriodEndDate.toISOString(),
          marginBps: mortgage.marginBps,
          eiborAssumptionBps: mortgage.eiborAssumptionBps,
          monthlyPayment: mortgage.monthlyPayment,
        }}
      />
    </div>
  );
}
