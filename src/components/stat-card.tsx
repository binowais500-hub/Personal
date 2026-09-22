import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/sparkline";
import { cn, formatAED, formatPercent } from "@/lib/utils";

export interface StatCardDelta {
  /** Absolute AED change vs. the prior period. */
  amount: number;
  /** e.g. "vs last month" */
  label: string;
  /** "goodWhenUp": rising is favorable (green on rise). "goodWhenDown": rising is unfavorable (red on rise) — e.g. spend, balance. */
  tone: "goodWhenUp" | "goodWhenDown";
  /** Show as a percentage of the prior value instead of an AED amount. */
  percent?: boolean;
}

export function StatCard({
  label,
  value,
  sub,
  delta,
  sparkline,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: StatCardDelta;
  sparkline?: number[];
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
            {sub && !delta && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
            {delta && <Delta delta={delta} />}
          </div>
          {sparkline && sparkline.length > 1 && (
            <div className="shrink-0 pt-1">
              <Sparkline values={sparkline} width={64} height={28} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function Delta({ delta }: { delta: StatCardDelta }) {
  const rising = delta.amount > 0;
  const flat = delta.amount === 0;
  const favorable = flat ? null : delta.tone === "goodWhenUp" ? rising : !rising;

  const colorClass = flat ? "text-muted-foreground" : favorable ? "text-success" : "text-destructive";
  const Icon = rising ? ArrowUp : ArrowDown;

  return (
    <p className={cn("mt-1 flex items-center gap-1 text-xs", colorClass)}>
      {!flat && <Icon className="size-3" />}
      <span className="font-medium tabular-nums">
        {delta.percent ? formatPercent(Math.abs(delta.amount), 1) : formatAED(Math.abs(delta.amount))}
      </span>
      <span className="text-muted-foreground">{delta.label}</span>
    </p>
  );
}
