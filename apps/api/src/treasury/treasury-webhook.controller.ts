import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { MonnifyWebhookSignatureGuard } from '../claims/payout/monnify-webhook-signature.guard';
import { TreasurySettlementService } from './treasury-settlement.service';

type MonnifySettlementWebhook = {
  eventType?: string;
  eventData?: {
    amount?: string | number;
    settlementTime?: string;
    settlementReference?: string;
    destinationAccountNumber?: string;
    destinationBankName?: string;
    destinationAccountName?: string;
    transactionsCount?: number;
  };
};

@Controller('webhooks/monnify')
export class TreasuryWebhookController {
  constructor(
    private readonly settlements: TreasurySettlementService,
  ) {}

  @Post('settlement')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MonnifyWebhookSignatureGuard)
  async handleSettlement(
    @Body() body: MonnifySettlementWebhook,
  ) {
    if (
      body.eventType
        ?.trim()
        .toUpperCase() !==
      'SETTLEMENT'
    ) {
      return {
        received: true,
        ignored: true,
      };
    }

    if (!body.eventData) {
      return {
        received: true,
        ignored: true,
        reason: 'Missing settlement event data',
      };
    }

    const result =
      await this.settlements.ingestMonnifySettlement(
        body.eventData,
      );

    return {
      received: true,
      settlementId: result.settlementId,
      ledgerTxnId: result.ledgerTxnId,
      status: result.status,
    };
  }
}
