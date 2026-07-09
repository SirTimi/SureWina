import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PaystackSignatureGuard } from './paystack-signature.guard';
import { PaystackWebhookService } from './paystack-webhook.service';

@Controller('webhooks/paystack')
export class PaystackWebhookController {
  constructor(private readonly webhookService: PaystackWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(PaystackSignatureGuard)
  async handle(@Body() body: unknown) {
    await this.webhookService.handle(body as never);
    return { received: true };
  }
}