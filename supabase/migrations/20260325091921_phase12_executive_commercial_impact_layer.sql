/*
  # Phase 12 – Executive Control & Commercial Impact Layer

  ## Summary
  Three additive tables that power boardroom-grade intelligence for plumbing_parser.
  All data is read from existing operational tables (runs, anomalies, review cases,
  regression results) and materialised here for fast executive reporting. No live
  parser behavior is altered. Passive Fire parser is untouched.

  ## New Tables

  ### parser_commercial_metrics
  Periodic aggregate metric snapshots. Each row is one metric type for one period.
  Supports daily / weekly / monthly roll-ups and org-scoped or global views.
  All values are auditable back to source data via metric_context_json.

  ### parser_impact_events
  Atomic impact event records — one per detected risk event. Each event carries an
  estimated_financial_value (NZD, conservative, confidence-weighted), a traceable
  source_id, and optional links to the anomaly and review case that produced it.
  These are the raw inputs to the financial impact calculation layer.

  ### parser_release_confidence
  Snapshot of release-readiness at a point in time. Stores the four input signals
  (regression pass rate, anomaly rate, review failure rate, predictive accuracy) plus
  the derived confidence_score and a binary release_ready flag. A new row is created
  each time confidence is recalculated — preserving the full history for trend analysis.

  ## Security
  - RLS enabled on all tables
  - Platform admins only (read + write for metrics generation, read for reporting)

  ## Important Notes
  1. All additive — no existing tables modified
  2. IF NOT EXISTS / IF NOT EXISTS guards throughout
  3. Conservative financial value estimation is enforced by application layer
  4. All impact events reference traceable source IDs
*/

-- ─── parser_commercial_metrics ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_commercial_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL DEFAULT 'plumbing_parser',
  org_id text,
  metric_type text NOT NULL,
  metric_value numeric NOT NULL DEFAULT 0,
  metric_unit text NOT NULL DEFAULT 'count',
  metric_context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parser_commercial_metrics ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pcm_module_key   ON parser_commercial_metrics(module_key);
CREATE INDEX IF NOT EXISTS idx_pcm_metric_type  ON parser_commercial_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_pcm_org_id       ON parser_commercial_metrics(org_id);
CREATE INDEX IF NOT EXISTS idx_pcm_period_start ON parser_commercial_metrics(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_pcm_period_end   ON parser_commercial_metrics(period_end DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_commercial_metrics' AND policyname = 'Platform admins can select commercial metrics') THEN
    CREATE POLICY "Platform admins can select commercial metrics"
      ON parser_commercial_metrics FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_commercial_metrics' AND policyname = 'Platform admins can insert commercial metrics') THEN
    CREATE POLICY "Platform admins can insert commercial metrics"
      ON parser_commercial_metrics FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_impact_events ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_impact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL DEFAULT 'plumbing_parser',
  source_type text NOT NULL,
  source_id text NOT NULL,
  org_id text,
  run_id text,
  anomaly_id text,
  review_case_id uuid REFERENCES parser_review_cases(id) ON DELETE SET NULL,
  impact_type text NOT NULL CHECK (impact_type IN (
    'duplicate_total_prevented',
    'incorrect_total_detected',
    'classification_error_prevented',
    'manual_review_correction',
    'high_risk_flagged_pre_parse'
  )),
  impact_value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated_financial_value numeric,
  confidence_score numeric(3,1) NOT NULL DEFAULT 5.0 CHECK (confidence_score >= 0 AND confidence_score <= 10),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parser_impact_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pie_module_key   ON parser_impact_events(module_key);
CREATE INDEX IF NOT EXISTS idx_pie_impact_type  ON parser_impact_events(impact_type);
CREATE INDEX IF NOT EXISTS idx_pie_org_id       ON parser_impact_events(org_id);
CREATE INDEX IF NOT EXISTS idx_pie_run_id       ON parser_impact_events(run_id);
CREATE INDEX IF NOT EXISTS idx_pie_anomaly_id   ON parser_impact_events(anomaly_id);
CREATE INDEX IF NOT EXISTS idx_pie_created_at   ON parser_impact_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pie_source_id    ON parser_impact_events(source_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_impact_events' AND policyname = 'Platform admins can select impact events') THEN
    CREATE POLICY "Platform admins can select impact events"
      ON parser_impact_events FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_impact_events' AND policyname = 'Platform admins can insert impact events') THEN
    CREATE POLICY "Platform admins can insert impact events"
      ON parser_impact_events FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_release_confidence ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_release_confidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL DEFAULT 'plumbing_parser',
  version text NOT NULL DEFAULT 'current',
  regression_pass_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (regression_pass_rate >= 0 AND regression_pass_rate <= 100),
  anomaly_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (anomaly_rate >= 0 AND anomaly_rate <= 100),
  review_failure_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (review_failure_rate >= 0 AND review_failure_rate <= 100),
  predictive_accuracy numeric(5,2) NOT NULL DEFAULT 0 CHECK (predictive_accuracy >= 0 AND predictive_accuracy <= 100),
  confidence_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  release_ready boolean NOT NULL DEFAULT false,
  signal_details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parser_release_confidence ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prc2_module_key  ON parser_release_confidence(module_key);
CREATE INDEX IF NOT EXISTS idx_prc2_version     ON parser_release_confidence(version);
CREATE INDEX IF NOT EXISTS idx_prc2_created_at  ON parser_release_confidence(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prc2_release_ready ON parser_release_confidence(release_ready);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_release_confidence' AND policyname = 'Platform admins can select release confidence') THEN
    CREATE POLICY "Platform admins can select release confidence"
      ON parser_release_confidence FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_release_confidence' AND policyname = 'Platform admins can insert release confidence') THEN
    CREATE POLICY "Platform admins can insert release confidence"
      ON parser_release_confidence FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
