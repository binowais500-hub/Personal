"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/nav";

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <>{children}</>;
  return <AppShell>{children}</AppShell>;
}
