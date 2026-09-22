import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export async function GET() {
  const cards = await db.card.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ cards });
}

const createSchema = z.object({
  bankName: z.string().min(1),
  cardName: z.string().min(1),
  last4: z.string().regex(/^\d{4}$/, "Last 4 digits must be 4 numbers"),
  currency: z.string().default("AED"),
  color: z.string().default("#0f6e5b"),
});

export async function POST(req: NextRequest) {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  try {
    const card = await db.card.create({ data: parsed.data });
    return NextResponse.json({ card });
  } catch {
    return NextResponse.json({ error: "A card with that bank and last 4 digits already exists" }, { status: 409 });
  }
}
