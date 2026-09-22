import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseStatementFile } from "@/lib/import/parsers.server";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB — generous for a statement export

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const bankName = String(form.get("bankName") ?? "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (!bankName) {
    return NextResponse.json({ error: "Bank name is required" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File is too large (max 15MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseStatementFile(buffer, file.name);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to parse file" }, { status: 400 });
  }

  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: "No rows found in this file" }, { status: 400 });
  }

  const existingMapping = await db.columnMapping.findUnique({
    where: { bankName_fileType: { bankName, fileType: parsed.fileType } },
  });

  return NextResponse.json({
    fileType: parsed.fileType,
    headers: parsed.headers,
    rows: parsed.rows,
    fileName: file.name,
    existingMapping: existingMapping
      ? {
          ...JSON.parse(existingMapping.mappingJson),
          fileType: existingMapping.fileType,
          dateFormat: existingMapping.dateFormat,
          delimiter: existingMapping.delimiter ?? undefined,
          skipRows: existingMapping.skipRows,
          amountSign: existingMapping.amountSign,
        }
      : null,
  });
}
