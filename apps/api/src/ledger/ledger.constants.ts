import {
  LedgerAccountPurpose,
  LedgerAccountType,
  LedgerOwnerType,
} from '@prisma/client';

export const SYSTEM_LEDGER_ACCOUNT_CODES = {
  PAYSTACK_CLEARING:
    'SYS:PSP:PAYSTACK',

  FLUTTERWAVE_CLEARING:
    'SYS:PSP:FLUTTERWAVE',

  BANK_CASH:
    'SYS:BANK:CASH',

  TICKET_SALES_REVENUE:
    'SYS:SALES:TICKET',

  PRIZE_EXPENSE:
    'SYS:PRIZE:EXPENSE',

  PRIZE_PAYABLE:
    'SYS:PRIZE:PAYABLE',

  WHT_PAYABLE:
    'SYS:TAX:WHT',

  REFUND_PAYABLE:
    'SYS:REFUND:PAYABLE',

  AGENT_COMMISSION_EXPENSE:
    'SYS:AGENT:COMMISSION',

  SUSPENSE:
    'SYS:SUSPENSE',

  MONNIFY_PAYOUT_CLEARING: 'SYS:PAYOUT:MONNIFY',
  PAYSTACK_PAYOUT_CLEARING: 'SYS:PAYOUT:PAYSTACK',
} as const;

export const SYSTEM_LEDGER_ACCOUNTS =
  [
    {
      code:
        SYSTEM_LEDGER_ACCOUNT_CODES.PAYSTACK_CLEARING,

      name:
        'Paystack Clearing',

      accountType:
        LedgerAccountType.ASSET,

      purpose:
        LedgerAccountPurpose.PSP_CLEARING,

      ownerType:
        LedgerOwnerType.SYSTEM,
    },

    {
      code:
        SYSTEM_LEDGER_ACCOUNT_CODES.FLUTTERWAVE_CLEARING,

      name:
        'Flutterwave Clearing',

      accountType:
        LedgerAccountType.ASSET,

      purpose:
        LedgerAccountPurpose.PSP_CLEARING,

      ownerType:
        LedgerOwnerType.SYSTEM,
    },

    {
      code:
        SYSTEM_LEDGER_ACCOUNT_CODES.BANK_CASH,

      name:
        'SureWina Bank Cash',

      accountType:
        LedgerAccountType.ASSET,

      purpose:
        LedgerAccountPurpose.BANK_CASH,

      ownerType:
        LedgerOwnerType.SYSTEM,
    },

    {
      code:
        SYSTEM_LEDGER_ACCOUNT_CODES.TICKET_SALES_REVENUE,

      name:
        'Ticket Sales Revenue',

      accountType:
        LedgerAccountType.REVENUE,

      purpose:
        LedgerAccountPurpose.TICKET_SALES_REVENUE,

      ownerType:
        LedgerOwnerType.SYSTEM,
    },

    {
      code:
        SYSTEM_LEDGER_ACCOUNT_CODES.PRIZE_EXPENSE,

      name:
        'Prize Expense',

      accountType:
        LedgerAccountType.EXPENSE,

      purpose:
        LedgerAccountPurpose.PRIZE_EXPENSE,

      ownerType:
        LedgerOwnerType.SYSTEM,
    },

    {
      code:
        SYSTEM_LEDGER_ACCOUNT_CODES.PRIZE_PAYABLE,

      name:
        'Prize Payable',

      accountType:
        LedgerAccountType.LIABILITY,

      purpose:
        LedgerAccountPurpose.PRIZE_PAYABLE,

      ownerType:
        LedgerOwnerType.SYSTEM,
    },

    {
      code:
        SYSTEM_LEDGER_ACCOUNT_CODES.WHT_PAYABLE,

      name:
        'Withholding Tax Payable',

      accountType:
        LedgerAccountType.LIABILITY,

      purpose:
        LedgerAccountPurpose.TAX_WHT_PAYABLE,

      ownerType:
        LedgerOwnerType.SYSTEM,
    },

    {
      code:
        SYSTEM_LEDGER_ACCOUNT_CODES.REFUND_PAYABLE,

      name:
        'Customer Refund Payable',

      accountType:
        LedgerAccountType.LIABILITY,

      purpose:
        LedgerAccountPurpose.REFUND_PAYABLE,

      ownerType:
        LedgerOwnerType.SYSTEM,
    },

    {
      code:
        SYSTEM_LEDGER_ACCOUNT_CODES.AGENT_COMMISSION_EXPENSE,

      name:
        'Agent Commission Expense',

      accountType:
        LedgerAccountType.EXPENSE,

      purpose:
        LedgerAccountPurpose.AGENT_COMMISSION_EXPENSE,

      ownerType:
        LedgerOwnerType.SYSTEM,
    },

    {
      code:
        SYSTEM_LEDGER_ACCOUNT_CODES.SUSPENSE,

      name:
        'Financial Suspense',

      accountType:
        LedgerAccountType.LIABILITY,

      purpose:
        LedgerAccountPurpose.SUSPENSE,

      ownerType:
        LedgerOwnerType.SYSTEM,
    },

    {
      code: SYSTEM_LEDGER_ACCOUNT_CODES.MONNIFY_PAYOUT_CLEARING,
      name: 'Monnify Payout Clearing',
      accountType: LedgerAccountType.ASSET,
      purpose: LedgerAccountPurpose.PAYOUT_CLEARING,
      ownerType: LedgerOwnerType.SYSTEM,
    },

    {
      code: SYSTEM_LEDGER_ACCOUNT_CODES.PAYSTACK_PAYOUT_CLEARING,
      name: 'Paystack Payout Clearing',
      accountType: LedgerAccountType.ASSET,
      purpose: LedgerAccountPurpose.PAYOUT_CLEARING,
      ownerType: LedgerOwnerType.SYSTEM,
    },
  ] as const;