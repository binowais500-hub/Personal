import { NextResponse } from "next/server";
import { isAiConfigured } from "@/lib/ai/client";
import { getMonthlyReview } from "@/lib/ai/review";

export async function GET() {
  if (!isAiConfigured()) {
    return NextResponse.json({ configured: false, review: null });
  }
  const review = await getMonthlyReview();
  return NextResponse.json({ configured: true, review });
}
