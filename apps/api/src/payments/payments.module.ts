import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaystackDriver } from './gateway/paystack.driver';
import { FlutterwaveDriver } from './gateway/flutterwave.driver';
import { MonnifyDriver } from './gateway/monnify.driver';
import { PurchaseConfirmationService } from './purchase-confirmation.service';
import { JackpotAccumulationService } from './jackpot-accumulation.service';
import { PaystackWebhookController } from './webhook/paystack-webhook.controller';
import { MonnifyWebhookController } from './webhook/monnify-webhook.controller';
import { PaystackWebhookService } from './webhook/paystack-webhook.service';
import { MonnifyWebhookService } from './webhook/monnify-webhook.service';
import { PaystackSignatureGuard } from './webhook/paystack-signature.guard';
import { FlutterwaveWebhookController } from './webhook/flutterwave-webhook.controller';
import { FlutterwaveWebhookService } from './webhook/flutterwave-webhook.service';
import { FlutterwaveHashGuard } from './webhook/flutterwave-hash.guard';
import { AdminOpsModule } from '../admin-ops/admin-ops.module'
import { PurchaseStatusService } from './purchase-status.service'
import { AccountModule } from '../account/account.module'
import { TicketsModule } from '../tickets/tickets.module'
import { PaymentVerificationService } from './payment-verification.service';
import { JwtModule } from '@nestjs/jwt';
import { WalletModule } from '../wallet/wallet.module';
import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard';
import { ClaimsModule } from '../claims/claims.module';
import { LedgerModule } from '../ledger/ledger.module';
import { MonnifyModule } from '../integrations/monnify/monnify.module';
import { WalletFundingService } from './wallet-funding.service';
import { WalletFundingController } from './wallet-funding.controller';
import { WalletFundingAdminController } from './wallet-funding-admin.controller';

import { WalletTicketPurchaseController } from './wallet-ticket-purchase.controller';
import { WalletTicketPurchaseService } from './wallet-ticket-purchase.service';

@Module({
  controllers: [
    PaymentsController,
    PaystackWebhookController,
    MonnifyWebhookController,
    FlutterwaveWebhookController,
    WalletFundingController,
    WalletFundingAdminController,
    WalletTicketPurchaseController
  ],
  providers: [
    PaymentsService,
    PaystackDriver,
    MonnifyDriver,
    FlutterwaveDriver,
    PurchaseConfirmationService,
    JackpotAccumulationService,
    PaystackWebhookService,
    MonnifyWebhookService,
    PaystackSignatureGuard,
    FlutterwaveWebhookService,
    PurchaseStatusService,
    FlutterwaveHashGuard,
    PaymentVerificationService,
    WalletFundingService,
    CustomerJwtGuard,
    WalletTicketPurchaseService
  ],
  exports: [PaymentsService, JackpotAccumulationService],
  imports: [
    JwtModule.register({}),
    AdminOpsModule,
    AccountModule,
    TicketsModule,
    WalletModule,
    ClaimsModule,
    LedgerModule,
    MonnifyModule
  ],  
})
export class PaymentsModule {}