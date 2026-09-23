import { NextResponse } from "next/server";
import { isAiConfigured } from "@/lib/ai/client";
import { getOverviewInsights } from "@/lib/ai/insights";

export async function GET() {
  if (!isAiConfigured()) {
    return NextResponse.json({ configured: false, insights: [] });
  }
  const insights = await getOverviewInsights();
  return NextResponse.json({ configured: true, insights });
}
