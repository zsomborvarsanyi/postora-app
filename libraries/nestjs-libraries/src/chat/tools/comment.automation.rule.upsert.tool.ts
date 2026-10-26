import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { CommentAutomationService } from '@gitroom/nestjs-libraries/database/prisma/comment-automation/comment-automation.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class CommentAutomationRuleUpsertTool implements AgentToolInterface {
  constructor(private _commentAutomationService: CommentAutomationService) {}
  name = 'commentAutomationRuleUpsert';

  run() {
    return createTool({
      id: 'commentAutomationRuleUpsert',
      mcp: {
        annotations: {
          title: 'Create Or Update A Comment Automation Rule',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      description: `
Create a new comment/DM automation rule on one integration (channel), or update an existing one if "id" is passed (use commentAutomationRulesList to find an existing rule's id).
triggerSource COMMENT reacts to a comment under a post: publicReply is posted as a visible reply, privateReply is sent as a comment-linked DM. triggerSource DIRECT_MESSAGE reacts to an inbound Messenger/Instagram DM: only privateReply is used, sent back as a normal message.
providerPostId scopes the rule to one specific post (get it from commentAutomationPostsList's "releaseId") - omit it for the default, whole-channel behavior. A post-specific rule always wins over a channel-wide rule on the same channel for the same comment.
matchType CONTAINS: the comment/message contains any of the "triggers" phrases anywhere in the text. EXACT: the whole comment/message has to be literally just one of the "triggers" phrases, nothing else. REGEX: pass exactly one pattern in "triggers" (only the first entry is used).
publicReply/privateReply can hold several wording variants; one is picked at random each time the rule fires, so repeated matches don't all get identical wording. A literal "{name}" placeholder in a reply is replaced with the commenter's name when known, or dropped otherwise.
`,
      inputSchema: z.object({
        integrationId: z
          .string()
          .describe('The id of the integration (channel) from integrationList'),
        id: z
          .string()
          .optional()
          .describe('Omit to create a new rule; pass an existing rule id to update it'),
        active: z.boolean().describe('Whether the rule is currently enabled'),
        triggerSource: z
          .enum(['COMMENT', 'DIRECT_MESSAGE'])
          .describe('What this rule reacts to'),
        providerPostId: z
          .string()
          .optional()
          .describe(
            'Scopes the rule to one specific post (releaseId from commentAutomationPostsList). Omit for the whole-channel default.'
          ),
        matchType: z
          .enum(['CONTAINS', 'REGEX', 'EXACT'])
          .describe('How the "triggers" phrases below are matched'),
        triggers: z
          .array(z.string())
          .max(50)
          .describe(
            'Phrases to match (plain text for CONTAINS/EXACT, or a single regex pattern as the only entry for REGEX)'
          ),
        publicReply: z
          .array(z.string())
          .max(10)
          .optional()
          .describe(
            'Visible comment-reply wording variants (COMMENT rules only, ignored for DIRECT_MESSAGE)'
          ),
        privateReply: z
          .array(z.string())
          .max(10)
          .optional()
          .describe('Private/DM reply wording variants'),
      }),
      outputSchema: z.object({
        output: z.object({
          id: z.string(),
        }),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        const rule = await this._commentAutomationService.upsertRule(
          organizationId,
          inputData.integrationId,
          {
            id: inputData.id,
            active: inputData.active,
            triggerSource: inputData.triggerSource as any,
            providerPostId: inputData.providerPostId,
            matchType: inputData.matchType as any,
            triggers: inputData.triggers,
            publicReply: inputData.publicReply,
            privateReply: inputData.privateReply,
          }
        );

        return { output: { id: rule.id } };
      },
    });
  }
}
