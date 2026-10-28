// posts.service.ts transitively imports create.post.dto.ts -> sanitize.post.content.ts
// -> isomorphic-dompurify, an ESM-only dependency this repo's jest/ts-jest
// transform isn't configured to handle (no unit test imports PostsService
// directly anywhere else in the repo today). Mocked out here rather than
// touching the shared jest.config.ts - this spec never exercises content
// sanitization, only the comment-automation activation hook.
jest.mock('@gitroom/helpers/utils/sanitize.post.content', () => ({
  sanitizePostContent: (value: unknown) => value,
}));
// IntegrationManager statically imports every social provider implementation
// (nostr, bluesky, etc.), several of which are ESM-only packages this repo's
// jest/ts-jest transform doesn't handle - same reasoning as the mock above.
// This spec never touches integration-specific behavior.
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));
// Same reasoning again: UploadFactory's Cloudflare storage backend pulls in
// `file-type`, another ESM-only package. posts.service.ts only uses this at
// module-load time for `UploadFactory.createStorage()`; this spec never
// touches file storage.
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));

import { PostsService } from './posts.service';

// Covers only the publish-time comment-automation activation hook added to
// PostsService.updatePost (Variant A: a commentRule attached at schedule
// time, in settings.commentRule, gets turned into a real
// CommentAutomationRule once a real providerPostId exists). The rest of
// PostsService's many dependencies are stubbed out - this hook is the only
// thing under test here.
describe('PostsService - comment-automation activation on publish', () => {
  const basePost = (overrides: Record<string, any> = {}) => ({
    id: 'post-1',
    parentPostId: null,
    integrationId: 'integration-1',
    organizationId: 'org-1',
    releaseId: 'provider-post-1',
    settings: JSON.stringify({
      __type: 'facebook',
      commentRule: {
        triggerSource: 'COMMENT',
        matchType: 'CONTAINS',
        triggers: ['price'],
        publicReply: ['Check your DMs!'],
      },
    }),
    ...overrides,
  });

  const makeService = (postRow: any) => {
    const updatePost = jest.fn().mockResolvedValue(postRow);
    const findRuleByProviderPost = jest.fn().mockResolvedValue(null);
    const upsertRule = jest.fn().mockResolvedValue({ id: 'rule-1' });

    const service = new PostsService(
      { updatePost } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { findRuleByProviderPost, upsertRule } as any
    );

    return { service, updatePost, findRuleByProviderPost, upsertRule };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('activates a rule for a main post and passes it through unchanged', async () => {
    const postRow = basePost();
    const { service, upsertRule } = makeService(postRow);

    const result = await service.updatePost('post-1', 'provider-post-1', 'https://x/1');

    expect(result).toBe(postRow);
    expect(upsertRule).toHaveBeenCalledWith(
      'org-1',
      'integration-1',
      expect.objectContaining({
        id: undefined,
        active: true,
        providerPostId: 'provider-post-1',
        triggerSource: 'COMMENT',
        matchType: 'CONTAINS',
        triggers: ['price'],
      })
    );
  });

  it('is idempotent across retries: a second activation for the same (integrationId, providerPostId) updates the existing rule instead of creating a duplicate', async () => {
    const postRow = basePost();
    const { service, findRuleByProviderPost, upsertRule } = makeService(postRow);

    // First run: nothing activated yet.
    await service.updatePost('post-1', 'provider-post-1', 'https://x/1');
    expect(upsertRule).toHaveBeenNthCalledWith(
      1,
      'org-1',
      'integration-1',
      expect.objectContaining({ id: undefined })
    );

    // Simulate the Temporal activity retrying the same activity call: the
    // rule now exists from the first run.
    findRuleByProviderPost.mockResolvedValue({ id: 'rule-1' });

    await service.updatePost('post-1', 'provider-post-1', 'https://x/1');
    expect(upsertRule).toHaveBeenNthCalledWith(
      2,
      'org-1',
      'integration-1',
      expect.objectContaining({ id: 'rule-1' })
    );

    // Never two independent "create" calls for the same post.
    expect(
      upsertRule.mock.calls.filter(([, , body]) => !body.id)
    ).toHaveLength(1);
  });

  it('never throws and leaves the publish result unchanged when the comment-automation lookup fails', async () => {
    const postRow = basePost();
    const { service, findRuleByProviderPost, upsertRule } = makeService(postRow);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    findRuleByProviderPost.mockRejectedValue(new Error('db down'));

    const result = await service.updatePost('post-1', 'provider-post-1', 'https://x/1');

    expect(result).toBe(postRow);
    expect(upsertRule).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[comment-automation:activate-on-publish]'),
      expect.anything()
    );
  });

  it('never throws and leaves the publish result unchanged when activation itself fails', async () => {
    const postRow = basePost();
    const { service, upsertRule } = makeService(postRow);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    upsertRule.mockRejectedValue(new Error('write failed'));

    const result = await service.updatePost('post-1', 'provider-post-1', 'https://x/1');

    expect(result).toBe(postRow);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[comment-automation:activate-on-publish]'),
      expect.anything()
    );
  });

  it('does not activate anything for a child/comment post (parentPostId set)', async () => {
    const postRow = basePost({ parentPostId: 'post-root' });
    const { service, findRuleByProviderPost, upsertRule } = makeService(postRow);

    const result = await service.updatePost('post-1', 'provider-post-1', 'https://x/1');

    expect(result).toBe(postRow);
    expect(findRuleByProviderPost).not.toHaveBeenCalled();
    expect(upsertRule).not.toHaveBeenCalled();
  });

  it('does nothing extra when the post has no commentRule in its settings', async () => {
    const postRow = basePost({
      settings: JSON.stringify({ __type: 'facebook', post_type: 'post' }),
    });
    const { service, findRuleByProviderPost, upsertRule } = makeService(postRow);

    const result = await service.updatePost('post-1', 'provider-post-1', 'https://x/1');

    expect(result).toBe(postRow);
    expect(findRuleByProviderPost).not.toHaveBeenCalled();
    expect(upsertRule).not.toHaveBeenCalled();
  });

  it('does nothing extra when the post has no settings at all', async () => {
    const postRow = basePost({ settings: null });
    const { service, findRuleByProviderPost, upsertRule } = makeService(postRow);

    const result = await service.updatePost('post-1', 'provider-post-1', 'https://x/1');

    expect(result).toBe(postRow);
    expect(findRuleByProviderPost).not.toHaveBeenCalled();
    expect(upsertRule).not.toHaveBeenCalled();
  });
});
