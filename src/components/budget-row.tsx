"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatAED, formatPercent, cn } from "@/lib/utils";

export function BudgetRow({
  categoryId,
  name,
  color,
  spent,
  budget,
}: {
  categoryId: string;
  name: string;
  color: string;
  spent: number;
  budget: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(String(budget || ""));
  const [saving, setSaving] = React.useState(false);

  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const over = budget > 0 && spent > budget;

  async function save() {
    const amount = Number(value);
    if (Number.isNaN(amount) || amount < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/budgets/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountAED: amount }),
      });
      if (!res.ok) {
        toast.error("Could not save budget");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
          {name}
          {over && <Badge variant="destructive">Over budget</Badge>}
        </span>
        <span className="flex items-center gap-2 tabular-nums">
          {formatAED(spent)} /{" "}
          {editing ? (
            <span className="flex items-center gap-1">
              <Input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                className="h-6 w-24 px-1 text-xs"
                disabled={saving}
              />
              <button onClick={save} aria-label="Save budget">
                <Check className="size-3.5" />
              </button>
            </span>
          ) : (
            <button className="text-muted-foreground flex items-center gap-1 hover:text-foreground" onClick={() => setEditing(true)}>
              {formatAED(budget)} <Pencil className="size-3" />
            </button>
          )}
        </span>
      </div>
      <Progress value={pct} indicatorClassName={cn(over && "bg-destructive")} />
      {budget > 0 && <p className="text-muted-foreground text-xs">{formatPercent(pct, 0)} used</p>}
    </div>
  );
}
