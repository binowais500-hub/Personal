import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const settings = await db.appSettings.findUnique({ where: { id: "singleton" } });
  return NextResponse.json({ hasPassword: !!settings });
}
