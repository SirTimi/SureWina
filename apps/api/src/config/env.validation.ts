import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .default('development'),

  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),

  PORT: Joi.number().port().default(4000),
  HOST: Joi.string().default('0.0.0.0'),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().integer().min(0).default(0),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),

  REFRESH_TOKEN_COOKIE_NAME: Joi.string().default('surewina_refresh_token'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).max(90).default(30),

  OTP_TTL_SECONDS: Joi.number().integer().min(60).max(900).default(300),

  // ─── Payments ───
  PAYSTACK_SECRET_KEY: Joi.string().allow('').default(''),
  PAYSTACK_BASE_URL: Joi.string().uri().default('https://api.paystack.co'),
  // Public base for building payment callback URLs shown after checkout.
  PAYMENT_CALLBACK_BASE_URL: Joi.string()
    .uri()
    .default('http://localhost:3000'),

  FLUTTERWAVE_SECRET_KEY: Joi.string().allow('').default(''),
  FLUTTERWAVE_BASE_URL: Joi.string().uri().default('https://api.flutterwave.com'),
  // Static hash Flutterwave sends in the verif-hash webhook header.
  FLUTTERWAVE_WEBHOOK_HASH: Joi.string().allow('').default(''),
  PUBLIC_WEB_BASE_URL: Joi.string().uri().default('http://localhost:3000'),
  AGENT_WEB_BASE_URL: Joi.string().uri().default('http://localhost:3001'),
  BVN_PROVIDER_API_KEY: Joi.string().allow('').default(''),
  KYC_STORAGE_DIR: Joi.string().default('./storage'),
  WHT_RATE_PERCENT: Joi.number().min(0).max(100).default(5),
  WHT_THRESHOLD_NGN: Joi.number().integer().min(0).default(0),
  AGENT_PAYOUT_MAX_NGN: Joi.number().integer().min(0).default(50000),
  REFUNDS_MODE: Joi.string().valid('dev', 'live').default('dev'),
  V2N_USERNAME: Joi.string().allow('').optional(),
  V2N_PASSWORD: Joi.string().allow('').optional(),
  V2N_SENDER_ID: Joi.string().allow('').default('SureWina'),
  SMS_DAILY_CAP: Joi.number().integer().min(1).default(300),
  ZOHO_SMTP_HOST: Joi.string().allow('').default('smtp.zoho.com'),
  ZOHO_SMTP_PORT: Joi.number().default(465),
  ZOHO_SMTP_USER: Joi.string().allow('').optional(),
  ZOHO_SMTP_PASSWORD: Joi.string().allow('').optional(),
  ZOHO_FROM_ADDRESS: Joi.string().allow('').optional(),
  MONNIFY_API_KEY:
    Joi.string()
      .allow('')
      .default(''),

  MONNIFY_SECRET_KEY:
    Joi.string()
      .allow('')
      .default(''),

  MONNIFY_BASE_URL:
    Joi.string()
      .uri()
      .default(
        'https://sandbox.monnify.com',
      ),

  MONNIFY_SOURCE_ACCOUNT_NUMBER:
    Joi.string()
      .allow('')
      .default(''),

  MONNIFY_CONTRACT_CODE:
    Joi.string()
      .allow('')
      .default(''),

  MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS:
    Joi.boolean()
      .default(false),

  TREASURY_BANK_REFERENCE: Joi.string().allow('').default(''),
  TREASURY_BANK_CODE: Joi.string().allow('').default(''),
  TREASURY_BANK_ACCOUNT_LAST4: Joi.string().allow('').pattern(/^\d{4}$/).default(''),
  FINANCIAL_LEDGER_CUTOVER_AT: Joi.string().allow('').default(''),

  // WITMANGO is an external Fineract wallet/CBA, not a card/bank PSP.
  // Off by default: do not affect existing ledger/funding behavior.
  WITMANGO_ENABLED: Joi.boolean().default(false),
  WITMANGO_BASE_URL: Joi.string().allow('').default(''),
  WITMANGO_TENANT_ID: Joi.string().allow('').default(''),
  WITMANGO_USERNAME: Joi.string().allow('').default(''),
  WITMANGO_PASSWORD: Joi.string().allow('').default(''),
  WITMANGO_TIMEOUT_MS: Joi.number().integer().min(1000).max(30000).default(10000),

  WALLET_FUNDING_MIN_NGN: Joi.number().integer().min(1).default(100),
  WALLET_FUNDING_MAX_NGN: Joi.number().integer().min(100).default(500000),
  KYC_BANK_FINGERPRINT_KEY: Joi.string().min(32).allow('').default(''),
  PAYOUT_ACCOUNT_ENCRYPTION_KEY: Joi.string()
  .pattern(/^[A-Za-z0-9+/]{43}=$/)
  .allow('')
  .default(''),

  PAYSTACK_TRANSFERS_ENABLED:
    Joi.boolean().default(false),

  PAYSTACK_TRANSFER_FEE_BUFFER_KOBO:
    Joi.number().integer().min(0).default(100000),

  WITMANGO_PROVISIONING_ENABLED:
  Joi.boolean().default(false),

  WITMANGO_OFFICE_ID:
    Joi.number().integer().min(1).optional(),

  WITMANGO_LEGAL_FORM_ID:
    Joi.number().integer().min(1).optional(),

  // One CBA savings product per wallet purpose. Separate products give
  // separate GL lines, so the books show deposits and winnings as distinct
  // liabilities without anyone tagging transactions.
  WITMANGO_DEPOSIT_PRODUCT_ID:
    Joi.number().integer().min(1).optional(),

  WITMANGO_WINNINGS_PRODUCT_ID:
    Joi.number().integer().min(1).optional(),

  WITMANGO_FLOAT_PRODUCT_ID:
    Joi.number().integer().min(1).optional(),

  WITMANGO_EARNINGS_PRODUCT_ID:
    Joi.number().integer().min(1).optional(),

  WITMANGO_WITHDRAWAL_RESERVATIONS_ENABLED:
    Joi.boolean().default(false),

  WITMANGO_MONETARY_ENABLED:
    Joi.boolean().default(false),

  WITMANGO_PAYMENT_TYPE_ID:
    Joi.number().integer().min(1).optional(),

  // Spending from CBA wallets: customer ticket purchases and agent sales are
  // paid by transfer between CBA savings accounts instead of from the
  // SureWina ledger wallet. Only wallets whose CBA pair is fully active use
  // it; every other wallet keeps the ledger path. Off unless deliberately
  // enabled, and needs WITMANGO_MONETARY_ENABLED as well.
  WITMANGO_WALLET_SPENDING_ENABLED:
    Joi.boolean().default(false),

  // SureWina's own CBA savings account that ticket money is transferred to,
  // and agent commission is paid from. Opened by Witmango; office is
  // WITMANGO_OFFICE_ID.
  WITMANGO_SALES_CLIENT_ID:
    Joi.number().integer().min(1).optional(),

  WITMANGO_SALES_ACCOUNT_ID:
    Joi.number().integer().min(1).optional(),

  // Winners may take a cash prize into their CBA Winnings account instead of
  // a bank payout. Off unless deliberately enabled; needs
  // WITMANGO_MONETARY_ENABLED and the sales account above.
  WITMANGO_PRIZE_CREDITS_ENABLED:
    Joi.boolean().default(false),

  // Cash prizes on tickets a customer bought directly are paid into their
  // wallet automatically after the draw (agent-sold tickets are paid by the
  // agent). Off unless deliberately enabled; needs
  // WITMANGO_PRIZE_CREDITS_ENABLED.
  PRIZE_AUTO_WALLET_CREDIT_ENABLED:
    Joi.boolean().default(false),

  // A 4-digit PIN is needed to withdraw and to save a bank account. On by
  // default; switching it off removes that check for everyone.
  WALLET_PIN_REQUIRED:
    Joi.boolean().default(true),

  // Saved withdrawal accounts. Each one is BVN-matched by Monnify (a paid
  // verification call), so this is off unless deliberately enabled and needs
  // MONNIFY_IDENTITY_VERIFICATION_ENABLED as well.
  WITHDRAWAL_ACCOUNTS_ENABLED:
    Joi.boolean().default(false),

  // How long a newly saved account waits before it can be withdrawn to.
  // Business value to confirm with Paul; 24 hours until then.
  WITHDRAWAL_ACCOUNT_COOLING_OFF_HOURS:
    Joi.number().integer().min(0).max(720).default(24),

  WITHDRAWAL_ACCOUNTS_MAX:
    Joi.number().integer().min(1).max(10).default(3),

  // Attempts to save an account per wallet per day, matched or not. Each
  // match is a paid Monnify call.
  WITHDRAWAL_ACCOUNT_ADDS_PER_DAY:
    Joi.number().integer().min(1).max(20).default(3),

  // Withdrawals from CBA wallets to saved bank accounts, paid by Monnify.
  // Off unless deliberately enabled. Needs WITMANGO_MONETARY_ENABLED, the
  // Pending Withdrawals account below, MONNIFY_SOURCE_ACCOUNT_NUMBER, and
  // Monnify's disbursement OTP switched off for API transfers.
  WALLET_WITHDRAWALS_ENABLED:
    Joi.boolean().default(false),

  // SureWina's CBA account that holds money between the lock and the payout.
  WITMANGO_PENDING_WITHDRAWALS_CLIENT_ID:
    Joi.number().integer().min(1).optional(),

  WITMANGO_PENDING_WITHDRAWALS_ACCOUNT_ID:
    Joi.number().integer().min(1).optional(),

  // Withdrawal limits — values for Paul to set. A per-request or daily
  // maximum left at 0 means "not configured", and withdrawals are refused
  // for that owner type: no limit is never assumed.
  WITHDRAWAL_MIN_NGN:
    Joi.number().integer().min(1).default(100),

  WITHDRAWAL_MAX_PER_REQUEST_CUSTOMER_NGN:
    Joi.number().integer().min(0).default(0),

  WITHDRAWAL_MAX_PER_REQUEST_AGENT_NGN:
    Joi.number().integer().min(0).default(0),

  WITHDRAWAL_DAILY_MAX_CUSTOMER_NGN:
    Joi.number().integer().min(0).default(0),

  WITHDRAWAL_DAILY_MAX_AGENT_NGN:
    Joi.number().integer().min(0).default(0),

  // The share of the withdrawable balance one request may take.
  WITHDRAWAL_MAX_PERCENT_OF_BALANCE:
    Joi.number().integer().min(1).max(100).default(100),

  // Withdrawals above this wait for finance approval, already locked.
  // 0 means none need approval.
  WITHDRAWAL_APPROVAL_THRESHOLD_NGN:
    Joi.number().integer().min(0).default(0),

  // Daily vault-against-book reconciliation for CBA wallets. Reads every CBA
  // account and the Monnify wallet balance. Off unless deliberately enabled;
  // finance can also run it by hand.
  CBA_RECONCILIATION_ENABLED:
    Joi.boolean().default(false),

  // The WAT hour at which the daily run happens.
  CBA_RECONCILIATION_HOUR_WAT:
    Joi.number().integer().min(0).max(23).default(6),

  // How far the full vault-against-book difference may drift, in naira,
  // before it is raised as an issue. Coverage itself has no tolerance.
  CBA_RECONCILIATION_TOLERANCE_NGN:
    Joi.number().integer().min(0).default(0),

  // The retry sweep: moves on withdrawals waiting on Monnify or the CBA,
  // and sends owed commission and prize reimbursements that never went out.
  // Only ever repeats what is proven safe to repeat. Off unless enabled.
  CBA_RECOVERY_SWEEP_ENABLED:
    Joi.boolean().default(false),

  // BVN verification is live-only at Monnify and costs ₦10 per successful
  // check from the Monnify balance. Off unless deliberately enabled.
  MONNIFY_IDENTITY_VERIFICATION_ENABLED:
    Joi.boolean().default(false),

  // Monnify's BVN checks are live-only. With this on, the checks answer from
  // a fixed set of test BVNs instead — and only when the Monnify settings are
  // the sandbox's (sandbox.monnify.com and an MK_TEST_ key). On any other
  // configuration every BVN check is refused, never passed.
  MONNIFY_SANDBOX_VERIFICATION_MOCK:
    Joi.boolean().default(false),

  // Whether the customer's SureWina phone number must also match the one on
  // their BVN record. Off by default: many BVN records carry an old number,
  // so requiring it refuses genuine customers.
  KYC_REQUIRE_BVN_PHONE_MATCH:
    Joi.boolean().default(false),

  KYC_MAX_FAILED_ATTEMPTS_PER_DAY:
    Joi.number().integer().min(1).default(3),

  // Reserved accounts are how wallets get funded by bank transfer. Off
  // unless deliberately enabled.
  MONNIFY_RESERVED_ACCOUNTS_ENABLED:
    Joi.boolean().default(false),

  // Deposit limits, set as limit profiles in Monnify and attached to every
  // account at creation. Without the relevant code, no account is issued.
  MONNIFY_CUSTOMER_LIMIT_PROFILE_CODE:
    Joi.string().trim().max(40).allow('').default(''),

  MONNIFY_AGENT_LIMIT_PROFILE_CODE:
    Joi.string().trim().max(40).allow('').default(''),
  
  // Backstop deposit limits. Monnify's limit profile is the real limit and
  // refuses an over-limit transfer at the bank; these catch the case where
  // that profile is wrong or missing. A deposit above the backstop is held
  // for finance, not credited. 0 disables the backstop.
  WALLET_TOPUP_BACKSTOP_CUSTOMER_NGN:
    Joi.number().integer().min(0).default(0),

  WALLET_TOPUP_BACKSTOP_AGENT_NGN:
    Joi.number().integer().min(0).default(0),
});