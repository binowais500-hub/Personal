import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { TransactionsFilters } from "@/components/transactions-filters";
import { TransactionsTable } from "@/components/transactions-table";

const PAGE_SIZE = 50;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ cardId?: string; categoryId?: string; month?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const [cards, categories] = await Promise.all([
    db.card.findMany({ orderBy: { createdAt: "asc" } }),
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const where: Prisma.TransactionWhereInput = {};
  if (sp.cardId) where.cardId = sp.cardId;
  if (sp.categoryId) where.categoryId = sp.categoryId === "none" ? null : sp.categoryId;
  if (sp.month) {
    const start = new Date(`${sp.month}-01T00:00:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    where.date = { gte: start, lt: end };
  }
  if (sp.q) {
    where.OR = [{ description: { contains: sp.q } }, { merchantNormalized: { contains: sp.q } }];
  }

  const [transactions, total] = await Promise.all([
    db.transaction.findMany({
      where,
      include: { card: true, category: true },
      orderBy: { date: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.transaction.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildQuery(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { cardId: sp.cardId, categoryId: sp.categoryId, month: sp.month, q: sp.q, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Transactions" description={`${total} total`} />

      <Card>
        <CardContent className="pt-6">
          <TransactionsFilters
            cards={cards}
            categories={categories}
            initial={{ q: sp.q, cardId: sp.cardId, categoryId: sp.categoryId, month: sp.month }}
          />
        </CardContent>
      </Card>

      <TransactionsTable
        transactions={transactions.map((t) => ({
          id: t.id,
          date: t.date.toISOString(),
          description: t.description,
          merchantNormalized: t.merchantNormalized,
          amountAED: t.amountAED,
          currencyOriginal: t.currencyOriginal,
          categoryId: t.categoryId,
          card: { bankName: t.card.bankName, last4: t.card.last4 },
        }))}
        categories={categories}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={buildQuery({ page: String(page - 1) })}>
                <Button variant="outline" size="sm">
                  Previous
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
            )}
            {page < totalPages ? (
              <Link href={buildQuery({ page: String(page + 1) })}>
                <Button variant="outline" size="sm">
                  Next
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
