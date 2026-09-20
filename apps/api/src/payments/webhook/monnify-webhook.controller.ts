import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { MonnifyWebhookSignatureGuard } from '../../claims/payout/monnify-webhook-signature.guard';
import { MonnifyWebhookService } from './monnify-webhook.service';

@Controller('webhooks/monnify')
export class MonnifyWebhookController {
  constructor(
    private readonly webhook:
      MonnifyWebhookService,
  ) {}

  @Post('collections')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    MonnifyWebhookSignatureGuard,
  )
  async handle(
    @Body()
    body: unknown,
  ) {
    await this.webhook.handle(
      body as never,
    );

    return {
      received: true,
    };
  }
}
