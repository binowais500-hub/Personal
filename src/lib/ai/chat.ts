import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { AI_MODEL, getAnthropicClient } from "@/lib/ai/client";
import { loadFinanceContext } from "@/lib/ai/finance-context";
import { buildFinanceTools, type ToolLogEntry } from "@/lib/ai/tools";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are a personal finance assistant built into a private, local-only dashboard. Answer questions about the user's credit card spending and mortgage using ONLY the provided tools — never guess or estimate a number yourself. Call a tool for every factual claim. Keep answers short (2-4 sentences), plain English, and always state the actual figures the tools returned, including currency (AED). If a tool reports something as not found, say so plainly rather than guessing, and suggest the closest known option if the tool provided one (e.g. a list of known categories).`;

/** Runs one chat turn: loads local data, lets Claude call read-only local tools, returns the final reply plus a log of what was computed. Returns null if no API key is configured. */
export async function runFinanceChat(history: ChatMessage[]): Promise<{ reply: string; toolLog: ToolLogEntry[] } | null> {
  const client = getAnthropicClient();
  if (!client) return null;

  const ctx = await loadFinanceContext();
  const toolLog: ToolLogEntry[] = [];
  const tools = buildFinanceTools(ctx, toolLog);

  try {
    const finalMessage = await client.beta.messages.toolRunner({
      model: AI_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    const reply = finalMessage.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return { reply: reply || "I couldn't find an answer to that — try rephrasing.", toolLog };
  } catch {
    return { reply: "Something went wrong answering that — try again in a moment.", toolLog };
  }
}
