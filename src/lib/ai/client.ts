import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = "claude-opus-5";

let client: Anthropic | null | undefined;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Returns null when no API key is set — callers must degrade gracefully. */
export function getAnthropicClient(): Anthropic | null {
  if (client !== undefined) return client;
  client = isAiConfigured() ? new Anthropic() : null;
  return client;
}
