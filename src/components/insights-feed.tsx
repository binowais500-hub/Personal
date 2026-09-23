"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Insight {
  title: string;
  body: string;
  tone: "positive" | "neutral" | "warning";
  href: string;
}

const TONE_ICON = { positive: TrendingUp, neutral: Sparkles, warning: AlertTriangle };
const TONE_CLASS = {
  positive: "border-success/30 text-success",
  neutral: "border-border text-muted-foreground",
  warning: "border-destructive/30 text-destructive",
};

export function InsightsFeed() {
  const [state, setState] = React.useState<{ loading: boolean; configured: boolean; insights: Insight[] }>({
    loading: true,
    configured: true,
    insights: [],
  });

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/insights")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setState({ loading: false, configured: data.configured, insights: data.insights ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, configured: true, insights: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-full" />
              <Skeleton className="mt-1 h-3 w-4/5" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!state.configured) {
    return (
      <p className="text-muted-foreground text-xs">
        AI insights are off. Add <code className="bg-muted rounded px-1 py-0.5">ANTHROPIC_API_KEY</code> to your{" "}
        <code className="bg-muted rounded px-1 py-0.5">.env</code> file and restart the app to enable them.
      </p>
    );
  }

  if (state.insights.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {state.insights.map((insight, i) => {
        const Icon = TONE_ICON[insight.tone];
        return (
          <Link key={i} href={insight.href} className="group">
            <Card className={cn("h-full transition-colors group-hover:border-primary/40")}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-2">
                  <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_CLASS[insight.tone])} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{insight.title}</p>
                    <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{insight.body}</p>
                  </div>
                </div>
                <div className="text-muted-foreground group-hover:text-foreground mt-3 flex items-center gap-1 text-xs">
                  View details <ArrowRight className="size-3" />
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
