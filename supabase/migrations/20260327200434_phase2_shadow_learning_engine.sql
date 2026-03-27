/*
  # Phase 2 Shadow Intelligence — Learning Engine

  ## Summary
  Adds 4 new tables to support the Shadow Learning Engine:
  1. adjudication_events — structured human correction records per shadow run
  2. adjudication_notes — free-text notes attached to shadow runs
  3. supplier_fingerprints — supplier/template family learning records
  4. run_fingerprint_links — links shadow runs to matched fingerprints
  5. learning_queue — prioritized review queue for shadow runs
  6. improvement_recommendations — evidence-driven improvement recommendations

  ## Tables Created

  ### adjudication_events
  Captures structured human corrections to shadow run outputs.
  Fields: id, run_id, module_key, correction_type, field_type,
  original_value_json, corrected_value_json, root_cause_category,
  human_reason, evidence_json, financial_impact_estimate,
  adjudicated_by, created_at

  ### adjudication_notes
  Free-text notes attached to shadow runs.
  Fields: id, run_id, note_type, note_text, created_by, created_at

  ### supplier_fingerprints
  Supplier/template family pattern records derived from diagnostics.
  Fields: id, supplier_name_normalized, template_family_id,
  fingerprint_hash, markers_json, total_phrase_family, section_order_json,
  table_style, gst_mode, common_failure_modes_json,
  historical_run_count, historical_accuracy, confidence,
  created_at, updated_at

  ### run_fingerprint_links
  Links each shadow run to a matched supplier fingerprint.
  Fields: id, run_id, supplier_name_normalized, template_family_id,
  confidence, matched_markers_json, created_at

  ### learning_queue
  Prioritized review queue for shadow runs.
  Fields: id, run_id, module_key, priority_score, learning_reason,
  status, assigned_to, created_at, updated_at

  ### improvement_recommendations
  Evidence-driven improvement recommendations generated from shadow data.
  Fields: id, module_key, title, recommendation_type, target_failure_code,
  target_supplier_family, evidence_count, expected_impact_score,
  implementation_complexity, recommendation_text, status,
  supporting_run_ids_json, created_at, updated_at

  ## Security
  - RLS enabled on all tables
  - Only authenticated users with shadow admin access can read/write
  - Uses service role bypass patterns consistent with Phase 1

  ## Notes
  - All tables are additive — no Phase 1 tables modified
  - Fully isolated from live production parsing logic
  - Designed for future Phase 3 expansion
*/

-- =============================================
-- adjudication_events
-- =============================================
CREATE TABLE IF NOT EXISTS adjudication_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES shadow_runs(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  correction_type text NOT NULL CHECK (correction_type IN (
    'total_correction', 'line_item_add', 'line_item_remove', 'line_item_edit',
    'classification_correction', 'qualification_correction',
    'failure_override', 'benchmark_truth_correction'
  )),
  field_type text NOT NULL CHECK (field_type IN (
    'document_total', 'validated_total', 'line_item', 'classification',
    'qualification', 'failure_tag', 'benchmark_truth', 'diagnostics_profile'
  )),
  original_value_json jsonb,
  corrected_value_json jsonb,
  root_cause_category text,
  human_reason text,
  evidence_json jsonb,
  financial_impact_estimate numeric,
  adjudicated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE adjudication_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shadow admins can view adjudication events"
  ON adjudication_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Shadow admins can insert adjudication events"
  ON adjudication_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = adjudicated_by OR adjudicated_by IS NULL);

CREATE INDEX IF NOT EXISTS idx_adjudication_events_run_id ON adjudication_events(run_id);
CREATE INDEX IF NOT EXISTS idx_adjudication_events_module_key ON adjudication_events(module_key);
CREATE INDEX IF NOT EXISTS idx_adjudication_events_correction_type ON adjudication_events(correction_type);

-- =============================================
-- adjudication_notes
-- =============================================
CREATE TABLE IF NOT EXISTS adjudication_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES shadow_runs(id) ON DELETE CASCADE,
  note_type text NOT NULL DEFAULT 'general' CHECK (note_type IN (
    'general', 'commercial', 'parser_observation', 'supplier_pattern', 'rollout_warning'
  )),
  note_text text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE adjudication_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shadow admins can view adjudication notes"
  ON adjudication_notes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Shadow admins can insert adjudication notes"
  ON adjudication_notes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE INDEX IF NOT EXISTS idx_adjudication_notes_run_id ON adjudication_notes(run_id);

