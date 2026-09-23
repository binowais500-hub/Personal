import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAiConfigured } from "@/lib/ai/client";
import { runFinanceChat } from "@/lib/ai/chat";

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }))
    .min(1)
    .max(40),
});

export async function POST(req: NextRequest) {
  if (!isAiConfigured()) {
    return NextResponse.json({ error: "AI is not configured" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const result = await runFinanceChat(parsed.data.messages);
  if (!result) {
    return NextResponse.json({ error: "AI is not configured" }, { status: 400 });
  }
  return NextResponse.json(result);
}
