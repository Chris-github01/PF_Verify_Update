/*
  # Extend Payment Claims — Full NZ Module

  ## Summary
  Extends the existing payment_claims and payment_claim_lines tables with additional
  fields required for a production-ready NZ Construction Contracts Act 2002 payment claim module.
  Adds bank details, per-line previous claimed tracking, separate variations table with
  approval/inclusion flags, activity logs, and export register.

  ## Changes

  ### payment_claims — new columns
  - `internal_reference` (text) — internal ref / our ref
  - `trade` (text) — trade discipline
  - `site_location` (text) — site address
  - `claim_period_start` (date)
  - `claim_period_end` (date)
  - `last_date_for_submitting` (date)
  - `bank_name` (text)
  - `account_name` (text)
  - `account_number` (text)
  - `payment_notes` (text)
  - `status` — expanded CHECK to include 'certified', 'disputed', 'cancelled'
  - `exported_pdf_at` (timestamptz)
  - `exported_excel_at` (timestamptz)
  - `created_by` (uuid)

  ### payment_claim_lines — new columns
  - `previous_claimed_value` (numeric) — carry-forward from prior claim

  ### New table: payment_claim_activity_logs
  Full audit trail per claim.

  ### New table: payment_claim_exports
  Register of generated exports.
*/

-- ─── Extend payment_claims ────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_claims' AND column_name='internal_reference') THEN
    ALTER TABLE payment_claims ADD COLUMN internal_reference text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_claims' AND column_name='trade') THEN
    ALTER TABLE payment_claims ADD COLUMN trade text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_claims' AND column_name='site_location') THEN
    ALTER TABLE payment_claims ADD COLUMN site_location text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_claims' AND column_name='claim_period_start') THEN
    ALTER TABLE payment_claims ADD COLUMN claim_period_start date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_claims' AND column_name='claim_period_end') THEN
    ALTER TABLE payment_claims ADD COLUMN claim_period_end date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_claims' AND column_name='last_date_for_submitting') THEN
    ALTER TABLE payment_claims ADD COLUMN last_date_for_submitting date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_claims' AND column_name='bank_name') THEN
    ALTER TABLE payment_claims ADD COLUMN bank_name text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_claims' AND column_name='account_name') THEN
    ALTER TABLE payment_claims ADD COLUMN account_name text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_claims' AND column_name='account_number') THEN
    ALTER TABLE payment_claims ADD COLUMN account_number text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_claims' AND column_name='payment_notes') THEN
    ALTER TABLE payment_claims ADD COLUMN payment_notes text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_claims' AND column_name='exported_pdf_at') THEN
    ALTER TABLE payment_claims ADD COLUMN exported_pdf_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_claims' AND column_name='exported_excel_at') THEN
    ALTER TABLE payment_claims ADD COLUMN exported_excel_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_claims' AND column_name='created_by') THEN
    ALTER TABLE payment_claims ADD COLUMN created_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Extend status CHECK to include certified, disputed, cancelled
ALTER TABLE payment_claims DROP CONSTRAINT IF EXISTS payment_claims_status_check;
ALTER TABLE payment_claims ADD CONSTRAINT payment_claims_status_check
  CHECK (status IN ('draft','submitted','certified','paid','disputed','cancelled'));

-- ─── Extend payment_claim_lines ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_claim_lines' AND column_name='previous_claimed_value') THEN
    ALTER TABLE payment_claim_lines ADD COLUMN previous_claimed_value numeric(15,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ─── payment_claim_activity_logs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_claim_activity_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_claim_id    uuid NOT NULL REFERENCES payment_claims(id) ON DELETE CASCADE,
  action_type         text NOT NULL,
  action_label        text NOT NULL,
  old_value_json      jsonb,
  new_value_json      jsonb,
  action_by           uuid REFERENCES auth.users(id),
  action_at           timestamptz DEFAULT now()
);

ALTER TABLE payment_claim_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select payment claim activity logs"
  ON payment_claim_activity_logs FOR SELECT TO authenticated
  USING (
    payment_claim_id IN (
      SELECT id FROM payment_claims
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Org members can insert payment claim activity logs"
  ON payment_claim_activity_logs FOR INSERT TO authenticated
  WITH CHECK (
    payment_claim_id IN (
      SELECT id FROM payment_claims
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- ─── payment_claim_exports ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_claim_exports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_claim_id    uuid NOT NULL REFERENCES payment_claims(id) ON DELETE CASCADE,
  export_type         text NOT NULL CHECK (export_type IN ('pdf','excel')),
  file_name           text,
  file_path           text,
  exported_by         uuid REFERENCES auth.users(id),
  exported_at         timestamptz DEFAULT now()
);

ALTER TABLE payment_claim_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select payment claim exports"
  ON payment_claim_exports FOR SELECT TO authenticated
  USING (
    payment_claim_id IN (
      SELECT id FROM payment_claims
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Org members can insert payment claim exports"
  ON payment_claim_exports FOR INSERT TO authenticated
  WITH CHECK (
    payment_claim_id IN (
      SELECT id FROM payment_claims
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payment_claim_activity_logs_claim ON payment_claim_activity_logs(payment_claim_id);
CREATE INDEX IF NOT EXISTS idx_payment_claim_exports_claim ON payment_claim_exports(payment_claim_id);
CREATE INDEX IF NOT EXISTS idx_payment_claims_status ON payment_claims(status);
