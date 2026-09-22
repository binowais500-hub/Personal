/**
 * A stable fingerprint for a transaction, used to detect duplicates on
 * re-import (e.g. re-uploading an overlapping statement period). Deliberately
 * coarse (date + rounded amount + normalized description) so that trivial
 * formatting differences between exports of the same transaction still match.
 *
 * Uses the Web Crypto API (available in both Node 20+ and browsers) so this
 * one implementation works for the client-side import preview and the
 * server-side commit/seed paths alike.
 */
export async function computeDedupeHash(input: {
  date: Date;
  amountAED: number;
  description: string;
}): Promise<string> {
  const day = input.date.toISOString().slice(0, 10);
  const amount = input.amountAED.toFixed(2);
  const desc = input.description.trim().toUpperCase().replace(/\s+/g, " ");
  const data = new TextEncoder().encode(`${day}|${amount}|${desc}`);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
