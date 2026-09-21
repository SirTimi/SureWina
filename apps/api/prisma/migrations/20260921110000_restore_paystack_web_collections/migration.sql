-- Restore Paystack for direct web ticket purchases.
--
-- Phase 8 previously blocked PAYSTACK on both payment_transactions
-- and wallet_fundings.
--
-- The intended architecture is now:
--
--   Direct web ticket purchases -> PAYSTACK
--   Wallet funding              -> MONNIFY / FLUTTERWAVE
--
-- Therefore only the PaymentTransaction trigger is removed.
-- The wallet_fundings Paystack restriction remains intact.

DROP TRIGGER IF EXISTS payment_transactions_no_new_paystack
ON "payment_transactions";