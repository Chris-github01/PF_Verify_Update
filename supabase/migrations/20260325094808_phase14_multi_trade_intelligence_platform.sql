/*
  # Phase 14 – Multi-Trade Intelligence Platform

  ## Summary
  Additive tables that support the cross-trade intelligence architecture.
  Zero existing tables modified. Plumbing and Passive Fire parsers untouched.
  Each table is trade-agnostic via module_key column.

  ## New Tables

  ### trade_module_registry
  Central source of truth for all trade modules. Stores capabilities JSON,
  status, version, and feature flags per module. Controls what intelligence
  features are enabled for each trade without hardcoding.

  ### intelligence_events
  Cross-trade event bus persistence. Records anomaly detections, review
  completions, regression failures, and rule suggestions from any module.
  Subscribers can query by event_type and source_module.

  ### cross_trade_patterns
  Patterns identified as occurring across multiple trade modules.
  Enables the cross-trade learning engine to flag shared failure modes
  and suggest parallel rule improvements in multiple modules.

  ### module_health_scores
  One row per module per snapshot. Tracks accuracy, anomaly rate, review
  load, and predictive performance over time. Powers the platform health
  dashboard and trend charts.

  ### module_feature_flags
  Per-module feature flag overrides. Allows enabling/disabling predictive,
  optimization, review, and learning independently per trade module without
  code changes.

  ### cross_trade_suggestions
  Suggestion-only cross-trade learning feedback. When review feedback in one
  trade reveals a pattern applicable to another trade, a row is created here.
  Never auto-applied. Admins review and act manually.

  ## Security
  - RLS enabled on all tables
  - Platform admins only for all write operations
  - Reads also restricted to platform admins for now (intelligence data is internal)

  ## Important Notes
  1. All additive — nothing altered
  2. module_key is always the canonical identifier (e.g. 'plumbing_parser')
  3. No cross-contamination of parser logic — only metadata and signals cross trade boundaries
*/

-- ─── trade_module_registry ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trade_module_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL UNIQUE,
  module_name text NOT NULL DEFAULT '',
  trade_category text NOT NULL DEFAULT '' CHECK (trade_category IN ('plumbing', 'passive_fire', 'active_fire', 'electrical', 'hvac', 'civil', 'structural', 'generic')),
  status text NOT NULL DEFAULT 'experimental' CHECK (status IN ('active', 'beta', 'experimental', 'disabled')),
  version text NOT NULL DEFAULT '1.0.0',
  capabilities jsonb NOT NULL DEFAULT '{"parsing":false,"predictive":false,"learning":false,"optimization":false,"review":false,"shadow":false}'::jsonb,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text NOT NULL DEFAULT '',
  parser_available boolean NOT NULL DEFAULT false,
  regression_suite_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trade_module_registry ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tmr_module_key      ON trade_module_registry(module_key);
