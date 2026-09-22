import { db } from "@/lib/db";
import { MortgageResetView } from "@/components/mortgage-reset-view";
import { PageHeader } from "@/components/page-header";
import { NoMortgageSetup } from "@/components/no-mortgage-setup";

export const dynamic = "force-dynamic";

export default async function MortgageResetPage() {
  const mortgage = await db.mortgage.findFirst({ orderBy: { createdAt: "asc" } });

  if (!mortgage) {
    return <NoMortgageSetup />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Rate reset" description="What your payment becomes once the fixed period ends." />
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
