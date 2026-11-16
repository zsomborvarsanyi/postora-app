import { InstagramStandaloneProvider } from './instagram.standalone.provider';

describe('InstagramStandaloneProvider comment automation', () => {
  const integration: any = { token: 'tok', internalId: '123' };
  let provider: InstagramStandaloneProvider;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    provider = new InstagramStandaloneProvider();
    fetchSpy = jest
      .spyOn(provider as any, 'fetch')
      .mockResolvedValue({ json: async () => ({}) });
  });

  it('opts in to comment automation', () => {
    expect(provider.supportsCommentAutomation).toBe(true);
  });

  it('replies publicly through graph.instagram.com /replies with the bearer token', async () => {
    await provider.replyToComment(integration, 'c1', 'hi there');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toMatch(
      /^https:\/\/graph\.instagram\.com\/v[\d.]+\/c1\/replies\?message=hi%20there$/
    );
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('sends the private reply to /<ig-user-id>/messages with recipient.comment_id', async () => {
    await provider.privateReply(integration, 'c1', 'dm text');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toMatch(
      /^https:\/\/graph\.instagram\.com\/v[\d.]+\/123\/messages$/
    );
    expect(JSON.parse(init.body)).toEqual({
      recipient: { comment_id: 'c1' },
      message: { text: 'dm text' },
    });
  });
});
