import Link from "next/link";
import { Upload } from "lucide-react";
import { db } from "@/lib/db";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddMortgagePaymentDialog } from "@/components/add-mortgage-payment-dialog";
import { DeleteMortgagePaymentButton } from "@/components/delete-mortgage-payment-button";
import { formatAED, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { NoMortgageSetup } from "@/components/no-mortgage-setup";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = { scheduled: "Scheduled", extra: "Extra", lump_sum: "Lump sum" };
const TYPE_VARIANT: Record<string, "secondary" | "warning" | "success"> = {
  scheduled: "secondary",
  extra: "warning",
  lump_sum: "success",
};

export default async function MortgagePaymentsPage() {
  const mortgage = await db.mortgage.findFirst({ orderBy: { createdAt: "asc" } });

  if (!mortgage) {
    return <NoMortgageSetup />;
  }

  const payments = await db.mortgagePayment.findMany({
    where: { mortgageId: mortgage.id },
    orderBy: { date: "desc" },
  });

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const totalExtra = payments.filter((p) => p.type !== "scheduled").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payment log"
        description={`${formatAED(totalPaid)} paid in total · ${formatAED(totalExtra)} in extra/lump-sum payments`}
        actions={
          <>
            <Link href="/mortgage/payments/import">
              <Button variant="outline">
                <Upload className="size-4" /> Import statement
              </Button>
            </Link>
            <AddMortgagePaymentDialog mortgageId={mortgage.id} />
          </>
        }
      />

      <div className="overflow-hidden rounded-md border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">Interest</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{formatDate(p.date)}</TableCell>
                <TableCell>
                  <Badge variant={TYPE_VARIANT[p.type] ?? "secondary"}>{TYPE_LABEL[p.type] ?? p.type}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatAED(p.amount)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.principalPortion != null ? formatAED(p.principalPortion) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.interestPortion != null ? formatAED(p.interestPortion) : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-48 truncate text-xs">{p.notes ?? "—"}</TableCell>
                <TableCell>
                  <DeleteMortgagePaymentButton id={p.id} />
                </TableCell>
              </TableRow>
            ))}
            {payments.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground text-center">
                  No payments logged yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
