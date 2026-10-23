'use client';

import React, { FC, Fragment, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@gitroom/react/form/button';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Textarea } from '@gitroom/react/form/textarea';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { Select } from '@gitroom/react/form/select';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { Input } from '@gitroom/react/form/input';
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
  providerPostId: string(),
  matchType: string().required(),
  triggersText: string().required(),
  publicReplyText: string(),
  privateReplyText: string(),
});

// Same key/label pairs as LON's includes/link_utm.php LINK_UTM_SOURCES /
// LINK_UTM_MEDIUMS - hardcoded here rather than fetched, since they're a
// small, rarely-changing fixed list (unlike landing pages/products/sponsors,
// which come live from /comment-automation/lon/options).
const LON_SOURCES = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'email', label: 'E-mail sorozat' },
];
const LON_MEDIUMS = [
  { value: 'komment', label: 'Komment' },
  { value: 'poszt', label: 'Poszt' },
  { value: 'bio', label: 'Bio-link' },
  { value: 'story', label: 'Story' },
  { value: 'hub', label: 'Hub' },
  { value: 'uzleti_megkereses', label: 'Üzleti megkeresés' },
  { value: 'privat_uzenet', label: 'Privát üzenet' },
];

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
      providerPostId: data?.providerPostId || '',
      matchType: data?.matchType || 'CONTAINS',
      triggersText: existingTriggers,
      publicReplyText: joinVariants(parseVariants(data?.publicReply)),
      privateReplyText: joinVariants(parseVariants(data?.privateReply)),
    },
  });

  const triggerSource = form.watch('triggerSource');
  const matchType = form.watch('matchType');

  const loadPosts = useCallback(async () => {
    return (await fetch(`/comment-automation/${integrationId}/posts`)).json();
  }, [integrationId]);
  const { data: posts } = useSWR(
    `comment-automation-posts-${integrationId}`,
    loadPosts
  );

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
            providerPostId: values.providerPostId || undefined,
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
            {triggerSource === 'COMMENT' && (
              <Select
                name="providerPostId"
                label={t(
                  'scope_to_post',
                  'Scope to one specific post (optional - a post-specific rule wins over a whole-channel rule)'
                )}
              >
                <option value="">
                  {t('whole_channel', 'Whole channel (default)')}
                </option>
                {(posts || []).map((post: any) => (
                  <option key={post.releaseId} value={post.releaseId}>
                    {new Date(post.publishDate).toLocaleDateString()} -{' '}
                    {(post.content || '').replace(/<[^>]+>/g, '').slice(0, 60)}
                  </option>
                ))}
              </Select>
            )}
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
            <LonLinkPanel />
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

// Authoring-time convenience only: fetches live landing/product/sponsor
// options and, on request, asks LON to mint a real, trackable short link -
// then just appends it as plain text to the private-reply field. Nothing
// here is ever called again once the rule is saved; the live comment-reply
// pipeline never talks to LON.
const LonLinkPanel: FC = () => {
  const fetch = useFetch();
  const t = useT();
  const toast = useToaster();
  const form = useFormContext();
  const [open, setOpen] = useState(false);
  const [landingSlug, setLandingSlug] = useState('');
  const [productSku, setProductSku] = useState('');
  const [distributorId, setDistributorId] = useState('');
  const [source, setSource] = useState('instagram');
  const [medium, setMedium] = useState('komment');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState<'landing' | 'purchase' | false>(false);

  const loadOptions = useCallback(async () => {
    return (await fetch('/comment-automation/lon/options')).json();
  }, []);
  const { data: options } = useSWR(
    open ? 'comment-automation-lon-options' : null,
    loadOptions
  );

  const appendLink = useCallback(
    (shortUrl: string) => {
      const current = form.getValues('privateReplyText') || '';
      form.setValue(
        'privateReplyText',
        current ? `${current}\n${shortUrl}` : shortUrl,
        { shouldValidate: true }
      );
    },
    [form]
  );

  const fetchLink = useCallback(
    (type: 'landing' | 'purchase') => async () => {
      setLoading(type);
      try {
        const body: any = { type, source, medium, content: content || undefined };
        if (type === 'landing') {
          body.landingSlug = landingSlug;
        } else {
          body.productSku = productSku;
          body.distributorId = distributorId ? Number(distributorId) : undefined;
        }

        const res = await fetch('/comment-automation/lon/generate-link', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error('lon_link_request_failed');
        }
        const { shortUrl } = await res.json();
        appendLink(shortUrl);
        toast.show(t('lon_link_added', 'Link added to the private reply'), 'success');
      } catch {
        toast.show(
          t('lon_link_failed', 'Could not get a link from LON, check the selections'),
          'warning'
        );
      } finally {
        setLoading(false);
      }
    },
    [source, medium, content, landingSlug, productSku, distributorId, appendLink]
  );

  if (!open) {
    return (
      <Button type="button" secondary={true} onClick={() => setOpen(true)}>
        {t('generate_a_lon_link', 'Generate a LON link')}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-[12px] border-fifth border rounded-[4px] p-[16px]">
      <div className="text-[14px]">
        {t(
          'lon_link_description',
          'Picks live from LON. The resulting link is appended to the private reply above as plain text - nothing here runs again once this rule is saved.'
        )}
      </div>
      <div className="grid grid-cols-2 gap-[10px]">
        <Select
          name="lon-source"
          disableForm={true}
          label={t('source', 'Source')}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          {LON_SOURCES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select
          name="lon-medium"
          disableForm={true}
          label={t('medium', 'Medium')}
          value={medium}
          onChange={(e) => setMedium(e.target.value)}
        >
          {LON_MEDIUMS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <Input
        label={t('content_slug', 'Content / slug (free text, e.g. a date + note)')}
        name="lon-content"
        disableForm={true}
        value={content}
        onChange={(e: any) => setContent(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-[10px] items-end">
        <Select
          name="lon-landing"
          disableForm={true}
          label={t('landing_page', 'Landing page')}
          value={landingSlug}
          onChange={(e) => setLandingSlug(e.target.value)}
        >
          <option value="">{t('choose', 'Choose...')}</option>
          {(options?.landingPages || []).map((p: any) => (
            <option key={p.slug} value={p.slug}>
              {p.label}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          onClick={fetchLink('landing')}
          disabled={!landingSlug || loading !== false}
        >
          {t('fetch_landing_link', 'Fetch landing link')}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-[10px]">
        <Select
          name="lon-product"
          disableForm={true}
          label={t('product', 'Product')}
          value={productSku}
          onChange={(e) => setProductSku(e.target.value)}
        >
          <option value="">{t('choose', 'Choose...')}</option>
          {(options?.products || []).map((p: any) => (
            <option key={p.sku} value={p.sku}>
              {p.brand ? `${p.brand} - ${p.name}` : p.name}
            </option>
          ))}
        </Select>
        <Select
          name="lon-sponsor"
          disableForm={true}
          label={t('sponsor', 'Sponsor')}
          value={distributorId}
          onChange={(e) => setDistributorId(e.target.value)}
        >
          <option value="">{t('choose', 'Choose...')}</option>
          {(options?.sponsors || []).map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <Button
        type="button"
        onClick={fetchLink('purchase')}
        disabled={!productSku || !distributorId || loading !== false}
      >
        {t('fetch_purchase_link', 'Fetch purchase link')}
      </Button>
    </div>
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
