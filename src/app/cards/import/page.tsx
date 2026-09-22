"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, FileText, FileSpreadsheet, File as FileIcon, ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { applyMapping, guessMapping } from "@/lib/import/apply-mapping";
import { matchCategoryRule } from "@/lib/categorize";
import { normalizeMerchant } from "@/lib/merchant";
import { computeDedupeHash } from "@/lib/dedupe";
import type { ImportFileType, MappingConfig, ParsedRow } from "@/lib/import/types";
import { cn, formatAED } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

interface CardRow {
  id: string;
  bankName: string;
  cardName: string;
  last4: string;
  currency: string;
  color: string;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  rules: { id: string; pattern: string; categoryId: string; priority: number }[];
}

type Step = 1 | 2 | 3 | 4;

const CURRENCIES = ["AED", "USD", "EUR", "GBP"];

function fileIcon(fileType: ImportFileType) {
  if (fileType === "csv") return <FileText className="size-4" />;
  if (fileType === "excel") return <FileSpreadsheet className="size-4" />;
  return <FileIcon className="size-4" />;
}

export default function ImportPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);

  const [cards, setCards] = React.useState<CardRow[]>([]);
  const [categories, setCategories] = React.useState<CategoryRow[]>([]);
  const [selectedCardId, setSelectedCardId] = React.useState<string>("");
  const [newCardOpen, setNewCardOpen] = React.useState(false);
  const [newCard, setNewCard] = React.useState({ bankName: "", cardName: "", last4: "", currency: "AED" });
  const [creatingCard, setCreatingCard] = React.useState(false);

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

  const [duplicateRowIndexes, setDuplicateRowIndexes] = React.useState<Set<number>>(new Set());
  const [excludedIndexes, setExcludedIndexes] = React.useState<Set<number>>(new Set());
  const [rowCategoryOverrides, setRowCategoryOverrides] = React.useState<Record<number, string | null>>({});
  const [checkingDuplicates, setCheckingDuplicates] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [commitResult, setCommitResult] = React.useState<{ inserted: number; skippedDuplicates: number } | null>(
    null,
  );

  React.useEffect(() => {
    fetch("/api/cards")
      .then((r) => r.json())
      .then((d) => setCards(d.cards ?? []));
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
  }, []);

  const selectedCard = cards.find((c) => c.id === selectedCardId);
  const allRules = React.useMemo(() => categories.flatMap((c) => c.rules), [categories]);

  function selectCard(card: CardRow) {
    setSelectedCardId(card.id);
    setBankName(card.bankName);
  }

  async function handleCreateCard() {
    if (!newCard.bankName || !newCard.cardName || !/^\d{4}$/.test(newCard.last4)) {
      toast.error("Fill in bank, card name, and a 4-digit last-4");
      return;
    }
    setCreatingCard(true);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCard),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not create card");
        return;
      }
      setCards((prev) => [...prev, data.card]);
      selectCard(data.card);
      setNewCardOpen(false);
      setNewCard({ bankName: "", cardName: "", last4: "", currency: "AED" });
    } finally {
      setCreatingCard(false);
    }
  }

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
      form.append("context", "card");
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
          dateFormat: data.fileType === "pdf" ? "dd/MM/yyyy" : "dd/MM/yyyy",
          skipRows: 0,
          amountSign: "spend_positive",
          lineRegex:
            data.fileType === "pdf"
              ? String.raw`^(?<date>\d{2}\/\d{2}\/\d{4})\s+(?<description>.+?)\s+(?<amount>-?[\d,]+\.\d{2})\s*(?<currency>[A-Z]{3})?$`
              : undefined,
          ...guess,
        });
      }
      setStep(3);
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

  const categorizedRows = React.useMemo(() => {
    return previewRows.map((row) => {
      if (rowCategoryOverrides[row.rowIndex] !== undefined) {
        return { ...row, categoryId: rowCategoryOverrides[row.rowIndex] };
      }
      const merchantNormalized = normalizeMerchant(row.description);
      const match = allRules.length ? matchCategoryRule(merchantNormalized, allRules) : null;
      return { ...row, categoryId: match?.categoryId ?? null };
    });
  }, [previewRows, allRules, rowCategoryOverrides]);

  async function handleGoToPreview() {
    if (!selectedCard) return;
    setCheckingDuplicates(true);
    try {
      const validRows = categorizedRows.filter((r) => !r.error && r.date);
      const hashes = await Promise.all(
        validRows.map((r) => computeDedupeHash({ date: new Date(r.date!), amountAED: r.amountAED!, description: r.description })),
      );
      const res = await fetch("/api/import/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: selectedCard.id, hashes }),
      });
      const data = await res.json();
      const existing = new Set<string>(data.existingHashes ?? []);
      const dupeRowIndexes = new Set<number>();
      validRows.forEach((r, i) => {
        if (existing.has(hashes[i])) dupeRowIndexes.add(r.rowIndex);
      });
      setDuplicateRowIndexes(dupeRowIndexes);
      // Pre-exclude error rows and duplicates by default.
      const toExclude = new Set<number>();
      categorizedRows.forEach((r) => {
        if (r.error || dupeRowIndexes.has(r.rowIndex)) toExclude.add(r.rowIndex);
      });
      setExcludedIndexes(toExclude);
      setStep(4);
    } finally {
      setCheckingDuplicates(false);
    }
  }

  async function handleCommit() {
    if (!selectedCard || !parseResult) return;
    const toImport = categorizedRows.filter((r) => !excludedIndexes.has(r.rowIndex) && !r.error && r.date);
    if (toImport.length === 0) {
      toast.error("No rows selected to import");
      return;
    }
    setCommitting(true);
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: selectedCard.id,
          bankName,
          fileName: parseResult.fileName,
          mapping,
          transactions: toImport.map((r) => ({
            date: r.date,
            description: r.description,
            amountAED: r.amountAED,
            amountOriginal: r.amountOriginal,
            currencyOriginal: r.currencyOriginal,
            fxFee: r.fxFee,
            categoryId: r.categoryId,
            categoryIsManual: rowCategoryOverrides[r.rowIndex] !== undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Import failed");
        return;
      }
      setCommitResult({ inserted: data.inserted, skippedDuplicates: data.skippedDuplicates });
      toast.success(`Imported ${data.inserted} transaction${data.inserted === 1 ? "" : "s"}`);
    } finally {
      setCommitting(false);
    }
  }

  function resetWizard() {
    setStep(1);
    setFile(null);
    setParseResult(null);
    setCommitResult(null);
    setExcludedIndexes(new Set());
    setRowCategoryOverrides({});
  }

  const errorCount = categorizedRows.filter((r) => r.error).length;
  const duplicateCount = categorizedRows.filter((r) => duplicateRowIndexes.has(r.rowIndex)).length;
  const includedCount = categorizedRows.filter((r) => !excludedIndexes.has(r.rowIndex) && !r.error).length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Import a statement" description="CSV, Excel, or PDF — mapped once per bank and remembered for next time." />

      <div className="flex items-center gap-2 text-sm">
        {(["Card", "Upload", "Map columns", "Preview & save"] as const).map((label, i) => (
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
            <CardTitle>Which card is this statement for?</CardTitle>
            <CardDescription>Column mappings are remembered per bank, so pick the right card first.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {cards.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectCard(c)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    selectedCardId === c.id ? "border-primary ring-1 ring-primary" : "border-border/60 hover:bg-accent/40",
                  )}
                >
                  <span className="size-8 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                  <span>
                    <span className="block text-sm font-medium">{c.bankName}</span>
                    <span className="text-muted-foreground block text-xs">
                      {c.cardName} •••• {c.last4}
                    </span>
                  </span>
                </button>
              ))}
              <Dialog open={newCardOpen} onOpenChange={setNewCardOpen}>
                <DialogTrigger asChild>
                  <button className="border-border/60 hover:bg-accent/40 flex items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-sm">
                    <Plus className="size-4" /> Add a card
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add a credit card</DialogTitle>
                    <DialogDescription>Just enough to tell statements apart — no account numbers needed.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <div className="grid gap-1.5">
                      <Label>Bank</Label>
                      <Input
                        placeholder="Emirates NBD"
                        value={newCard.bankName}
                        onChange={(e) => setNewCard((p) => ({ ...p, bankName: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Card name</Label>
                      <Input
                        placeholder="Visa Signature"
                        value={newCard.cardName}
                        onChange={(e) => setNewCard((p) => ({ ...p, cardName: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label>Last 4 digits</Label>
                        <Input
                          maxLength={4}
                          placeholder="4821"
                          value={newCard.last4}
                          onChange={(e) => setNewCard((p) => ({ ...p, last4: e.target.value.replace(/\D/g, "") }))}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Billing currency</Label>
                        <Select value={newCard.currency} onValueChange={(v) => setNewCard((p) => ({ ...p, currency: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCreateCard} disabled={creatingCard}>
                      {creatingCard ? "Adding…" : "Add card"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Button className="self-end" disabled={!selectedCardId} onClick={() => setStep(2)}>
              Continue <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload the statement</CardTitle>
            <CardDescription>.csv, .xlsx, .xls, or .pdf — for {selectedCard?.bankName}</CardDescription>
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
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button disabled={!file || uploading} onClick={handleUpload}>
                {uploading ? "Parsing…" : "Continue"} <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && parseResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {fileIcon(parseResult.fileType)} Map the columns
            </CardTitle>
            <CardDescription>
              {parseResult.fileType === "pdf"
                ? "Write a pattern that captures each transaction line. This is remembered for this bank next time."
                : "Tell Ledger which column is which. This is remembered for this bank next time."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {parseResult.fileType !== "pdf" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <ColumnPicker label="Date column" headers={parseResult.headers} value={mapping.dateColumn} onChange={(v) => setMapping((m) => ({ ...m, dateColumn: v }))} />
                <ColumnPicker label="Description / merchant column" headers={parseResult.headers} value={mapping.descriptionColumn} onChange={(v) => setMapping((m) => ({ ...m, descriptionColumn: v }))} />
                <ColumnPicker label="Amount column (AED billed)" headers={parseResult.headers} value={mapping.amountColumn} onChange={(v) => setMapping((m) => ({ ...m, amountColumn: v }))} />
                <ColumnPicker label="Currency column (optional)" headers={parseResult.headers} value={mapping.currencyColumn} onChange={(v) => setMapping((m) => ({ ...m, currencyColumn: v }))} allowNone />
                <ColumnPicker label="Foreign amount column (optional)" headers={parseResult.headers} value={mapping.foreignAmountColumn} onChange={(v) => setMapping((m) => ({ ...m, foreignAmountColumn: v }))} allowNone />
                <ColumnPicker label="FX fee column (optional)" headers={parseResult.headers} value={mapping.feeColumn} onChange={(v) => setMapping((m) => ({ ...m, feeColumn: v }))} allowNone />
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
                  Needs <code>(?&lt;date&gt;...)</code>, <code>(?&lt;description&gt;...)</code>, and{" "}
                  <code>(?&lt;amount&gt;...)</code> groups. <code>(?&lt;currency&gt;...)</code> is optional.
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
                <Label>In this file, spend is shown as</Label>
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
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount AED</TableHead>
                      <TableHead>Currency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.slice(0, 8).map((row) => (
                      <TableRow key={row.rowIndex}>
                        <TableCell>{row.date ?? <span className="text-destructive">—</span>}</TableCell>
                        <TableCell className="max-w-64 truncate">{row.description}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.amountAED != null ? row.amountAED.toFixed(2) : <span className="text-destructive">—</span>}
                        </TableCell>
                        <TableCell>{row.currencyOriginal}</TableCell>
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
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button disabled={previewRows.length === 0 || checkingDuplicates} onClick={handleGoToPreview}>
                {checkingDuplicates ? "Checking…" : "Continue"} <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && !commitResult && (
        <Card>
          <CardHeader>
            <CardTitle>Preview & save</CardTitle>
            <CardDescription>
              {categorizedRows.length} rows parsed · {errorCount} couldn&apos;t be read · {duplicateCount} look like
              duplicates · {includedCount} will be imported
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="max-h-[28rem] overflow-y-auto rounded-md border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categorizedRows.map((row) => {
                    const isDupe = duplicateRowIndexes.has(row.rowIndex);
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
                        <TableCell className="max-w-56 truncate">{row.description}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.amountAED != null ? formatAED(row.amountAED) : "—"}
                          {row.currencyOriginal !== "AED" && (
                            <span className="text-muted-foreground ml-1 text-xs">
                              ({row.currencyOriginal} {row.amountOriginal?.toFixed(2)})
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.categoryId ?? "none"}
                            onValueChange={(v) =>
                              setRowCategoryOverrides((prev) => ({ ...prev, [row.rowIndex]: v === "none" ? null : v }))
                            }
                          >
                            <SelectTrigger className="h-7 w-36 text-xs">
                              <SelectValue placeholder="Uncategorized" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Uncategorized</SelectItem>
                              {categories.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {row.error ? (
                            <Badge variant="destructive">{row.error}</Badge>
                          ) : isDupe ? (
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
              <Button variant="ghost" onClick={() => setStep(3)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button disabled={includedCount === 0 || committing} onClick={handleCommit}>
                {committing ? "Saving…" : `Import ${includedCount} transaction${includedCount === 1 ? "" : "s"}`}
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
              {commitResult.inserted} transaction{commitResult.inserted === 1 ? "" : "s"} imported
              {commitResult.skippedDuplicates > 0 && `, ${commitResult.skippedDuplicates} duplicate(s) skipped`}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button onClick={() => router.push("/cards/transactions")}>View transactions</Button>
            <Button variant="outline" onClick={resetWizard}>
              Import another statement
            </Button>
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
