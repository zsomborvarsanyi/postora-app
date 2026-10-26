import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { CommentAutomationService } from '@gitroom/nestjs-libraries/database/prisma/comment-automation/comment-automation.service';
import { LonLinkService } from '@gitroom/nestjs-libraries/database/prisma/comment-automation/lon-link.service';
import {
  CommentAutomationRuleDto,
  CopyCommentAutomationRulesDto,
  GenerateLonLinkDto,
  ReorderCommentAutomationRulesDto,
} from '@gitroom/nestjs-libraries/dtos/comment-automation/comment-automation.dto';
import * as Sentry from '@sentry/nestjs';

// Public-API-key mirror of CommentAutomationController (session-auth only).
// Same service calls, same DTOs, same routes/verbs under /public/v1/comment-automation
// so an API-key-only caller (script, n8n, cron) can manage comment-automation
// rules exactly like the dashboard does.
@ApiTags('Public API')
@Controller('/public/v1/comment-automation')
export class PublicCommentAutomationController {
  constructor(
    private _commentAutomationService: CommentAutomationService,
    private _lonLinkService: LonLinkService
  ) {}

  @Get('/lon/options')
  async getLonLinkOptions() {
    Sentry.metrics.count('public_api-request', 1);
    return this._lonLinkService.getOptions();
  }

  @Post('/lon/generate-link')
  async generateLonLink(@Body() body: GenerateLonLinkDto) {
    Sentry.metrics.count('public_api-request', 1);
    const shortUrl = await this._lonLinkService.generateLink(body);
    return { shortUrl };
  }

  @Get('/:integrationId/posts')
  async getIntegrationPosts(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._commentAutomationService.getIntegrationPosts(
      org.id,
      integrationId
    );
  }

  @Get('/:integrationId/rules')
  async getRules(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._commentAutomationService.getRules(org.id, integrationId);
  }

  @Post('/:integrationId/rules')
  async createRule(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Body() body: CommentAutomationRuleDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._commentAutomationService.upsertRule(org.id, integrationId, body);
  }

  @Put('/:integrationId/rules/:ruleId')
  async updateRule(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: CommentAutomationRuleDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._commentAutomationService.upsertRule(org.id, integrationId, {
      ...body,
      id: ruleId,
    });
  }

  @Delete('/:integrationId/rules/:ruleId')
  async deleteRule(
    @GetOrgFromRequest() org: Organization,
    @Param('ruleId') ruleId: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._commentAutomationService.deleteRule(org.id, ruleId);
  }

  @Put('/:integrationId/rules/reorder')
  async reorderRules(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Body() body: ReorderCommentAutomationRulesDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._commentAutomationService.reorder(
      org.id,
      integrationId,
      body.orderedIds
    );
  }

  @Post('/:integrationId/rules/copy-to')
  async copyRulesToOtherChannels(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Body() body: CopyCommentAutomationRulesDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._commentAutomationService.copyRulesToIntegrations(
      org.id,
      integrationId,
      body.targetIntegrationIds
    );
  }
}
