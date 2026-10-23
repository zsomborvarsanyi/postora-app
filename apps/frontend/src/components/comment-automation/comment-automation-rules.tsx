'use client';

import React, { FC, Fragment, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@gitroom/react/form/button';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Textarea } from '@gitroom/react/form/textarea';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { Select } from '@gitroom/react/form/select';
import { FormProvider, useForm } from 'react-hook-form';
import { boolean, object, string } from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import clsx from 'clsx';

// Several reply variants can live in one textarea, one per line separated
// by a line containing only "---" - lets a single variant span multiple
// lines/paragraphs, unlike one-variant-per-line.
const VARIANT_SEPARATOR = /\r?\n-{3,}\r?\n/;

const splitVariants = (text: string): string[] =>
  (text || '')
    .split(VARIANT_SEPARATOR)
    .map((variant) => variant.trim())
    .filter(Boolean);

const joinVariants = (variants: string[] | undefined): string =>
  (variants || []).join('\n---\n');

// Mirrors the backend's pickReplyVariant parsing, but returns every stored
// variant instead of picking one - used to repopulate the edit form.
const parseVariants = (stored: string | null | undefined): string[] => {
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [stored];
  } catch {
    return [stored];
  }
};

// Plain phrases by default - no regex required to use this at all. "Advanced"
// only switches on if someone explicitly wants a regex pattern instead.
const details = object().shape({
  active: boolean(),
  triggerSource: string().required(),
  matchType: string().required(),
  triggersText: string().required(),
  publicReplyText: string(),
  privateReplyText: string(),
});

