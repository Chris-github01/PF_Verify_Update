/*
  # SCC Full Workflow System — Comprehensive Schema

  ## Summary
  This migration completes the SCC (Subcontract Commercial Control) data model with all
  tables needed for the end-to-end workflow: Quote Import → Contract Baseline → Progress
  Claims → Retention & Materials → Variation Register → Payment Reconciliation.

  ## New Tables

  ### Quote Import Phase
  - `scc_quote_imports` — tracks uploaded quote files submitted by sub-contractors
  - `scc_quote_line_items` — parsed line items extracted from the submitted quote

  ### Contract Baseline Phase
  - `scc_scope_lines` may already exist; this adds missing columns safely
  - Adds `claim_method` (percentage / quantity / lump_sum / milestone) and rate fields

  ### Claims Phase
  - `scc_on_site_materials` — material stored on-site claimed before installation
  - `scc_off_site_materials` — fabricated / stored off-site
  - `scc_claim_attachments` — evidence files for claims
  - `scc_retention_ledger` — retention hold/release events per claim period

  ### Payment Reconciliation
  - `scc_payment_certificates` — formal payment certificates issued by main contractor
  - `scc_payment_disputes` — dispute log per payment certificate

  ## Modified Tables
  - `scc_contracts` — adds payment_claim_prefix, next_claim_number, retention_limit_pct, defects_liability_months
  - `scc_claim_periods` — adds claim_number, site_materials_total, off_site_materials_total, retention_held, retention_released
  - `scc_scope_lines` — adds claim_method, unit_rate, original_qty, remaining_qty, last_claim_date

  ## Security
  - RLS enabled on all new tables
  - Policies based on organisation_members membership check
*/

