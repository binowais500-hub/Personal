"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Settings,
  LogOut,
  Wallet,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { CommandPalette } from "@/components/command-palette";
import { NAV_SECTIONS } from "@/lib/nav-items";

const SIDEBAR_COLLAPSE_KEY = "ledger:sidebar-collapsed";

function NavLinks({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-6">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          {!collapsed && (
            <p className="text-muted-foreground px-2 text-xs font-medium tracking-wide uppercase">
              {section.label}
            </p>
          )}
          {section.items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors duration-150",
                  collapsed && "justify-center px-0 py-2",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-foreground/80 hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && item.label}
              </Link>
            );
            if (!collapsed) return link;
            return (
              <Tooltip key={item.href} delayDuration={200}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [paletteHint, setPaletteHint] = React.useState<"mac" | "other" | null>(null);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setCollapsed(stored === "1");
    } catch {
      // localStorage unavailable (private browsing) — default to expanded.
    }
    setPaletteHint(navigator.platform.toUpperCase().includes("MAC") ? "mac" : "other");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function openPalette() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  return (
    <div className="flex min-h-screen">
      <CommandPalette />

      {/* Desktop sidebar */}
      <aside
        className="no-print hidden shrink-0 flex-col border-r border-border/60 px-3 py-5 transition-[width] duration-200 md:flex"
        style={{ width: collapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width)" }}
      >
        <Link href="/" className={cn("mb-6 flex items-center gap-2 px-2", collapsed && "justify-center px-0")}>
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Wallet className="size-4" />
          </div>
          {!collapsed && <span className="font-semibold tracking-tight">Ledger</span>}
        </Link>
        <nav className="flex-1 overflow-y-auto">
          <NavLinks collapsed={collapsed} />
        </nav>
        <div className={cn("flex items-center pt-4", collapsed ? "justify-center" : "justify-end")}>
          <Button variant="ghost" size="icon" aria-label="Collapse sidebar" onClick={toggleCollapsed}>
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        </div>
      </aside>

      {/* Mobile nav drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="px-3 py-5">
          <Link href="/" onClick={() => setMobileNavOpen(false)} className="mb-6 flex items-center gap-2 px-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Wallet className="size-4" />
            </div>
            <span className="font-semibold tracking-tight">Ledger</span>
          </Link>
          <nav className="flex-1 overflow-y-auto">
            <NavLinks onNavigate={() => setMobileNavOpen(false)} />
          </nav>
          <SheetClose asChild>
            <div className="flex items-center justify-between px-2 pt-4">
              <Link href="/settings" onClick={() => setMobileNavOpen(false)}>
                <Button variant="ghost" size="icon" aria-label="Settings">
                  <Settings className="size-4" />
                </Button>
              </Link>
              <Button variant="ghost" size="icon" aria-label="Log out" onClick={handleLogout}>
                <LogOut className="size-4" />
              </Button>
            </div>
          </SheetClose>
        </SheetContent>
      </Sheet>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setMobileNavOpen(true)}>
              <Menu className="size-4" />
            </Button>
            <Link href="/" className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Wallet className="size-4" />
              </div>
              <span className="font-semibold tracking-tight">Ledger</span>
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Search" onClick={openPalette}>
              <Search className="size-4" />
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {/* Desktop top bar */}
        <header className="no-print sticky top-0 z-30 hidden items-center justify-between border-b border-border/60 bg-background/80 px-6 py-3 backdrop-blur md:flex">
          <button
            onClick={openPalette}
            className="text-muted-foreground hover:bg-accent/60 hover:text-foreground flex w-full max-w-sm items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm transition-colors"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Search transactions, pages…</span>
            {paletteHint && (
              <kbd className="bg-muted text-muted-foreground rounded border border-border/60 px-1.5 py-0.5 text-[10px] font-medium">
                {paletteHint === "mac" ? "⌘K" : "Ctrl K"}
              </kbd>
            )}
          </button>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Link href="/settings">
              <Button variant="ghost" size="icon" aria-label="Settings">
                <Settings className="size-4" />
              </Button>
            </Link>
            <Button variant="ghost" size="icon" aria-label="Log out" onClick={handleLogout}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
