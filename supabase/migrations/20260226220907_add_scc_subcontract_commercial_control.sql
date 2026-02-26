/*
  # SCC: Subcontract Commercial Control

  ## Overview
  This migration creates the full SCC module schema. The SCC module allows subcontractors
  (or main contractors managing subs) to track a subcontract from award through to final payment,
  with locked contract snapshots, progress claims, variation registers, and reconciliation.

  ## New Tables

  ### scc_contracts
  The master contract record linking a project + subcontractor quote to a locked subcontract.
  - id, project_id, organisation_id
  - contract_number, contract_name
  - subcontractor_name, subcontractor_company, subcontractor_email, subcontractor_phone
  - contract_value (original)
  - retention_percentage (default 5%)
  - retention_release_method: 'practical_completion' | 'on_demand' | 'staged'
  - payment_terms_days (default 20)
  - claim_cutoff_day (day of month, default 20)
  - contract_start_date, contract_end_date
  - status: 'setup' | 'active' | 'complete' | 'disputed'
  - snapshot_locked (bool) — locked after first claim
  - snapshot_hash (text) — deterministic hash of baseline at lock time
  - source_quote_id (optional FK to quotes)
  - created_at, updated_at

  ### scc_scope_lines
  The locked baseline — one row per line item from the approved quote/schedule.
  Mirrors commercial_baseline_items but is SCC-native.
  - id, contract_id, project_id, organisation_id
  - line_number (e.g. SCC-0001)
  - section, description, system_category
  - unit, qty_contract (locked contract qty)
  - unit_rate, line_total (computed)
  - claim_method: 'percentage' | 'quantity' | 'milestone'
  - evidence_required (bool)
  - is_variation (bool — false for base lines)
  - variation_id (FK to scc_variations if is_variation)
  - notes
  - created_at

  ### scc_claim_periods
  One record per claim submission (monthly, fortnightly, etc.)
  - id, contract_id, project_id, organisation_id
  - period_number (sequential)
  - period_name (e.g. "Progress Claim #3 — March 2026")
  - claim_date, period_start, period_end
  - status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'partial' | 'rejected'
  - total_claimed_this_period
  - total_claimed_cumulative
  - retention_deducted_this_period
  - retention_held_cumulative
  - net_payable_this_period
  - approved_amount (set by MC)
  - disputed_amount
  - notes, mc_notes
  - submitted_at, approved_at
  - created_at, updated_at

  ### scc_claim_lines
  Line-level detail for each claim period.
  - id, claim_period_id, scope_line_id, contract_id
  - qty_previous_cumulative
  - qty_this_claim
  - qty_cumulative (previous + this)
  - percent_this_claim, percent_cumulative
  - amount_this_claim, amount_cumulative
  - amount_remaining
  - mc_approved_qty, mc_approved_amount (set during review)
  - dispute_flag, dispute_note
  - created_at, updated_at

  ### scc_variations
  Variation events (add/omit/adjustment).
  - id, contract_id, project_id, organisation_id
  - vo_number (e.g. VO-001)
  - title, description
  - type: 'addition' | 'omission' | 'adjustment'
  - status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'claimed' | 'paid'
  - submitted_by (text)
  - instructed_by (text)
  - instruction_reference
  - claimed_amount, approved_amount
  - created_at, updated_at

  ## Security
  - RLS enabled on all tables
  - Users can only access records within their own organisation
*/

-- ============================================================
-- scc_contracts
-- ============================================================
CREATE TABLE IF NOT EXISTS scc_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  contract_number text NOT NULL DEFAULT '',
  contract_name text NOT NULL DEFAULT '',
  subcontractor_name text NOT NULL DEFAULT '',
  subcontractor_company text DEFAULT '',
  subcontractor_email text DEFAULT '',
  subcontractor_phone text DEFAULT '',
  contract_value numeric(15,2) NOT NULL DEFAULT 0,
  retention_percentage numeric(5,2) NOT NULL DEFAULT 5.00,
  retention_release_method text NOT NULL DEFAULT 'practical_completion'
    CHECK (retention_release_method IN ('practical_completion', 'on_demand', 'staged')),
  payment_terms_days integer NOT NULL DEFAULT 20,
  claim_cutoff_day integer NOT NULL DEFAULT 20,
  contract_start_date date,
  contract_end_date date,
  status text NOT NULL DEFAULT 'setup'
    CHECK (status IN ('setup', 'active', 'complete', 'disputed')),
  snapshot_locked boolean NOT NULL DEFAULT false,
  snapshot_hash text,
  source_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scc_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scc_contracts_select"
  ON scc_contracts FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "scc_contracts_insert"
  ON scc_contracts FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "scc_contracts_update"
  ON scc_contracts FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "scc_contracts_delete"
  ON scc_contracts FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================
