import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { CommentAutomationService } from '@gitroom/nestjs-libraries/database/prisma/comment-automation/comment-automation.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class CommentAutomationRuleCopyTool implements AgentToolInterface {
  constructor(private _commentAutomationService: CommentAutomationService) {}
  name = 'commentAutomationRuleCopy';

  run() {
    return createTool({
      id: 'commentAutomationRuleCopy',
      mcp: {
        annotations: {
          title: 'Copy Comment Automation Rules To Other Channels',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      description: `
Appends a copy of every current rule on "integrationId" to each channel in "targetIntegrationIds". Existing rules on those target channels are kept, not replaced.
A copied rule always lands channel-wide on the target (providerPostId is dropped) - a source post id only exists on the source channel.
`,
      inputSchema: z.object({
        integrationId: z
          .string()
          .describe('The source integration (channel) id whose rules get copied'),
        targetIntegrationIds: z
          .array(z.string())
          .max(50)
          .describe('Target integration (channel) ids to append the copies to'),
      }),
      outputSchema: z.object({
        output: z.object({ copied: z.number() }),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        const result = await this._commentAutomationService.copyRulesToIntegrations(
          organizationId,
          inputData.integrationId,
          inputData.targetIntegrationIds
        );

        return { output: result };
      },
    });
  }
}
