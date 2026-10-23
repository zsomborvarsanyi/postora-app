'use client';

import React, { FC, Fragment, useCallback, useMemo } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@gitroom/react/form/button';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Textarea } from '@gitroom/react/form/textarea';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { FormProvider, useForm } from 'react-hook-form';
import { boolean, object, string } from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import clsx from 'clsx';

// Plain phrases by default - no regex required to use this at all. "Advanced"
// only switches on if someone explicitly wants a regex pattern instead.
const details = object().shape({
  active: boolean(),
  isRegex: boolean(),
  triggersText: string().required(),
  publicReply: string(),
  privateReply: string(),
});

export const CommentAutomationRules: FC<{ integrationId: string }> = ({
  integrationId,
}) => {
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
            <div className="grid grid-cols-[2fr,2fr,2fr,auto,auto,auto] w-full gap-y-[10px] gap-x-[10px]">
              <div>{t('triggers', 'Triggers')}</div>
              <div>{t('public_reply', 'Public reply')}</div>
              <div>{t('private_reply_dm', 'Private reply (DM)')}</div>
              <div>{t('active', 'Active')}</div>
              <div>{t('order', 'Order')}</div>
              <div>{t('actions', 'Actions')}</div>
              {data?.map((rule: any) => (
                <Fragment key={rule.id}>
                  <div className="flex flex-col justify-center truncate">
                    {(JSON.parse(rule.triggers || '[]') as string[]).join(', ')}
                  </div>
                  <div className="flex flex-col justify-center truncate">
                    {rule.publicReply || '-'}
                  </div>
                  <div className="flex flex-col justify-center truncate">
                    {rule.privateReply || '-'}
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
          <div>
            <Button
              onClick={openRule()}
              className={clsx((data?.length || 0) > 0 && 'my-[16px]')}
            >
              {t('add_a_rule', 'Add a rule')}
            </Button>
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
      isRegex: data?.matchType === 'REGEX',
      triggersText: existingTriggers,
      publicReply: data?.publicReply || '',
      privateReply: data?.privateReply || '',
    },
  });

  const callBack = useCallback(
    async (values: any) => {
      const triggers = values.isRegex
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
            matchType: values.isRegex ? 'REGEX' : 'CONTAINS',
            triggers,
            publicReply: values.publicReply || undefined,
            privateReply: values.privateReply || undefined,
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
            <Checkbox
              name="isRegex"
              label={t(
                'advanced_use_a_regex_pattern_instead',
                'Advanced: use a regex pattern instead of plain phrases'
              )}
            />
            <Textarea
              name="triggersText"
              label={t(
                'triggers_one_phrase_per_line',
                'Triggers (one phrase per line, matches if the comment contains any of them)'
              )}
            />
            <Textarea
              name="publicReply"
              label={t(
                'public_reply_optional',
                'Public reply (optional, posted as a visible comment reply)'
              )}
            />
            <Textarea
              name="privateReply"
              label={t(
                'private_reply_optional',
                'Private reply / DM (optional, a link here will be clickable)'
              )}
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
