import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  LedgerAccountPurpose,
  LedgerAccountType,
  LedgerEntrySide,
  LedgerOwnerType,
  LedgerTransactionKind,
  Prisma,
  RemittanceStatus,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { SYSTEM_LEDGER_ACCOUNT_CODES } from '../ledger/ledger.constants';
import { WalletService } from '../wallet/wallet.service';

type PrizeAccrualInput = {
  claimId: string;
  winnerTicketRef: string;
  grossPrizeValueNgn: number;
  whtAmountNgn: number;
  netPrizeValueNgn: number;
  prizeAccrualLedgerTxnId: string | null;
};

@Injectable()
export class AgentAccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly wallets: WalletService,
  ) {}

  async recordSaleInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      paymentTxnId: string;
      agentId: string;
      amountNgn: number;
      reference: string;
      occurredAt: Date;
    },
  ) {
    const payment = await tx.paymentTransaction.findUniqueOrThrow({
      where: { txnId: input.paymentTxnId },
      select: { collectionLedgerTxnId: true },
    });

    if (payment.collectionLedgerTxnId) {
      return tx.ledgerTransaction.findUniqueOrThrow({
        where: { ledgerTxnId: payment.collectionLedgerTxnId },
      });
    }

    const receivable = await this.ensureReceivableInTransaction(tx, input.agentId);
    const revenue = await this.requireAccount(
      tx,
      SYSTEM_LEDGER_ACCOUNT_CODES.TICKET_SALES_REVENUE,
    );

    const journal = await this.ledger.postInTransaction(tx, {
      idempotencyKey: `ledger:agent-sale:${input.paymentTxnId}`,
      kind: LedgerTransactionKind.AGENT_SALE,
      referenceType: 'PaymentTransaction',
      referenceId: input.paymentTxnId,
      description: 'Agent cash ticket sale',
      occurredAt: input.occurredAt,
      metadata: {
        agentId: input.agentId,
        gatewayReference: input.reference,
      },
      lines: [
        {
          accountId: receivable.accountId,
          side: LedgerEntrySide.DEBIT,
          amountNgn: input.amountNgn,
          memo: 'Cash collected by agent',
        },
        {
          accountId: revenue.accountId,
          side: LedgerEntrySide.CREDIT,
          amountNgn: input.amountNgn,
          memo: 'Ticket sales revenue',
        },
      ],
    });

    await tx.paymentTransaction.update({
      where: { txnId: input.paymentTxnId },
      data: { collectionLedgerTxnId: journal.ledgerTxnId },
    });

    return journal;
  }

  async recordAgentPrizePayoutInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      claim: PrizeAccrualInput & {
        agentPayoutLedgerTxnId: string | null;
      };
      agentId: string;
      reference: string;
      occurredAt: Date;
    },
  ) {
    if (input.claim.agentPayoutLedgerTxnId) {
      return tx.ledgerTransaction.findUniqueOrThrow({
        where: { ledgerTxnId: input.claim.agentPayoutLedgerTxnId },
      });
    }

    await this.ensurePrizeAccrualInTransaction(tx, input.claim);

    const payable = await this.requireAccount(
      tx,
      SYSTEM_LEDGER_ACCOUNT_CODES.PRIZE_PAYABLE,
    );
    const receivable = await this.ensureReceivableInTransaction(tx, input.agentId);

    const journal = await this.ledger.postInTransaction(tx, {
      idempotencyKey: `ledger:agent-prize-payout:${input.claim.claimId}`,
      kind: LedgerTransactionKind.PRIZE_PAYOUT,
      referenceType: 'PrizeClaim',
      referenceId: input.claim.claimId,
      description: 'Prize paid from agent till',
      occurredAt: input.occurredAt,
      metadata: {
        agentId: input.agentId,
        payoutReference: input.reference,
        winnerTicketRef: input.claim.winnerTicketRef,
      },
      lines: [
        {
          accountId: payable.accountId,
          side: LedgerEntrySide.DEBIT,
          amountNgn: input.claim.netPrizeValueNgn,
          memo: 'Settle winner prize payable',
        },
        {
          accountId: receivable.accountId,
          side: LedgerEntrySide.CREDIT,
          amountNgn: input.claim.netPrizeValueNgn,
          memo: 'Reduce amount agent owes SureWina',
        },
      ],
    });

    await tx.prizeClaim.update({
      where: { claimId: input.claim.claimId },
      data: { agentPayoutLedgerTxnId: journal.ledgerTxnId },
    });

    return journal;
  }

  async recordCommissionInTransaction(
    tx: Prisma.TransactionClient,
    remittanceId: string,
  ) {
    const remittance = await tx.remittance.findUniqueOrThrow({
      where: { remittanceId },
    });

    if (remittance.commissionNgn <= 0) {
      return null;
    }

    if (remittance.commissionLedgerTxnId) {
      return tx.ledgerTransaction.findUniqueOrThrow({
        where: { ledgerTxnId: remittance.commissionLedgerTxnId },
      });
    }

    const receivable = await this.ensureReceivableInTransaction(
      tx,
      remittance.agentId,
    );
    const expense = await this.requireAccount(
      tx,
      SYSTEM_LEDGER_ACCOUNT_CODES.AGENT_COMMISSION_EXPENSE,
    );

    const journal = await this.ledger.postInTransaction(tx, {
      idempotencyKey: `ledger:agent-commission:${remittance.remittanceId}`,
      kind: LedgerTransactionKind.COMMISSION,
      referenceType: 'Remittance',
      referenceId: remittance.remittanceId,
      description: 'Agent retained commission',
      occurredAt: remittance.periodDate,
      metadata: {
        agentId: remittance.agentId,
        periodDate: remittance.periodDate.toISOString(),
        grossSalesNgn: remittance.grossSalesNgn,
      },
      lines: [
        {
          accountId: expense.accountId,
          side: LedgerEntrySide.DEBIT,
          amountNgn: remittance.commissionNgn,
          memo: 'Agent commission expense',
        },
        {
          accountId: receivable.accountId,
          side: LedgerEntrySide.CREDIT,
          amountNgn: remittance.commissionNgn,
          memo: 'Commission retained by agent',
        },
      ],
    });

    await tx.remittance.update({
      where: { remittanceId: remittance.remittanceId },
      data: { commissionLedgerTxnId: journal.ledgerTxnId },
    });

    return journal;
  }

  async creditNegativeRemittanceToWallet(remittanceId: string) {
    const remittance = await this.getRemittance(remittanceId);

    if (remittance.amountDueNgn >= 0) {
      return remittance;
    }

    const wallet = await this.wallets.ensureAgentWallet(remittance.agentId);

    return this.serializable(async (tx) => {
      await this.lockRemittance(tx, remittanceId);

      const current = await tx.remittance.findUniqueOrThrow({
        where: { remittanceId },
      });

      await this.recordCommissionInTransaction(tx, remittanceId);

      if (current.walletCreditLedgerTxnId) {
        return tx.remittance.findUniqueOrThrow({
          where: { remittanceId },
        });
      }

      const receivable = await this.ensureReceivableInTransaction(
        tx,
        current.agentId,
      );
      const amountNgn = -current.amountDueNgn;

      const journal = await this.wallets.creditInTransaction(tx, {
        walletId: wallet.walletId,
        amountNgn,
        counterAccountId: receivable.accountId,
        idempotencyKey: `ledger:remittance-wallet-credit:${current.remittanceId}`,
        kind: LedgerTransactionKind.AGENT_REMITTANCE,
        referenceType: 'Remittance',
        referenceId: current.remittanceId,
        description: 'Agent daily net credit',
        metadata: {
          agentId: current.agentId,
          periodDate: current.periodDate.toISOString(),
        },
      });

      return tx.remittance.update({
        where: { remittanceId: current.remittanceId },
        data: {
          walletCreditLedgerTxnId: journal.ledgerTxnId,
          status: RemittanceStatus.CREDITED_TO_WALLET,
          receivedAt: new Date(),
        },
      });
    });
  }

  async ensureRemittanceCommission(remittanceId: string) {
    return this.serializable(async (tx) => {
      await this.lockRemittance(tx, remittanceId);

      await this.recordCommissionInTransaction(
        tx,
        remittanceId,
      );

      const current = await tx.remittance.findUniqueOrThrow({
        where: { remittanceId },
      });

      if (
        current.amountDueNgn === 0 &&
        (
          current.status === RemittanceStatus.PENDING ||
          current.status === RemittanceStatus.LATE
        )
      ) {
        return tx.remittance.update({
          where: { remittanceId },
          data: {
            status: RemittanceStatus.RECEIVED,
            receivedAt: new Date(),
          },
        });
      }

      return current;
    });
  }

  async settleBankRemittance(remittanceId: string) {
    return this.serializable(async (tx) => {
      await this.lockRemittance(tx, remittanceId);

      const remittance = await tx.remittance.findUniqueOrThrow({
        where: { remittanceId },
      });

      if (remittance.amountDueNgn <= 0) {
        throw new ConflictException(
          'Only positive remittances can be settled to the bank',
        );
      }

      if (
        remittance.status ===
          RemittanceStatus.RECEIVED &&
        remittance.settlementLedgerTxnId
      ) {
        return remittance;
      }

      if (
        remittance.status !==
        RemittanceStatus.AGENT_CONFIRMED
      ) {
        throw new ConflictException(
          'Agent must confirm the bank transfer before Finance can mark it received',
        );
      }

      if (!remittance.bankTransferRef) {
        throw new ConflictException(
          'Bank transfer reference is missing',
        );
      }

      await this.recordCommissionInTransaction(tx, remittanceId);

      if (remittance.settlementLedgerTxnId) {
        return tx.remittance.findUniqueOrThrow({
          where: { remittanceId },
        });
      }

      const bank = await this.requireAccount(
        tx,
        SYSTEM_LEDGER_ACCOUNT_CODES.BANK_CASH,
      );
      const receivable = await this.ensureReceivableInTransaction(
        tx,
        remittance.agentId,
      );

      const journal = await this.ledger.postInTransaction(tx, {
        idempotencyKey: `ledger:agent-remittance-bank:${remittance.remittanceId}`,
        kind: LedgerTransactionKind.AGENT_REMITTANCE,
        referenceType: 'Remittance',
        referenceId: remittance.remittanceId,
        description: 'Agent remittance received in bank',
        occurredAt: new Date(),
        metadata: {
          agentId: remittance.agentId,
          bankTransferRef: remittance.bankTransferRef,
        },
        lines: [
          {
            accountId: bank.accountId,
            side: LedgerEntrySide.DEBIT,
            amountNgn: remittance.amountDueNgn,
            memo: 'Cash received from agent',
          },
          {
            accountId: receivable.accountId,
            side: LedgerEntrySide.CREDIT,
            amountNgn: remittance.amountDueNgn,
            memo: 'Clear agent receivable',
          },
        ],
      });

      return tx.remittance.update({
        where: { remittanceId: remittance.remittanceId },
        data: {
          settlementLedgerTxnId: journal.ledgerTxnId,
          status: RemittanceStatus.RECEIVED,
          receivedAt: new Date(),
        },
      });
    });
  }

  async settleRemittanceFromWallet(agentId: string, remittanceId: string) {
    const remittance = await this.getRemittance(remittanceId);

    if (remittance.agentId !== agentId) {
      throw new ConflictException('Remittance does not belong to this agent');
    }
    if (remittance.amountDueNgn <= 0) {
      throw new ConflictException('Nothing to settle for this day');
    }

    const wallet = await this.wallets.ensureAgentWallet(agentId);

    return this.serializable(async (tx) => {
      await this.lockRemittance(tx, remittanceId);

      const current = await tx.remittance.findUniqueOrThrow({
        where: { remittanceId },
      });

      if (
        current.status !== RemittanceStatus.PENDING &&
        current.status !== RemittanceStatus.LATE
      ) {
        throw new ConflictException(`Remittance is ${current.status}`);
      }

      await this.recordCommissionInTransaction(tx, remittanceId);

      const receivable = await this.ensureReceivableInTransaction(tx, agentId);

      const journal = await this.wallets.debitInTransaction(tx, {
        walletId: wallet.walletId,
        amountNgn: current.amountDueNgn,
        counterAccountId: receivable.accountId,
        idempotencyKey: `ledger:remittance-wallet-settlement:${current.remittanceId}`,
        kind: LedgerTransactionKind.AGENT_REMITTANCE,
        referenceType: 'Remittance',
        referenceId: current.remittanceId,
        description: 'Agent remittance settled from wallet credit',
        metadata: {
          agentId,
          periodDate: current.periodDate.toISOString(),
        },
      });

      return tx.remittance.update({
        where: { remittanceId: current.remittanceId },
        data: {
          settlementLedgerTxnId: journal.ledgerTxnId,
          status: RemittanceStatus.RECEIVED,
          bankTransferRef: `WALLET-${current.remittanceId.slice(0, 8).toUpperCase()}`,
          agentConfirmedAt: new Date(),
          receivedAt: new Date(),
        },
      });
    });
  }

  async ensurePrizeAccrualInTransaction(
    tx: Prisma.TransactionClient,
    claim: PrizeAccrualInput,
  ) {
    if (claim.prizeAccrualLedgerTxnId) {
      return tx.ledgerTransaction.findUniqueOrThrow({
        where: { ledgerTxnId: claim.prizeAccrualLedgerTxnId },
      });
    }

    if (
      claim.grossPrizeValueNgn <= 0 ||
      claim.netPrizeValueNgn <= 0 ||
      claim.whtAmountNgn < 0 ||
      claim.grossPrizeValueNgn !== claim.netPrizeValueNgn + claim.whtAmountNgn
    ) {
      throw new ConflictException('Prize gross/net/WHT values do not balance');
    }

    const expense = await this.requireAccount(
      tx,
      SYSTEM_LEDGER_ACCOUNT_CODES.PRIZE_EXPENSE,
    );
    const payable = await this.requireAccount(
      tx,
      SYSTEM_LEDGER_ACCOUNT_CODES.PRIZE_PAYABLE,
    );

    const lines: Array<{
      accountId: string;
      side: LedgerEntrySide;
      amountNgn: number;
      memo: string;
    }> = [
      {
        accountId: expense.accountId,
        side: LedgerEntrySide.DEBIT,
        amountNgn: claim.grossPrizeValueNgn,
        memo: 'Recognise prize expense',
      },
      {
        accountId: payable.accountId,
        side: LedgerEntrySide.CREDIT,
        amountNgn: claim.netPrizeValueNgn,
        memo: 'Winner prize payable',
      },
    ];

    if (claim.whtAmountNgn > 0) {
      const wht = await this.requireAccount(
        tx,
        SYSTEM_LEDGER_ACCOUNT_CODES.WHT_PAYABLE,
      );

      lines.push({
        accountId: wht.accountId,
        side: LedgerEntrySide.CREDIT,
        amountNgn: claim.whtAmountNgn,
        memo: 'Withholding tax payable',
      });
    }

    const journal = await this.ledger.postInTransaction(tx, {
      idempotencyKey: `ledger:prize-accrual:${claim.claimId}`,
      kind: LedgerTransactionKind.PRIZE_ACCRUAL,
      referenceType: 'PrizeClaim',
      referenceId: claim.claimId,
      description: `Prize accrual for ${claim.winnerTicketRef}`,
      metadata: {
        winnerTicketRef: claim.winnerTicketRef,
        grossPrizeValueNgn: claim.grossPrizeValueNgn,
        whtAmountNgn: claim.whtAmountNgn,
        netPrizeValueNgn: claim.netPrizeValueNgn,
      },
      lines,
    });

    await tx.prizeClaim.update({
      where: { claimId: claim.claimId },
      data: { prizeAccrualLedgerTxnId: journal.ledgerTxnId },
    });

    return journal;
  }

  async ensureReceivableInTransaction(
    tx: Prisma.TransactionClient,
    agentId: string,
  ) {
    const code = `AGENT:${agentId.toUpperCase()}:RECEIVABLE`;

    await tx.ledgerAccount.createMany({
      data: [
        {
          code,
          name: 'Agent Receivable',
          accountType: LedgerAccountType.ASSET,
          purpose: LedgerAccountPurpose.AGENT_RECEIVABLE,
          ownerType: LedgerOwnerType.AGENT,
          ownerId: agentId,
          currency: 'NGN',
        },
      ],
      skipDuplicates: true,
    });

    const account = await tx.ledgerAccount.findUniqueOrThrow({
      where: { code },
    });

    if (
      account.accountType !== LedgerAccountType.ASSET ||
      account.purpose !== LedgerAccountPurpose.AGENT_RECEIVABLE ||
      account.ownerType !== LedgerOwnerType.AGENT ||
      account.ownerId !== agentId ||
      account.currency !== 'NGN'
    ) {
      throw new ConflictException(
        'Agent receivable ledger account has unexpected identity',
      );
    }

    return account;
  }

  private async getRemittance(remittanceId: string) {
    const remittance = await this.prisma.remittance.findUnique({
      where: { remittanceId },
    });

    if (!remittance) {
      throw new NotFoundException('Remittance not found');
    }

    return remittance;
  }

  private lockRemittance(
    tx: Prisma.TransactionClient,
    remittanceId: string,
  ) {
    return tx.$queryRaw`
      SELECT "remittance_id"
      FROM "remittances"
      WHERE "remittance_id" = ${remittanceId}
      FOR UPDATE
    `;
  }

  private async requireAccount(
    tx: Prisma.TransactionClient,
    code: string,
  ) {
    const account = await tx.ledgerAccount.findUnique({
      where: { code },
    });

    if (!account) {
      throw new ConflictException(
        `Required ledger account ${code} does not exist`,
      );
    }

    return account;
  }

  private async serializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const run = () =>
      this.prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });

    try {
      return await run();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        return run();
      }

      throw error;
    }
  }
}
