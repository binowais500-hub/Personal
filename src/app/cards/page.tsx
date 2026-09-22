import Link from "next/link";
import { startOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { categoryBreakdown, lastNMonthKeys, monthlySpendTrend, topMerchants, type TxnLike } from "@/lib/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAED, formatMonthYear } from "@/lib/utils";
import { MonthlyTrendChart, type TrendDatum } from "@/components/charts/monthly-trend-chart";
import { CategoryBreakdownChart } from "@/components/charts/category-breakdown-chart";
import { Upload, CreditCard } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const [cards, categories] = await Promise.all([
    db.card.findMany({ orderBy: { createdAt: "asc" } }),
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const months = lastNMonthKeys(12);
  const currentMonth = months[months.length - 1];
  const trailingMonths = months.slice(-7, -1);
  const since = startOfMonth(new Date(`${months[0]}-01T00:00:00`));

  const transactions: TxnLike[] = await db.transaction.findMany({
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
  });

  const trendPoints = monthlySpendTrend(transactions, months);
  const trendData: TrendDatum[] = trendPoints.map((p) => ({ month: p.month, total: p.total, ...p.byCard }));

  const breakdown = categoryBreakdown(transactions, currentMonth, trailingMonths);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const categoryChartData = breakdown
    .filter((b) => b.categoryId)
    .map((b) => ({
      name: categoryById.get(b.categoryId!)?.name ?? "Other",
      current: Math.round(b.currentMonth * 100) / 100,
      average: Math.round(b.trailingAverage * 100) / 100,
    }))
    .sort((a, b) => b.current - a.current);

  const merchants = topMerchants(
    transactions.filter((t) => t.date >= startOfMonth(new Date(`${currentMonth}-01T00:00:00`))),
    8,
  );

  const currentMonthByCard = new Map<string, number>();
  for (const t of transactions) {
    if (t.amountAED <= 0) continue;
    const key = t.date.toISOString().slice(0, 7);
    if (key !== currentMonth) continue;
    currentMonthByCard.set(t.cardId, (currentMonthByCard.get(t.cardId) ?? 0) + t.amountAED);
  }

  const thisMonthTotal = trendData[trendData.length - 1]?.total ?? 0;
  const lastMonthTotal = trendData[trendData.length - 2]?.total ?? 0;
  const avg12mo = trendData.reduce((s, p) => s + p.total, 0) / Math.max(trendData.length, 1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cards"
        description={`${formatMonthYear(`${currentMonth}-01`)} at a glance`}
        actions={
          <Link href="/cards/import">
            <Button>
              <Upload className="size-4" /> Import statement
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="This month" value={formatAED(thisMonthTotal)} sub={`vs ${formatAED(lastMonthTotal)} last month`} />
        <StatCard label="12-month average" value={formatAED(avg12mo)} sub="per month" />
        <StatCard label="Cards tracked" value={String(cards.length)} sub={`${transactions.length} transactions on file`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex items-center gap-3 pt-6">
              <span className="size-9 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {c.bankName} <span className="text-muted-foreground font-normal">•••• {c.last4}</span>
                </p>
                <p className="text-muted-foreground text-xs">{c.cardName}</p>
              </div>
              <p className="tabular-nums text-sm font-medium">{formatAED(currentMonthByCard.get(c.id) ?? 0)}</p>
            </CardContent>
          </Card>
        ))}
        {cards.length === 0 && (
          <Card className="sm:col-span-3">
            <CardContent className="pt-6">
              <EmptyState
                icon={CreditCard}
                title="No cards yet"
                description="Import a statement to add your first card and start tracking spend."
                action={
                  <Link href="/cards/import">
                    <Button variant="outline">Import a statement</Button>
                  </Link>
                }
              />
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly spend — last 12 months</CardTitle>
          <CardDescription>By card, stacked to show the total.</CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyTrendChart data={trendData} cards={cards.map((c) => ({ id: c.id, label: `${c.bankName} •${c.last4}` }))} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spend by category</CardTitle>
            <CardDescription>This month vs. the trailing 6-month average.</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryChartData.length > 0 ? (
              <CategoryBreakdownChart data={categoryChartData} />
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">No spend recorded yet this month.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top merchants</CardTitle>
            <CardDescription>{formatMonthYear(`${currentMonth}-01`)}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {merchants.map((m) => (
                  <TableRow key={m.merchantNormalized}>
                    <TableCell className="max-w-48 truncate">{m.merchantNormalized}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAED(m.total)}</TableCell>
                  </TableRow>
                ))}
                {merchants.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground text-center">
                      No transactions this month yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        <p className="text-muted-foreground mt-1 text-xs">{sub}</p>
      </CardContent>
    </Card>
  );
}