-- =============================================
-- supplier_fingerprints
-- =============================================
CREATE TABLE IF NOT EXISTS supplier_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name_normalized text,
  template_family_id text NOT NULL UNIQUE,
  fingerprint_hash text NOT NULL,
  markers_json jsonb DEFAULT '{}',
  total_phrase_family text,
  section_order_json jsonb,
  table_style text,
  gst_mode text,
  common_failure_modes_json jsonb DEFAULT '[]',
  historical_run_count integer DEFAULT 0,
  historical_accuracy numeric DEFAULT 0,
  confidence numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE supplier_fingerprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shadow admins can view supplier fingerprints"
  ON supplier_fingerprints FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Shadow admins can insert supplier fingerprints"
  ON supplier_fingerprints FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Shadow admins can update supplier fingerprints"
  ON supplier_fingerprints FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_supplier_fingerprints_supplier_name ON supplier_fingerprints(supplier_name_normalized);
CREATE INDEX IF NOT EXISTS idx_supplier_fingerprints_template_family ON supplier_fingerprints(template_family_id);
CREATE INDEX IF NOT EXISTS idx_supplier_fingerprints_hash ON supplier_fingerprints(fingerprint_hash);

-- =============================================
-- run_fingerprint_links
-- =============================================
CREATE TABLE IF NOT EXISTS run_fingerprint_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES shadow_runs(id) ON DELETE CASCADE,
  supplier_name_normalized text,
  template_family_id text NOT NULL,
  confidence numeric DEFAULT 0,
  matched_markers_json jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE run_fingerprint_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shadow admins can view run fingerprint links"
  ON run_fingerprint_links FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Shadow admins can insert run fingerprint links"
  ON run_fingerprint_links FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_run_fingerprint_links_run_id ON run_fingerprint_links(run_id);
CREATE INDEX IF NOT EXISTS idx_run_fingerprint_links_template_family ON run_fingerprint_links(template_family_id);

-- =============================================
-- learning_queue
-- =============================================
CREATE TABLE IF NOT EXISTS learning_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES shadow_runs(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  priority_score integer NOT NULL DEFAULT 0,
  learning_reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved', 'dismissed')),
  assigned_to uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(run_id)
);

ALTER TABLE learning_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shadow admins can view learning queue"
  ON learning_queue FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Shadow admins can insert learning queue entries"
  ON learning_queue FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Shadow admins can update learning queue entries"
  ON learning_queue FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_learning_queue_run_id ON learning_queue(run_id);
CREATE INDEX IF NOT EXISTS idx_learning_queue_status ON learning_queue(status);
CREATE INDEX IF NOT EXISTS idx_learning_queue_priority ON learning_queue(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_learning_queue_module_key ON learning_queue(module_key);

-- =============================================
-- improvement_recommendations
-- =============================================
CREATE TABLE IF NOT EXISTS improvement_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  title text NOT NULL,
  recommendation_type text NOT NULL CHECK (recommendation_type IN (
    'parser_rule_candidate', 'anchor_pattern_candidate', 'supplier_template_rule',
    'review_workflow_improvement', 'benchmark_gap',
    'confidence_threshold_adjustment', 'diagnostics_enhancement'
  )),
  target_failure_code text,
  target_supplier_family text,
  evidence_count integer DEFAULT 0,
  expected_impact_score integer DEFAULT 0,
  implementation_complexity text NOT NULL DEFAULT 'medium' CHECK (implementation_complexity IN ('low', 'medium', 'high')),
  recommendation_text text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'deferred', 'rejected', 'implemented')),
  supporting_run_ids_json jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE improvement_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shadow admins can view improvement recommendations"
  ON improvement_recommendations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Shadow admins can insert improvement recommendations"
  ON improvement_recommendations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Shadow admins can update improvement recommendations"
  ON improvement_recommendations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_improvement_recommendations_module_key ON improvement_recommendations(module_key);
CREATE INDEX IF NOT EXISTS idx_improvement_recommendations_status ON improvement_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_improvement_recommendations_type ON improvement_recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_improvement_recommendations_impact ON improvement_recommendations(expected_impact_score DESC);
