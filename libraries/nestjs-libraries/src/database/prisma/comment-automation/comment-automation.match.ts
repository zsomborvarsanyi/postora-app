import { CommentAutomationRule } from '@prisma/client';

export type MatchableRule = Pick<
  CommentAutomationRule,
  'id' | 'active' | 'matchType' | 'triggers' | 'publicReply' | 'privateReply'
>;

// Deterministic, network-free matching: the first active rule (in list order)
// whose triggers match the comment text wins. No AI, no network, trivially
// unit-testable - kept in its own module so testing it never has to load the
// rest of CommentAutomationService's dependency graph (IntegrationManager,
// every social provider, etc).
export function matchComment(
  rules: MatchableRule[],
  commentText: string
): MatchableRule | null {
  const text = (commentText || '').toLowerCase();

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
      const phrases = JSON.parse(rule.triggers || '[]') as string[];
      if (phrases.some((phrase) => phrase && text.includes(phrase.toLowerCase()))) {
        return rule;
      }
    } catch {
      // malformed stored JSON: never match, never throw
    }
  }

  return null;
}
