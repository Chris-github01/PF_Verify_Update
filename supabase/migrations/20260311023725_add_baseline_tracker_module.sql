/*
  # Baseline Tracker Module — Core Schema

  ## Purpose
  Standalone supplier/subcontractor-facing module for:
  - Receiving or creating a baseline from an awarded quote
  - Locking the baseline for commercial reference
  - Tracking progress against awarded scope
  - Recording quantities completed per period
  - Managing payment claims
  - Tracking variations
  - Generating Excel exports

  ## New Tables
  1. `bt_projects` - Projects tracked in the Baseline Tracker
  2. `bt_baseline_headers` - Commercial baseline summary per project
  3. `bt_baseline_line_items` - Awarded scope line items
  4. `bt_claim_periods` - Claim cycles (period-based)
  5. `bt_claim_line_items` - Claim values per baseline line per period
  6. `bt_progress_updates` - Progress records entered over time
  7. `bt_variations` - Proposed or approved scope changes
  8. `bt_attachments` - Evidence and supporting files
  9. `bt_activity_logs` - Full audit trail

  ## Security
  - RLS enabled on all tables
  - Policies scoped to organisation_id
  - All tables reference organisations for multi-tenant isolation
*/

-- ============================================================
-- 1. bt_projects
-- ============================================================
CREATE TABLE IF NOT EXISTS bt_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_name text NOT NULL,
  project_code text,
  client_name text,
  main_contractor_name text,
  site_address text,
  contract_reference text,
  linked_quote_audit_reference text,
  source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'imported_from_quote_audit', 'imported_from_file')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'claim_in_progress', 'submitted', 'closed', 'archived')),
  baseline_locked_at timestamptz,
  start_date date,
  end_date date,
  retention_percent numeric(5,2) DEFAULT 5.00,
  payment_terms_days integer DEFAULT 20,
  claim_frequency text DEFAULT 'monthly'
    CHECK (claim_frequency IN ('monthly', 'fortnightly', 'milestone', 'custom')),
  gst_rate numeric(5,3) DEFAULT 0.15,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bt_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_projects_select"
  ON bt_projects FOR SELECT
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_projects_insert"
  ON bt_projects FOR INSERT
  TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_projects_update"
  ON bt_projects FOR UPDATE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_projects_delete"
  ON bt_projects FOR DELETE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

