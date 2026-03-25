/*
  # Phase 7 – Plumbing Parser Live Beta Intelligence Layer

  ## Summary
  Creates three new shadow/admin-only tables for live beta monitoring,
  anomaly detection, and daily aggregated metrics. All tables are internal
  to the Shadow Admin system and never surface in customer-facing views.

  ## New Tables

  ### parser_beta_events
  Records every plumbing_parser execution that occurs during a beta rollout.
  Links execution to a run_id, org, user, parser mode, and rollout context.
  This is the raw telemetry stream for beta traffic.

  ### parser_anomaly_events
  Stores detected anomalies from beta runs with severity, evidence, and
  resolution workflow (open → acknowledged → resolved / ignored).
  Admins use this for triage and rollback decisions.

  ### parser_beta_daily_metrics
  Aggregated daily roll-up of beta statistics per module/context/org.
  Powers dashboard trend cards without expensive per-page recalculation.

  ## Security
  - RLS enabled on all three tables
  - Platform admins only: SELECT, INSERT, UPDATE
  - Service role implicitly bypasses RLS for edge function writes

  ## Notes
  1. Fully additive — no existing tables modified
  2. IF NOT EXISTS guards on all objects
  3. Indexed for common query patterns (module_key, org_id, date, severity)
*/

-- ─── parser_beta_events ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_beta_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  run_id uuid,
  org_id uuid,
  user_id uuid REFERENCES auth.users(id),
  source_type text,
  source_id text,
  parser_mode_used text NOT NULL CHECK (parser_mode_used IN ('live', 'shadow')),
  rollout_context text CHECK (rollout_context IN ('internal_beta', 'org_beta', 'percentage_beta')),
  live_version text,
  shadow_version text,
  run_status text NOT NULL DEFAULT 'completed' CHECK (run_status IN ('completed', 'failed', 'partial')),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parser_beta_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pbe_module_key    ON parser_beta_events(module_key);
CREATE INDEX IF NOT EXISTS idx_pbe_org_id        ON parser_beta_events(org_id);
CREATE INDEX IF NOT EXISTS idx_pbe_created_at    ON parser_beta_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pbe_run_id        ON parser_beta_events(run_id);
CREATE INDEX IF NOT EXISTS idx_pbe_run_status    ON parser_beta_events(run_status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_beta_events' AND policyname = 'Platform admins can view beta events') THEN
    CREATE POLICY "Platform admins can view beta events"
      ON parser_beta_events FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_beta_events' AND policyname = 'Platform admins can insert beta events') THEN
    CREATE POLICY "Platform admins can insert beta events"
      ON parser_beta_events FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_anomaly_events ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_anomaly_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  run_id uuid,
  beta_event_id uuid REFERENCES parser_beta_events(id),
  org_id uuid,
  source_type text,
  source_id text,
  anomaly_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  anomaly_score numeric(5,2) NOT NULL DEFAULT 0,
  title text NOT NULL,
  description text,
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_status text NOT NULL DEFAULT 'open' CHECK (resolution_status IN ('open', 'acknowledged', 'resolved', 'ignored')),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parser_anomaly_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pae_module_key         ON parser_anomaly_events(module_key);
CREATE INDEX IF NOT EXISTS idx_pae_org_id             ON parser_anomaly_events(org_id);
CREATE INDEX IF NOT EXISTS idx_pae_severity           ON parser_anomaly_events(severity);
CREATE INDEX IF NOT EXISTS idx_pae_anomaly_type       ON parser_anomaly_events(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_pae_resolution_status  ON parser_anomaly_events(resolution_status);
CREATE INDEX IF NOT EXISTS idx_pae_created_at         ON parser_anomaly_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pae_run_id             ON parser_anomaly_events(run_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_anomaly_events' AND policyname = 'Platform admins can view anomaly events') THEN
    CREATE POLICY "Platform admins can view anomaly events"
      ON parser_anomaly_events FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_anomaly_events' AND policyname = 'Platform admins can insert anomaly events') THEN
    CREATE POLICY "Platform admins can insert anomaly events"
      ON parser_anomaly_events FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_anomaly_events' AND policyname = 'Platform admins can update anomaly events') THEN
    CREATE POLICY "Platform admins can update anomaly events"
      ON parser_anomaly_events FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_beta_daily_metrics ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_beta_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  metric_date date NOT NULL,
  rollout_context text,
  org_id uuid,
  total_runs integer NOT NULL DEFAULT 0,
  failed_runs integer NOT NULL DEFAULT 0,
  anomaly_count integer NOT NULL DEFAULT 0,
  critical_anomaly_count integer NOT NULL DEFAULT 0,
  avg_total_delta numeric(12,4),
  avg_document_delta numeric(12,4),
  avg_confidence numeric(5,2),
  shadow_better_count integer NOT NULL DEFAULT 0,
  live_better_count integer NOT NULL DEFAULT 0,
  inconclusive_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_key, metric_date, rollout_context, org_id)
);

ALTER TABLE parser_beta_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pbdm_module_key    ON parser_beta_daily_metrics(module_key);
CREATE INDEX IF NOT EXISTS idx_pbdm_metric_date   ON parser_beta_daily_metrics(metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_pbdm_org_id        ON parser_beta_daily_metrics(org_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_beta_daily_metrics' AND policyname = 'Platform admins can view daily metrics') THEN
    CREATE POLICY "Platform admins can view daily metrics"
      ON parser_beta_daily_metrics FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_beta_daily_metrics' AND policyname = 'Platform admins can upsert daily metrics') THEN
    CREATE POLICY "Platform admins can upsert daily metrics"
      ON parser_beta_daily_metrics FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_beta_daily_metrics' AND policyname = 'Platform admins can update daily metrics') THEN
    CREATE POLICY "Platform admins can update daily metrics"
      ON parser_beta_daily_metrics FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
