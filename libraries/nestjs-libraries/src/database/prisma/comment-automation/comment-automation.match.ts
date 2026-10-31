import { CommentAutomationRule } from '@prisma/client';

export type MatchableRule = Pick<
  CommentAutomationRule,
  'id' | 'active' | 'matchType' | 'triggers' | 'publicReply' | 'privateReply'
>;

// A post-scoped rule's providerPostId has to equal what the provider's comment webhook reports for the post, but the
// webhook and the publish don't always use the same shape of the same id (Facebook: bare "12345" vs composite
// "pageId_12345"). Returns every shape the incoming id can be stored under, so a rule matches either way. Ids that
// contain no "_" (Instagram media ids) come back unchanged.
export function postIdCandidates(providerPostId: string): {
  exact: string[];
  suffix: string | null;
} {
  const raw = (providerPostId || '').trim();
  if (!raw) {
    return { exact: [], suffix: null };
  }
  const bare = raw.split('_').pop() || raw;
  const exact = Array.from(new Set([raw, bare]));
  // a rule stored composite ("<page>_<bare>") matches an incoming bare id
  return { exact, suffix: bare === raw ? `_${bare}` : null };
}

// Deterministic, network-free matching: the first active rule (in list order)
// whose triggers match the comment text wins. No AI, no network, trivially
// unit-testable - kept in its own module so testing it never has to load the
// rest of CommentAutomationService's dependency graph (IntegrationManager,
// every social provider, etc).
export function matchComment(
  rules: MatchableRule[],
  commentText: string
): MatchableRule | null {
  const text = (commentText || '').toLowerCase().trim();

  for (const rule of rules) {
    if (!rule.active) continue;

    if (rule.matchType === 'REGEX') {
      try {
        const pattern = (JSON.parse(rule.triggers || '[]') as string[])[0];
        if (pattern && new RegExp(pattern, 'i').test(commentText || '')) {
          return rule;
        }
      } catch {
        // malformed regex (bad pattern, or bad stored JSON): never match, never throw
      }
      continue;
    }

    try {
      const phrases = (JSON.parse(rule.triggers || '[]') as string[])
        .filter(Boolean)
        .map((phrase) => phrase.toLowerCase().trim());

      // EXACT: the whole message has to be just the phrase (e.g. "a plain
      // 'szia' and nothing else") - CONTAINS: the phrase appears anywhere.
      const isMatch =
        rule.matchType === 'EXACT'
          ? phrases.includes(text)
          : phrases.some((phrase) => phrase && text.includes(phrase));

      if (isMatch) {
        return rule;
      }
    } catch {
      // malformed stored JSON: never match, never throw
    }
  }

  return null;
}

// publicReply/privateReply are stored as a JSON array of variants (picked at
// random when sent, so high-volume accounts don't post the identical string
// over and over - a known spam signal). A plain, non-JSON string is treated
// as a single variant, so hand-edited or pre-this-feature data still works.
export function pickReplyVariant(stored: string | null | undefined): string | null {
  if (!stored) return null;

  let variants: string[];
  try {
    const parsed = JSON.parse(stored);
    variants = Array.isArray(parsed) ? parsed.filter(Boolean) : [stored];
  } catch {
    variants = [stored];
  }

  if (!variants.length) return null;
  return variants[Math.floor(Math.random() * variants.length)];
}

// Lets a reply template write "Szia {name}!" and have it read naturally
// either way: "Szia Zsombor!" when a name is known, or "Szia!" when it
// isn't (the name is genuinely not always available - e.g. Instagram
// direct messages don't carry one at all). The leading whitespace is
// consumed along with the placeholder so dropping it never leaves a
// double space or an orphaned space before the punctuation.
export function applyNamePlaceholder(
  text: string,
  name: string | null | undefined
): string {
  return text.replace(/\s*\{name\}/g, name ? ` ${name}` : '');
}