export const CommentAutomationRules: FC<{
  integrationId: string;
  siblingIntegrations: { id: string; name: string; picture?: string }[];
}> = ({ integrationId, siblingIntegrations }) => {
  const fetch = useFetch();
  const modal = useModals();
  const toaster = useToaster();
  const t = useT();

  const load = useCallback(async () => {
    return (await fetch(`/comment-automation/${integrationId}/rules`)).json();
  }, [integrationId]);
  const { data, mutate } = useSWR(
    `comment-automation-rules-${integrationId}`,
    load
  );

  const openRule = useCallback(
    (rule?: any) => () => {
      modal.openModal({
        title: rule
          ? t('edit_rule', 'Edit rule')
          : t('add_rule', 'Add rule'),
        withCloseButton: true,
        children: (
          <AddOrEditRule
            integrationId={integrationId}
            data={rule}
            reload={mutate}
          />
        ),
      });
    },
    [integrationId, mutate]
  );

  const deleteRule = useCallback(
    (rule: any) => async () => {
      if (
        await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete_this_rule',
            'Are you sure you want to delete this rule?'
          )
        )
      ) {
        await fetch(`/comment-automation/${integrationId}/rules/${rule.id}`, {
          method: 'DELETE',
        });
        mutate();
        toaster.show(t('rule_deleted_successfully', 'Rule deleted successfully'), 'success');
      }
    },
    [integrationId]
  );

  const openCopyModal = useCallback(() => {
    modal.openModal({
      title: t('copy_rules_to_other_channels', 'Copy rules to other channels'),
      withCloseButton: true,
      children: (
        <CopyRulesModal
          integrationId={integrationId}
          siblingIntegrations={siblingIntegrations}
        />
      ),
    });
  }, [integrationId, siblingIntegrations]);

  const move = useCallback(
    (rule: any, direction: -1 | 1) => async () => {
      const sorted = [...(data || [])];
      const index = sorted.findIndex((r) => r.id === rule.id);
      const swapWith = index + direction;
      if (swapWith < 0 || swapWith >= sorted.length) return;

      [sorted[index], sorted[swapWith]] = [sorted[swapWith], sorted[index]];

      await fetch(`/comment-automation/${integrationId}/rules/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ orderedIds: sorted.map((r) => r.id) }),
      });
      mutate();
    },
    [data, integrationId]
  );

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">
        {t('comment_automation', 'Comment automation')}
      </h3>
      <div className="text-customColor18 mt-[4px]">
        {t(
          'comment_automation_description',
          'When a comment matches one of these rules, the first match wins: a public reply and/or a private reply (DM) is sent automatically. No AI, just plain text matching.'
        )}
      </div>
      <div className="my-[16px] bg-sixth border-fifth items-center border rounded-[4px] p-[24px] flex gap-[24px]">
        <div className="flex flex-col w-full">
          {!!data?.length && (
            <div className="grid grid-cols-[auto,2fr,2fr,2fr,auto,auto,auto] w-full gap-y-[10px] gap-x-[10px]">
              <div>{t('trigger', 'Trigger')}</div>
              <div>{t('triggers', 'Triggers')}</div>
              <div>{t('public_reply', 'Public reply')}</div>
              <div>{t('private_reply_dm', 'Private reply (DM)')}</div>
              <div>{t('active', 'Active')}</div>
              <div>{t('order', 'Order')}</div>
              <div>{t('actions', 'Actions')}</div>
              {data?.map((rule: any) => (
                <Fragment key={rule.id}>
                  <div className="flex flex-col justify-center">
                    {rule.triggerSource === 'DIRECT_MESSAGE'
                      ? t('trigger_direct_message_short', 'DM')
                      : t('trigger_comment_short', 'Comment')}
                  </div>
                  <div className="flex flex-col justify-center truncate">
                    {(JSON.parse(rule.triggers || '[]') as string[]).join(', ')}
                  </div>
                  <div className="flex flex-col justify-center truncate">
                    {parseVariants(rule.publicReply).join(' / ') || '-'}
                  </div>
                  <div className="flex flex-col justify-center truncate">
                    {parseVariants(rule.privateReply).join(' / ') || '-'}
                  </div>
                  <div className="flex flex-col justify-center">
                    {rule.active
                      ? t('yes', 'Yes')
                      : t('no', 'No')}
                  </div>
                  <div className="flex flex-col justify-center gap-[4px]">
                    <div className="flex gap-[4px]">
                      <Button onClick={move(rule, -1)}>▲</Button>
                      <Button onClick={move(rule, 1)}>▼</Button>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center gap-[4px]">
                    <div className="flex gap-[4px]">
                      <Button onClick={openRule(rule)}>
                        {t('edit', 'Edit')}
                      </Button>
                      <Button onClick={deleteRule(rule)}>
                        {t('delete', 'Delete')}
                      </Button>
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
          )}
          <div className="flex gap-[10px]">
            <Button
              onClick={openRule()}
              className={clsx((data?.length || 0) > 0 && 'my-[16px]')}
            >
              {t('add_a_rule', 'Add a rule')}
            </Button>
            {!!data?.length && !!siblingIntegrations.length && (
              <Button
                secondary={true}
                onClick={openCopyModal}
                className="my-[16px]"
              >
                {t('copy_rules_to_other_channels', 'Copy rules to other channels')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const AddOrEditRule: FC<{
  integrationId: string;
  data?: any;
  reload: () => void;
}> = (props) => {
  const { integrationId, data, reload } = props;
  const fetch = useFetch();
  const t = useT();
  const modal = useModals();
  const toast = useToaster();

  const existingTriggers = useMemo(() => {
    try {
      return (JSON.parse(data?.triggers || '[]') as string[]).join('\n');
    } catch {
      return '';
    }
  }, [data]);

  const form = useForm({
    resolver: yupResolver(details),
    values: {
      active: data ? data.active : true,
      triggerSource: data?.triggerSource || 'COMMENT',
      matchType: data?.matchType || 'CONTAINS',
      triggersText: existingTriggers,
      publicReplyText: joinVariants(parseVariants(data?.publicReply)),
      privateReplyText: joinVariants(parseVariants(data?.privateReply)),
    },
  });

  const triggerSource = form.watch('triggerSource');
  const matchType = form.watch('matchType');

  const callBack = useCallback(
    async (values: any) => {
      const triggers =
        values.matchType === 'REGEX'
          ? [values.triggersText.replace(/\r?\n/g, ' ').trim()]
          : values.triggersText
              .split('\n')
              .map((line: string) => line.trim())
              .filter(Boolean);

      await fetch(
        data?.id
          ? `/comment-automation/${integrationId}/rules/${data.id}`
          : `/comment-automation/${integrationId}/rules`,
        {
          method: data?.id ? 'PUT' : 'POST',
          body: JSON.stringify({
            active: values.active,
            triggerSource: values.triggerSource,
            matchType: values.matchType,
            triggers,
            publicReply:
              values.triggerSource === 'DIRECT_MESSAGE'
                ? undefined
                : splitVariants(values.publicReplyText),
            privateReply: splitVariants(values.privateReplyText),
          }),
        }
      );

      toast.show(
        data?.id
          ? t('rule_updated_successfully', 'Rule updated successfully')
          : t('rule_added_successfully', 'Rule added successfully'),
        'success'
      );
      modal.closeAll();
      reload();
    },
    [data, integrationId]
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(callBack)}>
        <div className="relative flex gap-[20px] flex-col flex-1 rounded-[4px] pt-0">
          <div className="flex flex-col gap-[16px]">
            <Select
              name="triggerSource"
              label={t(
                'trigger_label',
                'Trigger: what this rule reacts to'
              )}
            >
              <option value="COMMENT">
                {t('trigger_comment', 'A comment under a post')}
              </option>
              <option value="DIRECT_MESSAGE">
                {t('trigger_direct_message', 'An inbound direct message')}
              </option>
            </Select>
            <Select
              name="matchType"
              label={t('match_type_label', 'How the triggers below are matched')}
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
              name="triggersText"
              label={
                matchType === 'REGEX'
                  ? t('triggers_regex_pattern', 'Regex pattern')
                  : t('triggers_one_phrase_per_line', 'Triggers (one phrase per line)')
              }
            />
            {triggerSource === 'COMMENT' && (
              <Textarea
                name="publicReplyText"
                label={t(
                  'public_reply_optional',
                  'Public reply (optional, posted as a visible comment reply). Several variants can go here, one per line, separated by a line with just ---; one is picked at random each time.'
                )}
              />
            )}
            <Textarea
              name="privateReplyText"
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
            />
            <Checkbox name="active" label={t('active', 'Active')} />
            <div className="flex gap-[10px]">
              <Button type="submit" disabled={!form.formState.isValid}>
                {t('save', 'Save')}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </FormProvider>
  );
};

const CopyRulesModal: FC<{
  integrationId: string;
  siblingIntegrations: { id: string; name: string; picture?: string }[];
}> = ({ integrationId, siblingIntegrations }) => {
  const fetch = useFetch();
  const t = useT();
  const modal = useModals();
  const toast = useToaster();
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(
    (id: string) => () => {
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
      );
    },
    []
  );

  const copy = useCallback(async () => {
    setLoading(true);
    try {
      const { copied } = await (
        await fetch(`/comment-automation/${integrationId}/rules/copy-to`, {
          method: 'POST',
          body: JSON.stringify({ targetIntegrationIds: selected }),
        })
      ).json();
      toast.show(
        t(
          'rules_copied_to_x_channels',
          `Rules copied to ${copied} channel(s)`,
          { copied }
        ),
        'success'
      );
      modal.closeAll();
    } finally {
      setLoading(false);
    }
  }, [selected, integrationId]);

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="text-customColor18">
        {t(
          'copy_rules_description',
          'This appends every current rule from this channel to the channels you pick below. Existing rules on those channels are kept, not replaced.'
        )}
      </div>
      <div className="flex flex-col gap-[8px]">
        {siblingIntegrations.map((integration) => (
          <label
            key={integration.id}
            className="flex items-center gap-[10px] cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.includes(integration.id)}
              onChange={toggle(integration.id)}
            />
            <span>{integration.name}</span>
          </label>
        ))}
      </div>
      <Button onClick={copy} disabled={!selected.length || loading}>
        {t('copy', 'Copy')}
      </Button>
    </div>
  );
};
