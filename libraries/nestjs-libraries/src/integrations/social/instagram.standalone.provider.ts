import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  SocialAbstract,
  ValidityMedia,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { InstagramDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/instagram.dto';
import { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';
import { META_GRAPH_API_VERSION } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';
import { Integration } from '@prisma/client';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

const instagramProvider = new InstagramProvider();

@Rules(
  "Instagram should have at least one attachment, if it's a story, it can have only one picture"
)
export class InstagramStandaloneProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'instagram-standalone';
  supportsCommentAutomation = true;
  name = 'Instagram\n(Standalone)';
  // Instagram API with Unified Login (Facebook Login for Business): the token
  // is a business-integration system user token (SUAT) that Meta does not
  // refresh through us, and one login can share several Instagram accounts,
  // so the account is picked in the generic in-between-steps flow.
  isBetweenSteps = true;
  refreshCron = false;
  scopes = [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_messages',
  ];
  override maxConcurrentJob = 200; // Instagram standalone has stricter limits
  dto = InstagramDto;

  editor = 'normal' as const;
  maxLength() {
    return 2200;
  }

  override async checkValidity(
    [firstPost]: Array<ValidityMedia[]>,
    settings: any
  ): Promise<string | true> {
    if (!firstPost?.length) {
      return 'Should have at least one media';
    }
    if (this.assetBoolean(settings?.is_trial_reel)) {
      if ((firstPost?.length ?? 0) > 1) {
        return 'Trial Reels can only have one video';
      }
      const hasVideo = firstPost?.some(
        (f) => (f?.path?.indexOf?.('mp4') ?? -1) > -1
      );
      if (!hasVideo) {
        return 'Trial Reels must be a video';
      }
    }
    return true;
  }

  public override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    return instagramProvider.handleErrors(body, status);
  }

  async refreshToken(refresh_token: string): Promise<AuthTokenDetails> {
    // SUAT: nothing to refresh, an invalid token surfaces through handleErrors.
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  private redirectUri(refresh?: string) {
    return `${
      process?.env.FRONTEND_URL?.indexOf('https') == -1
        ? `https://redirectmeto.com/${process?.env.FRONTEND_URL}`
        : `${process?.env.FRONTEND_URL}`
    }/integrations/social/instagram-standalone${
      refresh ? `?refresh=${refresh}` : ''
    }`;
  }

  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url:
        `https://www.facebook.com/dialog/oauth?client_id=${process.env.FACEBOOK_APP_ID}` +
        `&config_id=${process.env.INSTAGRAM_UNIFIED_CONFIG_ID}` +
        '&display=popup&override_default_response_type=true' +
        `&redirect_uri=${encodeURIComponent(this.redirectUri())}` +
        `&response_type=code&state=${state}&prompt=login`,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh: string;
  }) {
    const { access_token, expires_in } = await (
      await fetch(
        `https://graph.facebook.com/${META_GRAPH_API_VERSION}/oauth/access_token` +
          `?client_id=${process.env.FACEBOOK_APP_ID}` +
          `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
          `&redirect_uri=${encodeURIComponent(this.redirectUri(params.refresh))}` +
          `&code=${params.code}`
      )
    ).json();

    if (!access_token) {
      throw new Error('Instagram login failed: no access token returned');
    }

    // /me is the system user here, not an Instagram account: the account is
    // chosen afterwards through pages() / fetchPageInformation().
    const { id, name } = await (
      await fetch(
        `https://graph.facebook.com/${META_GRAPH_API_VERSION}/me?fields=id,name&access_token=${access_token}`
      )
    ).json();

    return {
      id,
      name,
      accessToken: access_token,
      refreshToken: access_token,
      // shortcut: SUAT lifetime is set by the Meta login configuration, 10 years when none is returned
      expiresIn: expires_in || 10 * 365 * 24 * 3600,
      picture: '',
      username: '',
    };
  }

  async pages(token: string) {
    const { data } = await (
      await fetch(
        `https://graph.facebook.com/${META_GRAPH_API_VERSION}/me/assigned_instagram_accounts?fields=id&limit=100&access_token=${token}`
      )
    ).json();

    return Promise.all(
      (data || []).map(async (account: { id: string }) => {
        const { name, username, profile_picture_url } = await (
          await fetch(
            `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${account.id}?fields=name,username,profile_picture_url&access_token=${token}`
          )
        ).json();

        return {
          pageId: account.id,
          id: account.id,
          name: name || username,
          picture: { data: { url: profile_picture_url } },
        };
      })
    );
  }

  async fetchPageInformation(token: string, data: { id: string }) {
    const { id, name, username, profile_picture_url } = await (
      await fetch(
        `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${data.id}?fields=id,name,username,profile_picture_url&access_token=${token}`
      )
    ).json();

    await this.subscribeToCommentWebhook(data.id, token);

    return {
      id: id || data.id,
      name: name || username,
      picture: profile_picture_url,
      access_token: token,
      username,
    };
  }

  async reConnect(
    id: string,
    requiredId: string,
    token: string
  ): Promise<Omit<AuthTokenDetails, 'refreshToken' | 'expiresIn'>> {
    const information = await this.fetchPageInformation(token, {
      id: requiredId,
    });

    return {
      id: information.id,
      name: information.name,
      accessToken: information.access_token,
      picture: information.picture,
      username: information.username,
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<InstagramDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return instagramProvider.post(
      id,
      accessToken,
      postDetails,
      integration,
      'graph.facebook.com'
    );
  }

  async postPending(
    id: string,
    accessToken: string,
    postDetails: PostDetails<InstagramDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return instagramProvider.postPending(
      id,
      accessToken,
      postDetails,
      integration,
      'graph.facebook.com'
    );
  }

  // the graph domain travels inside pendingData, so these are pure delegations
  override async checkPostStatus(
    accessToken: string,
    pendingData: any,
    integration: Integration
  ) {
    return instagramProvider.checkPostStatus(
      accessToken,
      pendingData,
      integration
    );
  }

  override async finalizePost(
    accessToken: string,
    pendingData: any,
    integration: Integration
  ) {
    return instagramProvider.finalizePost(accessToken, pendingData, integration);
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails<InstagramDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return instagramProvider.comment(
      id,
      postId,
      lastCommentId,
      accessToken,
      postDetails,
      integration,
      'graph.facebook.com'
    );
  }

  // Unified Login: same graph.facebook.com host as posting, the token is the
  // plain system user token (no compound token).
  async replyToComment(
    integration: Integration,
    commentId: string,
    message: string
  ): Promise<void> {
    await this.fetch(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${commentId}/replies?message=${encodeURIComponent(
        message
      )}&access_token=${integration.token}`,
      { method: 'POST' },
      'reply to comment'
    );
  }

  // Private reply: one per comment, within 7 days, enforced by Meta.
  async privateReply(
    integration: Integration,
    commentId: string,
    message: string
  ): Promise<void> {
    await this.fetch(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${integration.internalId}/messages?access_token=${integration.token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { comment_id: commentId },
          message: { text: message },
        }),
      },
      'private reply'
    );
  }

  // Idempotent. Never blocks connecting, but failures are logged: an account
  // that never subscribes looks connected while no webhook ever arrives.
  private async subscribeToCommentWebhook(igUserId: string, accessToken: string) {
    await this.fetch(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${igUserId}/subscribed_apps?subscribed_fields=comments&access_token=${accessToken}`,
      { method: 'POST' },
      'subscribe to webhook'
    ).catch((err) =>
      console.error(
        '[instagram-standalone] subscribeToCommentWebhook failed:',
        err?.message || err
      )
    );
  }

  async analytics(id: string, accessToken: string, date: number) {
    return instagramProvider.analytics(
      id,
      accessToken,
      date,
      'graph.facebook.com'
    );
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    date: number
  ) {
    return instagramProvider.postAnalytics(
      integrationId,
      accessToken,
      postId,
      date,
      'graph.facebook.com'
    );
  }
}
