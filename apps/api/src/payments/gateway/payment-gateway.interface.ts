import { PaymentGateway as PaymentGatewayEnum } from '@prisma/client';

// What the caller wants the gateway to set up.
export type InitializePaymentInput = {
  // Amount in kobo (NGN * 100) — gateways charge in the minor unit.
  amountKobo: number;
  // Our internal reference; the gateway echoes this back on the webhook.
  reference: string;
  // Optional email — Paystack requires one; we synthesise from phone if absent.
  email: string;
  // Where the gateway redirects the buyer after payment.
  callbackUrl: string;
  // Arbitrary data echoed back on the webhook (buyerPhone, drawCode, etc.).
  metadata: Record<string, unknown>;
};

export type InitializePaymentResult = {
  // The hosted checkout page URL we return to the client.
  authorizationUrl: string;
  // The gateway's own reference (may equal ours; we store the definitive one).
  gatewayReference: string;
};

// Every gateway (Paystack now, Flutterwave in 6.8) implements this.
export interface PaymentGatewayDriver {
  readonly gateway: PaymentGatewayEnum;
  initialize(input: InitializePaymentInput): Promise<InitializePaymentResult>;
}

// DI token so the service can depend on the interface, not a concrete class.
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');