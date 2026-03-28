/*
  # Quantity Intelligence Module

  Adds a non-destructive advisory analysis layer that compares equivalent line items
  across supplier quotes, derives reference quantities, and flags suppliers whose
  apparent price advantage is driven by under-allowed quantities rather than
  genuine competitiveness.

  ## New Tables

  1. `quantity_comparison_groups`
     - Top-level container for a quantity intelligence run on a package/project
     - Fields: id, project_id, package_id, module_key, comparison_name, created_by, created_at

  2. `quantity_line_matches`
     - Each row represents one matched group of equivalent line items across suppliers
     - Fields: id, comparison_group_id, normalized_item_key, canonical_description, unit, created_at

  3. `quantity_line_supplier_values`
     - Each supplier's specific value for a matched line item
     - Fields: id, line_match_id, supplier_quote_id, supplier_name, original_line_item_id,
       original_description, quantity, unit_rate, total_value, included_flag, created_at

  4. `quantity_reference_analysis`
     - Derived reference quantity and outlier analysis per matched line
     - Fields: id, line_match_id, reference_quantity, reference_method, highest_quantity,
       lowest_quantity, quantity_spread_percent, outlier_flag, notes, created_at

  5. `quantity_supplier_adjustments`
     - Per-supplier summary: raw vs normalized totals, completeness & competitiveness scores
     - Fields: id, comparison_group_id, supplier_quote_id, supplier_name, raw_total,
       normalized_total, quantity_gap_value, completeness_score, competitiveness_score_raw,
       competitiveness_score_normalized, underallowance_flag, notes, created_at

  ## Security
  - RLS enabled on all tables
  - Authenticated users can read/write their own data
  - Access is scoped via the project's organisation membership
*/

-- ==========================================
-- 1. quantity_comparison_groups
-- ==========================================
CREATE TABLE IF NOT EXISTS quantity_comparison_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  package_id text,
  module_key text NOT NULL DEFAULT 'general',
  comparison_name text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qcg_project_id ON quantity_comparison_groups(project_id);
CREATE INDEX IF NOT EXISTS idx_qcg_created_by ON quantity_comparison_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_qcg_created_at ON quantity_comparison_groups(created_at DESC);

ALTER TABLE quantity_comparison_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own quantity comparison groups"
  ON quantity_comparison_groups FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can insert quantity comparison groups"
  ON quantity_comparison_groups FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own quantity comparison groups"
  ON quantity_comparison_groups FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete own quantity comparison groups"
  ON quantity_comparison_groups FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- ==========================================
-- 2. quantity_line_matches
-- ==========================================
CREATE TABLE IF NOT EXISTS quantity_line_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_group_id uuid NOT NULL REFERENCES quantity_comparison_groups(id) ON DELETE CASCADE,
  normalized_item_key text NOT NULL DEFAULT '',
  canonical_description text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'ea',
  match_confidence numeric(4,3) NOT NULL DEFAULT 0.0,
  match_method text NOT NULL DEFAULT 'description_fuzzy',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qlm_group_id ON quantity_line_matches(comparison_group_id);
CREATE INDEX IF NOT EXISTS idx_qlm_item_key ON quantity_line_matches(normalized_item_key);

ALTER TABLE quantity_line_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own quantity line matches"
  ON quantity_line_matches FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quantity_comparison_groups
      WHERE quantity_comparison_groups.id = quantity_line_matches.comparison_group_id
      AND quantity_comparison_groups.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can insert quantity line matches"
  ON quantity_line_matches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quantity_comparison_groups
      WHERE quantity_comparison_groups.id = quantity_line_matches.comparison_group_id
      AND quantity_comparison_groups.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete own quantity line matches"
  ON quantity_line_matches FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quantity_comparison_groups
      WHERE quantity_comparison_groups.id = quantity_line_matches.comparison_group_id
      AND quantity_comparison_groups.created_by = auth.uid()
    )
  );

-- ==========================================
-- 3. quantity_line_supplier_values
-- ==========================================
CREATE TABLE IF NOT EXISTS quantity_line_supplier_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_match_id uuid NOT NULL REFERENCES quantity_line_matches(id) ON DELETE CASCADE,
  supplier_quote_id text NOT NULL,
  supplier_name text NOT NULL DEFAULT '',
  original_line_item_id text,
  original_description text NOT NULL DEFAULT '',
  quantity numeric(14,4),
  unit_rate numeric(14,4),
  total_value numeric(14,2),
  included_flag boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qlsv_line_match_id ON quantity_line_supplier_values(line_match_id);
CREATE INDEX IF NOT EXISTS idx_qlsv_supplier_quote_id ON quantity_line_supplier_values(supplier_quote_id);

ALTER TABLE quantity_line_supplier_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own quantity supplier values"
  ON quantity_line_supplier_values FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quantity_line_matches qlm
      JOIN quantity_comparison_groups qcg ON qcg.id = qlm.comparison_group_id
      WHERE qlm.id = quantity_line_supplier_values.line_match_id
      AND qcg.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can insert quantity supplier values"
  ON quantity_line_supplier_values FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quantity_line_matches qlm
      JOIN quantity_comparison_groups qcg ON qcg.id = qlm.comparison_group_id
      WHERE qlm.id = quantity_line_supplier_values.line_match_id
      AND qcg.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete own quantity supplier values"
  ON quantity_line_supplier_values FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quantity_line_matches qlm
      JOIN quantity_comparison_groups qcg ON qcg.id = qlm.comparison_group_id
      WHERE qlm.id = quantity_line_supplier_values.line_match_id
      AND qcg.created_by = auth.uid()
    )
  );

