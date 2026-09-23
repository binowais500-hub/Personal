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
  NotebookText,
  Bot,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/review", label: "Monthly review", icon: NotebookText },
      { href: "/ask", label: "Ask my finances", icon: Bot },
    ],
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

export const NAV_ITEMS_FLAT: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);
