import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  AdminRole,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { PrismaService } from '../database/prisma.service';

class SearchTicketsDto {
  @IsString()
  @MinLength(4)
  q!: string;
}

class ListPaymentsDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}

@Controller('admin/tickets')
@UseGuards(
  AdminJwtGuard,
  AdminRoleGuard,
)
@AdminRoles(AdminRole.OPERATOR)
export class TicketAdminController {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // Search by exact ticket ref or by buyer phone
  // (E.164 or trailing digits).
  @Get('search')
  async search(
    @Query() q: SearchTicketsDto,
  ) {
    const term =
      q.q.trim().toUpperCase();

    const isRef =
      term.startsWith('SW-');

    const tickets =
      await this.prisma.ticket.findMany({
        where: isRef
          ? {
              ticketRef: term,
            }
          : {
              buyerPhone: {
                endsWith:
                  term.replace(
                    /[^\d+]/g,
                    '',
                  ),
              },
            },

        orderBy: {
          createdAt: 'desc',
        },

        take: 50,

        include: {
          draw: {
            select: {
              drawCode: true,
              prizeDescription: true,
              status: true,
            },
          },

          /*
           * Legacy/direct PSP or agent purchase.
           *
           * This relation is nullable in Phase 5 because
           * wallet-purchased tickets no longer require a
           * fake PaymentTransaction.
           */
          payment: {
            select: {
              txnId: true,
              gateway: true,
              status: true,
              gatewayReference: true,
              amountNgn: true,
              confirmedAt: true,
            },
          },

          /*
           * Phase 5 wallet purchase source.
           */
          walletPurchase: {
            select: {
              purchaseId: true,
              idempotencyKey: true,
              status: true,
              amountNgn: true,
              ticketCount: true,
              completedAt: true,
              walletId: true,
            },
          },

          agent: {
            select: {
              agentCode: true,
              fullName: true,
            },
          },
        },
      });

    return {
      tickets: tickets.map(
        (ticket) => {
          const purchaseSource =
            ticket.walletPurchase
              ? 'WALLET'
              : ticket.payment
                ? 'PAYMENT'
                : 'UNKNOWN';

          return {
            ticketRef:
              ticket.ticketRef,

            drawCode:
              ticket.draw.drawCode,

            drawStatus:
              ticket.draw.status,

            prizeDescription:
              ticket.draw.prizeDescription,

            buyerPhone:
              ticket.buyerPhone,

            buyerUserId:
              ticket.buyerUserId,

            faceValueNgn:
              ticket.faceValueNgn,

            channel:
              ticket.purchaseChannel,

            stateOfPlayCode:
              ticket.stateOfPlayCode,

            status:
              ticket.status,

            isWinner:
              ticket.isWinner,

            agentCode:
              ticket.agent?.agentCode ??
              null,

            agentName:
              ticket.agent?.fullName ??
              null,

            /*
             * Makes it immediately clear to the admin
             * where the ticket came from.
             */
            purchaseSource,

            /*
             * Legacy payment information.
             *
             * Null for Phase 5 wallet purchases.
             */
            payment:
              ticket.payment
                ? {
                    txnId:
                      ticket.payment.txnId,

                    gateway:
                      ticket.payment.gateway,

                    status:
                      ticket.payment.status,

                    gatewayReference:
                      ticket.payment
                        .gatewayReference,

                    amountNgn:
                      ticket.payment.amountNgn,

                    confirmedAt:
                      ticket.payment.confirmedAt
                        ?.toISOString() ??
                      null,
                  }
                : null,

            /*
             * Phase 5 wallet purchase information.
             *
             * Null for legacy PSP / agent purchases.
             */
            walletPurchase:
              ticket.walletPurchase
                ? {
                    purchaseId:
                      ticket.walletPurchase
                        .purchaseId,

                    idempotencyKey:
                      ticket.walletPurchase
                        .idempotencyKey,

                    walletId:
                      ticket.walletPurchase
                        .walletId,

                    status:
                      ticket.walletPurchase
                        .status,

                    amountNgn:
                      ticket.walletPurchase
                        .amountNgn,

                    ticketCount:
                      ticket.walletPurchase
                        .ticketCount,

                    completedAt:
                      ticket.walletPurchase
                        .completedAt
                        ?.toISOString() ??
                      null,
                  }
                : null,

            createdAt:
              ticket.createdAt.toISOString(),
          };
        },
      ),
    };
  }

  // Payment browser — discovery path for
  // refunds and failed provider payments.
  //
  // Wallet purchases intentionally do not appear here
  // because they are not PaymentTransactions.
  @Get('payments')
  async payments(
    @Query() q: ListPaymentsDto,
  ) {
    const where:
      Prisma.PaymentTransactionWhereInput =
      {
        ...(q.status
          ? {
              status:
                q.status,
            }
          : {}),

        ...(q.fromDate ||
        q.toDate
          ? {
              createdAt: {
                ...(q.fromDate
                  ? {
                      gte:
                        new Date(
                          q.fromDate,
                        ),
                    }
                  : {}),

                ...(q.toDate
                  ? {
                      lte:
                        new Date(
                          `${q.toDate}T23:59:59.999Z`,
                        ),
                    }
                  : {}),
              },
            }
          : {}),
      };

    const rows =
      await this.prisma.paymentTransaction.findMany({
        where,

        orderBy: {
          createdAt: 'desc',
        },

        take: 100,
      });

    return {
      payments: rows.map(
        (payment) => ({
          txnId:
            payment.txnId,

          gatewayReference:
            payment.gatewayReference,

          gateway:
            payment.gateway,

          status:
            payment.status,

          buyerPhone:
            payment.buyerPhone,

          amountNgn:
            payment.amountNgn,

          ticketCount:
            payment.ticketCount,

          failureReason:
            payment.failureReason,

          confirmedAt:
            payment.confirmedAt
              ?.toISOString() ??
            null,

          createdAt:
            payment.createdAt.toISOString(),
        }),
      ),
    };
  }
}