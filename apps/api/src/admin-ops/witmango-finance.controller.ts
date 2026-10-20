import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { WitmangoClientService } from '../integrations/witmango/witmango-client.service';

/**
 * Read-only operational verification, restricted to authenticated Finance.
 * Never returns credentials, raw GL records, account numbers or balances.
 */
@Controller('admin/finance/witmango')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.FINANCE_OFFICER)
export class WitmangoFinanceController {
  constructor(private readonly witmango: WitmangoClientService) {}

  @Get('probe')
  async probe() {
    if (!this.witmango.isEnabled()) {
      return { enabled: false, connected: false };
    }
    // The documented API has no dedicated health endpoint. Probe
    // two read-only discovery endpoints to confirm auth and tenant.
    const [glAccounts, savingsProducts] = await Promise.all([
      this.witmango.listGlAccounts(),
      this.witmango.listSavingsProducts(),
    ]);
    return {
      enabled: true,
      connected: true,
      glAccountsReceived: glAccounts !== null,
      savingsProductsReceived: savingsProducts !== null,
    };
  }
}
