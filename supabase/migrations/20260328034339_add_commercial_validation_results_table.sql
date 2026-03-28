/*
  # Commercial Validation Results Table

  ## Purpose
  Stores the output of the commercial_validation_engine module.
  This table acts as the gating layer between Quantity Intelligence
  and the "Best Tenderer" recommendation shown in Award Reports.

  ## New Tables

  ### commercial_validation_results
  Persists one validation record per shadow run (run_id).

  Columns:
  - id: UUID primary key
  - run_id: References shadow_runs (the QI comparison run being validated)
  - trade_key: The trade this validation applies to (e.g. "passive_fire")
  - total_suppliers: Total number of suppliers in the run
  - comparable_suppliers: Suppliers with valid matchedGroups (at least one matched line)
  - has_optionals: Whether any line items were flagged optional/TBC
  - optionals_normalized: Whether optionals were aligned/normalized by QI
  - has_provisional_quantities: Whether provisional language was detected
  - provisional_risk_score: Fraction of line items affected by provisional language (0-1)
  - exclusion_mismatch_score: 0=aligned, 1=minor, 2=material commercial differences
  - quantity_alignment_score: Fraction of matchedGroups within acceptable quantity tolerance (0-1)
  - match_confidence_score: Average confidence across all matchedGroups (0-1)
  - scope_completeness_variance: % variance in scope completeness across suppliers
  - normalization_applied: Whether QI normalization was applied to any line
  - validation_status: ENUM - "validated" | "conditional" | "not_comparable"
  - validation_notes: JSONB array of check-level detail notes
  - created_at: Timestamp

  ## Security
  - RLS enabled
  - Platform admins (shadow admin users) can read/insert/update
  - Regular users cannot access this table
*/

CREATE TABLE IF NOT EXISTS commercial_validation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  trade_key text NOT NULL DEFAULT '',

  total_suppliers int NOT NULL DEFAULT 0,
  comparable_suppliers int NOT NULL DEFAULT 0,

  has_optionals boolean NOT NULL DEFAULT false,
  optionals_normalized boolean NOT NULL DEFAULT false,

  has_provisional_quantities boolean NOT NULL DEFAULT false,
  provisional_risk_score numeric NOT NULL DEFAULT 0,

  exclusion_mismatch_score numeric NOT NULL DEFAULT 0,

  quantity_alignment_score numeric NOT NULL DEFAULT 0,
  match_confidence_score numeric NOT NULL DEFAULT 0,

  scope_completeness_variance numeric NOT NULL DEFAULT 0,

  normalization_applied boolean NOT NULL DEFAULT false,

  validation_status text NOT NULL DEFAULT 'not_comparable'
    CHECK (validation_status IN ('validated', 'conditional', 'not_comparable')),

  validation_notes jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commercial_validation_results_run_id
  ON commercial_validation_results(run_id);

CREATE INDEX IF NOT EXISTS idx_commercial_validation_results_trade_key
  ON commercial_validation_results(trade_key);

CREATE INDEX IF NOT EXISTS idx_commercial_validation_results_status
  ON commercial_validation_results(validation_status);

CREATE INDEX IF NOT EXISTS idx_commercial_validation_results_created_at
  ON commercial_validation_results(created_at DESC);

ALTER TABLE commercial_validation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can select commercial validation results"
  ON commercial_validation_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
        AND platform_admins.is_active = true
    )
  );

CREATE POLICY "Platform admins can insert commercial validation results"
  ON commercial_validation_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
        AND platform_admins.is_active = true
    )
  );

CREATE POLICY "Platform admins can update commercial validation results"
  ON commercial_validation_results
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
        AND platform_admins.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
        AND platform_admins.is_active = true
    )
  );
