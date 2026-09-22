"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function TransactionCategorySelect({
  transactionId,
  categoryId,
  categories,
}: {
  transactionId: string;
  categoryId: string | null;
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleChange(value: string) {
    setPending(true);
    try {
      const res = await fetch(`/api/transactions/${transactionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: value === "none" ? null : value }),
      });
      if (!res.ok) {
        toast.error("Could not update category");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Select value={categoryId ?? "none"} onValueChange={handleChange} disabled={pending}>
      <SelectTrigger className="h-7 w-36 text-xs">
        <SelectValue placeholder="Uncategorized" />
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
  );
}
