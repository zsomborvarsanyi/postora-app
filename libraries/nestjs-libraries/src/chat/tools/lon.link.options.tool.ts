import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { LonLinkService } from '@gitroom/nestjs-libraries/database/prisma/comment-automation/lon-link.service';

@Injectable()
export class LonLinkOptionsTool implements AgentToolInterface {
  constructor(private _lonLinkService: LonLinkService) {}
  name = 'lonLinkOptions';

  run() {
    return createTool({
      id: 'lonLinkOptions',
      mcp: {
        annotations: {
          title: 'List LON Link Options',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      description: `
LON-specific (theluxuryofnature brand) helper, not relevant for other organizations. Lists the live landing pages, products and sponsors LON can mint a trackable short link for.
Use the returned "slug"/"sku"/"id" values with lonLinkGenerate.
`,
      inputSchema: z.object({}),
      outputSchema: z.object({
        output: z.object({
          landingPages: z.array(z.object({ slug: z.string(), label: z.string() })),
          products: z.array(
            z.object({ sku: z.string(), name: z.string(), brand: z.string() })
          ),
          sponsors: z.array(z.object({ id: z.number(), name: z.string() })),
        }),
      }),
      execute: async () => {
        return { output: await this._lonLinkService.getOptions() };
      },
    });
  }
}
