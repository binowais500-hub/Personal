import { parse as parseDateFn, isValid } from "date-fns";
import type { MappingConfig, ParsedRow } from "./types";

function parseAmount(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/^-/.test(s)) negative = true;
  s = s.replace(/[^\d.]/g, "");
  if (s === "" || s === ".") return null;
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}

function findColumnIndex(headerRow: string[], name?: string): number {
  if (!name) return -1;
  return headerRow.findIndex((h) => (h ?? "").trim().toLowerCase() === name.trim().toLowerCase());
}

export function applyMapping(rawRows: string[][], mapping: MappingConfig): ParsedRow[] {
  if (mapping.fileType === "pdf") return applyPdfMapping(rawRows, mapping);
  return applyTableMapping(rawRows, mapping);
}

function applyTableMapping(rawRows: string[][], mapping: MappingConfig): ParsedRow[] {
  const headerRow = rawRows[mapping.skipRows] ?? [];
  const dataRows = rawRows.slice(mapping.skipRows + 1);

  const dateIdx = findColumnIndex(headerRow, mapping.dateColumn);
  const descIdx = findColumnIndex(headerRow, mapping.descriptionColumn);
  const amountIdx = findColumnIndex(headerRow, mapping.amountColumn);
  const currencyIdx = findColumnIndex(headerRow, mapping.currencyColumn);
  const foreignIdx = findColumnIndex(headerRow, mapping.foreignAmountColumn);
  const feeIdx = findColumnIndex(headerRow, mapping.feeColumn);

  return dataRows
    .filter((row) => row.some((cell) => (cell ?? "").trim()))
    .map((row, i) => {
      const raw = row.join(" | ");
      const dateStr = dateIdx >= 0 ? (row[dateIdx] ?? "").trim() : "";
      const description = descIdx >= 0 ? (row[descIdx] ?? "").trim() : "";
      const amountRaw = amountIdx >= 0 ? row[amountIdx] : undefined;
      const currencyOriginal = currencyIdx >= 0 ? (row[currencyIdx] ?? "").trim().toUpperCase() || "AED" : "AED";
      const foreignAmountRaw = foreignIdx >= 0 ? row[foreignIdx] : undefined;
      const feeRaw = feeIdx >= 0 ? row[feeIdx] : undefined;

      let date: string | null = null;
      let error: string | undefined;

      if (!dateStr) {
        error = "Missing date";
      } else {
        const parsed = parseDateFn(dateStr, mapping.dateFormat, new Date());
        if (isValid(parsed)) date = parsed.toISOString().slice(0, 10);
        else error = `Could not parse date "${dateStr}"`;
      }

      let amount = parseAmount(amountRaw);
      if (amount == null && !error) error = `Could not parse amount "${amountRaw ?? ""}"`;
      if (amount != null && mapping.amountSign === "spend_negative") amount = -amount;

      const foreignAmount = parseAmount(foreignAmountRaw);
      const fxFee = parseAmount(feeRaw);

      return {
        rowIndex: i,
        raw,
        date,
        description: description || raw,
        amountAED: amount,
        amountOriginal: foreignAmount ?? amount,
        currencyOriginal,
        fxFee: fxFee != null ? Math.abs(fxFee) : null,
        error,
      };
    });
}

function applyPdfMapping(rawRows: string[][], mapping: MappingConfig): ParsedRow[] {
  const lines = rawRows.slice(mapping.skipRows).map((r) => r[0] ?? "");
  let re: RegExp | null = null;
  if (mapping.lineRegex) {
    try {
      re = new RegExp(mapping.lineRegex);
    } catch {
      re = null;
    }
  }

  const results: ParsedRow[] = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    if (!re) return;

    const m = line.match(re);
    if (!m || !m.groups) return; // non-transaction lines (headers/footers/page numbers) are silently skipped

    const { date: dateStr, description, amount: amountStr, currency } = m.groups;
    let date: string | null = null;
    let error: string | undefined;

    if (dateStr) {
      const parsed = parseDateFn(dateStr, mapping.dateFormat, new Date());
      if (isValid(parsed)) date = parsed.toISOString().slice(0, 10);
      else error = `Could not parse date "${dateStr}"`;
    } else {
      error = "Pattern is missing a (?<date>...) group";
    }

    let amount = parseAmount(amountStr);
    if (amount == null && !error) error = `Could not parse amount "${amountStr ?? ""}"`;
    if (amount != null && mapping.amountSign === "spend_negative") amount = -amount;

    results.push({
      rowIndex: i,
      raw: line,
      date,
      description: (description ?? line).trim(),
      amountAED: amount,
      amountOriginal: amount,
      currencyOriginal: (currency ?? "AED").trim().toUpperCase() || "AED",
      fxFee: null,
      error,
    });
  });

  return results;
}

const HEADER_GUESSES: Record<
  keyof Pick<MappingConfig, "dateColumn" | "descriptionColumn" | "amountColumn" | "currencyColumn" | "foreignAmountColumn" | "feeColumn">,
  string[]
> = {
  dateColumn: ["date", "transaction date", "txn date", "posting date", "value date"],
  descriptionColumn: ["description", "merchant", "details", "narration", "transaction details", "particulars"],
  amountColumn: ["amount", "amount (aed)", "aed amount", "billing amount", "debit"],
  currencyColumn: ["currency", "billing currency", "txn currency", "original currency"],
  foreignAmountColumn: ["foreign amount", "original amount", "txn amount"],
  feeColumn: ["fx fee", "fee", "markup", "conversion fee", "cross currency fee"],
};

/** Best-effort auto-suggestion for a fresh bank the app hasn't seen a mapping for yet. */
export function guessMapping(headers: string[]): Partial<MappingConfig> {
  const guess: Partial<MappingConfig> = {};
  for (const [field, candidates] of Object.entries(HEADER_GUESSES) as [keyof typeof HEADER_GUESSES, string[]][]) {
    const match = headers.find((h) => candidates.includes((h ?? "").trim().toLowerCase()));
    if (match) guess[field] = match;
  }
  return guess;
}
