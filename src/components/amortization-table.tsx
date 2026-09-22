"use client";

import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatAED, formatDate, formatPercent } from "@/lib/utils";

export interface ScheduleRowData {
  paymentNo: number;
  date: string; // ISO
  openingBalance: number;
  interest: number;
  principal: number;
  payment: number;
  closingBalance: number;
  rateApplied: number;
  isFixed: boolean;
}

export function AmortizationTable({ rows, todayIndex }: { rows: ScheduleRowData[]; todayIndex: number }) {
  const [expanded, setExpanded] = React.useState(false);

  const windowStart = Math.max(0, todayIndex - 2);
  const windowEnd = Math.min(rows.length, todayIndex + 13);
  const visible = expanded ? rows : rows.slice(windowStart, windowEnd);

  return (
    <div className="flex flex-col gap-3">
      <div className={expanded ? "max-h-[32rem] overflow-y-auto rounded-md border border-border/60" : "rounded-md border border-border/60"}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead className="text-right">Interest</TableHead>
              <TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">Payment</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.paymentNo} className={r.paymentNo - 1 === todayIndex ? "bg-accent/40" : undefined}>
                <TableCell className="text-muted-foreground">{r.paymentNo}</TableCell>
                <TableCell>{formatDate(r.date)}</TableCell>
                <TableCell>
                  <Badge variant={r.isFixed ? "secondary" : "outline"}>{formatPercent(r.rateApplied)}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatAED(r.interest)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAED(r.principal)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAED(r.payment)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAED(r.closingBalance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button variant="outline" size="sm" className="self-start" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "Show fewer months" : `Show full schedule (${rows.length} months)`}
      </Button>
    </div>
  );
}
