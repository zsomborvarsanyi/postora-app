import { createHmac, timingSafeEqual } from 'crypto';

// Pure, network/DB-free webhook helpers, kept in their own module for the
// same reason as comment-automation.match.ts: unit-testing them should never
// have to load CommentAutomationService's full dependency graph.

// Meta's Webhooks product signs every delivery with an HMAC over the raw
// (unparsed) request body, keyed with the app secret. Must run before the
// body is trusted/parsed for anything else.
export function verifyMetaWebhookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string | undefined
): boolean {
  if (!rawBody || !appSecret || !signatureHeader?.startsWith('sha256=')) {
    return false;
  }

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const provided = signatureHeader.slice('sha256='.length);

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export type ExtractedCommentEvent = {
  pageOrIgId: string;
  providerCommentId: string;
  commentText: string;
};

// Only extracts what's needed to find the integration and the comment text -
// no reply decision is made here, that's matchComment()'s job once the
// Temporal activity loads the integration and its rules.
export function extractCommentEvents(payload: any): ExtractedCommentEvent[] {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  return entries.flatMap((entry: any) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    return changes
      .filter((change: any) => ['feed', 'comments'].includes(change?.field))
      .map((change: any) => ({
        pageOrIgId: entry.id,
        // Facebook's 'feed' comment events key the id as comment_id;
        // Instagram's 'comments' field has been observed keying it as
        // plain id instead - accept either rather than guessing wrong once
        // in production. Both are no-ops for non-comment feed events (new
        // post, like, ...), which carry neither and get filtered out below.
        providerCommentId: change.value?.comment_id || change.value?.id,
        commentText: change.value?.message || change.value?.text || '',
      }))
      .filter((event: any) => !!event.providerCommentId);
  });
}