CREATE INDEX IF NOT EXISTS idx_tmr_status          ON trade_module_registry(status);
CREATE INDEX IF NOT EXISTS idx_tmr_trade_category  ON trade_module_registry(trade_category);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trade_module_registry' AND policyname = 'Platform admins can select trade module registry') THEN
    CREATE POLICY "Platform admins can select trade module registry"
      ON trade_module_registry FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trade_module_registry' AND policyname = 'Platform admins can insert trade module registry') THEN
    CREATE POLICY "Platform admins can insert trade module registry"
      ON trade_module_registry FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trade_module_registry' AND policyname = 'Platform admins can update trade module registry') THEN
    CREATE POLICY "Platform admins can update trade module registry"
      ON trade_module_registry FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── intelligence_events ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intelligence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_module text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('anomaly_detected','review_completed','regression_failure','rule_suggestion_created','optimization_run','pattern_identified','health_updated')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_module_keys text[] NOT NULL DEFAULT '{}',
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE intelligence_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ie_source_module  ON intelligence_events(source_module);
CREATE INDEX IF NOT EXISTS idx_ie_event_type     ON intelligence_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ie_severity       ON intelligence_events(severity);
CREATE INDEX IF NOT EXISTS idx_ie_created_at     ON intelligence_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ie_processed      ON intelligence_events(processed);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intelligence_events' AND policyname = 'Platform admins can select intelligence events') THEN
    CREATE POLICY "Platform admins can select intelligence events"
      ON intelligence_events FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intelligence_events' AND policyname = 'Platform admins can insert intelligence events') THEN
    CREATE POLICY "Platform admins can insert intelligence events"
      ON intelligence_events FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intelligence_events' AND policyname = 'Platform admins can update intelligence events') THEN
    CREATE POLICY "Platform admins can update intelligence events"
      ON intelligence_events FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── cross_trade_patterns ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cross_trade_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_key text NOT NULL,
  pattern_type text NOT NULL CHECK (pattern_type IN ('total_row','header_row','unit_mismatch','classification_error','price_format','quantity_format','scope_gap','custom')),
  description text NOT NULL DEFAULT '',
  affected_modules text[] NOT NULL DEFAULT '{}',
  occurrence_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_detected_in text NOT NULL DEFAULT '',
  confidence_score numeric(4,1) NOT NULL DEFAULT 5.0,
  suggested_rule_changes_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved','monitoring','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cross_trade_patterns ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ctp_pattern_key ON cross_trade_patterns(pattern_key);
CREATE INDEX IF NOT EXISTS idx_ctp_pattern_type   ON cross_trade_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_ctp_status         ON cross_trade_patterns(status);
CREATE INDEX IF NOT EXISTS idx_ctp_confidence     ON cross_trade_patterns(confidence_score DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cross_trade_patterns' AND policyname = 'Platform admins can select cross trade patterns') THEN
    CREATE POLICY "Platform admins can select cross trade patterns"
      ON cross_trade_patterns FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cross_trade_patterns' AND policyname = 'Platform admins can insert cross trade patterns') THEN
    CREATE POLICY "Platform admins can insert cross trade patterns"
      ON cross_trade_patterns FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cross_trade_patterns' AND policyname = 'Platform admins can update cross trade patterns') THEN
    CREATE POLICY "Platform admins can update cross trade patterns"
      ON cross_trade_patterns FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── module_health_scores ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS module_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  accuracy_score numeric(5,2) NOT NULL DEFAULT 0,
  anomaly_rate numeric(5,2) NOT NULL DEFAULT 0,
  regression_pass_rate numeric(5,2) NOT NULL DEFAULT 0,
  review_backlog_count integer NOT NULL DEFAULT 0,
  predictive_accuracy numeric(5,2) NOT NULL DEFAULT 0,
  optimization_score numeric(5,2) NOT NULL DEFAULT 0,
  overall_health_score numeric(5,2) NOT NULL DEFAULT 0,
  trend text NOT NULL DEFAULT 'stable' CHECK (trend IN ('improving','stable','degrading')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE module_health_scores ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mhs_module_key    ON module_health_scores(module_key);
CREATE INDEX IF NOT EXISTS idx_mhs_snapshot_date ON module_health_scores(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_mhs_health        ON module_health_scores(overall_health_score DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mhs_unique ON module_health_scores(module_key, snapshot_date);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'module_health_scores' AND policyname = 'Platform admins can select module health scores') THEN
    CREATE POLICY "Platform admins can select module health scores"
      ON module_health_scores FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'module_health_scores' AND policyname = 'Platform admins can insert module health scores') THEN
    CREATE POLICY "Platform admins can insert module health scores"
      ON module_health_scores FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'module_health_scores' AND policyname = 'Platform admins can update module health scores') THEN
    CREATE POLICY "Platform admins can update module health scores"
      ON module_health_scores FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── module_feature_flags ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS module_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  flag_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  override_reason text,
  set_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE module_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mff_unique ON module_feature_flags(module_key, flag_name);
CREATE INDEX IF NOT EXISTS idx_mff_module_key ON module_feature_flags(module_key);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'module_feature_flags' AND policyname = 'Platform admins can select module feature flags') THEN
    CREATE POLICY "Platform admins can select module feature flags"
      ON module_feature_flags FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'module_feature_flags' AND policyname = 'Platform admins can insert module feature flags') THEN
    CREATE POLICY "Platform admins can insert module feature flags"
      ON module_feature_flags FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'module_feature_flags' AND policyname = 'Platform admins can update module feature flags') THEN
    CREATE POLICY "Platform admins can update module feature flags"
      ON module_feature_flags FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── cross_trade_suggestions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cross_trade_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_module text NOT NULL,
  target_module text NOT NULL,
  origin_event_id uuid REFERENCES intelligence_events(id) ON DELETE SET NULL,
  origin_pattern_id uuid REFERENCES cross_trade_patterns(id) ON DELETE SET NULL,
  suggestion_type text NOT NULL CHECK (suggestion_type IN ('rule_import','pattern_share','threshold_align','review_insight')),
  description text NOT NULL DEFAULT '',
  suggested_changes_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score numeric(4,1) NOT NULL DEFAULT 5.0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','superseded')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cross_trade_suggestions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cts_source_module ON cross_trade_suggestions(source_module);
