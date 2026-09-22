import { db } from "@/lib/db";
import { MortgagePrepayView } from "@/components/mortgage-prepay-view";
import { PageHeader } from "@/components/page-header";
import { NoMortgageSetup } from "@/components/no-mortgage-setup";

export const dynamic = "force-dynamic";

export default async function MortgagePrepayPage() {
  const mortgage = await db.mortgage.findFirst({ orderBy: { createdAt: "asc" } });

  if (!mortgage) {
    return <NoMortgageSetup />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Early repayment simulator" description="See what a lump sum or a higher monthly payment actually saves you." />
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
