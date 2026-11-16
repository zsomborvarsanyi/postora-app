import 'reflect-metadata';
import { InstagramStandaloneProvider } from './instagram.standalone.provider';

describe('InstagramStandaloneProvider (Unified Login)', () => {
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

  it('opts in to comment automation and needs no refresh cron', () => {
    expect(provider.supportsCommentAutomation).toBe(true);
    expect(provider.refreshCron).toBe(false);
  });

  it('builds the Facebook Login for Business URL with the config id', async () => {
    process.env.FACEBOOK_APP_ID = 'app1';
    process.env.INSTAGRAM_UNIFIED_CONFIG_ID = 'cfg1';
    process.env.FRONTEND_URL = 'https://x.test';
    const { url, state } = await provider.generateAuthUrl();
    expect(url).toBe(
      'https://www.facebook.com/dialog/oauth?client_id=app1&config_id=cfg1' +
        '&display=popup&override_default_response_type=true' +
        `&redirect_uri=${encodeURIComponent(
          'https://x.test/integrations/social/instagram-standalone'
        )}&response_type=code&state=${state}&prompt=login`
    );
  });

  it('replies publicly through graph.facebook.com /replies', async () => {
    await provider.replyToComment(integration, 'c1', 'hi there');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toMatch(
      /^https:\/\/graph\.facebook\.com\/v[\d.]+\/c1\/replies\?message=hi%20there&access_token=tok$/
    );
    expect(init.method).toBe('POST');
  });

  it('sends the private reply to /<ig-user-id>/messages with recipient.comment_id', async () => {
    await provider.privateReply(integration, 'c1', 'dm text');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toMatch(
      /^https:\/\/graph\.facebook\.com\/v[\d.]+\/123\/messages\?access_token=tok$/
    );
    expect(JSON.parse(init.body)).toEqual({
      recipient: { comment_id: 'c1' },
      message: { text: 'dm text' },
    });
  });

  it('lists assigned accounts and subscribes the chosen one to comments', async () => {
    const calls: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation((async (u: any) => {
      calls.push(String(u));
      return {
        json: async () =>
          String(u).includes('assigned_instagram_accounts')
            ? { data: [{ id: 'ig1' }] }
            : { id: 'ig1', name: 'N', username: 'user', profile_picture_url: 'p' },
      };
    }) as any);

    const pages = await provider.pages('tok');
    expect(pages).toEqual([
      { pageId: 'ig1', id: 'ig1', name: 'N', picture: { data: { url: 'p' } } },
    ]);

    const info = await provider.fetchPageInformation('tok', { id: 'ig1' });
    expect(info).toMatchObject({ id: 'ig1', access_token: 'tok', username: 'user' });
    const [subUrl, subInit] = fetchSpy.mock.calls[0];
    expect(subUrl).toMatch(
      /^https:\/\/graph\.facebook\.com\/v[\d.]+\/ig1\/subscribed_apps\?subscribed_fields=comments&access_token=tok$/
    );
    expect(subInit.method).toBe('POST');
  });
});