CREATE INDEX IF NOT EXISTS idx_cts_target_module ON cross_trade_suggestions(target_module);
CREATE INDEX IF NOT EXISTS idx_cts_status        ON cross_trade_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_cts_created_at    ON cross_trade_suggestions(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cross_trade_suggestions' AND policyname = 'Platform admins can select cross trade suggestions') THEN
    CREATE POLICY "Platform admins can select cross trade suggestions"
      ON cross_trade_suggestions FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cross_trade_suggestions' AND policyname = 'Platform admins can insert cross trade suggestions') THEN
    CREATE POLICY "Platform admins can insert cross trade suggestions"
      ON cross_trade_suggestions FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cross_trade_suggestions' AND policyname = 'Platform admins can update cross trade suggestions') THEN
    CREATE POLICY "Platform admins can update cross trade suggestions"
      ON cross_trade_suggestions FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── Seed: core module registry entries ───────────────────────────────────────

INSERT INTO trade_module_registry (module_key, module_name, trade_category, status, version, capabilities, description, parser_available, regression_suite_count)
VALUES
  ('plumbing_parser',       'Plumbing Parser',        'plumbing',      'active',       '13.0.0',
   '{"parsing":true,"predictive":true,"learning":true,"optimization":true,"review":true,"shadow":true}'::jsonb,
   'Full-featured plumbing quote parser with shadow testing, learning, predictive risk, optimization, and review ops. Reference implementation.', true, 0),
  ('passive_fire_parser',   'Passive Fire Parser',    'passive_fire',  'active',       '2.0.0',
   '{"parsing":true,"predictive":false,"learning":false,"optimization":false,"review":false,"shadow":false}'::jsonb,
   'Passive fire protection quote parser. Parser is isolated and protected — intelligence layer expansion scheduled.', true, 0),
  ('active_fire_parser',    'Active Fire Parser',     'active_fire',   'experimental', '0.1.0',
   '{"parsing":true,"predictive":false,"learning":false,"optimization":false,"review":false,"shadow":false}'::jsonb,
   'Active fire protection parser stub. Parsing capability exists; intelligence layer pending.', true, 0),
  ('electrical_parser',     'Electrical Parser',      'electrical',    'experimental', '0.1.0',
   '{"parsing":false,"predictive":false,"learning":false,"optimization":false,"review":false,"shadow":false}'::jsonb,
   'Electrical trade parser. Scaffolding complete. Parser implementation pending.', false, 0),
  ('hvac_parser',           'HVAC Parser',            'hvac',          'experimental', '0.1.0',
   '{"parsing":false,"predictive":false,"learning":false,"optimization":false,"review":false,"shadow":false}'::jsonb,
   'HVAC trade parser. Scaffolding complete. Parser implementation pending.', false, 0)
ON CONFLICT (module_key) DO UPDATE
  SET module_name = EXCLUDED.module_name,
      trade_category = EXCLUDED.trade_category,
      status = EXCLUDED.status,
      description = EXCLUDED.description,
      parser_available = EXCLUDED.parser_available,
      updated_at = now();
