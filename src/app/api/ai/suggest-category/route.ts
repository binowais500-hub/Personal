import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAiConfigured } from "@/lib/ai/client";
import { suggestCategoriesForMerchants } from "@/lib/ai/categorize-suggest";

const bodySchema = z.object({
  merchants: z.array(z.string().min(1).max(200)).min(1).max(30),
});

export async function POST(req: NextRequest) {
  if (!isAiConfigured()) {
    return NextResponse.json({ configured: false, suggestions: {} });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const categories = await db.category.findMany({ select: { id: true, name: true } });
  const suggestions = await suggestCategoriesForMerchants(parsed.data.merchants, categories);
  return NextResponse.json({ configured: true, suggestions });
}
