export interface RuleLike {
  id: string;
  pattern: string;
  categoryId: string;
  priority: number;
}

/**
 * Matches a normalized merchant name against category rules. A pattern
 * wrapped in slashes (/.../[flags]) is treated as a regex; otherwise it's a
 * case-insensitive substring match. Highest priority wins; ties broken by
 * the longer (more specific) pattern.
 */
export function matchCategoryRule<T extends RuleLike>(
  merchantNormalized: string,
  rules: T[],
): T | null {
  const candidates = rules.filter((rule) => ruleMatches(merchantNormalized, rule.pattern));
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.pattern.length - a.pattern.length;
  });

  return candidates[0];
}

export function ruleMatches(merchantNormalized: string, pattern: string): boolean {
  const regexMatch = pattern.match(/^\/(.*)\/([a-z]*)$/i);
  if (regexMatch) {
    try {
      const re = new RegExp(regexMatch[1], regexMatch[2].includes("i") ? regexMatch[2] : regexMatch[2] + "i");
      return re.test(merchantNormalized);
    } catch {
      return false;
    }
  }
  return merchantNormalized.toUpperCase().includes(pattern.toUpperCase());
}
