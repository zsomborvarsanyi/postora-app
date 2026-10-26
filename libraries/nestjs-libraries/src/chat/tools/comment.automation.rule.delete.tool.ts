import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { CommentAutomationService } from '@gitroom/nestjs-libraries/database/prisma/comment-automation/comment-automation.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class CommentAutomationRuleDeleteTool implements AgentToolInterface {
  constructor(private _commentAutomationService: CommentAutomationService) {}
  name = 'commentAutomationRuleDelete';

  run() {
    return createTool({
      id: 'commentAutomationRuleDelete',
      mcp: {
        annotations: {
          title: 'Delete A Comment Automation Rule',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      description: `Delete a comment/DM automation rule by its id (use commentAutomationRulesList to find it). This is permanent - double-check with the user before calling this.`,
      inputSchema: z.object({
        id: z.string().describe('The id of the rule to delete'),
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

        const rule = await this._commentAutomationService.deleteRule(
          organizationId,
          inputData.id
        );

        return { output: { id: rule.id } };
      },
    });
  }
}
