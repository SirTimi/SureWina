import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { Phase8MigrationModule } from './phase8-migration.module';
import { Phase8MigrationService } from './phase8-migration.service';

function flag(
  name: string,
) {
  const prefix =
    `--${name}=`;

  const inline =
    process.argv
      .slice(3)
      .find(
        (
          value,
        ) =>
          value.startsWith(
            prefix,
          ),
      );

  if (inline) {
    return inline.slice(
      prefix.length,
    );
  }

  const args =
    process.argv.slice(
      3,
    );

  const index =
    args.indexOf(
      `--${name}`,
    );

  if (
    index >=
      0 &&
    args[index + 1]
  ) {
    return args[
      index + 1
    ];
  }

  return undefined;
}

function boolFlag(
  name: string,
) {
  return process.argv
    .slice(3)
    .includes(
      `--${name}`,
    );
}

function requiredFlag(
  name: string,
) {
  const value =
    flag(
      name,
    );

  if (!value) {
    throw new Error(
      `--${name} is required`,
    );
  }

  return value;
}

function output(
  value: unknown,
) {
  process.stdout.write(
    `${JSON.stringify(
      value,
      (
        _key,
        item,
      ) =>
        typeof item ===
        'bigint'
          ? item.toString()
          : item,
      2,
    )}\n`,
  );
}

async function main() {
  const command =
    process.argv[2];

  if (!command) {
    throw new Error(
      'Usage: pnpm phase8:migrate <plan|apply|retry|status|audit|finalize> [flags]',
    );
  }

  const app =
    await NestFactory.createApplicationContext(
      Phase8MigrationModule,
      {
        logger: [
          'error',
          'warn',
          'log',
        ],
      },
    );

  try {
    const migration =
      app.get(
        Phase8MigrationService,
      );

    const config =
      app.get(
        ConfigService,
      );

    switch (
      command
    ) {
      case 'plan': {
        const cutoverRaw =
          flag(
            'cutover',
          ) ??
          config.get<string>(
            'FINANCIAL_LEDGER_CUTOVER_AT',
          );

        if (!cutoverRaw) {
          throw new Error(
            'Set FINANCIAL_LEDGER_CUTOVER_AT or pass --cutover=<ISO timestamp>',
          );
        }

        const cutoverAt =
          new Date(
            cutoverRaw,
          );

        output(
          await migration.plan({
            label:
              flag(
                'label',
              ) ??
              'Phase 8 financial migration',
            cutoverAt,
            createdBy:
              flag(
                'created-by',
              ) ??
              'phase8-cli',
          }),
        );
        break;
      }

      case 'apply': {
        const runId =
          requiredFlag(
            'run',
          );

        const batch =
          Number(
            flag(
              'batch',
            ) ??
            '100',
          );

        output(
          await migration.apply(
            runId,
            Number.isFinite(
              batch,
            )
              ? batch
              : 100,
          ),
        );
        break;
      }

      case 'retry':
        output(
          await migration.retry(
            requiredFlag(
              'run',
            ),
            boolFlag(
              'include-review',
            ),
          ),
        );
        break;

      case 'status':
        output(
          await migration.status(
            requiredFlag(
              'run',
            ),
          ),
        );
        break;

      case 'audit':
        output(
          await migration.audit(
            requiredFlag(
              'run',
            ),
          ),
        );
        break;

      case 'finalize':
        output(
          await migration.finalize(
            requiredFlag(
              'run',
            ),
          ),
        );
        break;

      default:
        throw new Error(
          `Unknown Phase 8 migration command: ${command}`,
        );
    }
  } finally {
    await app.close();
  }
}

main().catch(
  (
    error,
  ) => {
    process.stderr.write(
      `${
        error instanceof Error
          ? error.stack ??
            error.message
          : String(
              error,
            )
      }\n`,
    );

    process.exitCode =
      1;
  },
);
