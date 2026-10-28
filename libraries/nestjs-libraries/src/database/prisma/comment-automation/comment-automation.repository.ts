import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { CommentAutomationRuleDto } from '@gitroom/nestjs-libraries/dtos/comment-automation/comment-automation.dto';
import { CommentAutomationRule, RuleTriggerSource } from '@prisma/client';

@Injectable()
export class CommentAutomationRepository {
  constructor(
    private _rules: PrismaRepository<'commentAutomationRule'>,
    private _processedComments: PrismaRepository<'processedComment'>,
    private _posts: PrismaRepository<'post'>
  ) {}

  // Feeds the rule editor's "scope to one specific post" picker. Purpose-
  // built here rather than reusing the general-purpose posts list/calendar
  // endpoints (which paginate by date range or by page, not by integration,
  // and this only ever needs a short, most-recent-first list for one
  // channel) - releaseId is the platform's own post id, the same value the
  // Meta webhook sends as providerPostId, which is what a rule is actually
  // matched against.
  getIntegrationPosts(orgId: string, integrationId: string) {
    return this._posts.model.post.findMany({
      where: {
        organizationId: orgId,
        integrationId,
        deletedAt: null,
        releaseId: { not: null },
      },
      select: {
        id: true,
        releaseId: true,
        content: true,
        publishDate: true,
      },
      orderBy: { publishDate: 'desc' },
      take: 50,
    });
  }

  getRules(orgId: string, integrationId: string) {
    return this._rules.model.commentAutomationRule.findMany({
      where: {
        organizationId: orgId,
        integrationId,
        deletedAt: null,
      },
      orderBy: { order: 'asc' },
    });
  }

  // A post-specific rule (providerPostId set, matching the comment's own
  // post) always wins over a channel-wide rule (providerPostId null) for
  // the same channel - two queries, concatenated in that precedence,
  // because matchComment() just picks the first match in array order.
  async getActiveRulesForIntegration(
    integrationId: string,
    triggerSource: RuleTriggerSource,
    providerPostId?: string
  ) {
    const postSpecific = providerPostId
      ? await this._rules.model.commentAutomationRule.findMany({
          where: {
            integrationId,
            triggerSource,
            providerPostId,
            active: true,
            deletedAt: null,
          },
          orderBy: { order: 'asc' },
        })
      : [];

    const channelWide = await this._rules.model.commentAutomationRule.findMany({
      where: {
        integrationId,
        triggerSource,
        providerPostId: null,
        active: true,
        deletedAt: null,
      },
      orderBy: { order: 'asc' },
    });

    return [...postSpecific, ...channelWide];
  }

  // Used by the publish-time activation hook (PostsService.updatePost) to
  // decide whether a post's commentRule should update an already-activated
  // rule or create a fresh one - a post only ever has one commentRule, so
  // (integrationId, providerPostId) is a sufficient key, backed by the
  // @@index([integrationId, providerPostId, active, order]) index.
  findRuleByProviderPost(integrationId: string, providerPostId: string) {
    return this._rules.model.commentAutomationRule.findFirst({
      where: { integrationId, providerPostId, deletedAt: null },
    });
  }

  async upsertRule(
    orgId: string,
    integrationId: string,
    body: CommentAutomationRuleDto
  ) {
    if (body.id) {
      return this._rules.model.commentAutomationRule.update({
        where: { id: body.id, organizationId: orgId },
        data: {
          active: body.active,
          triggerSource: body.triggerSource,
          providerPostId: body.providerPostId || null,
          matchType: body.matchType,
          triggers: JSON.stringify(body.triggers),
          publicReply: body.publicReply ? JSON.stringify(body.publicReply) : null,
          privateReply: body.privateReply
            ? JSON.stringify(body.privateReply)
            : null,
        },
      });
    }

    const total = await this._rules.model.commentAutomationRule.count({
      where: { integrationId, deletedAt: null },
    });

    return this._rules.model.commentAutomationRule.create({
      data: {
        organizationId: orgId,
        integrationId,
        order: total,
        active: body.active,
        triggerSource: body.triggerSource,
        providerPostId: body.providerPostId || null,
        matchType: body.matchType,
        triggers: JSON.stringify(body.triggers),
        publicReply: body.publicReply ? JSON.stringify(body.publicReply) : null,
        privateReply: body.privateReply
          ? JSON.stringify(body.privateReply)
          : null,
      },
    });
  }

  // Used by "copy rules to other channels" - takes the source integration's
  // own rule rows as-is (triggers already stored as a JSON string, no
  // reparsing needed) and appends copies to the target integration's list
  // (existing rules on the target are untouched). providerPostId is
  // deliberately NOT in the Pick/mapping below: a source post id only
  // exists on the source channel, so every copy lands channel-wide
  // (providerPostId null) on the target rather than silently referencing a
  // post that may not even exist there.
  async copyRulesToIntegration(
    orgId: string,
    targetIntegrationId: string,
    sourceRules: Pick<
      CommentAutomationRule,
      | 'active'
      | 'triggerSource'
      | 'matchType'
      | 'triggers'
      | 'publicReply'
      | 'privateReply'
    >[]
  ) {
    const total = await this._rules.model.commentAutomationRule.count({
      where: { integrationId: targetIntegrationId, deletedAt: null },
    });

    await this._rules.model.commentAutomationRule.createMany({
      data: sourceRules.map((rule, index) => ({
        organizationId: orgId,
        integrationId: targetIntegrationId,
        order: total + index,
        active: rule.active,
        triggerSource: rule.triggerSource,
        matchType: rule.matchType,
        triggers: rule.triggers,
        publicReply: rule.publicReply,
        privateReply: rule.privateReply,
      })),
    });
  }

  deleteRule(orgId: string, ruleId: string) {
    return this._rules.model.commentAutomationRule.update({
      where: { id: ruleId, organizationId: orgId },
      data: { deletedAt: new Date() },
    });
  }

  async reorder(orgId: string, integrationId: string, orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, order) =>
        this._rules.model.commentAutomationRule.update({
          where: { id, organizationId: orgId, integrationId },
          data: { order },
        })
      )
    );

    return { success: true };
  }

  findProcessedComment(integrationId: string, providerCommentId: string) {
    return this._processedComments.model.processedComment.findUnique({
      where: { integrationId_providerCommentId: { integrationId, providerCommentId } },
    });
  }

  // Dedup guard: a Meta webhook retry re-sends the same comment id, so a second
  // insert attempt must be swallowed as "already handled", not surfaced as an error.
  async createProcessedComment(data: {
    integrationId: string;
    providerCommentId: string;
    ruleId?: string | null;
  }) {
    try {
      return await this._processedComments.model.processedComment.create({
        data,
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return null;
      }
      throw err;
    }
  }

  updateProcessedComment(
    id: string,
    data: {
      ruleId?: string | null;
      publicReplySentAt?: Date;
      privateReplySentAt?: Date;
      error?: string | null;
    }
  ) {
    return this._processedComments.model.processedComment.update({
      where: { id },
      data,
    });
  }
}
