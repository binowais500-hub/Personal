/**
 * Normalizes a raw statement description into a stable merchant name for
 * matching against category rules and grouping "top merchants" / recurring
 * charges. Bank statements tend to append POS terminal codes, city names,
 * card auth references, etc. — this strips the common noise.
 */
export function normalizeMerchant(raw: string): string {
  let s = raw.trim().toUpperCase();

  // Drop common POS/card-network prefixes.
  s = s.replace(/^(POS\s*PUR(?:CHASE)?|PURCHASE|DEBIT|CREDIT|PAYMENT TO)\s*[:\-]?\s*/i, "");

  // Drop trailing reference/auth codes (long digit runs, card tails like *1234).
  s = s.replace(/\*?\d{4,}\b/g, " ");
  s = s.replace(/\bAUTH\s*#?\s*\w+/gi, " ");
  s = s.replace(/\bREF\s*#?\s*\w+/gi, " ");

  // Drop trailing "AE" / city+country tails commonly appended by UAE banks.
  s = s.replace(/\b(DUBAI|ABU ?DHABI|SHARJAH|AJMAN|UAE|ARE|DXB)\b/g, " ");

  // Collapse punctuation/whitespace.
  s = s.replace(/[.,#*_/\\-]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s || raw.trim().toUpperCase();
}
