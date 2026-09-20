import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { MonnifyClientService } from '../integrations/monnify/monnify-client.service';

export type ExternalCollectionTransaction = {
  provider: 'MONNIFY' | 'FLUTTERWAVE';
  providerReference: string;
  providerTransactionId: string | null;
  amountMinor: bigint;
  settlementAmountMinor: bigint | null;
  feeMinor: bigint | null;
  currency: string | null;
  status: string;
  occurredAt: Date | null;
  raw: unknown;
};

export type ExternalSettlement = {
  provider: 'FLUTTERWAVE';
  providerSettlementId: string;
  currency: string;
  grossAmountMinor: bigint;
  feeAmountMinor: bigint;
  refundAmountMinor: bigint;
  chargebackAmountMinor: bigint;
  netAmountMinor: bigint;
  status: string;
  destination: string | null;
  destinationReference: string | null;
  settlementDate: Date | null;
  processedAt: Date | null;
  transactions: ExternalSettlementTransaction[];
  raw: unknown;
};

export type ExternalSettlementTransaction = {
  providerReference: string | null;
  providerTransactionId: string | null;
  grossAmountMinor: bigint;
  feeAmountMinor: bigint;
  netAmountMinor: bigint;
  currency: string;
  raw: unknown;
};

type MonnifyTransactionRow = {
  transactionReference?: string;
  paymentReference?: string;
  amountPaid?: number | string;
  settlementAmount?: number | string;
  paymentStatus?: string;
  currency?: string;
  currencyCode?: string;
  fee?: number | string;
  paidOn?: string;
  completedOn?: string;
};

type MonnifyPage = {
  content?: MonnifyTransactionRow[];
  totalPages?: number;
  number?: number;
};

type MonnifyWalletBalance = {
  availableBalance?: number | string;
  ledgerBalance?: number | string;
  accountNumber?: string;
  currency?: string;
};

type FlutterwaveTransactionRow = {
  id?: number | string;
  tx_ref?: string;
  flw_ref?: string;
  amount?: number | string;
  charged_amount?: number | string;
  app_fee?: number | string;
  merchant_fee?: number | string;
  currency?: string;
  status?: string;
  created_at?: string;
};

type FlutterwaveTransactionResponse = {
  status?: string;
  message?: string;
  data?: FlutterwaveTransactionRow[];
  meta?: {
    page_info?: {
      current_page?: number;
      total_pages?: number;
    };
  };
};

type FlutterwaveSettlementRow = {
  id?: number | string;
  settlement_account?: string | null;
  bank_code?: string | null;
  transaction_date?: string;
  due_date?: string;
  processed_date?: string;
  status?: string;
  currency?: string;
  gross_amount?: number | string;
  app_fee?: number | string;
  merchant_fee?: number | string;
  chargeback?: number | string;
  refund?: number | string;
  stampduty_charge?: number | string;
  net_amount?: number | string;
  destination?: string | null;
  disburse_ref?: string | null;
  processor_ref?: string | null;
  transactions?: Array<{
    id?: number | string;
    tx_ref?: string;
    flw_ref?: string;
    charged_amount?: number | string;
    app_fee?: number | string;
    merchant_fee?: number | string;
    stampduty_charge?: number | string;
    settlement_amount?: number | string;
    currency?: string;
  }>;
};

type FlutterwaveSettlementResponse = {
  status?: string;
  message?: string;
  data?: FlutterwaveSettlementRow | FlutterwaveSettlementRow[];
  meta?: {
    page_info?: {
      current_page?: number;
      total_pages?: number;
    };
  };
};

type FlutterwaveBalanceResponse = {
  status?: string;
  message?: string;
  data?: Array<{
    currency?: string;
    available_balance?: number | string;
    ledger_balance?: number | string;
  }>;
};

@Injectable()
export class TreasuryProviderService {
  private readonly logger =
    new Logger(TreasuryProviderService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly monnify: MonnifyClientService,
  ) {}

