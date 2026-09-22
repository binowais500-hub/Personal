"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface CardOption {
  id: string;
  bankName: string;
  last4: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

export function TransactionsFilters({
  cards,
  categories,
  initial,
}: {
  cards: CardOption[];
  categories: CategoryOption[];
  initial: { q?: string; cardId?: string; categoryId?: string; month?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState(initial.q ?? "");

  function navigate(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { q, cardId: initial.cardId, categoryId: initial.categoryId, month: initial.month, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    router.push(`${pathname}?${params.toString()}`);
  }

  // Keep the input in sync when the query changes from elsewhere (Clear
  // filters, browser back/forward, another filter's navigation).
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing controlled input from the URL, not deriving fresh state
    setQ(initial.q ?? "");
  }, [initial.q]);

  // Debounced auto-submit as the user types the merchant search.
  React.useEffect(() => {
    if (q === (initial.q ?? "")) return;
    const handle = setTimeout(() => navigate({ q: q || undefined }), 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="grid gap-3 sm:grid-cols-5">
      <Input
        name="q"
        placeholder="Search merchant…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="sm:col-span-2"
      />
      <select
        value={initial.cardId ?? ""}
        onChange={(e) => navigate({ cardId: e.target.value || undefined })}
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
        value={initial.categoryId ?? ""}
        onChange={(e) => navigate({ categoryId: e.target.value || undefined })}
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
      <Input
        type="month"
        value={initial.month ?? ""}
        onChange={(e) => navigate({ month: e.target.value || undefined })}
      />
      <div className="sm:col-span-5 flex justify-end">
        <Button variant="ghost" type="button" onClick={() => router.push(pathname)}>
          Clear filters
        </Button>
      </div>
    </div>
  );
}
