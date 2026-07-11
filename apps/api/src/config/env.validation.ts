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
  BVN_PROVIDER_API_KEY: Joi.string().allow('').default(''),
  KYC_STORAGE_DIR: Joi.string().default('./storage'),
  WHT_RATE_PERCENT: Joi.number().min(0).max(100).default(5),
  WHT_THRESHOLD_NGN: Joi.number().integer().min(0).default(0),
  PAYOUTS_MODE: Joi.string().valid('dev', 'paystack').default('dev'),
  AGENT_PAYOUT_MAX_NGN: Joi.number().integer().min(0).default(50000),
  REFUNDS_MODE: Joi.string().valid('dev', 'paystack').default('dev'),
});