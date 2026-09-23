import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@/lib/db";
import { AI_MODEL, getAnthropicClient } from "@/lib/ai/client";
import { buildFinancialSnapshot, hashSnapshot, type FinancialSnapshot } from "@/lib/ai/snapshot";

const INSIGHT_LINKS = [
  "transactions",
  "budgets",
  "cards",
  "mortgage",
  "insights",
  "categories",
] as const;

export type InsightLink = (typeof INSIGHT_LINKS)[number];

export const INSIGHT_LINK_HREFS: Record<InsightLink, string> = {
  transactions: "/cards/transactions",
  budgets: "/cards/budgets",
  cards: "/cards",
  mortgage: "/mortgage",
  insights: "/cards/insights",
  categories: "/cards/categories",
};

const InsightSchema = z.object({
  insights: z
    .array(
      z.object({
        title: z.string().describe("A short, specific headline, under 8 words"),
        body: z.string().describe("One or two plain-English sentences explaining the insight, using the actual numbers given"),
        tone: z.enum(["positive", "neutral", "warning"]),
        link: z.enum(INSIGHT_LINKS).describe("The page this insight is most relevant to"),
      }),
    )
    .min(3)
    .max(5),
});

export interface Insight {
  title: string;
  body: string;
  tone: "positive" | "neutral" | "warning";
  href: string;
}

const KIND = "overview-insights";

function buildPrompt(snapshot: FinancialSnapshot): string {
  return `You are a personal finance assistant. Below is a summary of the user's spending and mortgage, computed locally — no raw transactions, only aggregates. Write 3-5 short, specific, plain-English insights a person would actually find useful. Reference concrete numbers from the data. Prefer insights about changes, risks, or noteworthy patterns over generic restatements. Vary the tone field honestly (warning for something that needs attention, positive for good news, neutral otherwise).

Period: ${snapshot.periodLabel}

Financial snapshot (JSON):
${JSON.stringify(snapshot, null, 2)}`;
}

/**
 * Returns 3-5 AI-generated insights for the overview page, or an empty
 * array if no API key is configured or the request fails. Results are
 * cached per (month, snapshot) so the same insights aren't regenerated on
 * every page load — only when the underlying data actually changes.
 */
export async function getOverviewInsights(): Promise<Insight[]> {
  const client = getAnthropicClient();
  if (!client) return [];

  const snapshot = await buildFinancialSnapshot();
  const inputHash = hashSnapshot(snapshot);
  const periodKey = snapshot.periodLabel;

  const cached = await db.aiCache.findUnique({
    where: { kind_periodKey_inputHash: { kind: KIND, periodKey, inputHash } },
  });
  if (cached) {
    return toInsights(JSON.parse(cached.resultJson));
  }

  let parsed: z.infer<typeof InsightSchema>;
  try {
    const response = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: 2000,
      output_config: { format: zodOutputFormat(InsightSchema), effort: "low" },
      messages: [{ role: "user", content: buildPrompt(snapshot) }],
    });
    if (!response.parsed_output) return [];
    parsed = response.parsed_output;
  } catch {
    return [];
  }

  await db.aiCache.upsert({
    where: { kind_periodKey_inputHash: { kind: KIND, periodKey, inputHash } },
    create: { kind: KIND, periodKey, inputHash, resultJson: JSON.stringify(parsed), model: AI_MODEL },
    update: { resultJson: JSON.stringify(parsed), model: AI_MODEL },
  });

  return toInsights(parsed);
}

function toInsights(parsed: z.infer<typeof InsightSchema>): Insight[] {
  return parsed.insights.map((i) => ({
    title: i.title,
    body: i.body,
    tone: i.tone,
    href: INSIGHT_LINK_HREFS[i.link],
  }));
}
