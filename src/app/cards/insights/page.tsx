import { startOfMonth, subMonths } from "date-fns";
import { db } from "@/lib/db";
import { detectRecurring, detectUnusual, fxSummary, type TxnLike } from "@/lib/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatAED, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const since = startOfMonth(subMonths(new Date(), 12));

  const [transactions, cards, categories] = await Promise.all([
    db.transaction.findMany({
      where: { date: { gte: since } },
      select: {
        id: true,
        cardId: true,
        date: true,
        amountAED: true,
        amountOriginal: true,
        currencyOriginal: true,
        fxFee: true,
        merchantNormalized: true,
        categoryId: true,
      },
    }) as Promise<TxnLike[]>,
    db.card.findMany(),
    db.category.findMany(),
  ]);

  const cardById = new Map(cards.map((c) => [c.id, c]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const recurring = detectRecurring(transactions);
  const unusual = detectUnusual(transactions.filter((t) => t.date >= subMonths(new Date(), 3))).slice(0, 15);
  const fx = fxSummary(transactions);

  const recurringMonthlyTotal = recurring.reduce((s, r) => s + r.averageAmount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Insights</h1>
        <p className="text-muted-foreground mt-1 text-sm">Patterns detected automatically from the last 12 months.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recurring charges</CardTitle>
          <CardDescription>
            {recurring.length} subscriptions detected · {formatAED(recurringMonthlyTotal)}/month combined
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Card</TableHead>
                <TableHead>Last charged</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recurring.map((r) => (
                <TableRow key={`${r.cardId}-${r.merchantNormalized}`}>
                  <TableCell>{r.merchantNormalized}</TableCell>
                  <TableCell>
                    {r.categoryId ? (
                      <Badge variant="outline">{categoryById.get(r.categoryId)?.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {cardById.get(r.cardId)?.bankName} •{cardById.get(r.cardId)?.last4}
                  </TableCell>
                  <TableCell>{formatDate(r.lastDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAED(r.averageAmount)}</TableCell>
                </TableRow>
              ))}
              {recurring.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-center">
                    Nothing recurring detected yet — needs 3+ months of similar charges.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unusual transactions</CardTitle>
          <CardDescription>Large amounts or first-time merchants in the last 3 months.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Why</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unusual.map((u) => (
                <TableRow key={u.transaction.id}>
                  <TableCell>{formatDate(u.transaction.date)}</TableCell>
                  <TableCell>{u.transaction.merchantNormalized}</TableCell>
                  <TableCell>
                    <Badge variant="warning">{u.reason}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatAED(u.transaction.amountAED)}</TableCell>
                </TableRow>
              ))}
              {unusual.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground text-center">
                    Nothing stands out recently.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Foreign currency spend & FX fees</CardTitle>
          <CardDescription>
            {formatAED(fx.totalForeignSpendAED)} spent abroad · {formatAED(fx.totalFees)} in fees over 12 months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead className="text-right">Total (AED)</TableHead>
                <TableHead className="text-right">Fees (AED)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fx.byCurrency.map((row) => (
                <TableRow key={row.currency}>
                  <TableCell>{row.currency}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAED(row.totalAED)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.totalFee > 0 ? formatAED(row.totalFee) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
              {fx.byCurrency.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground text-center">
                    No foreign currency transactions in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="text-muted-foreground mt-3 text-xs">
            Fees only show where your bank prints them on the statement as their own column — mapped during import.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
