import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@/lib/db";
import { AI_MODEL, getAnthropicClient } from "@/lib/ai/client";
import { buildFinancialSnapshot, hashSnapshot, type FinancialSnapshot } from "@/lib/ai/snapshot";

const ReviewSchema = z.object({
  headline: z.string().describe("A short, specific one-line summary of the month, under 12 words"),
  summary: z.string().describe("2-3 sentence overview paragraph"),
  sections: z
    .array(
      z.object({
        heading: z.string().describe("e.g. 'Spending', 'Budget', 'Subscriptions', 'Mortgage', 'Notable activity'"),
        body: z.string().describe("2-4 sentences, referencing the actual numbers given"),
      }),
    )
    .min(3)
    .max(5)
    .describe("Only include sections the data actually supports — skip Mortgage if there is none, etc."),
});

export interface MonthlyReview {
  periodLabel: string;
  headline: string;
  summary: string;
  sections: { heading: string; body: string }[];
}

const KIND = "monthly-review";

function buildPrompt(snapshot: FinancialSnapshot): string {
  return `Write a one-page monthly financial review for the user, based only on the locally-computed aggregates below (no raw transactions). Be specific and reference actual numbers throughout. Cover spending vs. budget, notable category or merchant changes, recurring charges worth flagging, anything unusual, and the mortgage if present — but skip any topic the data doesn't support. Write in a neutral, factual, mildly encouraging tone, as if for the user's own records, not a sales pitch.

Period: ${snapshot.periodLabel}

Financial snapshot (JSON):
${JSON.stringify(snapshot, null, 2)}`;
}

/**
 * Returns a written monthly review, or null if no API key is configured or
 * generation fails. Cached per (month, snapshot hash) like the insights
 * feed — regenerated only when the month's underlying data changes.
 */
export async function getMonthlyReview(): Promise<MonthlyReview | null> {
  const client = getAnthropicClient();
  if (!client) return null;

  const snapshot = await buildFinancialSnapshot();
  const inputHash = hashSnapshot(snapshot);
  const periodKey = snapshot.periodLabel;

  const cached = await db.aiCache.findUnique({
    where: { kind_periodKey_inputHash: { kind: KIND, periodKey, inputHash } },
  });
  if (cached) {
    const parsed = JSON.parse(cached.resultJson) as z.infer<typeof ReviewSchema>;
    return { periodLabel: snapshot.periodLabel, ...parsed };
  }

  let parsed: z.infer<typeof ReviewSchema>;
  try {
    const response = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: 3000,
      output_config: { format: zodOutputFormat(ReviewSchema), effort: "low" },
      messages: [{ role: "user", content: buildPrompt(snapshot) }],
    });
    if (!response.parsed_output) return null;
    parsed = response.parsed_output;
  } catch {
    return null;
  }

  await db.aiCache.upsert({
    where: { kind_periodKey_inputHash: { kind: KIND, periodKey, inputHash } },
    create: { kind: KIND, periodKey, inputHash, resultJson: JSON.stringify(parsed), model: AI_MODEL },
    update: { resultJson: JSON.stringify(parsed), model: AI_MODEL },
  });

  return { periodLabel: snapshot.periodLabel, ...parsed };
}
