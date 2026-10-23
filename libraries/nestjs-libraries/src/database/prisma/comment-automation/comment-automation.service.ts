import { Injectable } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { CommentAutomationRepository } from '@gitroom/nestjs-libraries/database/prisma/comment-automation/comment-automation.repository';
import { CommentAutomationRuleDto } from '@gitroom/nestjs-libraries/dtos/comment-automation/comment-automation.dto';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { Integration } from '@prisma/client';
import {
  matchComment,
  MatchableRule,
  pickReplyVariant,
  applyNamePlaceholder,
} from '@gitroom/nestjs-libraries/database/prisma/comment-automation/comment-automation.match';
import {
  verifyMetaWebhookSignature,
  extractCommentEvents,
  extractDirectMessageEvents,
} from '@gitroom/nestjs-libraries/database/prisma/comment-automation/comment-automation.webhook';

export { matchComment, MatchableRule };

// Facebook feed-comment events arrive with object: 'page', Instagram comment
// events with object: 'instagram'. Both map 1:1 to the providerIdentifier
// values used across this codebase; instagram-standalone is deliberately not
// included, it has no webhook subscription wired up (different Meta app,
// different credentials).
const META_WEBHOOK_PROVIDER_IDENTIFIERS = ['facebook', 'instagram'];

@Injectable()
export class CommentAutomationService {
  constructor(
    private _commentAutomationRepository: CommentAutomationRepository,
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _temporalService: TemporalService
  ) {}

  getRules(orgId: string, integrationId: string) {
    return this._commentAutomationRepository.getRules(orgId, integrationId);
  }

  getIntegrationPosts(orgId: string, integrationId: string) {
    return this._commentAutomationRepository.getIntegrationPosts(
      orgId,
      integrationId
    );
  }

  upsertRule(orgId: string, integrationId: string, body: CommentAutomationRuleDto) {
    return this._commentAutomationRepository.upsertRule(orgId, integrationId, body);
  }

  deleteRule(orgId: string, ruleId: string) {
    return this._commentAutomationRepository.deleteRule(orgId, ruleId);
  }

  reorder(orgId: string, integrationId: string, orderedIds: string[]) {
    return this._commentAutomationRepository.reorder(orgId, integrationId, orderedIds);
  }

  // Appends a copy of every rule on `sourceIntegrationId` to each target
  // integration's own list. Every target is re-checked against `orgId`
  // here, not just trusted from the request body - without this, a caller
  // could pass another organization's integration id as a target and have
  // our rule text start auto-replying on a channel we don't own.
  async copyRulesToIntegrations(
    orgId: string,
    sourceIntegrationId: string,
    targetIntegrationIds: string[]
  ) {
    const sourceRules = await this._commentAutomationRepository.getRules(
      orgId,
      sourceIntegrationId
    );

    if (!sourceRules.length) {
      return { copied: 0 };
    }

    let copied = 0;
    for (const targetIntegrationId of targetIntegrationIds) {
      if (targetIntegrationId === sourceIntegrationId) continue;

      const target = await this._integrationService.getIntegrationById(
        orgId,
        targetIntegrationId
      );
      if (!target) continue;

      await this._commentAutomationRepository.copyRulesToIntegration(
        orgId,
        targetIntegrationId,
        sourceRules
      );
      copied++;
    }

    return { copied };
  }

  // Called once per incoming comment, from the comment-automation Temporal
  // activity. Dedup-safe: a repeated call for the same (integrationId,
  // providerCommentId) pair is a guaranteed no-op, even across retries.
  async processIncomingComment(
    integration: Integration,
    providerCommentId: string,
    commentText: string,
    providerPostId?: string
  ) {
    const created = await this._commentAutomationRepository.createProcessedComment({
      integrationId: integration.id,
      providerCommentId,
    });

    if (!created) {
      return { alreadyProcessed: true };
    }

    const rules = await this._commentAutomationRepository.getActiveRulesForIntegration(
      integration.id,
      'COMMENT',
      providerPostId
    );
    const rule = matchComment(rules, commentText);

    if (!rule) {
      await this._commentAutomationRepository.updateProcessedComment(created.id, {});
      return { matched: false };
    }

    const provider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    let error: string | null = null;
    let publicReplySentAt: Date | undefined;
    let privateReplySentAt: Date | undefined;

    // A real commenter name isn't threaded through the Temporal workflow
    // yet (no rule needs it today - adding it later means a V3 workflow,
    // per this project's rule against changing an already-shipped one's
    // activity parameters). applyNamePlaceholder(..., undefined) still runs
    // so a stray {name} in a template degrades to "no name" instead of
    // leaking the literal placeholder text into a sent reply.
    const publicReplyText = applyNamePlaceholder(pickReplyVariant(rule.publicReply) || '', undefined) || null;
    const privateReplyText = applyNamePlaceholder(pickReplyVariant(rule.privateReply) || '', undefined) || null;

    if (publicReplyText) {
      try {
        await provider.comment?.(
          integration.internalId,
          providerCommentId,
          providerCommentId,
          integration.token,
          [{ id: providerCommentId, message: publicReplyText, settings: {} }],
          integration
        );
        publicReplySentAt = new Date();
      } catch (err: any) {
        error = `public reply failed: ${err?.message || err}`;
      }
    }

    if (privateReplyText && provider.privateReply) {
      try {
        await provider.privateReply(integration, providerCommentId, privateReplyText);
        privateReplySentAt = new Date();
      } catch (err: any) {
        error = [error, `private reply failed: ${err?.message || err}`]
          .filter(Boolean)
          .join('; ');
      }
    }

    await this._commentAutomationRepository.updateProcessedComment(created.id, {
      ruleId: rule.id,
      publicReplySentAt,
      privateReplySentAt,
      error,
    });

    return { matched: true, ruleId: rule.id, error };
  }

