import { createHmac } from 'crypto';
import {
  verifyMetaWebhookSignature,
  extractCommentEvents,
  extractDirectMessageEvents,
} from './comment-automation.webhook';

describe('verifyMetaWebhookSignature', () => {
  const secret = 'test-secret';
  const body = Buffer.from(JSON.stringify({ hello: 'world' }));
  const validSignature = `sha256=${createHmac('sha256', secret)
    .update(body)
    .digest('hex')}`;

  it('accepts a correctly signed body', () => {
    expect(verifyMetaWebhookSignature(body, validSignature, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const tampered = Buffer.from(JSON.stringify({ hello: 'tampered' }));
    expect(verifyMetaWebhookSignature(tampered, validSignature, secret)).toBe(
      false
    );
  });

  it('rejects a wrong secret', () => {
    expect(verifyMetaWebhookSignature(body, validSignature, 'wrong')).toBe(
      false
    );
  });

  it('rejects a missing signature header', () => {
    expect(verifyMetaWebhookSignature(body, undefined, secret)).toBe(false);
  });

  it('rejects a header without the sha256= prefix', () => {
    expect(verifyMetaWebhookSignature(body, 'not-a-signature', secret)).toBe(
      false
    );
  });

  it('rejects when there is no app secret configured', () => {
    expect(verifyMetaWebhookSignature(body, validSignature, undefined)).toBe(
      false
    );
  });
});

describe('extractCommentEvents', () => {
  it('extracts a Facebook feed comment event', () => {
    const payload = {
      entry: [
        {
          id: 'page-1',
          changes: [
            {
              field: 'feed',
              value: { item: 'comment', comment_id: 'c1', message: 'hi' },
            },
          ],
        },
      ],
    };
    expect(extractCommentEvents(payload)).toEqual([
      { pageOrIgId: 'page-1', providerCommentId: 'c1', commentText: 'hi' },
    ]);
  });

  it('extracts an Instagram comment event', () => {
    const payload = {
      entry: [
        {
          id: 'ig-1',
          changes: [
            { field: 'comments', value: { id: 'c2', text: 'nice post' } },
          ],
        },
      ],
    };
    expect(extractCommentEvents(payload)).toEqual([
      { pageOrIgId: 'ig-1', providerCommentId: 'c2', commentText: 'nice post' },
    ]);
  });

  it('ignores feed events that are not comments (e.g. a new post)', () => {
    const payload = {
      entry: [
        {
          id: 'page-1',
          changes: [{ field: 'feed', value: { item: 'status' } }],
        },
      ],
    };
    expect(extractCommentEvents(payload)).toEqual([]);
  });

  it('ignores unrelated fields entirely', () => {
    const payload = {
      entry: [{ id: 'page-1', changes: [{ field: 'ratings', value: {} }] }],
    };
    expect(extractCommentEvents(payload)).toEqual([]);
  });

  it('handles a missing or malformed payload without throwing', () => {
    expect(extractCommentEvents(undefined)).toEqual([]);
    expect(extractCommentEvents({})).toEqual([]);
    expect(extractCommentEvents({ entry: 'not-an-array' })).toEqual([]);
  });
});

describe('extractDirectMessageEvents', () => {
  it('extracts an inbound direct message', () => {
    const payload = {
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'user-1' },
              message: { mid: 'm1', text: 'szia' },
            },
          ],
        },
      ],
    };
    expect(extractDirectMessageEvents(payload)).toEqual([
      { pageOrIgId: 'page-1', senderId: 'user-1', messageId: 'm1', messageText: 'szia' },
    ]);
  });

  it('ignores echoes of our own outgoing messages', () => {
    const payload = {
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'page-1' },
              message: { mid: 'm2', text: 'our reply', is_echo: true },
            },
          ],
        },
      ],
    };
    expect(extractDirectMessageEvents(payload)).toEqual([]);
  });

  it('ignores deleted messages', () => {
    const payload = {
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'user-1' },
              message: { mid: 'm3', is_deleted: true },
            },
          ],
        },
      ],
    };
    expect(extractDirectMessageEvents(payload)).toEqual([]);
  });

  it('handles a missing or malformed payload without throwing', () => {
    expect(extractDirectMessageEvents(undefined)).toEqual([]);
    expect(extractDirectMessageEvents({})).toEqual([]);
    expect(extractDirectMessageEvents({ entry: 'not-an-array' })).toEqual([]);
  });
});
