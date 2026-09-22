import { startOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetRow } from "@/components/budget-row";
import { PageHeader } from "@/components/page-header";
import { formatAED } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const now = new Date();
  const monthStart = startOfMonth(now);

  const [categories, budgets, spendRows] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
    db.budget.findMany(),
    db.transaction.groupBy({
      by: ["categoryId"],
      where: { date: { gte: monthStart }, amountAED: { gt: 0 } },
      _sum: { amountAED: true },
    }),
  ]);

  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, b.amountAED]));
  const spendByCategory = new Map(spendRows.map((r) => [r.categoryId, r._sum.amountAED ?? 0]));

  const totalBudget = budgets.reduce((s, b) => s + b.amountAED, 0);
  const totalSpend = Array.from(spendByCategory.values()).reduce((s, v) => s + v, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Budgets" description="Set a monthly amount per category — click a number to edit it." />

      <Card>
        <CardHeader>
          <CardTitle>This month overall</CardTitle>
          <CardDescription>
            {formatAED(totalSpend)} spent of {formatAED(totalBudget)} budgeted
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="divide-border/60 divide-y pt-6">
          {categories.map((c) => (
            <BudgetRow
              key={c.id}
              categoryId={c.id}
              name={c.name}
              color={c.color}
              spent={spendByCategory.get(c.id) ?? 0}
              budget={budgetByCategory.get(c.id) ?? 0}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
