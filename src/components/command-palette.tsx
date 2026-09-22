"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Upload, MoonIcon, SunIcon, Receipt } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { NAV_ITEMS_FLAT } from "@/lib/nav-items";
import { formatAED, formatDate } from "@/lib/utils";

interface SearchTxn {
  id: string;
  date: string;
  description: string;
  amountAED: number;
  card: string;
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchTxn[]>([]);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  React.useEffect(() => {
    if (query.trim().length < 2) return;
    const handle = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => setResults(d.transactions ?? []))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const visibleResults = query.trim().length < 2 ? [] : results;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setResults([]);
    }
  }

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput placeholder="Search pages, transactions, or run an action…" value={query} onValueChange={setQuery} />
      <CommandList>
        {visibleResults.length === 0 && <CommandEmpty>No results.</CommandEmpty>}

        {visibleResults.length > 0 && (
          <>
            <CommandGroup heading="Transactions" forceMount>
              {visibleResults.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`txn-${t.id}`}
                  forceMount
                  onSelect={() => go(`/cards/transactions?q=${encodeURIComponent(t.description)}`)}
                >
                  <Receipt />
                  <span className="flex-1 truncate">{t.description}</span>
                  <span className="text-muted-foreground text-xs">{formatDate(t.date)}</span>
                  <span className="tabular-nums text-xs">{formatAED(t.amountAED)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Pages">
          {NAV_ITEMS_FLAT.map((item) => (
            <CommandItem
              key={item.href}
              value={`page-${item.href}`}
              keywords={[item.label]}
              onSelect={() => go(item.href)}
            >
              <item.icon />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem value="action-import" keywords={["upload", "csv", "statement"]} onSelect={() => go("/cards/import")}>
            <Upload />
            Import a statement
          </CommandItem>
          <CommandItem
            value="action-theme"
            keywords={["dark", "light", "appearance"]}
            onSelect={() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
            Toggle theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
