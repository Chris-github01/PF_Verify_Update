/*
  # SCC Early Warning System

  ## Summary
  Adds the Commercial Early Warning System to the SCC module. When a subcontractor
  submits a claim where the claimed amount exceeds the contract baseline amount and
  no approved variation exists, the system auto-generates an Early Warning Notice,
  places the claim line on Commercial Hold, and prevents certification.

  ## New Tables
  - `scc_early_warning_reports`
    - Links to scc_contracts, scc_claim_periods, and scc_claim_lines
    - Tracks overrun details: contract qty/amount vs claimed qty/amount
    - Status workflow: open → responded → resolved → dismissed
    - Stores trade info, affected trade, response notes, and resolution pathway
    - Tracks repeat offender count per scope line

  ## Modified Tables
  - `scc_claim_lines`
    - Added `certification_status` (certified | commercial_hold | pending | rejected)
    - Added `overrun_flagged` boolean flag
    - Added `early_warning_id` reference to the generated report

  ## Security
  - RLS enabled on early_warning_reports
  - Organisation members can view/manage their own reports
*/

CREATE TABLE IF NOT EXISTS scc_early_warning_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES scc_contracts(id) ON DELETE CASCADE,
  claim_period_id uuid REFERENCES scc_claim_periods(id) ON DELETE SET NULL,
  claim_line_id uuid REFERENCES scc_claim_lines(id) ON DELETE SET NULL,

  report_number text NOT NULL,
  trade_type text,
  affected_trade text,

  line_reference text,
  line_description text NOT NULL,

  contract_qty numeric(14,4),
  claimed_qty numeric(14,4),
  contract_amount numeric(14,2) NOT NULL DEFAULT 0,
  claimed_amount numeric(14,2) NOT NULL DEFAULT 0,
  overrun_amount numeric(14,2) GENERATED ALWAYS AS (claimed_amount - contract_amount) STORED,

  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'responded', 'resolved', 'dismissed')),

  resolution_pathway text
    CHECK (resolution_pathway IN ('approved_variation', 'omit_from_claim', 'recover_from_trade', 'dispute', NULL)),

  response_notes text,
  response_due_date timestamptz,
  responded_at timestamptz,
  resolved_at timestamptz,

  repeat_count integer NOT NULL DEFAULT 1,
  systemic_alert boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scc_early_warning_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view early warning reports"
  ON scc_early_warning_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = scc_early_warning_reports.organisation_id
        AND organisation_members.user_id = auth.uid()
        AND organisation_members.status = 'active'
    )
  );

CREATE POLICY "Org members can insert early warning reports"
  ON scc_early_warning_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = scc_early_warning_reports.organisation_id
        AND organisation_members.user_id = auth.uid()
        AND organisation_members.status = 'active'
    )
  );

CREATE POLICY "Org members can update early warning reports"
  ON scc_early_warning_reports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = scc_early_warning_reports.organisation_id
        AND organisation_members.user_id = auth.uid()
        AND organisation_members.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = scc_early_warning_reports.organisation_id
        AND organisation_members.user_id = auth.uid()
        AND organisation_members.status = 'active'
    )
  );

CREATE INDEX IF NOT EXISTS idx_scc_ew_reports_organisation_id ON scc_early_warning_reports(organisation_id);
CREATE INDEX IF NOT EXISTS idx_scc_ew_reports_contract_id ON scc_early_warning_reports(contract_id);
CREATE INDEX IF NOT EXISTS idx_scc_ew_reports_status ON scc_early_warning_reports(status);
CREATE INDEX IF NOT EXISTS idx_scc_ew_reports_claim_line_id ON scc_early_warning_reports(claim_line_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scc_claim_lines' AND column_name = 'certification_status'
  ) THEN
    ALTER TABLE scc_claim_lines
      ADD COLUMN certification_status text NOT NULL DEFAULT 'pending'
        CHECK (certification_status IN ('pending', 'certified', 'commercial_hold', 'rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scc_claim_lines' AND column_name = 'overrun_flagged'
  ) THEN
    ALTER TABLE scc_claim_lines ADD COLUMN overrun_flagged boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scc_claim_lines' AND column_name = 'early_warning_id'
  ) THEN
    ALTER TABLE scc_claim_lines ADD COLUMN early_warning_id uuid REFERENCES scc_early_warning_reports(id) ON DELETE SET NULL;
  END IF;
END $$;
