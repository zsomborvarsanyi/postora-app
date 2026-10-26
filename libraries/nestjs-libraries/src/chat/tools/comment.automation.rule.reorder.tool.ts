import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { CommentAutomationService } from '@gitroom/nestjs-libraries/database/prisma/comment-automation/comment-automation.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class CommentAutomationRuleReorderTool implements AgentToolInterface {
  constructor(private _commentAutomationService: CommentAutomationService) {}
  name = 'commentAutomationRuleReorder';

  run() {
    return createTool({
      id: 'commentAutomationRuleReorder',
      mcp: {
        annotations: {
          title: 'Reorder Comment Automation Rules',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      description: `
Set the match order of every rule on one integration (channel). The first match wins, so rules earlier in "orderedIds" are tried first.
"orderedIds" must contain every rule id currently on that channel (from commentAutomationRulesList), in the desired order - leaving one out does not delete it, but its order becomes undefined relative to the others.
`,
      inputSchema: z.object({
        integrationId: z
          .string()
          .describe('The id of the integration (channel) from integrationList'),
        orderedIds: z
          .array(z.string())
          .describe('Every rule id on this channel, in the desired match order'),
      }),
      outputSchema: z.object({
        output: z.object({ success: z.boolean() }),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        const result = await this._commentAutomationService.reorder(
          organizationId,
          inputData.integrationId,
          inputData.orderedIds
        );

        return { output: result };
      },
    });
  }
}
