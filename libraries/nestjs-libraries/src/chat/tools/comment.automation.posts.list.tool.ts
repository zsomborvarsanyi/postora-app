import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { CommentAutomationService } from '@gitroom/nestjs-libraries/database/prisma/comment-automation/comment-automation.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class CommentAutomationPostsListTool implements AgentToolInterface {
  constructor(private _commentAutomationService: CommentAutomationService) {}
  name = 'commentAutomationPostsList';

  run() {
    return createTool({
      id: 'commentAutomationPostsList',
      mcp: {
        annotations: {
          title: 'List Posts For Comment Automation',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      description: `
List the most recent published posts (up to 50, newest first) of one integration (channel), for picking the "providerPostId" used to scope a comment-automation rule to a single post.
Use integrationList first to find the integration id. Each item's "releaseId" is the value to pass as providerPostId in commentAutomationRuleUpsert.
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
            releaseId: z.string().nullable(),
            content: z.string(),
            publishDate: z.string(),
          })
        ),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        const posts = await this._commentAutomationService.getIntegrationPosts(
          organizationId,
          inputData.integrationId
        );

        return {
          output: posts.map((p) => ({
            id: p.id,
            releaseId: p.releaseId,
            content: p.content,
            publishDate: p.publishDate.toISOString(),
          })),
        };
      },
    });
  }
}
