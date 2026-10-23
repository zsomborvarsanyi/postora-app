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
} from '@gitroom/nestjs-libraries/database/prisma/comment-automation/comment-automation.match';
import {
  verifyMetaWebhookSignature,
  extractCommentEvents,
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

  upsertRule(orgId: string, integrationId: string, body: CommentAutomationRuleDto) {
    return this._commentAutomationRepository.upsertRule(orgId, integrationId, body);
  }

  deleteRule(orgId: string, ruleId: string) {
    return this._commentAutomationRepository.deleteRule(orgId, ruleId);
  }

  reorder(orgId: string, integrationId: string, orderedIds: string[]) {
    return this._commentAutomationRepository.reorder(orgId, integrationId, orderedIds);
  }

  // Called once per incoming comment, from the comment-automation Temporal
  // activity. Dedup-safe: a repeated call for the same (integrationId,
  // providerCommentId) pair is a guaranteed no-op, even across retries.
  async processIncomingComment(
    integration: Integration,
    providerCommentId: string,
    commentText: string
  ) {
    const created = await this._commentAutomationRepository.createProcessedComment({
      integrationId: integration.id,
      providerCommentId,
    });

    if (!created) {
      return { alreadyProcessed: true };
    }

    const rules = await this._commentAutomationRepository.getActiveRulesForIntegration(
      integration.id
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

    if (rule.publicReply) {
      try {
        await provider.comment?.(
          integration.internalId,
          providerCommentId,
          providerCommentId,
          integration.token,
          [{ id: providerCommentId, message: rule.publicReply, settings: {} }],
          integration
        );
        publicReplySentAt = new Date();
      } catch (err: any) {
        error = `public reply failed: ${err?.message || err}`;
      }
    }

    if (rule.privateReply && provider.privateReply) {
      try {
        await provider.privateReply(integration, providerCommentId, rule.privateReply);
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

  verifySignature(rawBody: Buffer | undefined, signatureHeader: string | undefined) {
    return verifyMetaWebhookSignature(
      rawBody,
      signatureHeader,
      process.env.FACEBOOK_APP_SECRET
    );
  }

  async handleWebhookPayload(payload: any) {
    const events = extractCommentEvents(payload);

    for (const event of events) {
      const integration = await this._integrationService.findActiveIntegrationByInternalId(
        event.pageOrIgId,
        META_WEBHOOK_PROVIDER_IDENTIFIERS
      );

      if (!integration) continue;

      await this.triggerProcessing(
        integration.id,
        event.providerCommentId,
        event.commentText
      );
    }
  }

  // One-shot Temporal workflow per comment. The workflow id is derived from
  // the comment id, so a duplicate webhook delivery racing to start the same
  // workflow is rejected by Temporal itself - a second, free dedup layer on
  // top of the ProcessedComment unique constraint.
  async triggerProcessing(
    integrationId: string,
    providerCommentId: string,
    commentText: string
  ) {
    try {
      await this._temporalService.client
        .getRawClient()
        ?.workflow.start('commentAutomationWorkflow', {
          workflowId: `comment-automation-${integrationId}-${providerCommentId}`,
          taskQueue: 'main',
          args: [{ integrationId, providerCommentId, commentText }],
        });
    } catch (err) {
      // WorkflowExecutionAlreadyStartedError on a webhook retry is expected, not a failure
    }
  }
}
