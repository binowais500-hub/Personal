"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAED } from "@/lib/utils";

export interface CategoryDatum {
  name: string;
  current: number;
  average: number;
}

export function CategoryBreakdownChart({ data }: { data: CategoryDatum[] }) {
  const height = Math.max(220, data.length * 34);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 12, fill: "var(--foreground)" }}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value, name) => [formatAED(Number(value)), String(name)]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="current"
          name="This month"
          fill="var(--primary)"
          radius={[0, 4, 4, 0]}
          barSize={12}
          animationDuration={500}
          animationEasing="ease-out"
        />
        <Bar
          dataKey="average"
          name="6-month average"
          fill="var(--muted-foreground)"
          fillOpacity={0.35}
          radius={[0, 4, 4, 0]}
          barSize={12}
          animationDuration={500}
          animationEasing="ease-out"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
