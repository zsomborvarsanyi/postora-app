import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { LonLinkService } from '@gitroom/nestjs-libraries/database/prisma/comment-automation/lon-link.service';

@Injectable()
export class LonLinkGenerateTool implements AgentToolInterface {
  constructor(private _lonLinkService: LonLinkService) {}
  name = 'lonLinkGenerate';

  run() {
    return createTool({
      id: 'lonLinkGenerate',
      mcp: {
        annotations: {
          title: 'Generate A LON Tracked Link',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      description: `
LON-specific (theluxuryofnature brand) helper, not relevant for other organizations. Mints a real, trackable short link from LON for either a landing page or a product purchase page.
Use lonLinkOptions first to get valid "landingSlug"/"productSku"/"distributorId" values. The resulting short URL is meant to be dropped as plain text into a comment-automation rule's publicReply/privateReply (commentAutomationRuleUpsert) - each new video/post should get its own freshly generated link, never reuse one across posts.
`,
      inputSchema: z.object({
        type: z.enum(['landing', 'purchase']),
        landingSlug: z
          .string()
          .optional()
          .describe('Required when type is "landing" (from lonLinkOptions)'),
        productSku: z
          .string()
          .optional()
          .describe('Required when type is "purchase" (from lonLinkOptions)'),
        distributorId: z
          .number()
          .optional()
          .describe('Required when type is "purchase" (sponsor id from lonLinkOptions)'),
        source: z
          .string()
          .optional()
          .describe('UTM source, e.g. facebook, instagram, tiktok, email'),
        medium: z
          .string()
          .optional()
          .describe('UTM medium, e.g. komment, poszt, bio, story, privat_uzenet'),
        content: z.string().optional().describe('Free-text UTM content/slug'),
        campaign: z.string().optional().describe('Free-text UTM campaign'),
        label: z.string().optional().describe('Free-text internal label'),
      }),
      outputSchema: z.object({
        output: z.object({ shortUrl: z.string() }),
      }),
      execute: async (inputData) => {
        const shortUrl = await this._lonLinkService.generateLink(inputData);
        return { output: { shortUrl } };
      },
    });
  }
}
