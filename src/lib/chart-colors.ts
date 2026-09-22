/**
 * Fixed categorical color slots (validated for CVD-safe adjacent separation).
 * Assign by a stable index (e.g. sortOrder) — never by filtered rank — so an
 * entity keeps its color when the series list changes.
 */
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const;

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
