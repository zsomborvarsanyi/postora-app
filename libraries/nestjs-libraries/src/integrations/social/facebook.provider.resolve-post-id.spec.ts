// social.abstract.ts statically imports `sharp`, a native module; this spec never touches image processing.
import 'reflect-metadata'; // the FB settings DTO's class-transformer decorators need it at import time
jest.mock('sharp', () => ({ __esModule: true, default: {} }));
// FacebookProvider.resolveCommentPostId: maps what a publish returned (releaseId) to the bare feed post id the Facebook
// comment webhook reports. Only the resolver is under test; the Graph fetch is stubbed.
jest.mock('@gitroom/helpers/utils/timer', () => ({ timer: () => Promise.resolve() }));

import { FacebookProvider } from './facebook.provider';

describe('FacebookProvider.resolveCommentPostId', () => {
  const integration: any = { id: 'int-1', internalId: '1000PAGE', token: 'tok' };

  const makeProvider = (pages: any[] | Error) => {
    const provider: any = new FacebookProvider();
    const fetch = jest.fn();
    if (pages instanceof Error) {
      fetch.mockRejectedValue(pages);
    } else {
      pages.forEach((body) =>
        fetch.mockResolvedValueOnce({ json: async () => body })
      );
      fetch.mockResolvedValue({ json: async () => ({ data: [] }) });
    }
    provider.fetch = fetch;
    return { provider: provider as FacebookProvider, fetch };
  };

  it('a composite pageId_postId release id resolves to the bare post id without any Graph call', async () => {
    const { provider, fetch } = makeProvider([]);
    await expect(
      provider.resolveCommentPostId(integration, '1000PAGE_122233333388050885', {})
    ).resolves.toBe('122233333388050885');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a Reel/video id resolves through published_posts attachments.target.id to the bare feed post id', async () => {
    const { provider, fetch } = makeProvider([
      {
        data: [
          { id: '1000PAGE_111', attachments: { data: [{ target: { id: '999' } }] } },
          { id: '1000PAGE_122233333388050885', attachments: { data: [{ target: { id: '2291226875008068' } }] } },
        ],
      },
    ]);
    await expect(
      provider.resolveCommentPostId(integration, '2291226875008068', {})
    ).resolves.toBe('122233333388050885');
    expect(fetch.mock.calls[0][0]).toContain('/1000PAGE/published_posts');
    expect(fetch.mock.calls[0][0]).toContain('access_token=tok');
  });

  it('finds the target in subattachments too', async () => {
    const { provider } = makeProvider([
      {
        data: [
          { id: '1000PAGE_555', attachments: { data: [{ target: { id: 'x' }, subattachments: { data: [{ target: { id: '777' } }] } }] } },
        ],
      },
    ]);
    await expect(provider.resolveCommentPostId(integration, '777', {})).resolves.toBe('555');
  });

  it('returns null (caller keeps the releaseId) when the Reel is never listed', async () => {
    const { provider, fetch } = makeProvider([{ data: [{ id: '1000PAGE_1', attachments: { data: [{ target: { id: '1' } }] } }] }]);
    await expect(provider.resolveCommentPostId(integration, '2291226875008068', {})).resolves.toBeNull();
    expect(fetch.mock.calls.length).toBeGreaterThan(1); // retried
  });

  it('returns null when Graph errors out, never throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { provider } = makeProvider(new Error('graph 500'));
    await expect(provider.resolveCommentPostId(integration, '2291226875008068', {})).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('skips stories (no comments) without any Graph call', async () => {
    const { provider, fetch } = makeProvider([]);
    await expect(
      provider.resolveCommentPostId(integration, '123456', { post_type: 'story' })
    ).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
