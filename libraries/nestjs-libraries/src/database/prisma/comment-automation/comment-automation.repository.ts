import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { CommentAutomationRuleDto } from '@gitroom/nestjs-libraries/dtos/comment-automation/comment-automation.dto';

@Injectable()
export class CommentAutomationRepository {
  constructor(
    private _rules: PrismaRepository<'commentAutomationRule'>,
    private _processedComments: PrismaRepository<'processedComment'>
  ) {}

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

  getActiveRulesForIntegration(integrationId: string) {
    return this._rules.model.commentAutomationRule.findMany({
      where: {
        integrationId,
        active: true,
        deletedAt: null,
      },
      orderBy: { order: 'asc' },
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
          matchType: body.matchType,
          triggers: JSON.stringify(body.triggers),
          publicReply: body.publicReply || null,
          privateReply: body.privateReply || null,
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
        matchType: body.matchType,
        triggers: JSON.stringify(body.triggers),
        publicReply: body.publicReply || null,
        privateReply: body.privateReply || null,
      },
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
