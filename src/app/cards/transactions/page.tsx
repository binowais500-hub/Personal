import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAED, formatDate } from "@/lib/utils";
import { TransactionCategorySelect } from "@/components/transaction-category-select";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";

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
    where.OR = [
      { description: { contains: sp.q } },
      { merchantNormalized: { contains: sp.q } },
    ];
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
          <form className="grid gap-3 sm:grid-cols-5" method="GET">
            <Input name="q" placeholder="Search merchant…" defaultValue={sp.q} className="sm:col-span-2" />
            <select
              name="cardId"
              defaultValue={sp.cardId ?? ""}
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-sm"
            >
              <option value="">All cards</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.bankName} •{c.last4}
                </option>
              ))}
            </select>
            <select
              name="categoryId"
              defaultValue={sp.categoryId ?? ""}
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-sm"
            >
              <option value="">All categories</option>
              <option value="none">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Input type="month" name="month" defaultValue={sp.month} />
            <div className="sm:col-span-5 flex justify-end gap-2">
              <Link href="/cards/transactions">
                <Button variant="ghost" type="button">
                  Clear
                </Button>
              </Link>
              <Button type="submit">Filter</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-md border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Card</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="whitespace-nowrap">{formatDate(t.date)}</TableCell>
                <TableCell className="max-w-72 truncate" title={t.description}>
                  {t.description}
                  {t.currencyOriginal !== "AED" && (
                    <Badge variant="outline" className="ml-2">
                      {t.currencyOriginal}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {t.card.bankName} •{t.card.last4}
                </TableCell>
                <TableCell>
                  <TransactionCategorySelect transactionId={t.id} categoryId={t.categoryId} categories={categories} />
                </TableCell>
                <TableCell className={`text-right tabular-nums ${t.amountAED < 0 ? "text-success" : ""}`}>
                  {formatAED(t.amountAED, { signDisplay: t.amountAED < 0 ? "always" : "auto" })}
                </TableCell>
              </TableRow>
            ))}
            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center">
                  No transactions match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