-- ==========================================
-- 4. quantity_reference_analysis
-- ==========================================
CREATE TABLE IF NOT EXISTS quantity_reference_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_match_id uuid NOT NULL REFERENCES quantity_line_matches(id) ON DELETE CASCADE,
  reference_quantity numeric(14,4),
  reference_method text NOT NULL DEFAULT 'inconclusive',
  highest_quantity numeric(14,4),
  lowest_quantity numeric(14,4),
  quantity_spread_percent numeric(8,2),
  outlier_flag boolean NOT NULL DEFAULT false,
  outlier_severity text NOT NULL DEFAULT 'none',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(line_match_id)
);

CREATE INDEX IF NOT EXISTS idx_qra_line_match_id ON quantity_reference_analysis(line_match_id);
CREATE INDEX IF NOT EXISTS idx_qra_outlier_flag ON quantity_reference_analysis(outlier_flag);

ALTER TABLE quantity_reference_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own quantity reference analysis"
  ON quantity_reference_analysis FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quantity_line_matches qlm
      JOIN quantity_comparison_groups qcg ON qcg.id = qlm.comparison_group_id
      WHERE qlm.id = quantity_reference_analysis.line_match_id
      AND qcg.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can insert quantity reference analysis"
  ON quantity_reference_analysis FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quantity_line_matches qlm
      JOIN quantity_comparison_groups qcg ON qcg.id = qlm.comparison_group_id
      WHERE qlm.id = quantity_reference_analysis.line_match_id
      AND qcg.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update own quantity reference analysis"
  ON quantity_reference_analysis FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quantity_line_matches qlm
      JOIN quantity_comparison_groups qcg ON qcg.id = qlm.comparison_group_id
      WHERE qlm.id = quantity_reference_analysis.line_match_id
      AND qcg.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quantity_line_matches qlm
      JOIN quantity_comparison_groups qcg ON qcg.id = qlm.comparison_group_id
      WHERE qlm.id = quantity_reference_analysis.line_match_id
      AND qcg.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete own quantity reference analysis"
  ON quantity_reference_analysis FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quantity_line_matches qlm
      JOIN quantity_comparison_groups qcg ON qcg.id = qlm.comparison_group_id
      WHERE qlm.id = quantity_reference_analysis.line_match_id
      AND qcg.created_by = auth.uid()
    )
  );

-- ==========================================
-- 5. quantity_supplier_adjustments
-- ==========================================
CREATE TABLE IF NOT EXISTS quantity_supplier_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_group_id uuid NOT NULL REFERENCES quantity_comparison_groups(id) ON DELETE CASCADE,
  supplier_quote_id text NOT NULL,
  supplier_name text NOT NULL DEFAULT '',
  raw_total numeric(14,2) NOT NULL DEFAULT 0,
  normalized_total numeric(14,2) NOT NULL DEFAULT 0,
  quantity_gap_value numeric(14,2) NOT NULL DEFAULT 0,
  completeness_score numeric(5,2) NOT NULL DEFAULT 100,
  competitiveness_score_raw numeric(5,2) NOT NULL DEFAULT 0,
  competitiveness_score_normalized numeric(5,2) NOT NULL DEFAULT 0,
  underallowance_flag boolean NOT NULL DEFAULT false,
  raw_rank integer NOT NULL DEFAULT 0,
  normalized_rank integer NOT NULL DEFAULT 0,
  matched_lines_count integer NOT NULL DEFAULT 0,
  underallowed_lines_count integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comparison_group_id, supplier_quote_id)
);

CREATE INDEX IF NOT EXISTS idx_qsa_group_id ON quantity_supplier_adjustments(comparison_group_id);
CREATE INDEX IF NOT EXISTS idx_qsa_supplier_quote_id ON quantity_supplier_adjustments(supplier_quote_id);
CREATE INDEX IF NOT EXISTS idx_qsa_underallowance_flag ON quantity_supplier_adjustments(underallowance_flag);

ALTER TABLE quantity_supplier_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own quantity supplier adjustments"
  ON quantity_supplier_adjustments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quantity_comparison_groups
      WHERE quantity_comparison_groups.id = quantity_supplier_adjustments.comparison_group_id
      AND quantity_comparison_groups.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can insert quantity supplier adjustments"
  ON quantity_supplier_adjustments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quantity_comparison_groups
      WHERE quantity_comparison_groups.id = quantity_supplier_adjustments.comparison_group_id
      AND quantity_comparison_groups.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update own quantity supplier adjustments"
  ON quantity_supplier_adjustments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quantity_comparison_groups
      WHERE quantity_comparison_groups.id = quantity_supplier_adjustments.comparison_group_id
      AND quantity_comparison_groups.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quantity_comparison_groups
      WHERE quantity_comparison_groups.id = quantity_supplier_adjustments.comparison_group_id
      AND quantity_comparison_groups.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete own quantity supplier adjustments"
  ON quantity_supplier_adjustments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quantity_comparison_groups
      WHERE quantity_comparison_groups.id = quantity_supplier_adjustments.comparison_group_id
      AND quantity_comparison_groups.created_by = auth.uid()
    )
  );
