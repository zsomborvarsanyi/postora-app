import 'reflect-metadata';
import { InstagramStandaloneProvider } from './instagram.standalone.provider';

describe('InstagramStandaloneProvider (legacy Instagram Login)', () => {
  const integration: any = { token: 'tok', internalId: '123' };
  let provider: InstagramStandaloneProvider;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    provider = new InstagramStandaloneProvider();
    fetchSpy = jest
      .spyOn(provider as any, 'fetch')
      .mockResolvedValue({ json: async () => ({}) });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opts in to comment automation and refreshes by cron', () => {
    expect(provider.identifier).toBe('instagram-standalone');
    expect(provider.supportsCommentAutomation).toBe(true);
    expect(provider.refreshCron).toBe(true);
  });

  it('builds the instagram.com authorize URL with the standalone redirect', async () => {
    process.env.INSTAGRAM_APP_ID = 'ig1';
    process.env.FRONTEND_URL = 'https://x.test';
    const { url } = await provider.generateAuthUrl();
    expect(url).toContain(
      'https://www.instagram.com/oauth/authorize?enable_fb_login=0&client_id=ig1'
    );
    expect(url).toContain(
      encodeURIComponent('https://x.test/integrations/social/instagram-standalone')
    );
    expect(decodeURIComponent(url)).toContain('instagram_business_manage_comments');
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

  it('subscribes the account id to comments on graph.instagram.com', async () => {
    await (provider as any).subscribeToCommentWebhook('42', 'tok');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toMatch(
      /^https:\/\/graph\.instagram\.com\/v[\d.]+\/42\/subscribed_apps\?subscribed_fields=comments$/
    );
    expect(init.method).toBe('POST');
  });
});
