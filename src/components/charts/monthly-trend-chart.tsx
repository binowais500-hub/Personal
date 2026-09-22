"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartColor } from "@/lib/chart-colors";
import { formatAED, formatMonthYear } from "@/lib/utils";

export interface TrendDatum {
  month: string;
  total: number;
  [cardKey: string]: string | number;
}

export function MonthlyTrendChart({
  data,
  cards,
}: {
  data: TrendDatum[];
  cards: { id: string; label: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap={6}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="month"
          tickFormatter={(m: string) => formatMonthYear(`${m}-01`)}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={(m) => formatMonthYear(`${m}-01`)}
          formatter={(value, name) => [formatAED(Number(value)), String(name)]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {cards.map((c, i) => (
          <Bar
            key={c.id}
            dataKey={c.id}
            name={c.label}
            stackId="spend"
            fill={chartColor(i)}
            radius={[2, 2, 2, 2]}
            animationDuration={500}
            animationEasing="ease-out"
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
