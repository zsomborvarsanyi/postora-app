import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { CommentAutomationService } from '@gitroom/nestjs-libraries/database/prisma/comment-automation/comment-automation.service';

@Injectable()
@Activity()
export class CommentAutomationActivity {
  constructor(
    private _integrationService: IntegrationService,
    private _commentAutomationService: CommentAutomationService
  ) {}

  @ActivityMethod()
  async processIncomingComment(
    integrationId: string,
    providerCommentId: string,
    commentText: string
  ) {
    const integration = await this._integrationService.getIntegrationByIdOnly(
      integrationId
    );

    if (!integration) {
      return { skipped: true, reason: 'integration not found' };
    }

    return this._commentAutomationService.processIncomingComment(
      integration,
      providerCommentId,
      commentText
    );
  }

  // v2: adds providerPostId for post-scoped rules. Kept as a separate
  // method/activity rather than changing processIncomingComment above -
  // this project's workflow rule forbids changing an already-shipped
  // activity's parameters, since that breaks replay determinism for any
  // still-in-flight execution.
  @ActivityMethod()
  async processIncomingCommentV2(
    integrationId: string,
    providerCommentId: string,
    commentText: string,
    providerPostId?: string
  ) {
    const integration = await this._integrationService.getIntegrationByIdOnly(
      integrationId
    );

    if (!integration) {
      return { skipped: true, reason: 'integration not found' };
    }

    return this._commentAutomationService.processIncomingComment(
      integration,
      providerCommentId,
      commentText,
      providerPostId
    );
  }

  @ActivityMethod()
  async processIncomingDirectMessage(
    integrationId: string,
    senderId: string,
    messageId: string,
    messageText: string
  ) {
    const integration = await this._integrationService.getIntegrationByIdOnly(
      integrationId
    );

    if (!integration) {
      return { skipped: true, reason: 'integration not found' };
    }

    return this._commentAutomationService.processIncomingDirectMessage(
      integration,
      senderId,
      messageId,
      messageText
    );
  }
}
