'use client';

import {
  FC,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { TikTokDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Select } from '@gitroom/react/form/select';
import { Checkbox } from '@gitroom/react/form/checkbox';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';
import { Input } from '@gitroom/react/form/input';
import { TiktokPreview } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.preview';
import { TikTokMusicSelector } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.music';
import { TikTokLocationSelector } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.location';

/**
 * What TikTok returns from the creator_info endpoint, as our backend shapes it.
 * The composer is built from this and not from our own defaults -- see the
 * comment on the fetch below.
 */
interface TikTokCreatorInfo {
  canPost: boolean;
  reason: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxDurationSeconds: number;
  nickname: string;
  avatarUrl: string;
  username: string;
}

const TikTokSettings: FC<{
  values?: any;
}> = (props) => {
  const { watch, register } = useSettings();
  const { value, integration } = useIntegration();
  const t = useT();
  const customFunc = useCustomProviderFunction();

  /*
   * LIVE CREATOR INFO, FETCHED ON EVERY MOUNT.
   *
   * TikTok's Content Sharing UX Guidelines require the posting screen to be
   * driven by the creator's current TikTok settings rather than by our own
   * assumptions, and to be refreshed when the page renders. Four things depend
   * on it: which privacy levels may be offered, whether comment / duet / stitch
   * are even available to this creator, how long a video they may post, and
   * whether they can post at all right now.
   *
   * Deliberately not cached: a creator can change these in the TikTok app at
   * any time, and a stale value here means a post that fails at publish time
   * with privacy_level_option_mismatch instead of a clear message up front.
   */
  const [creator, setCreator] = useState<TikTokCreatorInfo | null>(null);
  const [creatorLoading, setCreatorLoading] = useState(true);
  const [creatorError, setCreatorError] = useState('');

  useEffect(() => {
    if (!integration?.id) {
      return;
    }
    let cancelled = false;
    setCreatorLoading(true);
    setCreatorError('');
    customFunc
      .get('creatorInfo')
      .then((info: TikTokCreatorInfo) => {
        if (cancelled) return;
        setCreator(info);
        if (info && !info.canPost) {
          setCreatorError(info.reason);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCreatorError(
          t(
            'tiktok_creator_info_failed',
            'Could not load your TikTok account settings. Reconnect the channel and try again.'
          )
        );
      })
      .finally(() => {
        if (!cancelled) setCreatorLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // customFunc is rebuilt on every render, so the integration id is the real
    // dependency here -- including customFunc would refetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integration?.id]);

  // Music and location come from the Business API (v1.3) - the legacy Content
  // Posting API used by the "tiktok" identifier has no such fields.
  const isBusiness = integration?.identifier === 'tiktok-business';

  const isTitle = useMemo(() => {
    return value?.[0]?.image?.some((p) => (p?.path?.indexOf?.('mp4') ?? -1) === -1);
  }, [value]);

  const hasMedia = (value?.[0]?.image?.length ?? 0) > 0;
  const isVideo = hasMedia && !isTitle;

  const disclose = watch('disclose');
  const autoAddMusic = watch('autoAddMusic');
  const brand_organic_toggle = watch('brand_organic_toggle');
  const brand_content_toggle = watch('brand_content_toggle');
  const content_posting_method = watch('content_posting_method');
  const isUploadMode = content_posting_method === 'UPLOAD';

  // TikTok ignores every setting except the title / content when the posting
  // method is UPLOAD, so we hide them rather than pretend they apply. The fields
  // stay mounted and registered: their values must survive the switch, and
  // TikTokDto still requires most of them at save time.
  const directPostOnly = clsx(isUploadMode && 'invisible h-0 overflow-hidden');

  const tiktokRestrictionNotice = useMemo(() => {
    if (!hasMedia || !isVideo) return null;
    if (!isUploadMode) {
      return t(
        'tiktok_restriction_direct_video',
        'TikTok restriction: For direct post with video, your post content is used as the title. A separate title field is not available.'
      );
    }
    return t(
      'tiktok_restriction_upload_video',
      'TikTok restriction: For upload-only video, TikTok does not accept a title or message. The content will default to "#Postora" and you can edit it inside the TikTok app before publishing.'
    );
  }, [hasMedia, isUploadMode, isVideo, t]);

  const privacyLabels: Record<string, string> = {
    PUBLIC_TO_EVERYONE: t('public_to_everyone', 'Public to everyone'),
    MUTUAL_FOLLOW_FRIENDS: t('mutual_follow_friends', 'Mutual follow friends'),
    FOLLOWER_OF_CREATOR: t('follower_of_creator', 'Follower of creator'),
    SELF_ONLY: t('self_only', 'Self only'),
  };

  /*
   * The dropdown offers exactly what TikTok returned for this creator, nothing
   * more. Offering a level TikTok did not list is rejected at publish time with
   * privacy_level_option_mismatch, which the user would only see after the post
   * had already failed. Until the fetch returns, the list is empty and the
   * field stays disabled, so there is nothing to pick by accident.
   */
  const privacyLevel = (creator?.privacyLevelOptions ?? []).map((option) => ({
    value: option,
    label: privacyLabels[option] ?? option,
  }));

  /*
   * A video longer than the creator's allowance is refused by TikTok on upload.
   * We surface the limit before the user schedules anything.
   */
  const maxDurationLabel = useMemo(() => {
    const seconds = creator?.maxDurationSeconds ?? 0;
    if (!seconds || !isVideo) return null;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
  }, [creator?.maxDurationSeconds, isVideo]);
  const contentPostingMethod = [
    {
      value: 'DIRECT_POST',
      label: t(
        'post_content_directly_to_tiktok',
        'Post content directly to TikTok'
      ),
    },
    {
      value: 'UPLOAD',
      label: t(
        'upload_content_to_tiktok_without_posting',
        'Upload content to TikTok without posting it'
      ),
    },
  ];
  const yesNo = [
    {
      value: 'yes',
      label: t('yes', 'Yes'),
    },
    {
      value: 'no',
      label: t('no', 'No'),
    },
  ];

  return (
    <div className="flex flex-col">
      {/*<CheckTikTokValidity picture={props?.values?.[0]?.image?.[0]?.path} />*/}
      {/*
        WHICH ACCOUNT AM I POSTING TO.
        TikTok requires the creator's nickname to be visible on the posting
        screen so the user cannot post to the wrong account by mistake. The
        avatar comes along because it is the faster thing to recognise.
      */}
      <div className="flex items-center gap-[10px] mb-[18px] p-[10px] bg-tableBorder rounded-[10px]">
        {creator?.avatarUrl ? (
          <img
            src={creator.avatarUrl}
            alt=""
            className="w-[36px] h-[36px] rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-[36px] h-[36px] rounded-full bg-newTableBorder shrink-0" />
        )}
        <div className="flex flex-col text-[13px] leading-[1.35] min-w-0">
          <span className="opacity-70">
            {t('tiktok_posting_to', 'Posting to TikTok account')}
          </span>
          <span className="font-bold truncate">
            {creator?.nickname ||
              (creatorLoading
                ? t('loading', 'Loading...')
                : integration?.name || '-')}
            {creator?.username ? (
              <span className="font-normal opacity-70">
                {' '}
                (@{creator.username})
              </span>
            ) : null}
          </span>
        </div>
      </div>

      {/*
        Posting is blocked when TikTok says this creator cannot post right now
        (rate limit, unverified account, revoked scope). Showing the reason here
        is the difference between a user who reconnects the channel and a user
        who files a bug about a post that silently never went out.
      */}
      {creatorError && (
        <div className="bg-red-800/30 border border-red-600 p-[10px] mb-[18px] rounded-[10px] text-[13px] text-balance">
          {creatorError}
        </div>
      )}

      {maxDurationLabel && (
        <div className="text-[13px] mb-[18px] opacity-80">
          {t('tiktok_max_duration', 'Maximum video length for this account:')}{' '}
          <strong>{maxDurationLabel}</strong>
        </div>
      )}
      {tiktokRestrictionNotice && (
        <div className="bg-tableBorder p-[10px] mb-[18px] rounded-[10px] flex gap-[10px] items-start text-[13px] text-balance">
          <div className="shrink-0 mt-[2px]">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22.201 17.6335L14.0026 3.39569C13.7977 3.04687 13.5052 2.75764 13.1541 2.55668C12.803 2.35572 12.4055 2.25 12.001 2.25C11.5965 2.25 11.199 2.35572 10.8479 2.55668C10.4968 2.75764 10.2043 3.04687 9.99944 3.39569L1.80101 17.6335C1.60388 17.9709 1.5 18.3546 1.5 18.7454C1.5 19.1361 1.60388 19.5199 1.80101 19.8572C2.00325 20.2082 2.29523 20.499 2.64697 20.6998C2.99871 20.9006 3.39755 21.0043 3.80257 21.0001H20.1994C20.6041 21.0039 21.0026 20.9001 21.354 20.6993C21.7054 20.4985 21.997 20.2079 22.1991 19.8572C22.3965 19.52 22.5007 19.1364 22.5011 18.7456C22.5014 18.3549 22.3978 17.9711 22.201 17.6335ZM11.251 9.75006C11.251 9.55115 11.33 9.36038 11.4707 9.21973C11.6113 9.07908 11.8021 9.00006 12.001 9.00006C12.1999 9.00006 12.3907 9.07908 12.5313 9.21973C12.672 9.36038 12.751 9.55115 12.751 9.75006V13.5001C12.751 13.699 12.672 13.8897 12.5313 14.0304C12.3907 14.171 12.1999 14.2501 12.001 14.2501C11.8021 14.2501 11.6113 14.171 11.4707 14.0304C11.33 13.8897 11.251 13.699 11.251 13.5001V9.75006ZM12.001 18.0001C11.7785 18.0001 11.561 17.9341 11.376 17.8105C11.191 17.6868 11.0468 17.5111 10.9616 17.3056C10.8765 17.1 10.8542 16.8738 10.8976 16.6556C10.941 16.4374 11.0482 16.2369 11.2055 16.0796C11.3628 15.9222 11.5633 15.8151 11.7815 15.7717C11.9998 15.7283 12.226 15.7505 12.4315 15.8357C12.6371 15.9208 12.8128 16.065 12.9364 16.25C13.06 16.4351 13.126 16.6526 13.126 16.8751C13.126 17.1734 13.0075 17.4596 12.7965 17.6706C12.5855 17.8815 12.2994 18.0001 12.001 18.0001Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div>{tiktokRestrictionNotice}</div>
        </div>
      )}
      {isTitle && <Input label="Title" {...register('title')} maxLength={89} />}
      <div className={directPostOnly}>
        {/*
          NO DEFAULT VALUE, DELIBERATELY.
          TikTok's guidelines require the creator to choose the privacy status
          themselves -- a pre-selected value is the single item TikTok named
          when it rejected this integration's audit. The field starts empty and
          stays disabled until the creator's allowed options have loaded.
        */}
        <Select
          label={t('label_who_can_see_this_video', 'Who can see this video?')}
          disabled={isUploadMode || creatorLoading || !privacyLevel.length}
          {...register('privacy_level')}
        >
          <option value="">
            {creatorLoading
              ? t('loading', 'Loading...')
              : t('select', 'Select')}
          </option>
          {privacyLevel.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="text-[14px] mt-[10px] mb-[18px] text-balance">
        {t(
          'choose_upload_without_posting_description',
          `Choose upload without posting if you want to review and edit your content within TikTok's app before publishing.
        This gives you access to TikTok's built-in editing tools and lets you make final adjustments before posting. The additional settings are only available when posting directly to TikTok.`
        )}
      </div>
      <Select
        label={t('label_content_posting_method', 'Content posting method')}
        {...register('content_posting_method', {
          value: 'DIRECT_POST',
        })}
      >
        <option value="">{t('select', 'Select')}</option>
        {contentPostingMethod.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>
      {isUploadMode && <div className="-mt-[23px] mb-[23px] text-red-600">After posting you fill find a notification inside your Inbox about your post (not content studio)</div>}
      <div className={clsx('flex flex-col', directPostOnly)}>
        <Select
          label={
            isBusiness
              ? t('label_add_random_music', 'Add random music')
              : t('label_auto_add_music', 'Auto add music')
          }
          disabled={isUploadMode}
          {...register('autoAddMusic', {
            value: 'no',
          })}
        >
          <option value="">{t('select', 'Select')}</option>
          {yesNo.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
        <div className="text-[14px] mt-[10px] mb-[24px] text-balance">
          {isBusiness
            ? t(
                'tiktok_random_music_only_for_photos',
                'This feature is available only for photos, it adds a random trending track from TikTok\'s commercial music library.'
              )
            : t(
                'this_feature_available_only_for_photos',
                'This feature available only for photos, it will add a default music that\n        you can change later.'
              )}
        </div>
        {isBusiness && (
          <div className="flex flex-col gap-[18px] mb-[24px]">
            {/* Random music replaces a manual choice for photos, so the
                selector is hidden (but stays registered) while it's on. */}
            <div
              className={clsx(
                !isVideo &&
                  autoAddMusic === 'yes' &&
                  'invisible h-0 overflow-hidden'
              )}
            >
              <TikTokMusicSelector
                label={t('tiktok_music_label', 'Music')}
                showVolumes={isVideo}
                {...register('music')}
              />
            </div>
            <TikTokLocationSelector
              label={t('tiktok_location_label', 'Location')}
              {...register('location')}
            />
          </div>
        )}
        <hr className="mb-[15px] border-tableBorder" />
        <div className="text-[14px] mb-[10px]">
          {t('tiktok_video_features', 'Video features')}
        </div>
        <div className="flex gap-[40px]">
          {/*
            An interaction the creator switched off in the TikTok app must be
            greyed out here, not silently ignored. Unchecked by default, as
            TikTok requires.
          */}
          <div className={clsx(creator?.duetDisabled && 'opacity-50')}>
            <Checkbox
              variant="hollow"
              label={t('label_duet', 'Allow Duet')}
              disabled={isUploadMode || !!creator?.duetDisabled}
              {...register('duet', {
                value: false,
              })}
            />
          </div>
          <div className={clsx(creator?.stitchDisabled && 'opacity-50')}>
            <Checkbox
              label={t('label_stitch', 'Allow Stitch')}
              variant="hollow"
              disabled={isUploadMode || !!creator?.stitchDisabled}
              {...register('stitch', {
                value: false,
              })}
            />
          </div>
          <Checkbox
            label={t('video_made_with_ai', 'Video made with AI')}
            variant="hollow"
            disabled={isUploadMode}
            {...register('video_made_with_ai', {
              value: false,
            })}
          />
        </div>
        <hr className="my-[15px] mb-[25px] border-tableBorder" />
        <div className="flex flex-col gap-[20px]">
          {/*
            Unchecked by default. TikTok's guidelines state none of the
            interaction settings may be pre-enabled, and this one was.
          */}
          <div className={clsx(creator?.commentDisabled && 'opacity-50')}>
            <Checkbox
              label={t('label_comments', 'Allow Comments')}
              variant="hollow"
              disabled={isUploadMode || !!creator?.commentDisabled}
              {...register('comment', {
                value: false,
              })}
            />
          </div>
          <Checkbox
            variant="hollow"
            label={t('label_disclose_video_content', 'Disclose Video Content')}
            disabled={isUploadMode}
            {...register('disclose', {
              value: false,
            })}
          />
          {disclose && (
            <div className="bg-tableBorder p-[10px] mt-[10px] rounded-[10px] flex gap-[20px] items-center">
              <div>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M22.201 17.6335L14.0026 3.39569C13.7977 3.04687 13.5052 2.75764 13.1541 2.55668C12.803 2.35572 12.4055 2.25 12.001 2.25C11.5965 2.25 11.199 2.35572 10.8479 2.55668C10.4968 2.75764 10.2043 3.04687 9.99944 3.39569L1.80101 17.6335C1.60388 17.9709 1.5 18.3546 1.5 18.7454C1.5 19.1361 1.60388 19.5199 1.80101 19.8572C2.00325 20.2082 2.29523 20.499 2.64697 20.6998C2.99871 20.9006 3.39755 21.0043 3.80257 21.0001H20.1994C20.6041 21.0039 21.0026 20.9001 21.354 20.6993C21.7054 20.4985 21.997 20.2079 22.1991 19.8572C22.3965 19.52 22.5007 19.1364 22.5011 18.7456C22.5014 18.3549 22.3978 17.9711 22.201 17.6335ZM11.251 9.75006C11.251 9.55115 11.33 9.36038 11.4707 9.21973C11.6113 9.07908 11.8021 9.00006 12.001 9.00006C12.1999 9.00006 12.3907 9.07908 12.5313 9.21973C12.672 9.36038 12.751 9.55115 12.751 9.75006V13.5001C12.751 13.699 12.672 13.8897 12.5313 14.0304C12.3907 14.171 12.1999 14.2501 12.001 14.2501C11.8021 14.2501 11.6113 14.171 11.4707 14.0304C11.33 13.8897 11.251 13.699 11.251 13.5001V9.75006ZM12.001 18.0001C11.7785 18.0001 11.561 17.9341 11.376 17.8105C11.191 17.6868 11.0468 17.5111 10.9616 17.3056C10.8765 17.1 10.8542 16.8738 10.8976 16.6556C10.941 16.4374 11.0482 16.2369 11.2055 16.0796C11.3628 15.9222 11.5633 15.8151 11.7815 15.7717C11.9998 15.7283 12.226 15.7505 12.4315 15.8357C12.6371 15.9208 12.8128 16.065 12.9364 16.25C13.06 16.4351 13.126 16.6526 13.126 16.8751C13.126 17.1734 13.0075 17.4596 12.7965 17.6706C12.5855 17.8815 12.2994 18.0001 12.001 18.0001Z"
                    fill="white"
                  />
                </svg>
              </div>
              <div>
                {t(
                  'your_video_will_be_labeled_promotional',
                  'Your video will be labeled "Promotional Content".'
                )}
                <br />
                {t(
                  'this_cannot_be_changed_once_posted',
                  'This cannot be changed once your video is posted.'
                )}
              </div>
            </div>
          )}
          <div className="text-[14px] my-[10px] text-balance">
            {t(
              'turn_on_to_disclose_video_promotes',
              'Turn on to disclose that this video promotes goods or services in\n          exchange for something of value. You video could promote yourself, a\n          third party, or both.'
            )}
          </div>
        </div>
        <div className={clsx(!disclose && 'invisible h-0 overflow-hidden', 'mt-[20px]')}>
          <Checkbox
            variant="hollow"
            label={t('label_your_brand', 'Your brand')}
            disabled={isUploadMode}
            {...register('brand_organic_toggle', {
              value: false,
            })}
          />
          <div className="text-balance my-[10px] text-[14px]">
            {t(
              'you_are_promoting_yourself',
              'You are promoting yourself or your own brand.'
            )}
            <br />
            {t(
              'this_video_will_be_classified_brand_organic',
              'This video will be classified as Brand Organic.'
            )}
          </div>
          <Checkbox
            variant="hollow"
            label={t('label_branded_content', 'Branded content')}
            disabled={isUploadMode}
            {...register('brand_content_toggle', {
              value: false,
            })}
          />
          <div className="text-balance my-[10px] text-[14px]">
            {t(
              'you_are_promoting_another_brand',
              'You are promoting another brand or a third party.'
            )}
            <br />
            {t(
              'this_video_will_be_classified_branded_content',
              'This video will be classified as Branded Content.'
            )}
          </div>
        </div>

        {/*
          COMPLIANCE DECLARATION, ALWAYS VISIBLE.

          TikTok requires the music declaration to be on the posting screen for
          every post, not only for commercial ones -- it was previously rendered
          only when a brand toggle was on, so a plain post showed nothing. The
          Branded Content Policy is added on top when the post is branded
          content, which is the only part that is conditional.
        */}
        <div className="my-[10px] text-[14px] text-balance">
          {t(
            'by_posting_you_agree_to_tiktoks',
            "By posting, you agree to TikTok's"
          )}{' '}
          {brand_content_toggle && (
            <>
              <a
                target="_blank"
                rel="noreferrer"
                className="text-[#B69DEC] hover:underline"
                href="https://www.tiktok.com/legal/page/global/bc-policy/en"
              >
                {t('branded_content_policy', 'Branded Content Policy')}
              </a>{' '}
              {t('and', 'and')}{' '}
            </>
          )}
          <a
            target="_blank"
            rel="noreferrer"
            className="text-[#B69DEC] hover:underline"
            href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
          >
            {t('music_usage_confirmation', 'Music Usage Confirmation')}
          </a>
          .
        </div>
      </div>
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: TikTokSettings,
  comments: false,
  CustomPreviewComponent: TiktokPreview,
  dto: TikTokDto,
  maximumCharacters: 2000,
});
