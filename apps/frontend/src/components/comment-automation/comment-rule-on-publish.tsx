'use client';

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Select } from '@gitroom/react/form/select';
import { Textarea } from '@gitroom/react/form/textarea';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  splitVariants,
  joinVariants,
} from '@gitroom/frontend/components/comment-automation/comment-automation-rules';

export interface CommentRuleOnPublishValue {
  triggerSource: 'COMMENT' | 'DIRECT_MESSAGE';
  matchType: 'CONTAINS' | 'EXACT' | 'REGEX';
  triggers: string[];
  publicReply?: string[];
  privateReply?: string[];
}

// Variant A of comment automation: scheduling-time editor for the rule a
// post should activate for itself the moment it actually publishes (see
// PostsService.updatePost's activateCommentRuleOnPublish hook, which reads
// this back from settings.commentRule once a real providerPostId exists).
// Deliberately the same fields as CommentAutomationRules' AddOrEditRule
// (same textarea-variants convention, same options), minus id/order/active/
// providerPostId - none of those exist yet at schedule time, the backend
// hook fills them in on publish. Takes the whole value as one object, same
// controlled-component contract as InstagramAudioSelector (register('x')
// spread in, {name, onChange} read out, no native ref) rather than nested
// react-hook-form field paths, since this is a single opaque settings value.
export const CommentRuleOnPublishEditor: FC<{
  name: string;
  onChange?: (event: {
    target: { name: string; value: CommentRuleOnPublishValue | undefined };
  }) => void;
}> = (props) => {
  const { name, onChange } = props;
  const t = useT();
  const { getValues } = useSettings();

  const [enabled, setEnabled] = useState(false);
  const [triggerSource, setTriggerSource] = useState<
    'COMMENT' | 'DIRECT_MESSAGE'
  >('COMMENT');
  const [matchType, setMatchType] = useState<'CONTAINS' | 'EXACT' | 'REGEX'>(
    'CONTAINS'
  );
  const [triggersText, setTriggersText] = useState('');
  const [publicReplyText, setPublicReplyText] = useState('');
  const [privateReplyText, setPrivateReplyText] = useState('');
  const loaded = useRef(false);

  // Repopulate from an already-saved draft (settings.commentRule) exactly
  // once - same getValues()[name] read-back as InstagramAudioSelector.
  useEffect(() => {
    const existing = getValues()[name];
    if (existing?.triggers?.length) {
      setEnabled(true);
      setTriggerSource(existing.triggerSource || 'COMMENT');
      setMatchType(existing.matchType || 'CONTAINS');
      setTriggersText((existing.triggers as string[]).join('\n'));
      setPublicReplyText(joinVariants(existing.publicReply));
      setPrivateReplyText(joinVariants(existing.privateReply));
    }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Skip the render before the read-back above has had a chance to run -
    // otherwise this would immediately emit `undefined` and wipe out an
    // already-saved commentRule before it's even loaded into local state.
    if (!loaded.current || !onChange) {
      return;
    }

    if (!enabled) {
      onChange({ target: { name, value: undefined } });
      return;
    }

    const triggers =
      matchType === 'REGEX'
        ? [triggersText.replace(/\r?\n/g, ' ').trim()].filter(Boolean)
        : triggersText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);

    if (!triggers.length) {
      onChange({ target: { name, value: undefined } });
      return;
    }

    onChange({
      target: {
        name,
        value: {
          triggerSource,
          matchType,
          triggers,
          publicReply:
            triggerSource === 'DIRECT_MESSAGE'
              ? undefined
              : splitVariants(publicReplyText),
          privateReply: splitVariants(privateReplyText),
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    triggerSource,
    matchType,
    triggersText,
    publicReplyText,
    privateReplyText,
  ]);

  const toggleEnabled = useCallback(
    (e: { target: { value: boolean } }) => setEnabled(e.target.value),
    []
  );

  return (
    <div className="flex flex-col gap-[12px] bg-newBgColorInner border-newTableBorder border rounded-[8px] p-[16px]">
      <Checkbox
        disableForm
        checked={enabled}
        onChange={toggleEnabled}
        label={t(
          'activate_comment_rule_on_publish',
          'Automatically activate a comment-automation rule for this post once it publishes'
        )}
      />
      {enabled && (
        <div className="flex flex-col gap-[12px]">
          <Select
            name="commentRule-triggerSource"
            disableForm
            label={t('trigger_label', 'Trigger: what this rule reacts to')}
            value={triggerSource}
            onChange={(e) => setTriggerSource(e.target.value as any)}
          >
            <option value="COMMENT">
              {t('trigger_comment', 'A comment under this post')}
            </option>
            <option value="DIRECT_MESSAGE">
              {t('trigger_direct_message', 'An inbound direct message')}
            </option>
          </Select>
          <Select
            name="commentRule-matchType"
            disableForm
            label={t('match_type_label', 'How the triggers below are matched')}
            value={matchType}
            onChange={(e) => setMatchType(e.target.value as any)}
          >
            <option value="CONTAINS">
              {t('match_contains', 'Contains any of these phrases')}
            </option>
            <option value="EXACT">
              {t(
                'match_exact',
                'Is exactly one of these phrases, nothing else'
              )}
            </option>
            <option value="REGEX">
              {t('match_regex', 'Advanced: regex pattern')}
            </option>
          </Select>
          <Textarea
            name="commentRule-triggers"
            disableForm
            label={
              matchType === 'REGEX'
                ? t('triggers_regex_pattern', 'Regex pattern')
                : t(
                    'triggers_one_phrase_per_line',
                    'Triggers (one phrase per line)'
                  )
            }
            value={triggersText}
            onChange={(e) => setTriggersText(e.target.value)}
          />
          {triggerSource === 'COMMENT' && (
            <Textarea
              name="commentRule-publicReply"
              disableForm
              label={t(
                'public_reply_optional',
                'Public reply (optional, posted as a visible comment reply). Several variants can go here, one per line, separated by a line with just ---; one is picked at random each time.'
              )}
              value={publicReplyText}
              onChange={(e) => setPublicReplyText(e.target.value)}
            />
          )}
          <Textarea
            name="commentRule-privateReply"
            disableForm
            label={
              triggerSource === 'DIRECT_MESSAGE'
                ? t(
                    'direct_message_reply',
                    'Reply sent back as a direct message. Several variants can go here, separated by a line with just ---; one is picked at random each time.'
                  )
                : t(
                    'private_reply_optional',
                    'Private reply / DM (optional, a link here will be clickable). Several variants can go here, separated by a line with just ---; one is picked at random each time.'
                  )
            }
            value={privateReplyText}
            onChange={(e) => setPrivateReplyText(e.target.value)}
          />
          <div className="text-[12px] opacity-70">
            {t(
              'comment_rule_on_publish_note',
              'This rule only turns on once this post actually publishes and gets a real post id - nothing runs while it is still queued/scheduled.'
            )}
          </div>
        </div>
      )}
    </div>
  );
};
