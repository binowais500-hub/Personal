import { startOfMonth, startOfYear } from "date-fns";
import { db } from "@/lib/db";
import { lastNMonthKeys, monthlySpendTrend, type TxnLike } from "@/lib/analytics";
import { buildLiveSchedule, interestPaidToDate, nextPayment, outstandingBalance, toMortgageInput } from "@/lib/mortgage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkline } from "@/components/sparkline";
import { ExportPdfButton } from "@/components/export-pdf-button";
import { PageHeader } from "@/components/page-header";
import { cn, formatAED, formatDate, formatMonthYear, formatPercent } from "@/lib/utils";
import Link from "next/link";

// This page reads live data straight from the local SQLite DB on every
// request; it must never be frozen into a static build-time snapshot.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const yearStart = startOfYear(now);
  const trendMonths = lastNMonthKeys(6);
  const trendSince = startOfMonth(new Date(`${trendMonths[0]}-01T00:00:00`));

  const [categories, budgets, trendTxns, mortgage] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
    db.budget.findMany(),
    db.transaction.findMany({
      where: { date: { gte: trendSince } },
      select: { id: true, cardId: true, date: true, amountAED: true, amountOriginal: true, currencyOriginal: true, fxFee: true, merchantNormalized: true, categoryId: true },
    }) as Promise<TxnLike[]>,
    db.mortgage.findFirst({ orderBy: { createdAt: "asc" } }),
  ]);

  const totalBudget = budgets.reduce((s, b) => s + b.amountAED, 0);
  const trend = monthlySpendTrend(trendTxns, trendMonths);
  const currentMonthSpend = trend[trend.length - 1]?.total ?? 0;
  const budgetPct = totalBudget > 0 ? Math.min(100, (currentMonthSpend / totalBudget) * 100) : 0;
  const overBudget = totalBudget > 0 && currentMonthSpend > totalBudget;

  const savingsSeries = trend.map((p) => totalBudget - p.total);
  const thisMonthSavings = savingsSeries[savingsSeries.length - 1] ?? 0;

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const spendByCategory = new Map<string | null, number>();
  for (const t of trendTxns) {
    if (t.amountAED <= 0) continue;
    if (t.date < currentMonthStart) continue;
    spendByCategory.set(t.categoryId, (spendByCategory.get(t.categoryId) ?? 0) + t.amountAED);
  }
  const categorySummary = Array.from(spendByCategory.entries())
    .map(([categoryId, amount]) => ({ name: categoryId ? categoryById.get(categoryId)?.name ?? "Other" : "Uncategorized", amount }))
    .sort((a, b) => b.amount - a.amount);

  let mortgageStats: null | {
    balance: number;
    next: { amount: number; date: Date } | null;
    interestThisYear: number;
  } = null;

  if (mortgage) {
    const payments = await db.mortgagePayment.findMany({ where: { mortgageId: mortgage.id } });
    const input = toMortgageInput(mortgage);
    const schedule = buildLiveSchedule(
      input,
      payments.map((p) => ({ date: p.date, amount: p.amount, type: p.type, principalPortion: p.principalPortion })),
    );
    const balance = outstandingBalance(schedule, now);
    const next = nextPayment(schedule, now);
    const interestThisYear = interestPaidToDate(schedule, now) - interestPaidToDate(schedule, new Date(yearStart.getTime() - 1));
    mortgageStats = { balance, next: next ? { amount: next.payment, date: next.date } : null, interestThisYear };
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" description={formatMonthYear(now)} actions={<ExportPdfButton />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-xs">This month&apos;s card spend</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{formatAED(currentMonthSpend)}</p>
            <p className="text-muted-foreground mt-1 text-xs">of {formatAED(totalBudget)} budgeted</p>
            {totalBudget > 0 && (
              <Progress value={budgetPct} indicatorClassName={cn(overBudget && "bg-destructive")} className="mt-3" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-xs">Mortgage balance</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {mortgageStats ? formatAED(mortgageStats.balance) : "—"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{mortgage ? mortgage.bankName : "Not set up"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-xs">Next payment</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {mortgageStats?.next ? formatAED(mortgageStats.next.amount) : "—"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {mortgageStats?.next ? formatDate(mortgageStats.next.date) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-xs">Interest paid this year</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {mortgageStats ? formatAED(mortgageStats.interestThisYear) : "—"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">mortgage, year to date</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <p className="text-muted-foreground text-xs">Savings trend</p>
            <p className={cn("mt-1 text-xl font-semibold tabular-nums tracking-tight", thisMonthSavings < 0 ? "text-destructive" : "text-success")}>
              {thisMonthSavings >= 0 ? "+" : ""}
              {formatAED(thisMonthSavings)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">this month vs. budget, last 6 months shown</p>
          </div>
          <Sparkline values={savingsSeries} width={140} height={36} />
        </CardContent>
      </Card>

      <Card className="print:shadow-none">
        <CardHeader>
          <CardTitle>Monthly summary</CardTitle>
          <CardDescription>{formatMonthYear(now)} spend by category</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categorySummary.map((row) => (
                <TableRow key={row.name}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAED(row.amount)}</TableCell>
                </TableRow>
              ))}
              {categorySummary.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground text-center">
                    No spend recorded yet this month.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {categorySummary.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatAED(categorySummary.reduce((s, r) => s + r.amount, 0))}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
          {mortgageStats && (
            <div className="border-border/60 mt-4 flex flex-wrap gap-x-8 gap-y-1 border-t pt-4 text-sm">
              <span className="text-muted-foreground">
                Mortgage balance: <span className="text-foreground font-medium">{formatAED(mortgageStats.balance)}</span>
              </span>
              {mortgage && (
                <span className="text-muted-foreground">
                  {formatPercent(((mortgage.principal - mortgageStats.balance) / mortgage.principal) * 100, 1)} paid off
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!mortgage && (
        <p className="text-muted-foreground text-sm">
          <Link href="/mortgage" className="text-primary underline underline-offset-2">
            Set up your mortgage
          </Link>{" "}
          to see it here too.
        </p>
      )}
    </div>
  );
}
