import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { CommentAutomationService } from '@gitroom/nestjs-libraries/database/prisma/comment-automation/comment-automation.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

const parseJsonArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

@Injectable()
export class CommentAutomationRulesListTool implements AgentToolInterface {
  constructor(private _commentAutomationService: CommentAutomationService) {}
  name = 'commentAutomationRulesList';

  run() {
    return createTool({
      id: 'commentAutomationRulesList',
      mcp: {
        annotations: {
          title: 'List Comment Automation Rules',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      description: `
List every comment/DM automation rule configured on one integration (channel), active or not.
A COMMENT rule reacts to a comment under a post and can send a public reply and/or a comment-linked private reply (DM).
A DIRECT_MESSAGE rule reacts to an inbound Messenger/Instagram DM and replies as a normal message.
"providerPostId" null means the rule applies to every comment on the whole channel; set means it only applies to that one post (a post-specific rule wins over a channel-wide one).
`,
      inputSchema: z.object({
        integrationId: z
          .string()
          .describe('The id of the integration (channel) from integrationList'),
      }),
      outputSchema: z.object({
        output: z.array(
          z.object({
            id: z.string(),
            order: z.number(),
            active: z.boolean(),
            triggerSource: z.enum(['COMMENT', 'DIRECT_MESSAGE']),
            providerPostId: z.string().nullable(),
            matchType: z.enum(['CONTAINS', 'REGEX', 'EXACT']),
            triggers: z.array(z.string()),
            publicReply: z.array(z.string()),
            privateReply: z.array(z.string()),
          })
        ),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        const rules = await this._commentAutomationService.getRules(
          organizationId,
          inputData.integrationId
        );

        return {
          output: rules.map((rule) => ({
            id: rule.id,
            order: rule.order,
            active: rule.active,
            triggerSource: rule.triggerSource,
            providerPostId: rule.providerPostId,
            matchType: rule.matchType,
            triggers: parseJsonArray(rule.triggers),
            publicReply: parseJsonArray(rule.publicReply),
            privateReply: parseJsonArray(rule.privateReply),
          })),
        };
      },
    });
  }
}
