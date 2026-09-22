import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { RolloutCheckModule } from './rollout-check.module';
import { RolloutCheckService } from './rollout-check.service';

function hasFlag(name: string) {
  return process.argv.slice(2).includes(`--${name}`);
}

function outputJson(value: unknown) {
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

function outputHuman(result: Awaited<ReturnType<RolloutCheckService['run']>>) {
  process.stdout.write(
    [
      '',
      'SureWina financial rollout check',
      `Mode: ${result.mode}`,
      `Generated: ${result.generatedAt}`,
      '',
      ...result.checks.flatMap((check) => [
        `[${check.status}] ${check.label}`,
        `  ${check.summary}`,
      ]),
      '',
      `Blockers: ${result.summary.blockers}`,
      `Review items: ${result.summary.reviews}`,
      `Passed checks: ${result.summary.passed}`,
      `Ready: ${result.ready ? 'YES' : 'NO'}`,
      '',
    ].join('\n'),
  );
}

async function main() {
  const production = hasFlag('production');
  const strictReview = hasFlag('strict-review');
  const json = hasFlag('json');

  const app = await NestFactory.createApplicationContext(
    RolloutCheckModule,
    {
      logger: ['error', 'warn'],
    },
  );

  try {
    const checker = app.get(RolloutCheckService);
    const result = await checker.run({
      production,
      strictReview,
    });

    if (json) {
      outputJson(result);
    } else {
      outputHuman(result);
    }

    if (!result.ready) {
      process.exitCode = 1;
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

  process.exitCode = 2;
});
