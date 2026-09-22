import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export async function GET() {
  const categories = await db.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { rules: { orderBy: { priority: "desc" } } },
  });
  return NextResponse.json({ categories });
}

const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().default("#64748b"),
  icon: z.string().default("circle"),
});

export async function POST(req: NextRequest) {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const maxSort = await db.category.aggregate({ _max: { sortOrder: true } });
  try {
    const category = await db.category.create({
      data: { ...parsed.data, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
    });
    return NextResponse.json({ category });
  } catch {
    return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
  }
}
