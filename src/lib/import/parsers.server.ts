import "server-only";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { PDFParse } from "pdf-parse";
import type { ImportFileType, ParseFileResult } from "./types";

export function detectFileType(fileName: string): ImportFileType {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "csv") return "csv";
  if (ext === "xlsx" || ext === "xls") return "excel";
  if (ext === "pdf") return "pdf";
  throw new Error("Unsupported file type — please upload a .csv, .xlsx, .xls, or .pdf statement.");
}

export async function parseStatementFile(buffer: Buffer, fileName: string): Promise<ParseFileResult> {
  const fileType = detectFileType(fileName);
  if (fileType === "csv") return parseCsv(buffer);
  if (fileType === "excel") return parseExcel(buffer);
  return parsePdf(buffer);
}

function parseCsv(buffer: Buffer): ParseFileResult {
  const text = buffer.toString("utf-8");
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = (result.data as string[][]).filter((r) => r.length > 0);
  return { fileType: "csv", headers: rows[0] ?? [], rows };
}

function parseExcel(buffer: Buffer): ParseFileResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" }) as string[][];
  const cleaned = rows
    .map((r) => r.map((c) => (c == null ? "" : String(c))))
    .filter((r) => r.some((c) => c.trim()));
  return { fileType: "excel", headers: cleaned[0] ?? [], rows: cleaned };
}

async function parsePdf(buffer: Buffer): Promise<ParseFileResult> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const lines = result.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    return { fileType: "pdf", headers: ["Line"], rows: lines.map((l) => [l]) };
  } finally {
    await parser.destroy();
  }
}
