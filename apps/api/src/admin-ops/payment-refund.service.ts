import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  AuditActorType,
  AuditSeverity,
  DrawStatus,
  PaymentGateway,
  PaymentRefundStatus,
  PaymentStatus,
  TicketStatus,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentAccountingService } from '../ledger/payment-accounting.service';
import { MonnifyClientService } from '../integrations/monnify/monnify-client.service';

const REFUNDABLE_DRAW_STATES: DrawStatus[] = [
  DrawStatus.SCHEDULED,
  DrawStatus.ACTIVE,
  DrawStatus.SALES_CLOSED,
  DrawStatus.POSTPONED,
  DrawStatus.CANCELLED,
];

const REFUND_IN_PROGRESS_STATUSES: PaymentRefundStatus[] = [
  PaymentRefundStatus.REQUESTED,
  PaymentRefundStatus.SUBMITTED,
  PaymentRefundStatus.PROCESSING,
  PaymentRefundStatus.NEEDS_ATTENTION,
  PaymentRefundStatus.UNKNOWN,
];

type RefundProviderResult = {
  provider: PaymentGateway;

  reference: string | null;

  status: PaymentRefundStatus;

  amountNgn: number | null;

  currency: string | null;

  rawStatus: string | null;

  failureReason?: string;
};

type PaystackRefundResponse = {
  status?: boolean;
  message?: string;

  data?: {
    id?: number | string;
    status?: string;
    amount?: number;
    currency?: string;
  };
};

type PaystackRefundListResponse = {
  status?: boolean;
  message?: string;

  data?: Array<{
    id?: number | string;
    status?: string;
    amount?: number;
    currency?: string;
    created_at?: string;
    createdAt?: string;
  }>;
};

type PaystackTransactionVerifyResponse = {
  status?: boolean;

  data?: {
    status?: string;
  };
};

type MonnifyRefundBody = {
  refundReference?: string;
  transactionReference?: string;
  refundAmount?: number | string;
  refundStatus?: string;
  refundType?: string;
  refundStrategy?: string;
  comment?: string;
  completedOn?: string;
  createdOn?: string;
};

type FlutterwaveRefundResponse = {
  status?: string;
  message?: string;

  data?: {
    id?: number | string;

    flw_ref?: string;

    status?: string;

    amount_refunded?: number;

    currency?: string;
  };
};

type FlutterwaveRefundRow = {
  id?: number | string;

  status?: string;

  amount_refunded?: number;
  AmountRefunded?: number;

  flw_ref?: string;
  FlwRef?: string;

  currency?: string;
};

type FlutterwaveRefundListResponse = {
  status?: string;
  message?: string;

  data?:
    | FlutterwaveRefundRow[]
    | FlutterwaveRefundRow;
};

@Injectable()
export class PaymentRefundService {
  private readonly logger =
    new Logger(
      PaymentRefundService.name,
    );

  constructor(
    private readonly prisma:
      PrismaService,

    private readonly audit:
      AuditService,

    private readonly config:
      ConfigService,

    private readonly paymentAccounting:
      PaymentAccountingService,

    private readonly monnify:
      MonnifyClientService,
  ) {}

