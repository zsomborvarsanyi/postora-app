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
}
