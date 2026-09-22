"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MerchantAvatar } from "@/components/merchant-avatar";
import { TransactionCategorySelect } from "@/components/transaction-category-select";
import { formatAED, formatDate } from "@/lib/utils";

export interface TransactionRow {
  id: string;
  date: string;
  description: string;
  merchantNormalized: string;
  amountAED: number;
  currencyOriginal: string;
  categoryId: string | null;
  card: { bankName: string; last4: string };
}

interface CategoryOption {
  id: string;
  name: string;
}

export function TransactionsTable({ transactions, categories }: { transactions: TransactionRow[]; categories: CategoryOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = React.useState<string>("");
  const [working, setWorking] = React.useState(false);

  const allSelected = transactions.length > 0 && selected.size === transactions.length;
  const someSelected = selected.size > 0;

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(transactions.map((t) => t.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleBulkRecategorize() {
    if (!bulkCategory || selected.size === 0) return;
    setWorking(true);
    try {
      const res = await fetch("/api/transactions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), categoryId: bulkCategory === "none" ? null : bulkCategory }),
      });
      if (!res.ok) {
        toast.error("Could not recategorize selected transactions");
        return;
      }
      toast.success(`Recategorized ${selected.size} transaction${selected.size === 1 ? "" : "s"}`);
      setSelected(new Set());
      setBulkCategory("");
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} transaction${selected.size === 1 ? "" : "s"}? This can't be undone.`)) return;
    setWorking(true);
    try {
      const res = await fetch("/api/transactions/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!res.ok) {
        toast.error("Could not delete selected transactions");
        return;
      }
      toast.success(`Deleted ${selected.size} transaction${selected.size === 1 ? "" : "s"}`);
      setSelected(new Set());
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {someSelected && (
        <div className="bg-accent/60 border-border/60 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Select value={bulkCategory} onValueChange={setBulkCategory}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Recategorize as…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Uncategorized</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={!bulkCategory || working} onClick={handleBulkRecategorize}>
            Apply
          </Button>
          <Button size="sm" variant="outline" disabled={working} onClick={handleBulkDelete}>
            <Trash2 className="size-3.5" /> Delete
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            <X className="size-3.5" /> Clear
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox checked={allSelected} onCheckedChange={(c) => toggleAll(!!c)} aria-label="Select all" />
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Card</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => (
              <TableRow key={t.id} className={selected.has(t.id) ? "bg-accent/30" : undefined}>
                <TableCell>
                  <Checkbox checked={selected.has(t.id)} onCheckedChange={(c) => toggleOne(t.id, !!c)} aria-label="Select row" />
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(t.date)}</TableCell>
                <TableCell className="max-w-72">
                  <div className="flex items-center gap-2">
                    <MerchantAvatar name={t.merchantNormalized} />
                    <span className="truncate" title={t.description}>
                      {t.description}
                    </span>
                    {t.currencyOriginal !== "AED" && <Badge variant="outline">{t.currencyOriginal}</Badge>}
                  </div>
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
                <TableCell colSpan={6} className="text-muted-foreground text-center">
                  No transactions match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
