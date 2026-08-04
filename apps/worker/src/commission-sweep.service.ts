import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

// DISABLED — net remittance model.
//
// Agents keep their commission at the point of sale and remit only the
// balance (Remittance.amountDueNgn = gross - commission). Disbursing
// commission on top of that would pay it twice: once by retention, once by
// transfer.
//
// Kept as a registered no-op rather than deleted so the reason is visible in
// the codebase and printed at boot, and so reverting to the gross model is a
// single-file change. Existing CommissionDisbursement rows are deliberately
// untouched — any created before the switch represent commission genuinely
// owed under the old model.
@Injectable()
export class CommissionSweepService implements OnModuleInit {
  private readonly logger = new Logger(CommissionSweepService.name);

  onModuleInit() {
    this.logger.warn(
      'Commission sweep DISABLED — net model: commission is retained by the agent at point of sale, not disbursed',
    );
  }
}