  async initiate(
    txnId: string,
    adminId: string,
    reason: string,
  ) {
    const cleanReason =
      reason.trim();

    if (!cleanReason) {
      throw new ConflictException(
        'Refund reason is required',
      );
    }

    const existing =
      await this.prisma.paymentTransaction.findUnique({
        where: {
          txnId,
        },

        include: {
          tickets: {
            select: {
              ticketId: true,
              drawId: true,
              status: true,
              isWinner: true,
            },
          },
        },
      });

    if (!existing) {
      throw new NotFoundException(
        'Transaction not found',
      );
    }

    if (
      existing.status ===
      PaymentStatus.REFUNDED
    ) {
      return this.getRefundView(
        txnId,
      );
    }

    if (
      existing.refundStatus
    ) {
      throw new ConflictException(
        `Refund already exists with status ${existing.refundStatus}`,
      );
    }

    if (
      existing.status !==
        PaymentStatus.CONFIRMED &&
      existing.status !==
        PaymentStatus.REVIEW_REQUIRED
    ) {
      throw new ConflictException(
        `Payment cannot be refunded from status ${existing.status}`,
      );
    }

    if (
      existing.gateway ===
      PaymentGateway.AGENT_CASH
    ) {
      throw new ConflictException(
        'Agent cash payments cannot be refunded through an online payment provider',
      );
    }

    if (
      (
        existing.gateway ===
          PaymentGateway.FLUTTERWAVE ||
        existing.gateway ===
          PaymentGateway.MONNIFY
      ) &&
      !existing.providerTransactionId
    ) {
      throw new ConflictException(
        `${existing.gateway} provider transaction ID is missing. Manual finance review is required.`,
      );
    }

    const idempotencyKey =
      `SW-REFUND-${txnId}`;

    const requestedAt =
      new Date();

    /*
     * Lock the payment and any affected draws while
     * removing tickets from the eligible draw pool.
     */
    await this.prisma.$transaction(
      async (tx) => {
        const locked =
          await tx.$queryRaw<
            Array<{
              txn_id: string;
              status: PaymentStatus;
            }>
          >`
            SELECT
              txn_id,
              status
            FROM payment_transactions
            WHERE txn_id = ${txnId}
            FOR UPDATE
          `;

        if (
          locked.length === 0
        ) {
          throw new NotFoundException(
            'Transaction not found',
          );
        }

        const current =
          await tx.paymentTransaction.findUniqueOrThrow({
            where: {
              txnId,
            },

            include: {
              tickets: {
                select: {
                  ticketId: true,
                  drawId: true,
                  status: true,
                  isWinner: true,
                },
              },
            },
          });

        if (
          current.refundStatus
        ) {
          throw new ConflictException(
            `Refund already exists with status ${current.refundStatus}`,
          );
        }

        if (
          current.status !==
            PaymentStatus.CONFIRMED &&
          current.status !==
            PaymentStatus.REVIEW_REQUIRED
        ) {
          throw new ConflictException(
            `Payment cannot be refunded from status ${current.status}`,
          );
        }

        /*
         * A winning or rolled-over ticket has already
         * acquired downstream value.
         *
         * That requires dispute handling, not an ordinary
         * Finance refund.
         */
        if (
          current.tickets.some(
            (ticket) =>
              ticket.isWinner ||
              ticket.status ===
                TicketStatus.WINNING ||
              ticket.status ===
                TicketStatus.ROLLED_OVER,
          )
        ) {
          throw new ConflictException(
            'Payment contains a winning or rolled-over ticket and cannot use the standard refund flow',
          );
        }

        const drawIds =
          [
            ...new Set(
              current.tickets.map(
                (ticket) =>
                  ticket.drawId,
              ),
            ),
          ].sort();

        /*
         * Lock each affected draw.
         *
         * If the engine has already moved the draw into
         * EXECUTING, this request must be rejected.
         *
         * If Finance gets the lock first, tickets are
         * quarantined before the engine can snapshot them.
         */
        for (
          const drawId of
          drawIds
        ) {
          await tx.$queryRaw`
            SELECT draw_id
            FROM draws
            WHERE draw_id = ${drawId}
            FOR UPDATE
          `;
        }

        if (
          current.status ===
            PaymentStatus.CONFIRMED &&
          drawIds.length > 0
        ) {
          const draws =
            await tx.draw.findMany({
              where: {
                drawId: {
                  in: drawIds,
                },
              },

              select: {
                drawId: true,
                drawCode: true,
                status: true,
              },
            });

          const blocked =
            draws.filter(
              (draw) =>
                !REFUNDABLE_DRAW_STATES.includes(
                  draw.status,
                ),
            );

          if (
            blocked.length > 0
          ) {
            throw new ConflictException(
              `Draw(s) are already executing or completed: ${blocked
                .map(
                  (draw) =>
                    draw.drawCode,
                )
                .join(', ')}`,
            );
          }
        }

        if (
          (
            current.gateway ===
              PaymentGateway.MONNIFY ||
            current.gateway ===
              PaymentGateway.FLUTTERWAVE
          ) &&
          !current.collectionLedgerTxnId
        ) {
          await this.paymentAccounting.recordProviderCollectionInTransaction(
            tx,
            {
              paymentTxnId:
                txnId,

              gateway:
                current.gateway,

              amountNgn:
                current.amountNgn,

              disposition:
                current.status ===
                PaymentStatus.CONFIRMED
                  ? 'REVENUE'
                  : 'SUSPENSE',

              providerReference:
                current.gatewayReference,

              providerTransactionId:
                current.providerTransactionId,

              occurredAt:
                current.providerPaidAt ??
                current.confirmedAt ??
                current.updatedAt,
            },
          );
        }

        const refundSource =
          current.status ===
          PaymentStatus.CONFIRMED
            ? 'REVENUE'
            : 'SUSPENSE';

        const reserved =
          await tx.paymentTransaction.updateMany({
            where: {
              txnId,

              status:
                current.status,

              refundStatus:
                null,
            },

            data: {
              status:
                PaymentStatus.REFUND_PENDING,

              refundStatus:
                PaymentRefundStatus.REQUESTED,

              refundProvider:
                current.gateway,

              refundIdempotencyKey:
                idempotencyKey,

              refundReason:
                cleanReason,

              refundRequestedByAdminId:
                adminId,

              refundRequestedAt:
                requestedAt,

              refundFailureReason:
                null,
            },
          });

        if (
          reserved.count !== 1
        ) {
          throw new ConflictException(
            'Refund has already been started',
          );
        }

        if (
          current.gateway ===
            PaymentGateway.MONNIFY ||
          current.gateway ===
            PaymentGateway.FLUTTERWAVE
        ) {
          await this.paymentAccounting.recordRefundAccrualInTransaction(
            tx,
            {
              paymentTxnId:
                txnId,

              amountNgn:
                current.amountNgn,

              source:
                refundSource,

              reason:
                cleanReason,
            },
          );
        }

        /*
         * Remove live tickets from the draw pool while
         * money is being returned.
         *
         * Do not mark them EXPIRED yet because the
         * provider has not actually completed the refund.
         */
        await tx.ticket.updateMany({
          where: {
            paymentTxnId:
              txnId,

            status:
              TicketStatus.ACTIVE,
          },

          data: {
            status:
              TicketStatus.REFUND_PENDING,
          },
        });
      },
    );

    await this.audit.write({
      severity:
        AuditSeverity.WARNING,

      actor: {
        type:
          AuditActorType.ADMIN,
        id:
          adminId,
      },

      action:
        'PAYMENT_REFUND_REQUESTED',

      resource: {
        type:
          'PaymentTransaction',
        id:
          txnId,
      },

      metadata: {
        reference:
          existing.gatewayReference,

        gateway:
          existing.gateway,

        amountNgn:
          existing.amountNgn,

        idempotencyKey,

        reason:
          cleanReason,
      },
    });

    const mode =
      this.config.get<string>(
        'REFUNDS_MODE',
      ) ?? 'dev';

    try {
      let result:
        RefundProviderResult;

      if (
        mode === 'dev'
      ) {
        result = {
          provider:
            existing.gateway,

          reference:
            `DEV-REFUND-${idempotencyKey}`,

          status:
            PaymentRefundStatus.SUCCEEDED,

          amountNgn:
            existing.amountNgn,

          currency:
            'NGN',

          rawStatus:
            'dev_success',
        };
      } else {
        switch (
          existing.gateway
        ) {
          case PaymentGateway.PAYSTACK:
            result =
              await this.initiatePaystack(
                existing.gatewayReference,
                existing.amountNgn,
                cleanReason,
              );
            break;

          case PaymentGateway.MONNIFY:
            result =
              await this.initiateMonnify(
                existing.providerTransactionId!,
                idempotencyKey,
                existing.amountNgn,
                cleanReason,
              );
            break;

          case PaymentGateway.FLUTTERWAVE:
            result =
              await this.initiateFlutterwave(
                existing.providerTransactionId!,
                existing.amountNgn,
                cleanReason,
              );
            break;

          default:
            throw new ConflictException(
              `Unsupported refund provider ${existing.gateway}`,
            );
        }
      }

      await this.applyProviderResult(
        txnId,
        result,
        adminId,
      );

      return this.getRefundView(
        txnId,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown refund provider error';

      /*
       * A timeout does NOT prove the provider rejected
       * the refund.
       *
       * Never call the provider again automatically.
       * Finance must use the refresh operation.
       */
      await this.applyProviderResult(
        txnId,
        {
          provider:
            existing.gateway,

          reference:
            null,

          status:
            PaymentRefundStatus.UNKNOWN,

          amountNgn:
            null,

          currency:
            null,

          rawStatus:
            'PROVIDER_EXCEPTION',

          failureReason:
            message,
        },
        adminId,
      );

      throw error;
    }
  }

  async refresh(
    txnId: string,
    adminId: string,
  ) {
    const txn =
      await this.prisma.paymentTransaction.findUnique({
        where: {
          txnId,
        },
      });

    if (!txn) {
      throw new NotFoundException(
        'Transaction not found',
      );
    }

    if (
      !txn.refundStatus
    ) {
      throw new ConflictException(
        'No refund exists for this payment',
      );
    }

    if (
      txn.refundStatus ===
        PaymentRefundStatus.SUCCEEDED
    ) {
      return this.getRefundView(
        txnId,
      );
    }

    /*
     * FAILED is conclusive.
     *
     * Do not re-send automatically.
     */
    if (
      txn.refundStatus ===
      PaymentRefundStatus.FAILED
    ) {
      return this.getRefundView(
        txnId,
      );
    }

    const mode =
      this.config.get<string>(
        'REFUNDS_MODE',
      ) ?? 'dev';

    if (
      mode === 'dev'
    ) {
      return this.getRefundView(
        txnId,
      );
    }

    let result:
      RefundProviderResult;

    switch (
      txn.refundProvider
    ) {
      case PaymentGateway.PAYSTACK:
        result =
          await this.getPaystackRefundStatus(
            txn.refundReference,
            txn.providerTransactionId,
            txn.gatewayReference,
            txn.amountNgn,
          );
        break;

      case PaymentGateway.MONNIFY:
        result =
          await this.getMonnifyRefundStatus(
            txn.refundReference ??
            txn.refundIdempotencyKey,
            txn.amountNgn,
          );
        break;

      case PaymentGateway.FLUTTERWAVE:
        result =
          await this.getFlutterwaveRefundStatus(
            txn.refundReference,
            txn.providerTransactionId,
            txn.createdAt,
            txn.amountNgn,
          );
        break;

      default:
        throw new ConflictException(
          `Unsupported refund provider ${txn.refundProvider ?? 'UNKNOWN'}`,
        );
    }

    await this.applyProviderResult(
      txnId,
      result,
      adminId,
    );

    return this.getRefundView(
      txnId,
    );
  }

  async listRefunds() {
    const rows =
      await this.prisma.paymentTransaction.findMany({
        where: {
          refundStatus: {
            not:
              null,
          },
        },

        orderBy: {
          refundRequestedAt:
            'desc',
        },

        take:
          200,

        select: {
          txnId: true,
          gatewayReference: true,
          gateway: true,
          amountNgn: true,

          buyerPhone: true,

          status: true,

          refundStatus: true,
          refundProvider: true,
          refundReference: true,
          refundReason: true,
          refundRequestedAt: true,
          refundCompletedAt: true,
          refundLastCheckedAt: true,
          refundFailureReason: true,

          _count: {
            select: {
              tickets: true,
            },
          },
        },
      });

    return {
      refunds:
        rows.map(
          (row) => ({
            txnId:
              row.txnId,

            reference:
              row.gatewayReference,

            gateway:
              row.gateway,

            amountNgn:
              row.amountNgn,

            buyerPhone:
              row.buyerPhone,

            paymentStatus:
              row.status,

            refundStatus:
              row.refundStatus,

            refundProvider:
              row.refundProvider,

            refundReference:
              row.refundReference,

            reason:
              row.refundReason,

            requestedAt:
              row.refundRequestedAt
                ?.toISOString() ??
              null,

            completedAt:
              row.refundCompletedAt
                ?.toISOString() ??
              null,

            lastCheckedAt:
              row.refundLastCheckedAt
                ?.toISOString() ??
              null,

            failureReason:
              row.refundFailureReason,

            tickets:
              row._count.tickets,
          }),
        ),
    };
  }

  async listReviewRequired() {
    const rows =
      await this.prisma.paymentTransaction.findMany({
        where: {
          status:
            PaymentStatus.REVIEW_REQUIRED,
        },

        orderBy: {
          updatedAt:
            'desc',
        },

        take:
          200,

        select: {
          txnId: true,

          gatewayReference: true,

          gateway: true,

          providerTransactionId: true,

          amountNgn: true,

          buyerPhone: true,

          providerPaidAt: true,

          failureReason: true,

          refundStatus: true,

          refundReference: true,

          refundFailureReason: true,

          createdAt: true,

          updatedAt: true,

          _count: {
            select: {
              tickets: true,
            },
          },
        },
      });

    return {
      payments:
        rows.map(
          (row) => ({
            txnId:
              row.txnId,

            reference:
              row.gatewayReference,

            gateway:
              row.gateway,

            providerTransactionId:
              row.providerTransactionId,

            amountNgn:
              row.amountNgn,

            buyerPhone:
              row.buyerPhone,

            providerPaidAt:
              row.providerPaidAt
                ?.toISOString() ??
              null,

            reviewReason:
              row.failureReason,

            refundStatus:
              row.refundStatus,

            refundReference:
              row.refundReference,

            refundFailureReason:
              row.refundFailureReason,

            tickets:
              row._count.tickets,

            createdAt:
              row.createdAt.toISOString(),

            updatedAt:
              row.updatedAt.toISOString(),
          }),
        ),
    };
  }

  private async applyProviderResult(
    txnId: string,
    result: RefundProviderResult,
    actorAdminId: string,
  ) {
    const txn =
      await this.prisma.paymentTransaction.findUnique({
        where: {
          txnId,
        },
      });

    if (!txn) {
      throw new NotFoundException(
        'Transaction not found',
      );
    }

    if (
      txn.refundProvider &&
      txn.refundProvider !==
        result.provider
    ) {
      throw new ConflictException(
        `Refund belongs to ${txn.refundProvider}, not ${result.provider}`,
      );
    }

    /*
     * Never finalise a successful refund for the wrong
     * amount.
     */
    if (
      result.status ===
        PaymentRefundStatus.SUCCEEDED &&
      (
        result.amountNgn === null ||
        result.amountNgn !==
          txn.amountNgn ||
        (
          result.currency !== null &&
          result.currency !==
            'NGN'
        )
      )
    ) {
      result = {
        ...result,

        status:
          PaymentRefundStatus.UNKNOWN,

        failureReason:
          `Refund confirmation mismatch. Expected ${txn.amountNgn} NGN, received ${result.amountNgn ?? 'NULL'} ${result.currency ?? 'UNKNOWN'}`,
      };
    }

    switch (
      result.status
    ) {
      case PaymentRefundStatus.SUCCEEDED:
        await this.markSucceeded(
          txnId,
          result,
          actorAdminId,
        );
        return;

      case PaymentRefundStatus.FAILED:
        await this.markFailed(
          txnId,
          result,
          actorAdminId,
        );
        return;

      case PaymentRefundStatus.NEEDS_ATTENTION:
        await this.markPending(
          txnId,
          result,
        );

        await this.audit.write({
          severity:
            AuditSeverity.WARNING,

          actor: {
            type:
              AuditActorType.ADMIN,
            id:
              actorAdminId,
          },

          action:
            'PAYMENT_REFUND_NEEDS_ATTENTION',

          resource: {
            type:
              'PaymentTransaction',
            id:
              txnId,
          },

          metadata: {
            refundReference:
              result.reference,

            rawStatus:
              result.rawStatus,
          },
        });

        return;

      default:
        await this.markPending(
          txnId,
          result,
        );
    }
  }

  private async markSucceeded(
    txnId: string,
    result: RefundProviderResult,
    actorAdminId: string,
  ) {
    const now =
      new Date();

    const changed =
      await this.prisma.$transaction(
        async (tx) => {
          const updated =
            await tx.paymentTransaction.updateMany({
              where: {
                txnId,

                status:
                  PaymentStatus.REFUND_PENDING,

                refundStatus: {
                  in:
                    REFUND_IN_PROGRESS_STATUSES,
                },
              },

              data: {
                status:
                  PaymentStatus.REFUNDED,

                refundStatus:
                  PaymentRefundStatus.SUCCEEDED,

                refundReference:
                  result.reference,

                refundCompletedAt:
                  now,

                refundLastCheckedAt:
                  now,

                refundFailureReason:
                  null,
              },
            });

          if (
            updated.count !== 1
          ) {
            return false;
          }

          const current =
            await tx.paymentTransaction.findUniqueOrThrow({
              where: {
                txnId,
              },
            });

          if (
            current.gateway === PaymentGateway.PAYSTACK ||

            current.gateway ===
              PaymentGateway.MONNIFY ||
            current.gateway ===
              PaymentGateway.FLUTTERWAVE
          ) {
            await this.paymentAccounting.recordRefundSettlementInTransaction(
              tx,
              {
                paymentTxnId:
                  txnId,

                gateway:
                  current.gateway,

                amountNgn:
                  current.amountNgn,

                providerReference:
                  result.reference,
              },
            );
          }

          await tx.ticket.updateMany({
            where: {
              paymentTxnId:
                txnId,

              status:
                TicketStatus.REFUND_PENDING,
            },

            data: {
              status:
                TicketStatus.EXPIRED,
            },
          });

          return true;
        },
      );

    if (!changed) {
      return;
    }

    await this.audit.write({
      severity:
        AuditSeverity.WARNING,

      actor: {
        type:
          AuditActorType.ADMIN,
        id:
          actorAdminId,
      },

      action:
        'PAYMENT_REFUND_SUCCEEDED',

      resource: {
        type:
          'PaymentTransaction',
        id:
          txnId,
      },

      metadata: {
        provider:
          result.provider,

        refundReference:
          result.reference,

        rawStatus:
          result.rawStatus,

        amountNgn:
          result.amountNgn,

        currency:
          result.currency,
      },
    });
  }

  private async markFailed(
    txnId: string,
    result: RefundProviderResult,
    actorAdminId: string,
  ) {
    const now =
      new Date();

    const updated =
      await this.prisma.paymentTransaction.updateMany({
        where: {
          txnId,

          refundStatus: {
            in:
              REFUND_IN_PROGRESS_STATUSES,
          },
        },

        data: {
          /*
           * Money is still unresolved and the tickets
           * remain quarantined.
           */
          status:
            PaymentStatus.REVIEW_REQUIRED,

          refundStatus:
            PaymentRefundStatus.FAILED,

          refundReference:
            result.reference,

          refundLastCheckedAt:
            now,

          refundFailureReason:
            result.failureReason ??
            result.rawStatus ??
            'Provider refund failed',
        },
      });

    if (
      updated.count !== 1
    ) {
      return;
    }

    await this.audit.write({
      severity:
        AuditSeverity.CRITICAL,

      actor: {
        type:
          AuditActorType.ADMIN,
        id:
          actorAdminId,
      },

      action:
        'PAYMENT_REFUND_FAILED',

      resource: {
        type:
          'PaymentTransaction',
        id:
          txnId,
      },

      metadata: {
        provider:
          result.provider,

        refundReference:
          result.reference,

        rawStatus:
          result.rawStatus,

        failureReason:
          result.failureReason,
      },
    });
  }

  private async markPending(
    txnId: string,
    result: RefundProviderResult,
  ) {
    await this.prisma.paymentTransaction.updateMany({
      where: {
        txnId,

        refundStatus: {
          in:
            REFUND_IN_PROGRESS_STATUSES,
        },
      },

      data: {
        status:
          PaymentStatus.REFUND_PENDING,

        refundStatus:
          result.status,

        refundReference:
          result.reference ??
          undefined,

        refundLastCheckedAt:
          new Date(),

        refundFailureReason:
          result.failureReason ??
          null,
      },
    });
  }

  private async initiateMonnify(
    transactionReference: string,
    refundReference: string,
    amountNgn: number,
    reason: string,
  ): Promise<RefundProviderResult> {
    const result =
      await this.monnify.request<MonnifyRefundBody>(
        '/api/v1/refunds/initiate-refund',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            transactionReference,

            refundReference,

            refundAmount:
              amountNgn,

            refundReason:
              reason.slice(
                0,
                64,
              ),

            customerNote:
              'SureWina refund',
          }),
        },
      );

    const payload =
      result.payload;

    const body =
      payload?.responseBody;

    if (
      payload?.requestSuccessful &&
      body?.refundReference
    ) {
      return this.fromMonnifyRefund(
        body,
      );
    }

    const code =
      payload?.responseCode;

    /*
     * R9 means the exact refund reference already exists.
     * Query it rather than creating another refund.
     */
    if (
      code === 'R9'
    ) {
      return this.getMonnifyRefundStatus(
        refundReference,
        amountNgn,
      );
    }

    /*
     * 99/M01/M02 and network-style provider errors are not
     * proof that a refund was rejected.
     */
    const conclusivelyRejected =
      Boolean(
        code &&
        [
          'R1',
          'R2',
          'R3',
          'R4',
          'R5',
          'R6',
          'R7',
          'R8',
          'R10',
          'R11',
          'R12',
        ].includes(
          code,
        ),
      );

    return {
      provider:
        PaymentGateway.MONNIFY,

      reference:
        refundReference,

      status:
        conclusivelyRejected
          ? PaymentRefundStatus.FAILED
          : PaymentRefundStatus.UNKNOWN,

      amountNgn:
        null,

      currency:
        'NGN',

      rawStatus:
        code ??
        `HTTP_${result.httpStatus}`,

      failureReason:
        payload?.responseMessage ??
        'Could not determine Monnify refund state',
    };
  }

  private async getMonnifyRefundStatus(
    refundReference: string | null,
    expectedAmountNgn: number,
  ): Promise<RefundProviderResult> {
    if (!refundReference) {
      return {
        provider:
          PaymentGateway.MONNIFY,

        reference:
          null,

        status:
          PaymentRefundStatus.UNKNOWN,

        amountNgn:
          null,

        currency:
          'NGN',

        rawStatus:
          'MISSING_REFERENCE',

        failureReason:
          'Monnify refund reference is not known',
      };
    }

    const result =
      await this.monnify.request<MonnifyRefundBody>(
        `/api/v1/refunds/${encodeURIComponent(
          refundReference,
        )}`,
        {
          method:
            'GET',
        },
      );

    const payload =
      result.payload;

    const body =
      payload?.responseBody;

    if (
      payload?.requestSuccessful &&
      body
    ) {
      const normalized =
        this.fromMonnifyRefund(
          body,
        );

      if (
        normalized.amountNgn !==
          null &&
        normalized.amountNgn !==
          expectedAmountNgn
      ) {
        return {
          ...normalized,

          status:
            PaymentRefundStatus.UNKNOWN,

          failureReason:
            `Monnify refund amount mismatch. Expected ${expectedAmountNgn}, got ${normalized.amountNgn}`,
        };
      }

      return normalized;
    }

    return {
      provider:
        PaymentGateway.MONNIFY,

      reference:
        refundReference,

      status:
        payload?.responseCode ===
        'R7'
          ? PaymentRefundStatus.FAILED
          : PaymentRefundStatus.UNKNOWN,

      amountNgn:
        null,

      currency:
        'NGN',

      rawStatus:
        payload?.responseCode ??
        `HTTP_${result.httpStatus}`,

      failureReason:
        payload?.responseMessage ??
        'Could not determine Monnify refund status',
    };
  }

  private fromMonnifyRefund(
    data: MonnifyRefundBody,
  ): RefundProviderResult {
    const rawStatus =
      data.refundStatus
        ?.trim()
        .toUpperCase() ??
      null;

    const amountRaw =
      data.refundAmount;

    const amountNgn =
      typeof amountRaw ===
        'number'
        ? amountRaw
        : typeof amountRaw ===
            'string'
          ? Number(
              amountRaw,
            )
          : null;

    let status:
      PaymentRefundStatus;

    switch (
      rawStatus
    ) {
      case 'COMPLETED':
        status =
          PaymentRefundStatus.SUCCEEDED;
        break;

      case 'FAILED':
        status =
          PaymentRefundStatus.FAILED;
        break;

      case 'PENDING':
        status =
          PaymentRefundStatus.PROCESSING;
        break;

      default:
        status =
          PaymentRefundStatus.UNKNOWN;
    }

    return {
      provider:
        PaymentGateway.MONNIFY,

      reference:
        data.refundReference ??
        null,

      status,

      amountNgn:
        amountNgn !== null &&
        Number.isFinite(
          amountNgn,
        )
          ? amountNgn
          : null,

      currency:
        'NGN',

      rawStatus,

      failureReason:
        status ===
        PaymentRefundStatus.FAILED
          ? data.comment ??
            'Monnify refund failed'
          : undefined,
    };
  }

  private async initiatePaystack(
    transactionReference: string,
    amountNgn: number,
    reason: string,
  ): Promise<RefundProviderResult> {
    const secretKey =
      this.config.get<string>(
        'PAYSTACK_SECRET_KEY',
      );

    if (!secretKey) {
      throw new InternalServerErrorException(
        'Paystack is not configured',
      );
    }

    const baseUrl =
      this.config.getOrThrow<string>(
        'PAYSTACK_BASE_URL',
      );

    let response:
      Response;

    try {
      response =
        await fetch(
          `${baseUrl}/refund`,
          {
            method:
              'POST',

            headers: {
              Authorization:
                `Bearer ${secretKey}`,

              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                transaction:
                  transactionReference,

                /*
                 * Paystack refund amount is in kobo.
                 */
                amount:
                  amountNgn *
                  100,

                currency:
                  'NGN',

                customer_note:
                  reason,

                merchant_note:
                  `SureWina refund: ${reason}`,
              }),
          },
        );
    } catch {
      throw new ServiceUnavailableException(
        'Paystack refund service is unreachable',
      );
    }

    const payload =
      (await response
        .json()
        .catch(() => null)) as
        | PaystackRefundResponse
        | null;

    if (
      !response.ok ||
      !payload?.status ||
      !payload.data
    ) {
      return {
        provider:
          PaymentGateway.PAYSTACK,

        reference:
          null,

        status:
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 409
            ? PaymentRefundStatus.FAILED
            : PaymentRefundStatus.UNKNOWN,

        amountNgn:
          null,

        currency:
          null,

        rawStatus:
          null,

        failureReason:
          payload?.message ??
          `Paystack HTTP ${response.status}`,
      };
    }

    return this.fromPaystackRefund(
      payload.data,
    );
  }

  private async getPaystackRefundStatus(
    refundReference: string | null,
    providerTransactionId: string | null,
    transactionReference: string,
    amountNgn: number,
  ): Promise<RefundProviderResult> {
    const secretKey =
      this.config.get<string>(
        'PAYSTACK_SECRET_KEY',
      );

    if (!secretKey) {
      throw new InternalServerErrorException(
        'Paystack is not configured',
      );
    }

    const baseUrl =
      this.config.getOrThrow<string>(
        'PAYSTACK_BASE_URL',
      );

    if (
      refundReference
    ) {
      try {
        const response =
          await fetch(
            `${baseUrl}/refund/${encodeURIComponent(
              refundReference,
            )}`,
            {
              headers: {
                Authorization:
                  `Bearer ${secretKey}`,
              },
            },
          );

        const payload =
          (await response
            .json()
            .catch(() => null)) as
            | PaystackRefundResponse
            | null;

        if (
          response.ok &&
          payload?.status &&
          payload.data
        ) {
          return this.fromPaystackRefund(
            payload.data,
          );
        }
      } catch {
        throw new ServiceUnavailableException(
          'Paystack refund status service is unreachable',
        );
      }
    }

    /*
     * Recovery path for the dangerous case where
     * Paystack accepted the refund but our connection
     * died before its refund ID reached SureWina.
     */
    if (
      providerTransactionId
    ) {
      try {
        const response =
          await fetch(
            `${baseUrl}/refund?transaction=${encodeURIComponent(
              providerTransactionId,
            )}&perPage=50&page=1`,
            {
              headers: {
                Authorization:
                  `Bearer ${secretKey}`,
              },
            },
          );

        const payload =
          (await response
            .json()
            .catch(() => null)) as
            | PaystackRefundListResponse
            | null;

        if (
          response.ok &&
          payload?.status &&
          Array.isArray(
            payload.data,
          )
        ) {
          const expectedKobo =
            amountNgn *
            100;

          const match =
            payload.data.find(
              (row) =>
                row.amount ===
                expectedKobo,
            );

          if (match) {
            return this.fromPaystackRefund(
              match,
            );
          }
        }
      } catch {
        throw new ServiceUnavailableException(
          'Paystack refund status service is unreachable',
        );
      }
    }

    /*
     * Last-resort full-refund recovery.
     *
     * Paystack changes the original transaction to
     * reversal pending / reversed as the refund moves.
     */
    try {
      const response =
        await fetch(
          `${baseUrl}/transaction/verify/${encodeURIComponent(
            transactionReference,
          )}`,
          {
            headers: {
              Authorization:
                `Bearer ${secretKey}`,
            },
          },
        );

      const payload =
        (await response
          .json()
          .catch(() => null)) as
          | PaystackTransactionVerifyResponse
          | null;

      const status =
        payload?.data?.status
          ?.trim()
          .toLowerCase();

      if (
        response.ok &&
        payload?.status
      ) {
        if (
          status ===
          'reversed'
        ) {
          return {
            provider:
              PaymentGateway.PAYSTACK,

            reference:
              refundReference,

            status:
              PaymentRefundStatus.SUCCEEDED,

            amountNgn,

            currency:
              'NGN',

            rawStatus:
              status,
          };
        }

        if (
          status ===
            'reversal pending' ||
          status ===
            'reversal_pending'
        ) {
          return {
            provider:
              PaymentGateway.PAYSTACK,

            reference:
              refundReference,

            status:
              PaymentRefundStatus.PROCESSING,

            amountNgn,

            currency:
              'NGN',

            rawStatus:
              status,
          };
        }
      }
    } catch {
      throw new ServiceUnavailableException(
        'Paystack transaction verification is unreachable',
      );
    }

    return {
      provider:
        PaymentGateway.PAYSTACK,

      reference:
        refundReference,

      status:
        PaymentRefundStatus.UNKNOWN,

      amountNgn:
        null,

      currency:
        null,

      rawStatus:
        null,

      failureReason:
        'Could not determine Paystack refund status',
    };
  }

  private fromPaystackRefund(
    data: {
      id?: number | string;
      status?: string;
      amount?: number;
      currency?: string;
    },
  ): RefundProviderResult {
    const rawStatus =
      data.status
        ?.trim()
        .toLowerCase() ??
      null;

    let status:
      PaymentRefundStatus;

    switch (
      rawStatus
    ) {
      case 'processed':
        status =
          PaymentRefundStatus.SUCCEEDED;
        break;

      case 'failed':
        status =
          PaymentRefundStatus.FAILED;
        break;

      case 'needs-attention':
      case 'needs_attention':
        status =
          PaymentRefundStatus.NEEDS_ATTENTION;
        break;

      case 'processing':
        status =
          PaymentRefundStatus.PROCESSING;
        break;

      case 'pending':
        status =
          PaymentRefundStatus.SUBMITTED;
        break;

      default:
        status =
          PaymentRefundStatus.UNKNOWN;
    }

    return {
      provider:
        PaymentGateway.PAYSTACK,

      reference:
        data.id !==
        undefined
          ? String(
              data.id,
            )
          : null,

      status,

      amountNgn:
        typeof data.amount ===
          'number' &&
        Number.isFinite(
          data.amount,
        )
          ? data.amount /
            100
          : null,

      currency:
        typeof data.currency ===
        'string'
          ? data.currency
              .trim()
              .toUpperCase()
          : null,

      rawStatus,
    };
  }

  private async initiateFlutterwave(
    providerTransactionId: string,
    amountNgn: number,
    reason: string,
  ): Promise<RefundProviderResult> {
    const secretKey =
      this.config.get<string>(
        'FLUTTERWAVE_SECRET_KEY',
      );

    if (!secretKey) {
      throw new InternalServerErrorException(
        'Flutterwave is not configured',
      );
    }

    const baseUrl =
      this.config.getOrThrow<string>(
        'FLUTTERWAVE_BASE_URL',
      );

    let response:
      Response;

    try {
      response =
        await fetch(
          `${baseUrl}/v3/transactions/${encodeURIComponent(
            providerTransactionId,
          )}/refund`,
          {
            method:
              'POST',

            headers: {
              Authorization:
                `Bearer ${secretKey}`,

              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                amount:
                  amountNgn,

                comments:
                  reason,
              }),
          },
        );
    } catch {
      throw new ServiceUnavailableException(
        'Flutterwave refund service is unreachable',
      );
    }

    const payload =
      (await response
        .json()
        .catch(() => null)) as
        | FlutterwaveRefundResponse
        | null;

    if (
      !response.ok ||
      payload?.status !==
        'success' ||
      !payload.data
    ) {
      return {
        provider:
          PaymentGateway.FLUTTERWAVE,

        reference:
          null,

        status:
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 409
            ? PaymentRefundStatus.FAILED
            : PaymentRefundStatus.UNKNOWN,

        amountNgn:
          null,

        currency:
          null,

        rawStatus:
          null,

        failureReason:
          payload?.message ??
          `Flutterwave HTTP ${response.status}`,
      };
    }

    return this.fromFlutterwaveRefund(
      payload.data,
    );
  }

  private async getFlutterwaveRefundStatus(
    refundReference: string | null,
    providerTransactionId: string | null,
    createdAt: Date,
    expectedAmountNgn: number,
  ): Promise<RefundProviderResult> {
    const secretKey =
      this.config.get<string>(
        'FLUTTERWAVE_SECRET_KEY',
      );

    if (!secretKey) {
      throw new InternalServerErrorException(
        'Flutterwave is not configured',
      );
    }

    const baseUrl =
      this.config.getOrThrow<string>(
        'FLUTTERWAVE_BASE_URL',
      );

    const from =
      createdAt
        .toISOString()
        .slice(
          0,
          10,
        );

    const to =
      new Date()
        .toISOString()
        .slice(
          0,
          10,
        );

    const query =
      new URLSearchParams({
        from,
        to,
        currency:
          'NGN',
      });

    if (
      refundReference
    ) {
      if (
        refundReference.startsWith(
          'URF_',
        ) ||
        refundReference.startsWith(
          'FLW',
        )
      ) {
        query.set(
          'flw_ref',
          refundReference,
        );
      } else {
        query.set(
          'id',
          refundReference,
        );
      }
    } else if (
      providerTransactionId
    ) {
      query.set(
        'id',
        providerTransactionId,
      );
    } else {
      throw new ConflictException(
        'Flutterwave refund has no reference or provider transaction ID',
      );
    }

    let response:
      Response;

    try {
      response =
        await fetch(
          `${baseUrl}/v3/refunds?${query.toString()}`,
          {
            headers: {
              Authorization:
                `Bearer ${secretKey}`,

              'Content-Type':
                'application/json',
            },
          },
        );
    } catch {
      throw new ServiceUnavailableException(
        'Flutterwave refund status service is unreachable',
      );
    }

    const payload =
      (await response
        .json()
        .catch(() => null)) as
        | FlutterwaveRefundListResponse
        | null;

    if (
      !response.ok ||
      payload?.status !==
        'success' ||
      !payload.data
    ) {
      return {
        provider:
          PaymentGateway.FLUTTERWAVE,

        reference:
          refundReference,

        status:
          PaymentRefundStatus.UNKNOWN,

        amountNgn:
          null,

        currency:
          null,

        rawStatus:
          null,

        failureReason:
          payload?.message ??
          `Flutterwave HTTP ${response.status}`,
      };
    }

    const rows =
      Array.isArray(
        payload.data,
      )
        ? payload.data
        : [
            payload.data,
          ];

    const row =
      rows.find(
        (item) => {
          const amount =
            item.amount_refunded ??
            item.AmountRefunded;

          return (
            typeof amount ===
              'number' &&
            amount ===
              expectedAmountNgn
          );
        },
      ) ??
      rows[0];

    if (!row) {
      return {
        provider:
          PaymentGateway.FLUTTERWAVE,

        reference:
          refundReference,

        status:
          PaymentRefundStatus.UNKNOWN,

        amountNgn:
          null,

        currency:
          null,

        rawStatus:
          null,

        failureReason:
          'No Flutterwave refund record found',
      };
    }

    return this.fromFlutterwaveRefund(
      row,
    );
  }

  private fromFlutterwaveRefund(
    data:
      | {
          id?: number | string;
          flw_ref?: string;
          status?: string;
          amount_refunded?: number;
          currency?: string;
        }
      | FlutterwaveRefundRow,
  ): RefundProviderResult {
    const rawStatus =
      data.status
        ?.trim()
        .toLowerCase() ??
      null;

    let status:
      PaymentRefundStatus;

    switch (
      rawStatus
    ) {
      /*
       * Flutterwave explicitly documents plain
       * "completed" as initiated and still pending
       * disbursement.
       */
      case 'completed':
      case 'processing':
      case 'pending-momo':
        status =
          PaymentRefundStatus.PROCESSING;
        break;

      case 'completed-bank-transfer':
      case 'completed-momo':
      case 'completed-mpgs':
      case 'completed-offline':
      case 'completed-preauth':
      case 'successful':
        status =
          PaymentRefundStatus.SUCCEEDED;
        break;

      case 'failed':
        status =
          PaymentRefundStatus.FAILED;
        break;

      default:
        status =
          PaymentRefundStatus.UNKNOWN;
    }

    const amount =
      'amount_refunded' in data
        ? data.amount_refunded
        : undefined;

    const alternateAmount =
      'AmountRefunded' in data
        ? data.AmountRefunded
        : undefined;

    const flwRef =
      'flw_ref' in data
        ? data.flw_ref
        : undefined;

    const alternateRef =
      'FlwRef' in data
        ? data.FlwRef
        : undefined;

    return {
      provider:
        PaymentGateway.FLUTTERWAVE,

      reference:
        flwRef ??
        alternateRef ??
        (
          data.id !==
          undefined
            ? String(
                data.id,
              )
            : null
        ),

      status,

      amountNgn:
        typeof (
          amount ??
          alternateAmount
        ) === 'number'
          ? (
              amount ??
              alternateAmount ??
              null
            )
          : null,

      currency:
        typeof data.currency ===
        'string'
          ? data.currency
              .trim()
              .toUpperCase()
          : null,

      rawStatus,
    };
  }

  private async getRefundView(
    txnId: string,
  ) {
    const txn =
      await this.prisma.paymentTransaction.findUniqueOrThrow({
        where: {
          txnId,
        },

        select: {
          txnId: true,

          gatewayReference: true,

          gateway: true,

          amountNgn: true,

          status: true,

          refundStatus: true,

          refundProvider: true,

          refundReference: true,

          refundReason: true,

          refundRequestedAt: true,

          refundCompletedAt: true,

          refundLastCheckedAt: true,

          refundFailureReason: true,
        },
      });

    return {
      txnId:
        txn.txnId,

      reference:
        txn.gatewayReference,

      gateway:
        txn.gateway,

      amountNgn:
        txn.amountNgn,

      paymentStatus:
        txn.status,

      refundStatus:
        txn.refundStatus,

      refundProvider:
        txn.refundProvider,

      refundReference:
        txn.refundReference,

      reason:
        txn.refundReason,

      requestedAt:
        txn.refundRequestedAt
          ?.toISOString() ??
        null,

      completedAt:
        txn.refundCompletedAt
          ?.toISOString() ??
        null,

      lastCheckedAt:
        txn.refundLastCheckedAt
          ?.toISOString() ??
        null,

      failureReason:
        txn.refundFailureReason,
    };
  }
}