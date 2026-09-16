import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';

import {
  AdminRole,
} from '@prisma/client';

import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';

import { LedgerService } from './ledger.service';

@Controller(
  'admin/finance/ledger',
)
@UseGuards(
  AdminJwtGuard,
  AdminRoleGuard,
)
@AdminRoles(
  AdminRole.FINANCE_OFFICER,
)
export class LedgerAdminController {
  constructor(
    private readonly ledger:
      LedgerService,
  ) {}

  @Get(
    'trial-balance',
  )
  trialBalance() {
    return this.ledger.trialBalance();
  }

  @Get(
    'accounts/:accountId/balance',
  )
  accountBalance(
    @Param('accountId')
    accountId:
      string,
  ) {
    return this.ledger.getAccountBalance(
      accountId,
    );
  }

  @Get(
    'transactions/:ledgerTxnId',
  )
  transaction(
    @Param('ledgerTxnId')
    ledgerTxnId:
      string,
  ) {
    return this.ledger.getTransaction(
      ledgerTxnId,
    );
  }
}