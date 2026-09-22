import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddMortgagePaymentDialog } from "@/components/add-mortgage-payment-dialog";
import { DeleteMortgagePaymentButton } from "@/components/delete-mortgage-payment-button";
import { formatAED, formatDate } from "@/lib/utils";

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

  const payments = await db.mortgagePayment.findMany({
    where: { mortgageId: mortgage.id },
    orderBy: { date: "desc" },
  });

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const totalExtra = payments.filter((p) => p.type !== "scheduled").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Payment log</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {formatAED(totalPaid)} paid in total · {formatAED(totalExtra)} in extra/lump-sum payments
          </p>
        </div>
        <AddMortgagePaymentDialog mortgageId={mortgage.id} />
      </div>

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
