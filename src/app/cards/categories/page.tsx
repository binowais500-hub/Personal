"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface RuleRow {
  id: string;
  pattern: string;
  priority: number;
  source: string;
  hitCount: number;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  isSystem: boolean;
  rules: RuleRow[];
}

const SWATCHES = ["#16a34a", "#f97316", "#0ea5e9", "#78716c", "#a855f7", "#eab308", "#ec4899", "#6366f1", "#ef4444", "#64748b"];

export default function CategoriesPage() {
  const [categories, setCategories] = React.useState<CategoryRow[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [newCategoryOpen, setNewCategoryOpen] = React.useState(false);
  const [newCategoryName, setNewCategoryName] = React.useState("");
  const [newPattern, setNewPattern] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");

  async function refresh() {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data.categories ?? []);
    setLoading(false);
  }

  React.useEffect(() => {
    // Initial client-side data load; there's no server-rendered data to hydrate from here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  const selected = categories.find((c) => c.id === selectedId) ?? categories[0];

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    const color = SWATCHES[categories.length % SWATCHES.length];
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategoryName.trim(), color }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Could not create category");
      return;
    }
    setNewCategoryName("");
    setNewCategoryOpen(false);
    await refresh();
    setSelectedId(data.category.id);
  }

  async function handleRename(id: string) {
    if (!editingName.trim()) return;
    const res = await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingName.trim() }),
    });
    if (!res.ok) {
      toast.error("Could not rename category");
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function handleDeleteCategory(id: string) {
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Could not delete category");
      return;
    }
    if (selectedId === id) setSelectedId(null);
    await refresh();
  }

  async function handleAddRule() {
    if (!selected || !newPattern.trim()) return;
    const res = await fetch("/api/categories/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern: newPattern.trim().toUpperCase(), categoryId: selected.id, priority: 10 }),
    });
    if (!res.ok) {
      toast.error("Could not add rule");
      return;
    }
    setNewPattern("");
    await refresh();
  }

  async function handleDeleteRule(id: string) {
    await fetch(`/api/categories/rules/${id}`, { method: "DELETE" });
    await refresh();
  }

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-7 w-32" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
          <Dialog open={newCategoryOpen} onOpenChange={setNewCategoryOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="outline" aria-label="Add category">
                <Plus className="size-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New category</DialogTitle>
                <DialogDescription>Add a spending category of your own.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label>Name</Label>
                <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Pets" />
              </div>
              <DialogFooter>
                <Button onClick={handleCreateCategory}>Add category</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col gap-1">
          {categories.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                selected?.id === c.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              {editingId === c.id ? (
                <div className="flex flex-1 items-center gap-1">
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="h-6 px-1 text-xs"
                    onKeyDown={(e) => e.key === "Enter" && handleRename(c.id)}
                  />
                  <button onClick={() => handleRename(c.id)}>
                    <Check className="size-3.5" />
                  </button>
                  <button onClick={() => setEditingId(null)}>
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <button className="flex-1 truncate text-left" onClick={() => setSelectedId(c.id)}>
                  {c.name}
                </button>
              )}
              {editingId !== c.id && (
                <div className="hidden items-center gap-1 group-hover:flex">
                  <button
                    onClick={() => {
                      setEditingId(c.id);
                      setEditingName(c.name);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  {!c.isSystem && (
                    <button onClick={() => handleDeleteCategory(c.id)}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
              <Badge variant="outline" className="text-[10px]">
                {c.rules.length}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ backgroundColor: selected.color }} />
              {selected.name}
            </CardTitle>
            <CardDescription>
              Merchant name rules — transactions matching any of these are categorized automatically.
              Correcting a transaction elsewhere also creates a rule here.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Input
                placeholder="e.g. CARREFOUR"
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddRule()}
              />
              <Button onClick={handleAddRule}>
                <Plus className="size-4" /> Add rule
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              {selected.rules.map((r) => (
                <div key={r.id} className="hover:bg-accent/40 flex items-center justify-between rounded-md px-2 py-1.5 text-sm">
                  <span className="font-mono text-xs">{r.pattern}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.source === "learned" ? "success" : r.source === "seed" ? "secondary" : "outline"}>
                      {r.source}
                    </Badge>
                    <button onClick={() => handleDeleteRule(r.id)} aria-label="Delete rule">
                      <Trash2 className="text-muted-foreground size-3.5 hover:text-destructive" />
                    </button>
                  </div>
                </div>
              ))}
              {selected.rules.length === 0 && (
                <p className="text-muted-foreground py-4 text-center text-sm">No rules yet for this category.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
