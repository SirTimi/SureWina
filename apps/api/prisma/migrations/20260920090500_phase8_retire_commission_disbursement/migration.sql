-- CommissionDisbursement belongs to the retired gross-commission model.
-- Existing rows remain as historical evidence and require explicit Finance
-- review during Phase 8. New rows/status mutations are blocked.

CREATE OR REPLACE FUNCTION phase8_freeze_legacy_commission_disbursement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'CommissionDisbursement is a retired legacy model; use net remittance commission accounting.'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER commission_disbursement_no_insert
BEFORE INSERT
ON "commission_disbursements"
FOR EACH ROW
EXECUTE FUNCTION phase8_freeze_legacy_commission_disbursement();

CREATE TRIGGER commission_disbursement_no_update
BEFORE UPDATE
ON "commission_disbursements"
FOR EACH ROW
EXECUTE FUNCTION phase8_freeze_legacy_commission_disbursement();

CREATE TRIGGER commission_disbursement_no_delete
BEFORE DELETE
ON "commission_disbursements"
FOR EACH ROW
EXECUTE FUNCTION phase8_freeze_legacy_commission_disbursement();
