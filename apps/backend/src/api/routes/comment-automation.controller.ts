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

@ApiTags('Comment Automation')
@Controller('/comment-automation')
export class CommentAutomationController {
  constructor(
    private _commentAutomationService: CommentAutomationService,
    private _lonLinkService: LonLinkService
  ) {}

  // LON-specific authoring-time helper, not org-gated per the user's
  // explicit instruction - harmless if unused by other orgs, and avoids
  // building unnecessary multi-tenant plumbing for a single-customer need.
  @Get('/lon/options')
  async getLonLinkOptions() {
    return this._lonLinkService.getOptions();
  }

  @Post('/lon/generate-link')
  async generateLonLink(@Body() body: GenerateLonLinkDto) {
    const shortUrl = await this._lonLinkService.generateLink(body);
    return { shortUrl };
  }

  @Get('/:integrationId/posts')
  async getIntegrationPosts(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string
  ) {
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
    return this._commentAutomationService.getRules(org.id, integrationId);
  }

  @Post('/:integrationId/rules')
  async createRule(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Body() body: CommentAutomationRuleDto
  ) {
    return this._commentAutomationService.upsertRule(org.id, integrationId, body);
  }

  @Put('/:integrationId/rules/:ruleId')
  async updateRule(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: CommentAutomationRuleDto
  ) {
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
    return this._commentAutomationService.deleteRule(org.id, ruleId);
  }

  @Put('/:integrationId/rules/reorder')
  async reorderRules(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Body() body: ReorderCommentAutomationRulesDto
  ) {
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
    return this._commentAutomationService.copyRulesToIntegrations(
      org.id,
      integrationId,
      body.targetIntegrationIds
    );
  }
}
