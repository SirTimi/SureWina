-- Phase 7: allow customer-selected Monnify wallet funding.
--
-- PAYSTACK remains permitted here only for historical rows created before
-- Monnify became an active collection rail. New application flows expose
-- MONNIFY and FLUTTERWAVE only.

ALTER TABLE "wallet_fundings"
DROP CONSTRAINT IF EXISTS "wallet_funding_online_gateway_only";

ALTER TABLE "wallet_fundings"
ADD CONSTRAINT "wallet_funding_online_gateway_only"
CHECK (
  "gateway"::text IN ('PAYSTACK', 'MONNIFY', 'FLUTTERWAVE')
);