-- ============================================================
-- SCC Quote Imports
-- ============================================================
CREATE TABLE IF NOT EXISTS scc_quote_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES scc_contracts(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_url text,
  file_size_bytes bigint,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','parsing','parsed','reviewed','locked')),
  parsed_line_count integer DEFAULT 0,
  total_value numeric(15,2),
  main_contractor text,
  project_name text,
  quote_reference text,
  quote_date date,
  trade_type text,
  parsing_notes text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  locked_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE scc_quote_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select scc_quote_imports"
  ON scc_quote_imports FOR SELECT TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can insert scc_quote_imports"
  ON scc_quote_imports FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can update scc_quote_imports"
  ON scc_quote_imports FOR UPDATE TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================
-- SCC Quote Line Items (parsed from uploaded quote)
-- ============================================================
CREATE TABLE IF NOT EXISTS scc_quote_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES scc_quote_imports(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  line_number text,
  description text NOT NULL,
  unit text,
  quantity numeric(15,4),
  unit_rate numeric(15,4),
  total_amount numeric(15,2),
  scope_category text,
  location text,
  specification_ref text,
  is_provisional boolean DEFAULT false,
  is_pc_sum boolean DEFAULT false,
  is_excluded boolean DEFAULT false,
  include_in_baseline boolean DEFAULT true,
  review_notes text,
  original_text text,
  confidence_score numeric(4,3),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE scc_quote_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select scc_quote_line_items"
  ON scc_quote_line_items FOR SELECT TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can insert scc_quote_line_items"
  ON scc_quote_line_items FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can update scc_quote_line_items"
  ON scc_quote_line_items FOR UPDATE TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================
-- On-Site Materials Claims
-- ============================================================
CREATE TABLE IF NOT EXISTS scc_on_site_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES scc_contracts(id) ON DELETE CASCADE,
  claim_period_id uuid REFERENCES scc_claim_periods(id) ON DELETE SET NULL,
  description text NOT NULL,
  material_reference text,
  location_on_site text,
  quantity numeric(15,4),
  unit text,
  unit_rate numeric(15,4),
  claimed_amount numeric(15,2) NOT NULL DEFAULT 0,
  approved_amount numeric(15,2),
  delivery_date date,
  delivery_docket text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','approved','rejected','incorporated')),
  evidence_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE scc_on_site_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select scc_on_site_materials"
  ON scc_on_site_materials FOR SELECT TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can insert scc_on_site_materials"
  ON scc_on_site_materials FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can update scc_on_site_materials"
  ON scc_on_site_materials FOR UPDATE TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================
-- Off-Site Materials Claims
-- ============================================================
CREATE TABLE IF NOT EXISTS scc_off_site_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES scc_contracts(id) ON DELETE CASCADE,
  claim_period_id uuid REFERENCES scc_claim_periods(id) ON DELETE SET NULL,
  description text NOT NULL,
  material_reference text,
  storage_location text,
  is_bond_secured boolean DEFAULT false,
  bond_reference text,
  quantity numeric(15,4),
  unit text,
  unit_rate numeric(15,4),
  claimed_amount numeric(15,2) NOT NULL DEFAULT 0,
  approved_amount numeric(15,2),
  fabrication_complete_date date,
  inspection_date date,
  inspector_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','approved','rejected','delivered')),
  evidence_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE scc_off_site_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select scc_off_site_materials"
  ON scc_off_site_materials FOR SELECT TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can insert scc_off_site_materials"
  ON scc_off_site_materials FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can update scc_off_site_materials"
  ON scc_off_site_materials FOR UPDATE TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================
-- Retention Ledger
-- ============================================================
CREATE TABLE IF NOT EXISTS scc_retention_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES scc_contracts(id) ON DELETE CASCADE,
  claim_period_id uuid REFERENCES scc_claim_periods(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('hold','practical_completion_release','final_completion_release','other_release')),
  gross_amount_this_period numeric(15,2) DEFAULT 0,
  retention_rate_pct numeric(5,2) DEFAULT 0,
  amount_held numeric(15,2) DEFAULT 0,
  amount_released numeric(15,2) DEFAULT 0,
  running_balance numeric(15,2) DEFAULT 0,
  release_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scc_retention_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select scc_retention_ledger"
  ON scc_retention_ledger FOR SELECT TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can insert scc_retention_ledger"
  ON scc_retention_ledger FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================
-- Payment Certificates
-- ============================================================
CREATE TABLE IF NOT EXISTS scc_payment_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES scc_contracts(id) ON DELETE CASCADE,
  claim_period_id uuid NOT NULL REFERENCES scc_claim_periods(id) ON DELETE CASCADE,
  certificate_number text NOT NULL,
  claim_amount numeric(15,2) NOT NULL DEFAULT 0,
  certified_amount numeric(15,2) NOT NULL DEFAULT 0,
  retention_held numeric(15,2) DEFAULT 0,
  net_payable numeric(15,2) NOT NULL DEFAULT 0,
  issued_date date,
  due_date date,
  paid_date date,
  paid_amount numeric(15,2),
  payment_reference text,
  issued_by text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','disputed','overdue')),
  dispute_reason text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE scc_payment_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select scc_payment_certificates"
  ON scc_payment_certificates FOR SELECT TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can insert scc_payment_certificates"
  ON scc_payment_certificates FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can update scc_payment_certificates"
  ON scc_payment_certificates FOR UPDATE TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================
-- Augment scc_contracts with workflow fields
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_contracts' AND column_name='payment_claim_prefix') THEN
    ALTER TABLE scc_contracts ADD COLUMN payment_claim_prefix text NOT NULL DEFAULT 'PC';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_contracts' AND column_name='next_claim_number') THEN
    ALTER TABLE scc_contracts ADD COLUMN next_claim_number integer NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_contracts' AND column_name='retention_limit_pct') THEN
    ALTER TABLE scc_contracts ADD COLUMN retention_limit_pct numeric(5,2) DEFAULT 5.00;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_contracts' AND column_name='defects_liability_months') THEN
    ALTER TABLE scc_contracts ADD COLUMN defects_liability_months integer DEFAULT 12;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_contracts' AND column_name='quote_import_id') THEN
    ALTER TABLE scc_contracts ADD COLUMN quote_import_id uuid REFERENCES scc_quote_imports(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_contracts' AND column_name='practical_completion_date') THEN
    ALTER TABLE scc_contracts ADD COLUMN practical_completion_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_contracts' AND column_name='final_completion_date') THEN
    ALTER TABLE scc_contracts ADD COLUMN final_completion_date date;
  END IF;
END $$;

-- ============================================================
-- Augment scc_claim_periods with materials & retention
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_claim_periods' AND column_name='claim_number') THEN
    ALTER TABLE scc_claim_periods ADD COLUMN claim_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_claim_periods' AND column_name='site_materials_total') THEN
    ALTER TABLE scc_claim_periods ADD COLUMN site_materials_total numeric(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_claim_periods' AND column_name='off_site_materials_total') THEN
    ALTER TABLE scc_claim_periods ADD COLUMN off_site_materials_total numeric(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_claim_periods' AND column_name='retention_held_this_period') THEN
    ALTER TABLE scc_claim_periods ADD COLUMN retention_held_this_period numeric(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_claim_periods' AND column_name='retention_released_this_period') THEN
    ALTER TABLE scc_claim_periods ADD COLUMN retention_released_this_period numeric(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_claim_periods' AND column_name='retention_balance_cumulative') THEN
    ALTER TABLE scc_claim_periods ADD COLUMN retention_balance_cumulative numeric(15,2) DEFAULT 0;
  END IF;
END $$;

-- ============================================================
-- Augment scc_scope_lines with claim tracking
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_scope_lines' AND column_name='claim_method') THEN
    ALTER TABLE scc_scope_lines ADD COLUMN claim_method text NOT NULL DEFAULT 'percentage' CHECK (claim_method IN ('percentage','quantity','lump_sum','milestone'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_scope_lines' AND column_name='unit') THEN
    ALTER TABLE scc_scope_lines ADD COLUMN unit text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_scope_lines' AND column_name='original_qty') THEN
    ALTER TABLE scc_scope_lines ADD COLUMN original_qty numeric(15,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_scope_lines' AND column_name='unit_rate') THEN
    ALTER TABLE scc_scope_lines ADD COLUMN unit_rate numeric(15,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_scope_lines' AND column_name='qty_claimed_to_date') THEN
    ALTER TABLE scc_scope_lines ADD COLUMN qty_claimed_to_date numeric(15,4) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_scope_lines' AND column_name='pct_claimed_to_date') THEN
    ALTER TABLE scc_scope_lines ADD COLUMN pct_claimed_to_date numeric(5,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_scope_lines' AND column_name='amount_claimed_to_date') THEN
    ALTER TABLE scc_scope_lines ADD COLUMN amount_claimed_to_date numeric(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_scope_lines' AND column_name='last_claim_date') THEN
    ALTER TABLE scc_scope_lines ADD COLUMN last_claim_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scc_scope_lines' AND column_name='source_quote_line_id') THEN
    ALTER TABLE scc_scope_lines ADD COLUMN source_quote_line_id uuid REFERENCES scc_quote_line_items(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- Performance indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_scc_quote_imports_org ON scc_quote_imports(organisation_id);
CREATE INDEX IF NOT EXISTS idx_scc_quote_imports_contract ON scc_quote_imports(contract_id);
CREATE INDEX IF NOT EXISTS idx_scc_quote_line_items_import ON scc_quote_line_items(import_id);
CREATE INDEX IF NOT EXISTS idx_scc_on_site_materials_contract ON scc_on_site_materials(contract_id);
CREATE INDEX IF NOT EXISTS idx_scc_on_site_materials_claim ON scc_on_site_materials(claim_period_id);
CREATE INDEX IF NOT EXISTS idx_scc_off_site_materials_contract ON scc_off_site_materials(contract_id);
CREATE INDEX IF NOT EXISTS idx_scc_retention_ledger_contract ON scc_retention_ledger(contract_id);
CREATE INDEX IF NOT EXISTS idx_scc_payment_certs_contract ON scc_payment_certificates(contract_id);
CREATE INDEX IF NOT EXISTS idx_scc_payment_certs_claim ON scc_payment_certificates(claim_period_id);