-- ============================================================
-- 2. bt_baseline_headers
-- ============================================================
CREATE TABLE IF NOT EXISTS bt_baseline_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES bt_projects(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  baseline_reference text,
  awarded_quote_reference text,
  baseline_version integer DEFAULT 1,
  contract_value_excl_gst numeric(14,2) DEFAULT 0,
  contract_value_incl_gst numeric(14,2) DEFAULT 0,
  retention_percent numeric(5,2) DEFAULT 5.00,
  payment_terms_days integer DEFAULT 20,
  claim_frequency text DEFAULT 'monthly'
    CHECK (claim_frequency IN ('monthly', 'fortnightly', 'milestone', 'custom')),
  baseline_status text NOT NULL DEFAULT 'draft'
    CHECK (baseline_status IN ('draft', 'review', 'confirmed', 'locked', 'superseded')),
  baseline_source_snapshot_json jsonb,
  notes text,
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bt_baseline_headers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_baseline_headers_select"
  ON bt_baseline_headers FOR SELECT
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_baseline_headers_insert"
  ON bt_baseline_headers FOR INSERT
  TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_baseline_headers_update"
  ON bt_baseline_headers FOR UPDATE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_baseline_headers_delete"
  ON bt_baseline_headers FOR DELETE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

-- ============================================================
-- 3. bt_baseline_line_items
-- ============================================================
CREATE TABLE IF NOT EXISTS bt_baseline_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_header_id uuid NOT NULL REFERENCES bt_baseline_headers(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  line_number text NOT NULL,
  work_breakdown_code text,
  cost_code text,
  trade_category text,
  location text,
  area_or_zone text,
  item_title text NOT NULL,
  item_description text,
  unit text NOT NULL DEFAULT 'No.',
  baseline_quantity numeric(12,3) DEFAULT 0 CHECK (baseline_quantity >= 0),
  baseline_rate numeric(12,4) DEFAULT 0 CHECK (baseline_rate >= 0),
  baseline_amount numeric(14,2) GENERATED ALWAYS AS (ROUND((baseline_quantity * baseline_rate)::numeric, 2)) STORED,
  claim_method text NOT NULL DEFAULT 'quantity_based'
    CHECK (claim_method IN ('quantity_based', 'percent_based', 'milestone_based', 'manual_value')),
  milestone_label text,
  display_order integer DEFAULT 0,
  exclusions_notes text,
  assumptions_notes text,
  is_variation_origin boolean DEFAULT false,
  source_reference text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bt_baseline_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_baseline_line_items_select"
  ON bt_baseline_line_items FOR SELECT
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_baseline_line_items_insert"
  ON bt_baseline_line_items FOR INSERT
  TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_baseline_line_items_update"
  ON bt_baseline_line_items FOR UPDATE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_baseline_line_items_delete"
  ON bt_baseline_line_items FOR DELETE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

-- ============================================================
-- 4. bt_claim_periods
-- ============================================================
CREATE TABLE IF NOT EXISTS bt_claim_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES bt_projects(id) ON DELETE CASCADE,
  baseline_header_id uuid NOT NULL REFERENCES bt_baseline_headers(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  claim_no integer NOT NULL DEFAULT 1,
  claim_period_name text NOT NULL,
  period_start date,
  period_end date,
  due_date date,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'under_review', 'ready_to_submit', 'submitted', 'certified', 'part_paid', 'paid', 'disputed')),
  previous_claimed_total numeric(14,2) DEFAULT 0,
  current_claim_subtotal numeric(14,2) DEFAULT 0,
  approved_variations_total numeric(14,2) DEFAULT 0,
  gross_claim numeric(14,2) DEFAULT 0,
  retention_amount numeric(14,2) DEFAULT 0,
  net_before_gst numeric(14,2) DEFAULT 0,
  gst_amount numeric(14,2) DEFAULT 0,
  total_this_claim_incl_gst numeric(14,2) DEFAULT 0,
  submitted_at timestamptz,
  submitted_by uuid REFERENCES auth.users(id),
  certified_amount numeric(14,2),
  paid_amount numeric(14,2),
  payment_received_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bt_claim_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_claim_periods_select"
  ON bt_claim_periods FOR SELECT
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_claim_periods_insert"
  ON bt_claim_periods FOR INSERT
  TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_claim_periods_update"
  ON bt_claim_periods FOR UPDATE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_claim_periods_delete"
  ON bt_claim_periods FOR DELETE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

-- ============================================================
-- 5. bt_claim_line_items
-- ============================================================
CREATE TABLE IF NOT EXISTS bt_claim_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_period_id uuid NOT NULL REFERENCES bt_claim_periods(id) ON DELETE CASCADE,
  baseline_line_item_id uuid NOT NULL REFERENCES bt_baseline_line_items(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  previous_quantity_claimed numeric(12,3) DEFAULT 0,
  previous_value_claimed numeric(14,2) DEFAULT 0,
  this_period_quantity numeric(12,3) DEFAULT 0,
  this_period_percent numeric(5,2) DEFAULT 0,
  this_period_value numeric(14,2) DEFAULT 0,
  total_quantity_claimed_to_date numeric(12,3) DEFAULT 0,
  total_value_claimed_to_date numeric(14,2) DEFAULT 0,
  remaining_quantity numeric(12,3) DEFAULT 0,
  remaining_value numeric(14,2) DEFAULT 0,
  progress_percent_to_date numeric(5,2) DEFAULT 0,
  line_status text NOT NULL DEFAULT 'not_started'
    CHECK (line_status IN ('not_started', 'in_progress', 'substantially_complete', 'complete')),
  supporting_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bt_claim_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_claim_line_items_select"
  ON bt_claim_line_items FOR SELECT
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_claim_line_items_insert"
  ON bt_claim_line_items FOR INSERT
  TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_claim_line_items_update"
  ON bt_claim_line_items FOR UPDATE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_claim_line_items_delete"
  ON bt_claim_line_items FOR DELETE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

-- ============================================================
-- 6. bt_progress_updates
-- ============================================================
CREATE TABLE IF NOT EXISTS bt_progress_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES bt_projects(id) ON DELETE CASCADE,
  baseline_line_item_id uuid NOT NULL REFERENCES bt_baseline_line_items(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  claim_period_id uuid REFERENCES bt_claim_periods(id) ON DELETE SET NULL,
  update_date date NOT NULL DEFAULT CURRENT_DATE,
  quantity_complete numeric(12,3) DEFAULT 0,
  percent_complete numeric(5,2) DEFAULT 0,
  value_complete numeric(14,2) DEFAULT 0,
  status text DEFAULT 'in_progress'
    CHECK (status IN ('not_started', 'in_progress', 'substantially_complete', 'complete')),
  notes text,
  entered_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bt_progress_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_progress_updates_select"
  ON bt_progress_updates FOR SELECT
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_progress_updates_insert"
  ON bt_progress_updates FOR INSERT
  TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_progress_updates_update"
  ON bt_progress_updates FOR UPDATE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_progress_updates_delete"
  ON bt_progress_updates FOR DELETE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

-- ============================================================
-- 7. bt_variations
-- ============================================================
CREATE TABLE IF NOT EXISTS bt_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES bt_projects(id) ON DELETE CASCADE,
  baseline_header_id uuid NOT NULL REFERENCES bt_baseline_headers(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  variation_reference text NOT NULL,
  title text NOT NULL,
  description text,
  variation_type text NOT NULL DEFAULT 'addition'
    CHECK (variation_type IN ('addition', 'omission', 'substitution', 'rework', 'rate_change')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn')),
  quotation_reference text,
  quantity numeric(12,3) DEFAULT 0,
  rate numeric(12,4) DEFAULT 0,
  amount numeric(14,2) DEFAULT 0,
  approved_amount numeric(14,2),
  claimed_to_date numeric(14,2) DEFAULT 0,
  related_baseline_line_item_id uuid REFERENCES bt_baseline_line_items(id) ON DELETE SET NULL,
  approved_date date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bt_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_variations_select"
  ON bt_variations FOR SELECT
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_variations_insert"
  ON bt_variations FOR INSERT
  TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_variations_update"
  ON bt_variations FOR UPDATE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_variations_delete"
  ON bt_variations FOR DELETE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

-- ============================================================
-- 8. bt_attachments
-- ============================================================
CREATE TABLE IF NOT EXISTS bt_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES bt_projects(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'general'
    CHECK (entity_type IN ('baseline', 'claim_period', 'claim_line', 'variation', 'progress_update', 'general')),
  entity_id uuid,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size integer DEFAULT 0,
  upload_category text DEFAULT 'general'
    CHECK (upload_category IN ('photo', 'delivery_docket', 'site_record', 'marked_up_drawing', 'timesheet', 'invoice_support', 'variation_support', 'general')),
  description text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bt_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_attachments_select"
  ON bt_attachments FOR SELECT
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_attachments_insert"
  ON bt_attachments FOR INSERT
  TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_attachments_delete"
  ON bt_attachments FOR DELETE
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

-- ============================================================
-- 9. bt_activity_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS bt_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES bt_projects(id) ON DELETE CASCADE,
  entity_type text,
  entity_id uuid,
  action_type text NOT NULL,
  action_label text NOT NULL,
  old_value_json jsonb,
  new_value_json jsonb,
  action_by uuid REFERENCES auth.users(id),
  action_at timestamptz DEFAULT now()
);

ALTER TABLE bt_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_activity_logs_select"
  ON bt_activity_logs FOR SELECT
  TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "bt_activity_logs_insert"
  ON bt_activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM organisation_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

-- ============================================================
-- Performance Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bt_projects_organisation_id ON bt_projects(organisation_id);
CREATE INDEX IF NOT EXISTS idx_bt_projects_status ON bt_projects(status);
CREATE INDEX IF NOT EXISTS idx_bt_baseline_headers_project_id ON bt_baseline_headers(project_id);
CREATE INDEX IF NOT EXISTS idx_bt_baseline_line_items_header_id ON bt_baseline_line_items(baseline_header_id);
CREATE INDEX IF NOT EXISTS idx_bt_claim_periods_project_id ON bt_claim_periods(project_id);
CREATE INDEX IF NOT EXISTS idx_bt_claim_periods_baseline_header_id ON bt_claim_periods(baseline_header_id);
CREATE INDEX IF NOT EXISTS idx_bt_claim_line_items_claim_period_id ON bt_claim_line_items(claim_period_id);
CREATE INDEX IF NOT EXISTS idx_bt_claim_line_items_baseline_line_item_id ON bt_claim_line_items(baseline_line_item_id);
CREATE INDEX IF NOT EXISTS idx_bt_progress_updates_project_id ON bt_progress_updates(project_id);
CREATE INDEX IF NOT EXISTS idx_bt_progress_updates_line_item_id ON bt_progress_updates(baseline_line_item_id);
CREATE INDEX IF NOT EXISTS idx_bt_variations_project_id ON bt_variations(project_id);
CREATE INDEX IF NOT EXISTS idx_bt_attachments_project_id ON bt_attachments(project_id);
CREATE INDEX IF NOT EXISTS idx_bt_attachments_entity ON bt_attachments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_bt_activity_logs_project_id ON bt_activity_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_bt_activity_logs_organisation_id ON bt_activity_logs(organisation_id);

-- ============================================================
-- Updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_bt_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bt_projects_updated_at') THEN
    CREATE TRIGGER bt_projects_updated_at BEFORE UPDATE ON bt_projects FOR EACH ROW EXECUTE FUNCTION update_bt_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bt_baseline_headers_updated_at') THEN
    CREATE TRIGGER bt_baseline_headers_updated_at BEFORE UPDATE ON bt_baseline_headers FOR EACH ROW EXECUTE FUNCTION update_bt_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bt_baseline_line_items_updated_at') THEN
    CREATE TRIGGER bt_baseline_line_items_updated_at BEFORE UPDATE ON bt_baseline_line_items FOR EACH ROW EXECUTE FUNCTION update_bt_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bt_claim_periods_updated_at') THEN
    CREATE TRIGGER bt_claim_periods_updated_at BEFORE UPDATE ON bt_claim_periods FOR EACH ROW EXECUTE FUNCTION update_bt_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bt_claim_line_items_updated_at') THEN
    CREATE TRIGGER bt_claim_line_items_updated_at BEFORE UPDATE ON bt_claim_line_items FOR EACH ROW EXECUTE FUNCTION update_bt_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bt_progress_updates_updated_at') THEN
    CREATE TRIGGER bt_progress_updates_updated_at BEFORE UPDATE ON bt_progress_updates FOR EACH ROW EXECUTE FUNCTION update_bt_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bt_variations_updated_at') THEN
    CREATE TRIGGER bt_variations_updated_at BEFORE UPDATE ON bt_variations FOR EACH ROW EXECUTE FUNCTION update_bt_updated_at();
  END IF;
END $$;