  async monnifyTransactions(
    from: Date,
    to: Date,
  ): Promise<ExternalCollectionTransaction[]> {
    const rows: MonnifyTransactionRow[] = [];
    let page = 0;
    let totalPages = 1;

    while (page < totalPages) {
      const result =
        await this.monnify.request<MonnifyPage>(
          `/api/v1/merchant/transactions/search?page=${page}&size=100&from=${from.getTime()}&to=${to.getTime()}`,
          { method: 'GET' },
        );

      const payload = result.payload;
      const body = payload?.responseBody;

      if (
        !payload?.requestSuccessful ||
        !body
      ) {
        throw new ServiceUnavailableException(
          payload?.responseMessage ??
            'Could not fetch Monnify transactions',
        );
      }

      rows.push(
        ...(body.content ?? []),
      );

      totalPages = Math.max(
        1,
        body.totalPages ?? 1,
      );

      page += 1;
    }

    return rows
      .filter(
        (row) =>
          Boolean(
            row.paymentReference,
          ),
      )
      .map((row) => {
        const amountMinor =
          this.toMinor(
            row.amountPaid,
          );

        const settlementMinor =
          row.settlementAmount ===
            undefined
            ? null
            : this.toMinor(
                row.settlementAmount,
              );

        const feeMinor =
          row.fee !== undefined
            ? this.toMinor(
                row.fee,
              )
            : settlementMinor !==
                null &&
              amountMinor >=
                settlementMinor
              ? amountMinor -
                settlementMinor
              : null;

        return {
          provider:
            'MONNIFY' as const,

          providerReference:
            row.paymentReference!,

          providerTransactionId:
            row.transactionReference ??
            null,

          amountMinor,

          settlementAmountMinor:
            settlementMinor,

          feeMinor,

          currency:
            (
              row.currencyCode ??
              row.currency ??
              ''
            )
              .trim()
              .toUpperCase() ||
            null,

          status:
            (
              row.paymentStatus ??
              'UNKNOWN'
            )
              .trim()
              .toUpperCase(),

          occurredAt:
            this.parseDate(
              row.paidOn ??
              row.completedOn,
            ),

          raw:
            row,
        };
      });
  }

  async monnifySettlementTransactions(
    settlementReference: string,
  ): Promise<ExternalSettlementTransaction[]> {
    const rows: MonnifyTransactionRow[] = [];
    let page = 0;
    let totalPages = 1;

    while (page < totalPages) {
      const result =
        await this.monnify.request<MonnifyPage>(
          `/api/v1/transactions/find-by-settlement-reference?reference=${encodeURIComponent(
            settlementReference,
          )}&page=${page}&size=100`,
          { method: 'GET' },
        );

      const payload = result.payload;
      const body = payload?.responseBody;

      if (
        !payload?.requestSuccessful ||
        !body
      ) {
        throw new ServiceUnavailableException(
          payload?.responseMessage ??
            'Could not fetch Monnify settlement transactions',
        );
      }

      rows.push(
        ...(body.content ?? []),
      );

      totalPages = Math.max(
        1,
        body.totalPages ?? 1,
      );

      page += 1;
    }

    return rows.map((row) => {
      const gross =
        this.toMinor(
          row.amountPaid,
        );

      const net =
        row.settlementAmount ===
          undefined
          ? gross
          : this.toMinor(
              row.settlementAmount,
            );

      return {
        providerReference:
          row.paymentReference ??
          null,

        providerTransactionId:
          row.transactionReference ??
          null,

        grossAmountMinor:
          gross,

        feeAmountMinor:
          gross >= net
            ? gross - net
            : 0n,

        netAmountMinor:
          net,

        currency:
          (
            row.currencyCode ??
            row.currency ??
            'NGN'
          )
            .trim()
            .toUpperCase(),

        raw:
          row,
      };
    });
  }

  async monnifyPayoutBalance() {
    const accountNumber =
      this.config.get<string>(
        'MONNIFY_SOURCE_ACCOUNT_NUMBER',
      );

    if (!accountNumber) {
      throw new InternalServerErrorException(
        'MONNIFY_SOURCE_ACCOUNT_NUMBER is not configured',
      );
    }

    const result =
      await this.monnify.request<MonnifyWalletBalance>(
        `/api/v2/disbursements/wallet-balance?accountNumber=${encodeURIComponent(
          accountNumber,
        )}`,
        { method: 'GET' },
      );

    const payload = result.payload;
    const body = payload?.responseBody;

    if (
      !payload?.requestSuccessful ||
      !body
    ) {
      throw new ServiceUnavailableException(
        payload?.responseMessage ??
          'Could not fetch Monnify payout wallet balance',
      );
    }

    return {
      availableBalanceMinor:
        this.toMinor(
          body.availableBalance,
        ),

      ledgerBalanceMinor:
        this.toMinor(
          body.ledgerBalance,
        ),

      accountNumber:
        body.accountNumber ??
        accountNumber,

      currency:
        (
          body.currency ??
          'NGN'
        )
          .trim()
          .toUpperCase(),

      raw:
        payload,
    };
  }

