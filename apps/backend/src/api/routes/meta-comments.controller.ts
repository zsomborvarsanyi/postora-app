import {
  Controller,
  Get,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { CommentAutomationService } from '@gitroom/nestjs-libraries/database/prisma/comment-automation/comment-automation.service';

// Inbound Meta webhook: deliberately NOT in api.module.ts's
// authenticatedController list, same pattern as StripeController. Meta
// authenticates itself via the handshake (GET) and the signature header
// (POST), not via a Postora session.
@ApiTags('Meta Comments Webhook')
@Controller('/meta/comments-webhook')
export class MetaCommentsWebhookController {
  constructor(private _commentAutomationService: CommentAutomationService) {}

  @Get('/')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response
  ) {
    if (
      mode === 'subscribe' &&
      !!process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN &&
      token === process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN
    ) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send('Forbidden');
  }

  @Post('/')
  async receive(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    if (!this._commentAutomationService.verifySignature(req.rawBody, signature)) {
      return res.status(403).send('Invalid signature');
    }

    // Ack immediately - Meta expects a fast 200 and will retry (with
    // backoff, then eventually disable the subscription) if it doesn't get
    // one. The actual Graph API calls happen later, in a Temporal workflow.
    res.status(200).send('EVENT_RECEIVED');

    try {
      const payload = JSON.parse(req.rawBody!.toString('utf8'));
      await this._commentAutomationService.handleWebhookPayload(payload);
    } catch (err) {
      // already acked to Meta, nothing more to do here on failure
    }
  }
}