  // Called once per inbound Instagram/Messenger direct message, mirroring
  // processIncomingComment but on the DIRECT_MESSAGE rule set: no public
  // reply concept, and the reply goes out as a normal message (not a
  // comment-linked private reply, so none of Meta's once-per-comment/7-day
  // limits apply here).
  async processIncomingDirectMessage(
    integration: Integration,
    senderId: string,
    messageId: string,
    messageText: string
  ) {
    const created = await this._commentAutomationRepository.createProcessedComment({
      integrationId: integration.id,
      providerCommentId: messageId,
    });

    if (!created) {
      return { alreadyProcessed: true };
    }

    const rules = await this._commentAutomationRepository.getActiveRulesForIntegration(
      integration.id,
      'DIRECT_MESSAGE'
    );
    const rule = matchComment(rules, messageText);

    if (!rule) {
      await this._commentAutomationRepository.updateProcessedComment(created.id, {});
      return { matched: false };
    }

    const provider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    let error: string | null = null;
    let privateReplySentAt: Date | undefined;
    // Messenger/Instagram DM webhook events never carry a sender name (see
    // extractDirectMessageEvents) - always undefined here, same safety net
    // as the comment path above.
    const replyText = applyNamePlaceholder(pickReplyVariant(rule.privateReply) || '', undefined) || null;

    if (replyText && provider.sendDirectMessage) {
      try {
        await provider.sendDirectMessage(integration, senderId, replyText);
        privateReplySentAt = new Date();
      } catch (err: any) {
        error = `direct message reply failed: ${err?.message || err}`;
      }
    }

    await this._commentAutomationRepository.updateProcessedComment(created.id, {
      ruleId: rule.id,
      privateReplySentAt,
      error,
    });

    return { matched: true, ruleId: rule.id, error };
  }

  verifySignature(rawBody: Buffer | undefined, signatureHeader: string | undefined) {
    return verifyMetaWebhookSignature(
      rawBody,
      signatureHeader,
      process.env.FACEBOOK_APP_SECRET
    );
  }

  async handleWebhookPayload(payload: any) {
    const commentEvents = extractCommentEvents(payload);

    for (const event of commentEvents) {
      const integration = await this._integrationService.findActiveIntegrationByInternalId(
        event.pageOrIgId,
        META_WEBHOOK_PROVIDER_IDENTIFIERS
      );

      if (!integration) continue;

      await this.triggerProcessing(
        integration.id,
        event.providerCommentId,
        event.commentText,
        event.providerPostId
      );
    }

    const directMessageEvents = extractDirectMessageEvents(payload);

    for (const event of directMessageEvents) {
      const integration = await this._integrationService.findActiveIntegrationByInternalId(
        event.pageOrIgId,
        META_WEBHOOK_PROVIDER_IDENTIFIERS
      );

      if (!integration) continue;

      await this.triggerDirectMessageProcessing(
        integration.id,
        event.senderId,
        event.messageId,
        event.messageText
      );
    }
  }

  // One-shot Temporal workflow per comment. The workflow id is derived from
  // the comment id, so a duplicate webhook delivery racing to start the same
  // workflow is rejected by Temporal itself - a second, free dedup layer on
  // top of the ProcessedComment unique constraint.
  //
  // Starts commentAutomationWorkflowV2, not the original commentAutomationWorkflow:
  // post-scoped rules needed one more argument (providerPostId), and per this
  // project's workflow rule, an already-shipped workflow's activity
  // parameters can never change - a new version instead of touching v1.
  async triggerProcessing(
    integrationId: string,
    providerCommentId: string,
    commentText: string,
    providerPostId?: string
  ) {
    try {
      await this._temporalService.client
        .getRawClient()
        ?.workflow.start('commentAutomationWorkflowV2', {
          workflowId: `comment-automation-${integrationId}-${providerCommentId}`,
          taskQueue: 'main',
          args: [{ integrationId, providerCommentId, commentText, providerPostId }],
        });
    } catch (err) {
      // WorkflowExecutionAlreadyStartedError on a webhook retry is expected, not a failure
    }
  }

  // One-shot Temporal workflow per inbound direct message, same dedup
  // reasoning as triggerProcessing but keyed by message id instead of
  // comment id, and routed to the separate directMessageAutomationWorkflow
  // (kept apart from commentAutomationWorkflow per the project's workflow
  // versioning rule - two genuinely different event types, not a
  // parameter tweak of the existing one).
  async triggerDirectMessageProcessing(
    integrationId: string,
    senderId: string,
    messageId: string,
    messageText: string
  ) {
    try {
      await this._temporalService.client
        .getRawClient()
        ?.workflow.start('directMessageAutomationWorkflow', {
          workflowId: `direct-message-automation-${integrationId}-${messageId}`,
          taskQueue: 'main',
          args: [{ integrationId, senderId, messageId, messageText }],
        });
    } catch (err) {
      // WorkflowExecutionAlreadyStartedError on a webhook retry is expected, not a failure
    }
  }
}