  async flutterwaveTransactions(
    from: Date,
    to: Date,
  ): Promise<ExternalCollectionTransaction[]> {
    const rows:
      ExternalCollectionTransaction[] =
        [];

    for (
      const status of
      [
        'successful',
        'failed',
      ]
    ) {
      let page = 1;
      let totalPages = 1;

      while (
        page <=
        totalPages
      ) {
        const response =
          await this.flutterwaveFetch<FlutterwaveTransactionResponse>(
            `/v3/transactions?from=${this.dateOnly(
              from,
            )}&to=${this.dateOnly(
              to,
            )}&page=${page}&currency=NGN&status=${status}`,
          );

        if (
          response.status !==
          'success'
        ) {
          throw new ServiceUnavailableException(
            response.message ??
              'Could not fetch Flutterwave transactions',
          );
        }

        for (
          const row of
          response.data ??
          []
        ) {
          if (!row.tx_ref) {
            continue;
          }

          const amountMinor =
            this.toMinor(
              row.amount,
            );

          const feeMinor =
            this.toMinor(
              this.numberValue(
                row.app_fee,
              ) +
                this.numberValue(
                  row.merchant_fee,
                ),
            );

          rows.push({
            provider:
              'FLUTTERWAVE',

            providerReference:
              row.tx_ref,

            providerTransactionId:
              row.id !==
                undefined
                ? String(
                    row.id,
                  )
                : null,

            amountMinor,

            settlementAmountMinor:
              amountMinor >=
                feeMinor
                ? amountMinor -
                  feeMinor
                : null,

            feeMinor,

            currency:
              row.currency
                ?.trim()
                .toUpperCase() ??
              null,

            status:
              (
                row.status ??
                status
              )
                .trim()
                .toUpperCase(),

            occurredAt:
              this.parseDate(
                row.created_at,
              ),

            raw:
              row,
          });
        }

        totalPages =
          response.meta
            ?.page_info
            ?.total_pages ??
          page;

        page += 1;
      }
    }

    return rows;
  }

  async flutterwaveSettlements(
    from: Date,
    to: Date,
  ): Promise<ExternalSettlement[]> {
    const ids:
      string[] =
        [];

    let page = 1;
    let totalPages = 1;

    while (
      page <=
      totalPages
    ) {
      const response =
        await this.flutterwaveFetch<FlutterwaveSettlementResponse>(
          `/v3/settlements?from=${this.dateOnly(
            from,
          )}&to=${this.dateOnly(
            to,
          )}&page=${page}`,
        );

      if (
        response.status !==
        'success'
      ) {
        throw new ServiceUnavailableException(
          response.message ??
            'Could not fetch Flutterwave settlements',
        );
      }

      const data =
        Array.isArray(
          response.data,
        )
          ? response.data
          : response.data
            ? [
                response.data,
              ]
            : [];

      for (
        const row of
        data
      ) {
        if (
          row.id !==
          undefined
        ) {
          ids.push(
            String(
              row.id,
            ),
          );
        }
      }

      totalPages =
        response.meta
          ?.page_info
          ?.total_pages ??
        page;

      page += 1;
    }

    const settlements:
      ExternalSettlement[] =
        [];

    for (
      const id of
      ids
    ) {
      const response =
        await this.flutterwaveFetch<FlutterwaveSettlementResponse>(
          `/v3/settlements/${encodeURIComponent(
            id,
          )}`,
        );

      const row =
        !Array.isArray(
          response.data,
        )
          ? response.data
          : response.data[0];

      if (
        response.status !==
          'success' ||
        !row
      ) {
        this.logger.warn(
          `Flutterwave settlement ${id} could not be expanded`,
        );

        continue;
      }

      const appFee =
        this.toMinor(
          row.app_fee,
        );

      const merchantFee =
        this.toMinor(
          row.merchant_fee,
        );

      const stampDuty =
        this.toMinor(
          row.stampduty_charge,
        );

      const transactions =
        (
          row.transactions ??
          []
        ).map(
          (txn) => {
            const txAppFee =
              this.toMinor(
                txn.app_fee,
              );

            const txMerchantFee =
              this.toMinor(
                txn.merchant_fee,
              );

            const txStamp =
              this.toMinor(
                txn.stampduty_charge,
              );

            return {
              providerReference:
                txn.tx_ref ??
                null,

              providerTransactionId:
                txn.id !==
                  undefined
                  ? String(
                      txn.id,
                    )
                  : null,

              grossAmountMinor:
                this.toMinor(
                  txn.charged_amount,
                ),

              feeAmountMinor:
                txAppFee +
                txMerchantFee +
                txStamp,

              netAmountMinor:
                this.toMinor(
                  txn.settlement_amount,
                ),

              currency:
                (
                  txn.currency ??
                  row.currency ??
                  'NGN'
                )
                  .trim()
                  .toUpperCase(),

              raw:
                txn,
            };
          },
        );

      settlements.push({
        provider:
          'FLUTTERWAVE',

        providerSettlementId:
          id,

        currency:
          (
            row.currency ??
            'NGN'
          )
            .trim()
            .toUpperCase(),

        grossAmountMinor:
          this.toMinor(
            row.gross_amount,
          ),

        feeAmountMinor:
          appFee +
          merchantFee +
          stampDuty,

        refundAmountMinor:
          this.toMinor(
            row.refund,
          ),

        chargebackAmountMinor:
          this.toMinor(
            row.chargeback,
          ),

        netAmountMinor:
          this.toMinor(
            row.net_amount,
          ),

        status:
          (
            row.status ??
            'UNKNOWN'
          )
            .trim()
            .toUpperCase(),

        destination:
          row.destination ??
          null,

        destinationReference:
          row.settlement_account ??
          row.disburse_ref ??
          row.processor_ref ??
          null,

        settlementDate:
          this.parseDate(
            row.transaction_date ??
            row.due_date,
          ),

        processedAt:
          this.parseDate(
            row.processed_date,
          ),

        transactions,

        raw:
          row,
      });
    }

    return settlements;
  }