-- scc_scope_lines
-- ============================================================
CREATE TABLE IF NOT EXISTS scc_scope_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES scc_contracts(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  line_number text NOT NULL DEFAULT '',
  section text NOT NULL DEFAULT 'General',
  description text NOT NULL DEFAULT '',
  system_category text DEFAULT '',
  unit text NOT NULL DEFAULT 'item',
  qty_contract numeric(15,4) NOT NULL DEFAULT 0,
  unit_rate numeric(15,4) NOT NULL DEFAULT 0,
  line_total numeric(15,2) GENERATED ALWAYS AS (ROUND((qty_contract * unit_rate)::numeric, 2)) STORED,
  claim_method text NOT NULL DEFAULT 'percentage'
    CHECK (claim_method IN ('percentage', 'quantity', 'milestone')),
  evidence_required boolean NOT NULL DEFAULT false,
  is_variation boolean NOT NULL DEFAULT false,
  variation_id uuid,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scc_scope_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scc_scope_lines_select"
  ON scc_scope_lines FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "scc_scope_lines_insert"
  ON scc_scope_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "scc_scope_lines_update"
  ON scc_scope_lines FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "scc_scope_lines_delete"
  ON scc_scope_lines FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================
-- scc_claim_periods
-- ============================================================
CREATE TABLE IF NOT EXISTS scc_claim_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES scc_contracts(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  period_number integer NOT NULL DEFAULT 1,
  period_name text NOT NULL DEFAULT '',
  claim_date date NOT NULL DEFAULT CURRENT_DATE,
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'partial', 'rejected')),
  total_claimed_this_period numeric(15,2) NOT NULL DEFAULT 0,
  total_claimed_cumulative numeric(15,2) NOT NULL DEFAULT 0,
  retention_deducted_this_period numeric(15,2) NOT NULL DEFAULT 0,
  retention_held_cumulative numeric(15,2) NOT NULL DEFAULT 0,
  net_payable_this_period numeric(15,2) NOT NULL DEFAULT 0,
  approved_amount numeric(15,2),
  disputed_amount numeric(15,2) NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  mc_notes text DEFAULT '',
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scc_claim_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scc_claim_periods_select"
  ON scc_claim_periods FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "scc_claim_periods_insert"
  ON scc_claim_periods FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "scc_claim_periods_update"
  ON scc_claim_periods FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "scc_claim_periods_delete"
  ON scc_claim_periods FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================
-- scc_claim_lines
-- ============================================================
CREATE TABLE IF NOT EXISTS scc_claim_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_period_id uuid NOT NULL REFERENCES scc_claim_periods(id) ON DELETE CASCADE,
  scope_line_id uuid NOT NULL REFERENCES scc_scope_lines(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES scc_contracts(id) ON DELETE CASCADE,
  qty_previous_cumulative numeric(15,4) NOT NULL DEFAULT 0,
  qty_this_claim numeric(15,4) NOT NULL DEFAULT 0,
  qty_cumulative numeric(15,4) NOT NULL DEFAULT 0,
  percent_this_claim numeric(7,4) NOT NULL DEFAULT 0,
  percent_cumulative numeric(7,4) NOT NULL DEFAULT 0,
  amount_this_claim numeric(15,2) NOT NULL DEFAULT 0,
  amount_cumulative numeric(15,2) NOT NULL DEFAULT 0,
  amount_remaining numeric(15,2) NOT NULL DEFAULT 0,
  mc_approved_qty numeric(15,4),
  mc_approved_amount numeric(15,2),
  dispute_flag boolean NOT NULL DEFAULT false,
  dispute_note text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scc_claim_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scc_claim_lines_select"
  ON scc_claim_lines FOR SELECT
  TO authenticated
  USING (
    contract_id IN (
      SELECT id FROM scc_contracts
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "scc_claim_lines_insert"
  ON scc_claim_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    contract_id IN (
      SELECT id FROM scc_contracts
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "scc_claim_lines_update"
  ON scc_claim_lines FOR UPDATE
  TO authenticated
  USING (
    contract_id IN (
      SELECT id FROM scc_contracts
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  )
  WITH CHECK (
    contract_id IN (
      SELECT id FROM scc_contracts
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "scc_claim_lines_delete"
  ON scc_claim_lines FOR DELETE
  TO authenticated
  USING (
    contract_id IN (
      SELECT id FROM scc_contracts
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- ============================================================
-- scc_variations
-- ============================================================
CREATE TABLE IF NOT EXISTS scc_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES scc_contracts(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  vo_number text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  type text NOT NULL DEFAULT 'addition'
    CHECK (type IN ('addition', 'omission', 'adjustment')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'claimed', 'paid')),
  submitted_by text DEFAULT '',
  instructed_by text DEFAULT '',
  instruction_reference text DEFAULT '',
  claimed_amount numeric(15,2) NOT NULL DEFAULT 0,
  approved_amount numeric(15,2),
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scc_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scc_variations_select"
  ON scc_variations FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "scc_variations_insert"
  ON scc_variations FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "scc_variations_update"
  ON scc_variations FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "scc_variations_delete"
  ON scc_variations FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_scc_contracts_project_id ON scc_contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_scc_contracts_organisation_id ON scc_contracts(organisation_id);
CREATE INDEX IF NOT EXISTS idx_scc_scope_lines_contract_id ON scc_scope_lines(contract_id);
CREATE INDEX IF NOT EXISTS idx_scc_scope_lines_organisation_id ON scc_scope_lines(organisation_id);
CREATE INDEX IF NOT EXISTS idx_scc_claim_periods_contract_id ON scc_claim_periods(contract_id);
CREATE INDEX IF NOT EXISTS idx_scc_claim_periods_organisation_id ON scc_claim_periods(organisation_id);
CREATE INDEX IF NOT EXISTS idx_scc_claim_lines_claim_period_id ON scc_claim_lines(claim_period_id);
CREATE INDEX IF NOT EXISTS idx_scc_claim_lines_scope_line_id ON scc_claim_lines(scope_line_id);
CREATE INDEX IF NOT EXISTS idx_scc_claim_lines_contract_id ON scc_claim_lines(contract_id);
CREATE INDEX IF NOT EXISTS idx_scc_variations_contract_id ON scc_variations(contract_id);
CREATE INDEX IF NOT EXISTS idx_scc_variations_organisation_id ON scc_variations(organisation_id);
