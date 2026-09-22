import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { RolloutSmokeModule } from './rollout-smoke.module';
import { RolloutSmokeService } from './rollout-smoke.service';

function flag(name: string) {
  const prefix = `--${name}=`;
  const args = process.argv.slice(3);

  const inline = args.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function requiredFlag(name: string) {
  const value = flag(name)?.trim();

  if (!value) {
    throw new Error(`--${name} is required`);
  }

  return value;
}

function amountFlag() {
  const amount = Number(requiredFlag('amount'));

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('--amount must be a positive integer NGN amount');
  }

  return amount;
}

function output(value: unknown) {
  process.stdout.write(
    `${JSON.stringify(
      value,
      (_key, item) =>
        typeof item === 'bigint'
          ? item.toString()
          : item,
      2,
    )}\n`,
  );
}

async function main() {
  const command = process.argv[2];

  if (!command) {
    throw new Error(
      'Usage: pnpm rollout:smoke <candidates|fund-customer|fund-agent> [flags]',
    );
  }

  const app = await NestFactory.createApplicationContext(
    RolloutSmokeModule,
    {
      logger: ['error', 'warn', 'log'],
    },
  );

  try {
    const smoke = app.get(RolloutSmokeService);

    switch (command) {
      case 'candidates':
        output(await smoke.candidates());
        break;

      case 'fund-customer':
        output(
          await smoke.fundCustomer({
            phone: requiredFlag('phone'),
            amountNgn: amountFlag(),
          }),
        );
        break;

      case 'fund-agent':
        output(
          await smoke.fundAgent({
            agentCode: requiredFlag('agent-code'),
            amountNgn: amountFlag(),
          }),
        );
        break;

      default:
        throw new Error(`Unknown rollout smoke command: ${command}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${
      error instanceof Error
        ? error.stack ?? error.message
        : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
