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

function integerFlag(name: string) {
  const amount = Number(requiredFlag(name));

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`--${name} must be a positive integer NGN amount`);
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
      'Usage: pnpm rollout:smoke <candidates|create-draw|cancel-draw|fund-customer|fund-agent> [flags]',
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

      case 'create-draw':
        output(
          await smoke.createDraw({
            ticketPriceNgn:
              integerFlag('price'),
          }),
        );
        break;

      case 'cancel-draw':
        output(
          await smoke.cancelDraw({
            drawCode:
              requiredFlag('draw-code'),
          }),
        );
        break;

      case 'fund-customer':
        output(
          await smoke.fundCustomer({
            phone: requiredFlag('phone'),
            amountNgn:
              integerFlag('amount'),
          }),
        );
        break;

      case 'fund-agent':
        output(
          await smoke.fundAgent({
            agentCode: requiredFlag('agent-code'),
            amountNgn:
              integerFlag('amount'),
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
