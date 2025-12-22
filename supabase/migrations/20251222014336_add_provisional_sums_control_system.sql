/*
  # Provisional Sums (PS) Control System

  1. Changes to contract_allowances table
    - Add ps_type: Type of PS (penetrations, remedial, access, doors, qa, design, other)
    - Add ps_reason: Reason for PS item
    - Add ps_trigger: Condition that triggers this PS
    - Add ps_approval_role: Who must approve PS spend (QS, PM, CM, Client)
    - Add ps_evidence_required: Evidence documentation requirements
    - Add ps_spend_method: How PS is calculated (lump_sum, rate_and_cap, schedule_of_rates)
    - Add ps_cap: Maximum authorised spend cap
    - Add ps_rate_basis: Basis for rate calculation
    - Add ps_spend_to_date: Approved spend recorded against this PS
    - Add ps_conversion_rule: How to convert spend (variation, progress_claim, manual)
    - Add ps_status: Status of PS item (draft, approved, closed)
    - Add ps_standardised: Whether this is a standard PS item
    - Add ps_notes_internal: Internal commercial notes

  2. New Tables
    - contract_variations: Track variations from PS spend
    - progress_claims: Track progress claim line items from PS spend

  3. Security
    - RLS enabled on new tables
    - Access controlled by project membership
*/

-- Add PS control fields to contract_allowances (all nullable for backward compatibility)
ALTER TABLE contract_allowances
ADD COLUMN IF NOT EXISTS ps_type text,
ADD COLUMN IF NOT EXISTS ps_reason text,
ADD COLUMN IF NOT EXISTS ps_trigger text,
ADD COLUMN IF NOT EXISTS ps_approval_role text,
ADD COLUMN IF NOT EXISTS ps_evidence_required text,
ADD COLUMN IF NOT EXISTS ps_spend_method text,
ADD COLUMN IF NOT EXISTS ps_cap numeric,
ADD COLUMN IF NOT EXISTS ps_rate_basis text,
ADD COLUMN IF NOT EXISTS ps_spend_to_date numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS ps_conversion_rule text,
ADD COLUMN IF NOT EXISTS ps_status text,
ADD COLUMN IF NOT EXISTS ps_standardised boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS ps_notes_internal text;

-- Add constraints for PS fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contract_allowances_ps_type_check'
  ) THEN
    ALTER TABLE contract_allowances
    ADD CONSTRAINT contract_allowances_ps_type_check
    CHECK (ps_type IS NULL OR ps_type IN ('penetrations', 'remedial', 'access', 'doors', 'qa', 'design', 'other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contract_allowances_ps_approval_role_check'
  ) THEN
    ALTER TABLE contract_allowances
    ADD CONSTRAINT contract_allowances_ps_approval_role_check
    CHECK (ps_approval_role IS NULL OR ps_approval_role IN ('QS', 'PM', 'CM', 'Client'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contract_allowances_ps_spend_method_check'
  ) THEN
    ALTER TABLE contract_allowances
    ADD CONSTRAINT contract_allowances_ps_spend_method_check
    CHECK (ps_spend_method IS NULL OR ps_spend_method IN ('lump_sum', 'rate_and_cap', 'schedule_of_rates'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contract_allowances_ps_conversion_rule_check'
  ) THEN
    ALTER TABLE contract_allowances
    ADD CONSTRAINT contract_allowances_ps_conversion_rule_check
    CHECK (ps_conversion_rule IS NULL OR ps_conversion_rule IN ('variation', 'progress_claim', 'manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contract_allowances_ps_status_check'
  ) THEN
    ALTER TABLE contract_allowances
    ADD CONSTRAINT contract_allowances_ps_status_check
    CHECK (ps_status IS NULL OR ps_status IN ('draft', 'approved', 'closed'));
  END IF;
END $$;

-- Create contract_variations table
CREATE TABLE IF NOT EXISTS contract_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  allowance_id uuid REFERENCES contract_allowances(id) ON DELETE SET NULL,
  variation_number text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'closed')),
  reference text,
  evidence_notes text,
  submitted_date date,
  approved_date date,
  approved_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add RLS to contract_variations
ALTER TABLE contract_variations ENABLE ROW LEVEL SECURITY;

-- RLS policies for contract_variations
CREATE POLICY "Users can view variations in their organisation projects"
  ON contract_variations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON p.organisation_id = om.organisation_id
      WHERE p.id = contract_variations.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert variations in their organisation projects"
  ON contract_variations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON p.organisation_id = om.organisation_id
      WHERE p.id = contract_variations.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update variations in their organisation projects"
  ON contract_variations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON p.organisation_id = om.organisation_id
      WHERE p.id = contract_variations.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON p.organisation_id = om.organisation_id
      WHERE p.id = contract_variations.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can delete variations in their organisation projects"
  ON contract_variations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON p.organisation_id = om.organisation_id
      WHERE p.id = contract_variations.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- Create progress_claims table
CREATE TABLE IF NOT EXISTS progress_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  allowance_id uuid REFERENCES contract_allowances(id) ON DELETE SET NULL,
  claim_number text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  claim_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'paid')),
  reference text,
  evidence_notes text,
  submitted_date date,
  approved_date date,
  paid_date date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add RLS to progress_claims
ALTER TABLE progress_claims ENABLE ROW LEVEL SECURITY;

-- RLS policies for progress_claims
CREATE POLICY "Users can view progress claims in their organisation projects"
  ON progress_claims FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON p.organisation_id = om.organisation_id
      WHERE p.id = progress_claims.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert progress claims in their organisation projects"
  ON progress_claims FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON p.organisation_id = om.organisation_id
      WHERE p.id = progress_claims.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update progress claims in their organisation projects"
  ON progress_claims FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON p.organisation_id = om.organisation_id
      WHERE p.id = progress_claims.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON p.organisation_id = om.organisation_id
      WHERE p.id = progress_claims.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can delete progress claims in their organisation projects"
  ON progress_claims FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON p.organisation_id = om.organisation_id
      WHERE p.id = progress_claims.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contract_variations_project_id ON contract_variations(project_id);
CREATE INDEX IF NOT EXISTS idx_contract_variations_allowance_id ON contract_variations(allowance_id);
CREATE INDEX IF NOT EXISTS idx_contract_variations_status ON contract_variations(status);

CREATE INDEX IF NOT EXISTS idx_progress_claims_project_id ON progress_claims(project_id);
CREATE INDEX IF NOT EXISTS idx_progress_claims_allowance_id ON progress_claims(allowance_id);
CREATE INDEX IF NOT EXISTS idx_progress_claims_status ON progress_claims(status);

-- Add index on contract_allowances for PS queries
CREATE INDEX IF NOT EXISTS idx_contract_allowances_is_provisional ON contract_allowances(is_provisional) WHERE is_provisional = true;
CREATE INDEX IF NOT EXISTS idx_contract_allowances_ps_status ON contract_allowances(ps_status) WHERE ps_status IS NOT NULL;

-- Update existing seed data (optional - only if seed exists)
UPDATE contract_allowances
SET
  ps_type = 'penetrations',
  ps_spend_method = 'lump_sum',
  ps_conversion_rule = 'variation',
  ps_status = 'approved'
WHERE is_provisional = true
AND ps_type IS NULL;