import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { LedgerBootstrapCommandModule } from './ledger-bootstrap-command.module';
import { SYSTEM_LEDGER_ACCOUNTS } from './ledger.constants';

/**
 * Explicit operator command to verify/create the deterministic system chart.
 * No HTTP API, workers, financial journals or Phase 8 migration is started.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    LedgerBootstrapCommandModule,
    { logger: ['error', 'warn'] },
  );

  try {
    // LedgerBootstrapService.onModuleInit has already run. It fails closed
    // if any previously existing account has an unexpected identity.
    process.stdout.write(
      `System ledger chart ready: ${SYSTEM_LEDGER_ACCOUNTS.length} account identities verified.\n`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
