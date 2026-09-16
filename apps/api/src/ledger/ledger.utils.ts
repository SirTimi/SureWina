import {
  LedgerAccountType,
  LedgerEntrySide,
} from '@prisma/client';

export type LedgerAmountLine = {
  side: LedgerEntrySide;
  amountNgn: number;
};

export function calculateLedgerTotals(
  lines: LedgerAmountLine[],
) {
  let debitNgn = 0;
  let creditNgn = 0;

  for (const line of lines) {
    if (
      line.side ===
      LedgerEntrySide.DEBIT
    ) {
      debitNgn +=
        line.amountNgn;
    } else {
      creditNgn +=
        line.amountNgn;
    }
  }

  return {
    debitNgn,
    creditNgn,
    balanced:
      debitNgn === creditNgn,
  };
}

/*
 * Returns the account's balance using its normal
 * accounting direction.
 *
 * ASSET / EXPENSE:
 *   debit - credit
 *
 * LIABILITY / EQUITY / REVENUE:
 *   credit - debit
 */
export function naturalLedgerBalance(
  accountType: LedgerAccountType,
  debitNgn: number,
  creditNgn: number,
) {
  switch (accountType) {
    case LedgerAccountType.ASSET:
    case LedgerAccountType.EXPENSE:
      return (
        debitNgn -
        creditNgn
      );

    case LedgerAccountType.LIABILITY:
    case LedgerAccountType.EQUITY:
    case LedgerAccountType.REVENUE:
      return (
        creditNgn -
        debitNgn
      );
  }
}

/*
 * Produce deterministic JSON for idempotency hashing.
 *
 * Object key order must never affect the fingerprint.
 */
export function canonicalJson(
  value: unknown,
): string {
  return JSON.stringify(
    canonicalize(value),
  );
}

function canonicalize(
  value: unknown,
): unknown {
  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  if (
    Array.isArray(value)
  ) {
    return value.map(
      canonicalize,
    );
  }

  if (
    value !== null &&
    typeof value === 'object'
  ) {
    const object =
      value as Record<
        string,
        unknown
      >;

    return Object.keys(object)
      .sort()
      .reduce<
        Record<string, unknown>
      >(
        (
          result,
          key,
        ) => {
          result[key] =
            canonicalize(
              object[key],
            );

          return result;
        },
        {},
      );
  }

  return value;
}