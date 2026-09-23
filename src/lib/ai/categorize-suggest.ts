import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@/lib/db";
import { AI_MODEL, getAnthropicClient } from "@/lib/ai/client";

export interface CategoryOption {
  id: string;
  name: string;
}

export interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
}

const KIND = "category-suggestion";
const NONE = "__none__";

function categoryListHash(categories: CategoryOption[]): string {
  const names = categories.map((c) => c.name).sort();
  return createHash("sha256").update(JSON.stringify(names)).digest("hex").slice(0, 16);
}

/**
 * Suggests a category for each given merchant name, using only the
 * merchant name and the list of known category names — no transaction
 * amounts, dates, or other data ever leaves the machine. Each merchant's
 * suggestion is cached (keyed to the merchant + the current category list,
 * so it's re-suggested only if your categories change), and only merchants
 * without a cached suggestion trigger an API call, batched into one request.
 * Returns null per-merchant if AI is unconfigured, the merchant doesn't
 * clearly fit any category, or generation fails.
 */
export async function suggestCategoriesForMerchants(
  merchants: string[],
  categories: CategoryOption[],
): Promise<Record<string, CategorySuggestion | null>> {
  const uniqueMerchants = Array.from(new Set(merchants.map((m) => m.trim()).filter(Boolean)));
  const result: Record<string, CategorySuggestion | null> = {};
  if (uniqueMerchants.length === 0 || categories.length === 0) return result;

  const client = getAnthropicClient();
  if (!client) {
    for (const m of uniqueMerchants) result[m] = null;
    return result;
  }

  const inputHash = categoryListHash(categories);
  const byName = new Map(categories.map((c) => [c.name, c]));

  const misses: string[] = [];
  for (const merchant of uniqueMerchants) {
    const cached = await db.aiCache.findUnique({
      where: { kind_periodKey_inputHash: { kind: KIND, periodKey: merchant, inputHash } },
    });
    if (cached) {
      const stored = JSON.parse(cached.resultJson) as { categoryName: string } | null;
      const category = stored ? byName.get(stored.categoryName) : undefined;
      result[merchant] = category ? { categoryId: category.id, categoryName: category.name } : null;
    } else {
      misses.push(merchant);
    }
  }

  if (misses.length === 0) return result;

  const categoryNames = categories.map((c) => c.name);
  const CategoryEnum = z.enum([NONE, ...categoryNames] as [string, ...string[]]);
  const SuggestSchema = z.object({
    suggestions: z.array(
      z.object({
        merchant: z.string(),
        category: CategoryEnum.describe(`One of the known categories, or "${NONE}" if genuinely unclear`),
      }),
    ),
  });

  let parsedByMerchant = new Map<string, string>();
  try {
    const response = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: 2000,
      output_config: { format: zodOutputFormat(SuggestSchema), effort: "low" },
      messages: [
        {
          role: "user",
          content: `For each merchant name below, pick the single best-fitting category from this list: ${categoryNames.join(", ")}. Use "${NONE}" only if a merchant name is too generic or ambiguous to categorize confidently — don't guess. Merchant names only, no other transaction data is available.\n\nMerchants:\n${misses.map((m) => `- ${m}`).join("\n")}`,
        },
      ],
    });
    if (response.parsed_output) {
      parsedByMerchant = new Map(response.parsed_output.suggestions.map((s) => [s.merchant, s.category]));
    }
  } catch {
    // fall through — misses stay uncached and resolve to null below
  }

  for (const merchant of misses) {
    const categoryName = parsedByMerchant.get(merchant);
    const category = categoryName && categoryName !== NONE ? byName.get(categoryName) : undefined;
    const suggestion: CategorySuggestion | null = category ? { categoryId: category.id, categoryName: category.name } : null;
    result[merchant] = suggestion;

    // Only cache a real answer; leave misses (API error, model omitted the
    // merchant) uncached so a retry is possible instead of a wrong null.
    if (parsedByMerchant.has(merchant)) {
      await db.aiCache.upsert({
        where: { kind_periodKey_inputHash: { kind: KIND, periodKey: merchant, inputHash } },
        create: {
          kind: KIND,
          periodKey: merchant,
          inputHash,
          resultJson: JSON.stringify(suggestion ? { categoryName: suggestion.categoryName } : null),
          model: AI_MODEL,
        },
        update: {
          resultJson: JSON.stringify(suggestion ? { categoryName: suggestion.categoryName } : null),
          model: AI_MODEL,
        },
      });
    }
  }

  return result;
}
