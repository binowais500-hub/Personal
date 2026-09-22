"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { applyMapping, guessMapping } from "@/lib/import/apply-mapping";
import type { ImportFileType, MappingConfig, ParsedRow } from "@/lib/import/types";
import { cn, formatAED } from "@/lib/utils";

type Step = 1 | 2 | 3;

export default function MortgageImportPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);
  const [mortgageId, setMortgageId] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [parseResult, setParseResult] = React.useState<{
    fileType: ImportFileType;
    headers: string[];
    rows: string[][];
    fileName: string;
  } | null>(null);

  const [mapping, setMapping] = React.useState<MappingConfig>({
    fileType: "csv",
    dateFormat: "dd/MM/yyyy",
    skipRows: 0,
    amountSign: "spend_positive",
  });

  const [existingKeys, setExistingKeys] = React.useState<Set<string>>(new Set());
  const [excludedIndexes, setExcludedIndexes] = React.useState<Set<number>>(new Set());
  const [checking, setChecking] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [commitResult, setCommitResult] = React.useState<{ inserted: number; skippedDuplicates: number } | null>(null);

  React.useEffect(() => {
    fetch("/api/mortgage")
      .then((r) => r.json())
      .then((d) => {
        if (d.mortgage) {
          setMortgageId(d.mortgage.id);
          setBankName(d.mortgage.bankName);
        }
      });
  }, []);

  async function handleUpload() {
    if (!file || !bankName) {
      toast.error("Choose a file and confirm the bank name");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("bankName", bankName);
      form.append("context", "mortgage");
      const res = await fetch("/api/import/parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not parse file");
        return;
      }
      setParseResult({ fileType: data.fileType, headers: data.headers, rows: data.rows, fileName: data.fileName });
      if (data.existingMapping) {
        setMapping(data.existingMapping);
      } else {
        const guess = guessMapping(data.headers);
        setMapping({
          fileType: data.fileType,
          dateFormat: "dd/MM/yyyy",
          skipRows: 0,
          amountSign: "spend_positive",
          lineRegex:
            data.fileType === "pdf"
              ? String.raw`^(?<date>\d{2}\/\d{2}\/\d{4})\s+.*?(?<amount>[\d,]+\.\d{2})\s*$`
              : undefined,
          ...guess,
        });
      }
      setStep(2);
    } finally {
      setUploading(false);
    }
  }

  const previewRows = React.useMemo<ParsedRow[]>(() => {
    if (!parseResult) return [];
    try {
      return applyMapping(parseResult.rows, mapping);
    } catch {
      return [];
    }
  }, [parseResult, mapping]);

  async function handleGoToPreview() {
    if (!mortgageId) return;
    setChecking(true);
    try {
      const res = await fetch(`/api/mortgage/payments?mortgageId=${mortgageId}`);
      const data = await res.json();
      const keys = new Set<string>(
        (data.payments ?? []).map((p: { date: string; amount: number }) => `${p.date.slice(0, 10)}|${p.amount.toFixed(2)}`),
      );
      setExistingKeys(keys);
      const toExclude = new Set<number>();
      previewRows.forEach((r) => {
        const key = r.date && r.amountAED != null ? `${r.date}|${r.amountAED.toFixed(2)}` : null;
        if (r.error || (key && keys.has(key))) toExclude.add(r.rowIndex);
      });
      setExcludedIndexes(toExclude);
      setStep(3);
    } finally {
      setChecking(false);
    }
  }

  async function handleCommit() {
    if (!mortgageId || !parseResult) return;
    const toImport = previewRows.filter((r) => !excludedIndexes.has(r.rowIndex) && !r.error && r.date && r.amountAED != null);
    if (toImport.length === 0) {
      toast.error("No rows selected to import");
      return;
    }
    setCommitting(true);
    try {
      const res = await fetch("/api/mortgage/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mortgageId,
          bankName,
          mapping,
          payments: toImport.map((r) => ({
            date: r.date,
            amount: r.amountAED,
            principalPortion: r.principalPortion,
            interestPortion: r.interestPortion,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Import failed");
        return;
      }
      setCommitResult({ inserted: data.inserted, skippedDuplicates: data.skippedDuplicates });
      toast.success(`Imported ${data.inserted} payment${data.inserted === 1 ? "" : "s"}`);
    } finally {
      setCommitting(false);
    }
  }

  const isDuplicate = (r: ParsedRow) => {
    const key = r.date && r.amountAED != null ? `${r.date}|${r.amountAED.toFixed(2)}` : null;
    return !!key && existingKeys.has(key);
  };

  const includedCount = previewRows.filter((r) => !excludedIndexes.has(r.rowIndex) && !r.error).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="Import a mortgage statement" description="CSV, Excel, or PDF from your bank — mapped once and remembered." />

      <div className="flex items-center gap-2 text-sm">
        {(["Upload", "Map columns", "Preview & save"] as const).map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <div className="bg-border h-px w-6" />}
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1",
                step === i + 1 ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground",
              )}
            >
              <span className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-[10px] text-primary">
                {i + 1}
              </span>
              {label}
            </div>
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload the statement</CardTitle>
            <CardDescription>Your bank&apos;s mortgage/loan account statement — .csv, .xlsx, .xls, or .pdf</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label>Bank name (used to remember this mapping)</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <label className="border-border/60 hover:bg-accent/30 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
              <UploadCloud className="text-muted-foreground size-6" />
              <span className="text-sm">{file ? file.name : "Click to choose a file, or drag it here"}</span>
              <span className="text-muted-foreground text-xs">CSV, Excel, or PDF — up to 15MB</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <Button className="self-end" disabled={!file || !bankName || !mortgageId || uploading} onClick={handleUpload}>
              {uploading ? "Parsing…" : "Continue"} <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && parseResult && (
        <Card>
          <CardHeader>
            <CardTitle>Map the columns</CardTitle>
            <CardDescription>
              {parseResult.fileType === "pdf"
                ? "Write a pattern that captures each payment line."
                : "Tell Ledger which column is which."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {parseResult.fileType !== "pdf" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <ColumnPicker label="Date column" headers={parseResult.headers} value={mapping.dateColumn} onChange={(v) => setMapping((m) => ({ ...m, dateColumn: v }))} />
                <ColumnPicker label="Payment amount column" headers={parseResult.headers} value={mapping.amountColumn} onChange={(v) => setMapping((m) => ({ ...m, amountColumn: v }))} />
                <ColumnPicker label="Principal column (optional)" headers={parseResult.headers} value={mapping.principalColumn} onChange={(v) => setMapping((m) => ({ ...m, principalColumn: v }))} allowNone />
                <ColumnPicker label="Interest column (optional)" headers={parseResult.headers} value={mapping.interestColumn} onChange={(v) => setMapping((m) => ({ ...m, interestColumn: v }))} allowNone />
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label>Line pattern (regex, with named groups)</Label>
                <textarea
                  className="border-input focus-visible:ring-ring min-h-20 w-full rounded-md border bg-transparent p-2 font-mono text-xs shadow-sm outline-none focus-visible:ring-2"
                  value={mapping.lineRegex ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, lineRegex: e.target.value }))}
                />
                <p className="text-muted-foreground text-xs">
                  Needs <code>(?&lt;date&gt;...)</code> and <code>(?&lt;amount&gt;...)</code>. <code>(?&lt;principal&gt;...)</code> and{" "}
                  <code>(?&lt;interest&gt;...)</code> are optional.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>Date format</Label>
                <Input value={mapping.dateFormat} onChange={(e) => setMapping((m) => ({ ...m, dateFormat: e.target.value }))} placeholder="dd/MM/yyyy" />
              </div>
              <div className="grid gap-1.5">
                <Label>{parseResult.fileType === "pdf" ? "Skip leading lines" : "Rows before the header"}</Label>
                <Input
                  type="number"
                  min={0}
                  value={mapping.skipRows}
                  onChange={(e) => setMapping((m) => ({ ...m, skipRows: Math.max(0, Number(e.target.value)) }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Amounts are shown as</Label>
                <Select value={mapping.amountSign} onValueChange={(v) => setMapping((m) => ({ ...m, amountSign: v as MappingConfig["amountSign"] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spend_positive">Positive numbers</SelectItem>
                    <SelectItem value="spend_negative">Negative numbers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Live preview</Label>
              <div className="rounded-md border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Principal</TableHead>
                      <TableHead className="text-right">Interest</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.slice(0, 8).map((row) => (
                      <TableRow key={row.rowIndex}>
                        <TableCell>{row.date ?? <span className="text-destructive">—</span>}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.amountAED != null ? row.amountAED.toFixed(2) : <span className="text-destructive">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.principalPortion?.toFixed(2) ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.interestPortion?.toFixed(2) ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {previewRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground text-center">
                          No rows matched yet — adjust the mapping above.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                {previewRows.filter((r) => !r.error).length} of {previewRows.length} rows parse cleanly so far.
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button disabled={previewRows.length === 0 || checking} onClick={handleGoToPreview}>
                {checking ? "Checking…" : "Continue"} <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && !commitResult && (
        <Card>
          <CardHeader>
            <CardTitle>Preview & save</CardTitle>
            <CardDescription>{includedCount} payment(s) will be imported as scheduled payments.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="max-h-[28rem] overflow-y-auto rounded-md border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Interest</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row) => {
                    const dup = isDuplicate(row);
                    const excluded = excludedIndexes.has(row.rowIndex);
                    return (
                      <TableRow key={row.rowIndex} className={cn(row.error && "opacity-50")}>
                        <TableCell>
                          <Checkbox
                            checked={!excluded && !row.error}
                            disabled={!!row.error}
                            onCheckedChange={(checked) => {
                              setExcludedIndexes((prev) => {
                                const next = new Set(prev);
                                if (checked) next.delete(row.rowIndex);
                                else next.add(row.rowIndex);
                                return next;
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell>{row.date ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.amountAED != null ? formatAED(row.amountAED) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.principalPortion != null ? formatAED(row.principalPortion) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.interestPortion != null ? formatAED(row.interestPortion) : "—"}</TableCell>
                        <TableCell>
                          {row.error ? (
                            <Badge variant="destructive">{row.error}</Badge>
                          ) : dup ? (
                            <Badge variant="warning">Possible duplicate</Badge>
                          ) : (
                            <Badge variant="success">New</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button disabled={includedCount === 0 || committing} onClick={handleCommit}>
                {committing ? "Saving…" : `Import ${includedCount} payment${includedCount === 1 ? "" : "s"}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {commitResult && (
        <Card>
          <CardHeader>
            <CardTitle>Import complete</CardTitle>
            <CardDescription>
              {commitResult.inserted} payment{commitResult.inserted === 1 ? "" : "s"} imported
              {commitResult.skippedDuplicates > 0 && `, ${commitResult.skippedDuplicates} duplicate(s) skipped`}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/mortgage/payments")}>View payment log</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ColumnPicker({
  label,
  headers,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  headers: string[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={value ?? (allowNone ? "none" : undefined)} onValueChange={(v) => onChange(v === "none" ? undefined : v)}>
        <SelectTrigger>
          <SelectValue placeholder="Select a column" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="none">None</SelectItem>}
          {headers.map((h, i) => (
            <SelectItem key={`${h}-${i}`} value={h}>
              {h || `Column ${i + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
