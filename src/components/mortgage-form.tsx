"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface MortgageFormValues {
  bankName: string;
  principal: string;
  startDate: string;
  tenorMonths: string;
  fixedRateAPR: string;
  fixedPeriodEndDate: string;
  marginBps: string;
  eiborAssumptionBps: string;
  monthlyPayment: string;
  earlySettlementFeeCapPct: string;
}

const EMPTY: MortgageFormValues = {
  bankName: "",
  principal: "",
  startDate: "",
  tenorMonths: "300",
  fixedRateAPR: "",
  fixedPeriodEndDate: "",
  marginBps: "",
  eiborAssumptionBps: "",
  monthlyPayment: "",
  earlySettlementFeeCapPct: "1",
};

export function MortgageForm({
  mortgageId,
  initial,
  onSaved,
}: {
  mortgageId?: string;
  initial?: Partial<MortgageFormValues>;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<MortgageFormValues>({ ...EMPTY, ...initial });
  const [saving, setSaving] = React.useState(false);

  function set<K extends keyof MortgageFormValues>(key: K, v: string) {
    setValues((p) => ({ ...p, [key]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        bankName: values.bankName,
        principal: Number(values.principal),
        startDate: values.startDate,
        tenorMonths: Number(values.tenorMonths),
        fixedRateAPR: Number(values.fixedRateAPR),
        fixedPeriodEndDate: values.fixedPeriodEndDate,
        marginBps: Math.round(Number(values.marginBps) * 100),
        eiborAssumptionBps: Math.round(Number(values.eiborAssumptionBps) * 100),
        monthlyPayment: Number(values.monthlyPayment),
        earlySettlementFeeCapPct: Number(values.earlySettlementFeeCapPct),
      };
      const res = await fetch(mortgageId ? `/api/mortgage/${mortgageId}` : "/api/mortgage", {
        method: mortgageId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not save mortgage");
        return;
      }
      toast.success("Mortgage saved");
      onSaved?.();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label>Bank</Label>
        <Input value={values.bankName} onChange={(e) => set("bankName", e.target.value)} placeholder="ADCB" required />
      </div>
      <div className="grid gap-1.5">
        <Label>Principal (AED)</Label>
        <Input type="number" value={values.principal} onChange={(e) => set("principal", e.target.value)} required min={0} />
      </div>
      <div className="grid gap-1.5">
        <Label>Start date</Label>
        <Input type="date" value={values.startDate} onChange={(e) => set("startDate", e.target.value)} required />
      </div>
      <div className="grid gap-1.5">
        <Label>Tenor (months)</Label>
        <Input type="number" value={values.tenorMonths} onChange={(e) => set("tenorMonths", e.target.value)} required min={1} />
      </div>
      <div className="grid gap-1.5">
        <Label>Fixed rate APR (%)</Label>
        <Input type="number" step="0.01" value={values.fixedRateAPR} onChange={(e) => set("fixedRateAPR", e.target.value)} required min={0} />
      </div>
      <div className="grid gap-1.5">
        <Label>Fixed period ends</Label>
        <Input type="date" value={values.fixedPeriodEndDate} onChange={(e) => set("fixedPeriodEndDate", e.target.value)} required />
      </div>
      <div className="grid gap-1.5">
        <Label>Margin over EIBOR (%)</Label>
        <Input type="number" step="0.01" value={values.marginBps} onChange={(e) => set("marginBps", e.target.value)} required min={0} />
      </div>
      <div className="grid gap-1.5">
        <Label>Current EIBOR assumption (%)</Label>
        <Input
          type="number"
          step="0.01"
          value={values.eiborAssumptionBps}
          onChange={(e) => set("eiborAssumptionBps", e.target.value)}
          required
          min={0}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Monthly payment (fixed period, AED)</Label>
        <Input
          type="number"
          value={values.monthlyPayment}
          onChange={(e) => set("monthlyPayment", e.target.value)}
          required
          min={0}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Early settlement fee cap (%)</Label>
        <Input
          type="number"
          step="0.01"
          value={values.earlySettlementFeeCapPct}
          onChange={(e) => set("earlySettlementFeeCapPct", e.target.value)}
          required
          min={0}
        />
      </div>
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
