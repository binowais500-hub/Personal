import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const createSchema = z.object({
  pattern: z.string().min(1),
  categoryId: z.string().min(1),
  priority: z.number().int().default(10),
});

export async function POST(req: NextRequest) {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const rule = await db.categoryRule.create({ data: { ...parsed.data, source: "user" } });
  return NextResponse.json({ rule });
}