  async flutterwavePayoutBalance() {
    const response =
      await this.flutterwaveFetch<FlutterwaveBalanceResponse>(
        '/v3/balances',
      );

    if (
      response.status !==
      'success'
    ) {
      throw new ServiceUnavailableException(
        response.message ??
          'Could not fetch Flutterwave wallet balance',
      );
    }

    const ngn =
      (
        response.data ??
        []
      ).find(
        (row) =>
          row.currency
            ?.trim()
            .toUpperCase() ===
          'NGN',
      );

    if (!ngn) {
      throw new ServiceUnavailableException(
        'Flutterwave did not return an NGN wallet balance',
      );
    }

    return {
      availableBalanceMinor:
        this.toMinor(
          ngn.available_balance,
        ),

      ledgerBalanceMinor:
        this.toMinor(
          ngn.ledger_balance,
        ),

      currency:
        'NGN',

      raw:
        response,
    };
  }

  private async flutterwaveFetch<T>(
    path: string,
  ): Promise<T> {
    const secretKey =
      this.config.get<string>(
        'FLUTTERWAVE_SECRET_KEY',
      );

    if (!secretKey) {
      throw new InternalServerErrorException(
        'FLUTTERWAVE_SECRET_KEY is not configured',
      );
    }

    const baseUrl =
      this.config
        .getOrThrow<string>(
          'FLUTTERWAVE_BASE_URL',
        )
        .replace(
          /\/+$/,
          '',
        );

    let response:
      Response;

    try {
      response =
        await fetch(
          `${baseUrl}${path}`,
          {
            headers: {
              Authorization:
                `Bearer ${secretKey}`,

              'Content-Type':
                'application/json',
            },
          },
        );
    } catch (error) {
      this.logger.warn(
        `Flutterwave treasury request failed: ${
          error instanceof Error
            ? error.message
            : 'unknown'
        }`,
      );

      throw new ServiceUnavailableException(
        'Flutterwave treasury API is unreachable',
      );
    }

    const payload =
      (await response
        .json()
        .catch(
          () =>
            null,
        )) as
        | T
        | null;

    if (
      !response.ok ||
      !payload
    ) {
      throw new ServiceUnavailableException(
        `Flutterwave treasury request failed with HTTP ${response.status}`,
      );
    }

    return payload;
  }

  private toMinor(
    value:
      | number
      | string
      | null
      | undefined,
  ): bigint {
    const number =
      this.numberValue(
        value,
      );

    if (
      !Number.isFinite(
        number,
      )
    ) {
      return 0n;
    }

    return BigInt(
      Math.round(
        number *
        100,
      ),
    );
  }

  private numberValue(
    value:
      | number
      | string
      | null
      | undefined,
  ) {
    if (
      typeof value ===
      'number'
    ) {
      return value;
    }

    if (
      typeof value ===
      'string'
    ) {
      const parsed =
        Number(
          value,
        );

      return Number.isFinite(
        parsed,
      )
        ? parsed
        : 0;
    }

    return 0;
  }

  private dateOnly(
    value: Date,
  ) {
    return value
      .toISOString()
      .slice(
        0,
        10,
      );
  }

  private parseDate(
    value:
      | string
      | null
      | undefined,
  ) {
    if (!value) {
      return null;
    }

    const parsed =
      new Date(
        value,
      );

    return Number.isNaN(
      parsed.getTime(),
    )
      ? null
      : parsed;
  }
}
