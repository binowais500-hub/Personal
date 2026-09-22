import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  cardId: z.string().min(1),
  hashes: z.array(z.string()).max(5000),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { cardId, hashes } = parsed.data;
  if (hashes.length === 0) return NextResponse.json({ existingHashes: [] });

  const existing = await db.transaction.findMany({
    where: { cardId, dedupeHash: { in: hashes } },
    select: { dedupeHash: true },
  });

  return NextResponse.json({ existingHashes: existing.map((t) => t.dedupeHash) });
}
