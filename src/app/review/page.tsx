"use client";

import * as React from "react";
import { NotebookText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ExportPdfButton } from "@/components/export-pdf-button";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

interface Review {
  periodLabel: string;
  headline: string;
  summary: string;
  sections: { heading: string; body: string }[];
}

export default function MonthlyReviewPage() {
  const [state, setState] = React.useState<{ loading: boolean; configured: boolean; review: Review | null }>({
    loading: true,
    configured: true,
    review: null,
  });

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/review")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setState({ loading: false, configured: data.configured, review: data.review });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, configured: true, review: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Monthly review"
        description="An AI-written summary of your month, from locally-computed aggregates."
        actions={state.review ? <ExportPdfButton /> : undefined}
      />

      {state.loading && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="mt-4 h-4 w-1/3" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      )}

      {!state.loading && !state.configured && (
        <EmptyState
          icon={NotebookText}
          title="AI reviews are off"
          description="Add ANTHROPIC_API_KEY to your .env file and restart the app to generate a written monthly review."
        />
      )}

      {!state.loading && state.configured && !state.review && (
        <EmptyState
          icon={NotebookText}
          title="Couldn't generate a review"
          description="Something went wrong reaching the AI. Try refreshing the page."
        />
      )}

      {!state.loading && state.review && (
        <Card className="print:shadow-none">
          <CardContent className="flex flex-col gap-6 pt-6">
            <div>
              <p className="text-muted-foreground text-xs">{state.review.periodLabel}</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">{state.review.headline}</h2>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{state.review.summary}</p>
            </div>
            {state.review.sections.map((s, i) => (
              <div key={i}>
                <h3 className="text-sm font-medium">{s.heading}</h3>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
