"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CreditCard,
  Upload,
  Receipt,
  Tags,
  Target,
  Sparkles,
  Landmark,
  SlidersHorizontal,
  Calculator,
  History,
  Settings,
  LogOut,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Overview", icon: LayoutDashboard }],
  },
  {
    label: "Credit cards",
    items: [
      { href: "/cards", label: "Cards", icon: CreditCard },
      { href: "/cards/import", label: "Import", icon: Upload },
      { href: "/cards/transactions", label: "Transactions", icon: Receipt },
      { href: "/cards/categories", label: "Categories", icon: Tags },
      { href: "/cards/budgets", label: "Budgets", icon: Target },
      { href: "/cards/insights", label: "Insights", icon: Sparkles },
    ],
  },
  {
    label: "Mortgage",
    items: [
      { href: "/mortgage", label: "Overview", icon: Landmark },
      { href: "/mortgage/reset", label: "Rate reset", icon: SlidersHorizontal },
      { href: "/mortgage/prepay", label: "Prepay simulator", icon: Calculator },
      { href: "/mortgage/payments", label: "Payment log", icon: History },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-6">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <p className="text-muted-foreground px-2 text-xs font-medium tracking-wide uppercase">
            {section.label}
          </p>
          {section.items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-foreground/80 hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="no-print hidden w-60 shrink-0 border-r border-border/60 px-3 py-5 md:flex md:flex-col">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Wallet className="size-4" />
          </div>
          <span className="font-semibold tracking-tight">Ledger</span>
        </Link>
        <nav className="flex-1 overflow-y-auto">
          <NavLinks />
        </nav>
        <div className="flex items-center justify-between px-2 pt-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon" aria-label="Settings">
              <Settings className="size-4" />
            </Button>
          </Link>
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="Log out" onClick={handleLogout}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Wallet className="size-4" />
            </div>
            <span className="font-semibold tracking-tight">Ledger</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" aria-label="Log out" onClick={handleLogout}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>
        <div className="no-print border-b border-border/60 px-3 py-2 md:hidden">
          <div className="flex gap-1 overflow-x-auto">
            {NAV_SECTIONS.flatMap((s) => s.items).map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap"
                >
                  <Icon className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
