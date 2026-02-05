/*
  # Add Commercial Baseline Items Table

  ## Overview
  Creates independent commercial baseline storage that replaces dependency on boq_lines.
  This table stores the awarded contract items plus structural enhancements (allowances, retention, provisional sums).

  ## 1. New Tables

  ### `commercial_baseline_items`
  Independent storage of commercial baseline for each awarded project
  - Links to award_approvals (not BOQ Builder)
  - Sources from quote_items
  - Supports multiple line types: awarded_item, allowance, retention, provisional_sum
  - Provides foundation for Base Tracker without BOQ dependency

  ## 2. Security
  - Enable RLS
  - Users can only access baselines for their organisation's projects
  - Platform admins have full access

  ## 3. Indexes
  - Performance indexes on project_id, award_approval_id, quote_id
  - Composite index for common queries

  ## 4. Important Notes
  - This table is the SOURCE OF TRUTH for commercial tracking
  - Populated from quote_items when supplier is awarded
  - Base Tracker exports query this table (not boq_lines)
  - Completely independent of BOQ Builder workflow
*/

-- =====================================================
-- 1. COMMERCIAL BASELINE ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS commercial_baseline_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  award_approval_id uuid NOT NULL REFERENCES award_approvals(id) ON DELETE CASCADE,
  trade_key text NOT NULL,

  -- Source reference (links back to awarded quote)
  source_quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  source_quote_item_id uuid REFERENCES quote_items(id) ON DELETE SET NULL,

  -- Line identification
  line_number text NOT NULL,
  line_type text NOT NULL CHECK (line_type IN ('awarded_item', 'allowance', 'retention', 'provisional_sum')),

  -- Description
  description text NOT NULL,
  system_category text,
  scope_category text,
  location_zone text,

  -- Commercial details
  unit text NOT NULL,
  quantity numeric NOT NULL,
  unit_rate numeric NOT NULL,
  line_amount numeric GENERATED ALWAYS AS (quantity * unit_rate) STORED,

  -- Tracking
  is_active boolean DEFAULT true,
  baseline_locked boolean DEFAULT false,
  baseline_locked_at timestamptz,
  baseline_locked_by_user_id uuid REFERENCES auth.users(id),

  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(project_id, award_approval_id, line_number)
);

-- =====================================================
-- 2. INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_commercial_baseline_project
  ON commercial_baseline_items(project_id);

CREATE INDEX IF NOT EXISTS idx_commercial_baseline_award
  ON commercial_baseline_items(award_approval_id);

CREATE INDEX IF NOT EXISTS idx_commercial_baseline_quote
  ON commercial_baseline_items(source_quote_id);

CREATE INDEX IF NOT EXISTS idx_commercial_baseline_type
  ON commercial_baseline_items(line_type);

CREATE INDEX IF NOT EXISTS idx_commercial_baseline_active
  ON commercial_baseline_items(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_commercial_baseline_composite
  ON commercial_baseline_items(project_id, award_approval_id, is_active);

-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE commercial_baseline_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view baseline for their organisation's projects"
  ON commercial_baseline_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = commercial_baseline_items.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can create baseline for their organisation's projects"
  ON commercial_baseline_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = commercial_baseline_items.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update baseline for their organisation's projects"
  ON commercial_baseline_items FOR UPDATE
  TO authenticated
  USING (
    baseline_locked = false
    AND EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = commercial_baseline_items.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can delete baseline for their organisation's projects"
  ON commercial_baseline_items FOR DELETE
  TO authenticated
  USING (
    baseline_locked = false
    AND EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = commercial_baseline_items.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- =====================================================
-- 4. HELPER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION get_next_baseline_line_number(
  p_project_id uuid,
  p_award_approval_id uuid,
  p_line_type text DEFAULT 'awarded_item'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_line_number text;
  v_prefix text;
  v_start_num integer;
BEGIN
  CASE p_line_type
    WHEN 'awarded_item' THEN
      v_prefix := 'BT-';
      v_start_num := 1;
    WHEN 'allowance' THEN
      v_prefix := 'BT-';
      v_start_num := 9000;
    WHEN 'provisional_sum' THEN
      v_prefix := 'BT-';
      v_start_num := 9100;
    WHEN 'retention' THEN
      RETURN 'BT-RET';
    ELSE
      v_prefix := 'BT-';
      v_start_num := 1;
  END CASE;

  SELECT COUNT(*) INTO v_count
  FROM commercial_baseline_items
  WHERE project_id = p_project_id
  AND award_approval_id = p_award_approval_id
  AND line_type = p_line_type
  AND line_number LIKE v_prefix || '%';

  v_line_number := v_prefix || LPAD((v_start_num + v_count)::text, 4, '0');

  RETURN v_line_number;
END;
$$;

CREATE OR REPLACE FUNCTION lock_commercial_baseline(
  p_award_approval_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE commercial_baseline_items
  SET
    baseline_locked = true,
    baseline_locked_at = now(),
    baseline_locked_by_user_id = auth.uid()
  WHERE award_approval_id = p_award_approval_id
  AND baseline_locked = false;
END;
$$;

CREATE OR REPLACE FUNCTION get_baseline_summary(p_award_approval_id uuid)
RETURNS TABLE(
  line_type text,
  line_count bigint,
  total_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cbi.line_type,
    COUNT(*) as line_count,
    SUM(cbi.line_amount) as total_amount
  FROM commercial_baseline_items cbi
  WHERE cbi.award_approval_id = p_award_approval_id
  AND cbi.is_active = true
  GROUP BY cbi.line_type
  ORDER BY
    CASE cbi.line_type
      WHEN 'awarded_item' THEN 1
      WHEN 'allowance' THEN 2
      WHEN 'provisional_sum' THEN 3
      WHEN 'retention' THEN 4
      ELSE 5
    END;
END;
$$;

-- =====================================================
-- 5. TRIGGERS
-- =====================================================

CREATE TRIGGER update_commercial_baseline_items_updated_at
  BEFORE UPDATE ON commercial_baseline_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();