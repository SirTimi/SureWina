import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FlutterwaveHashGuard } from './flutterwave-hash.guard';
import { FlutterwaveWebhookService } from './flutterwave-webhook.service';

@Controller('webhooks/flutterwave')
export class FlutterwaveWebhookController {
  constructor(private readonly webhookService: FlutterwaveWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(FlutterwaveHashGuard)
  async handle(@Body() body: unknown) {
    await this.webhookService.handle(body as never);
    return { received: true };
  }
}