"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAED } from "@/lib/utils";

export interface BalancePoint {
  date: string; // yyyy-MM
  balance: number;
}

export function MortgageBalanceChart({
  data,
  todayMonth,
  resetMonth,
}: {
  data: BalancePoint[];
  todayMonth: string;
  resetMonth: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={60}
          tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
        />
        <Tooltip
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          formatter={(value) => [formatAED(Number(value)), "Balance"]}
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
        />
        <ReferenceLine
          x={todayMonth}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={{ value: "Today", position: "insideBottomLeft", fontSize: 10, fill: "var(--muted-foreground)" }}
        />
        <ReferenceLine
          x={resetMonth}
          stroke="var(--chart-2)"
          strokeDasharray="4 4"
          label={{ value: "Rate reset", position: "insideTopLeft", fontSize: 10, fill: "var(--chart-2)" }}
        />
        <Area
          type="monotone"
          dataKey="balance"
          stroke="var(--primary)"
          strokeWidth={2}
          fill="url(#balanceFill)"
          animationDuration={600}
          animationEasing="ease-out"
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
