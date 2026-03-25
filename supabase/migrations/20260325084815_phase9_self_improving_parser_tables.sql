/*
  # Phase 9 – Self-Improving Parser System

  ## Summary
  Four new tables support a controlled learning loop: learning events are captured
  from regression failures and beta anomalies, clustered into patterns, surfaced as
  rule suggestions, and tracked as versioned rule configs. Nothing is auto-deployed —
  every change requires admin review and goes through the Phase 6/8 rollout system.

  ## New Tables

  ### parser_learning_events
  Individual observations of problematic parsing behaviour captured from regression
  failures and beta anomalies. Each row stores the raw pattern signature that caused
  the failure so it can be clustered.

  ### parser_pattern_clusters
  Aggregated clusters of similar learning events. occurrence_count tells you how
  frequently this pattern causes problems. severity_distribution_json tracks how
  many are critical/warning/info across all events.

  ### parser_rule_suggestions
  AI/heuristic-generated suggestions for rule improvements, derived from high-frequency
  pattern clusters. Admins review, approve, or reject each suggestion before it can
  be tested. proposed_rule_json contains the machine-readable change; expected_impact_json
  describes the human-readable expected benefit.

  ### parser_rule_versions
  Immutable snapshots of the full rule config. A new version is created before each
  rule change is tested. rules_json holds the full PlumbingRuleConfig object. Shadow
  parser can be pointed at a specific version for testing without touching live.

  ## Security
  - RLS enabled on all tables
  - Platform admins only for all operations
  - Service role bypasses for background captures

  ## Notes
  1. All tables are additive — no existing code modified
  2. IF NOT EXISTS guards throughout
  3. parent_cluster_id allows future sub-clustering
*/

-- ─── parser_learning_events ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_learning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('regression_failure', 'beta_anomaly', 'manual')),
  source_id text NOT NULL,
  run_id text,
  learning_type text NOT NULL CHECK (learning_type IN ('regression_failure', 'beta_anomaly')),
  pattern_key text NOT NULL,
  pattern_signature_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  cluster_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parser_learning_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ple_module_key    ON parser_learning_events(module_key);
CREATE INDEX IF NOT EXISTS idx_ple_pattern_key   ON parser_learning_events(pattern_key);
CREATE INDEX IF NOT EXISTS idx_ple_learning_type ON parser_learning_events(learning_type);
CREATE INDEX IF NOT EXISTS idx_ple_created_at    ON parser_learning_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ple_cluster_id    ON parser_learning_events(cluster_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_learning_events' AND policyname = 'Platform admins can select learning events') THEN
    CREATE POLICY "Platform admins can select learning events"
      ON parser_learning_events FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_learning_events' AND policyname = 'Platform admins can insert learning events') THEN
    CREATE POLICY "Platform admins can insert learning events"
      ON parser_learning_events FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_pattern_clusters ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_pattern_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  pattern_key text NOT NULL,
  pattern_label text NOT NULL DEFAULT '',
  pattern_signature_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  example_rows_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  occurrence_count int NOT NULL DEFAULT 1,
  failure_count int NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  severity_distribution_json jsonb NOT NULL DEFAULT '{"critical":0,"warning":0,"info":0}'::jsonb,
  linked_suggestion_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_key, pattern_key)
);

ALTER TABLE parser_pattern_clusters ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ppc_module_key    ON parser_pattern_clusters(module_key);
CREATE INDEX IF NOT EXISTS idx_ppc_pattern_key   ON parser_pattern_clusters(pattern_key);
CREATE INDEX IF NOT EXISTS idx_ppc_occurrence    ON parser_pattern_clusters(occurrence_count DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_pattern_clusters' AND policyname = 'Platform admins can select pattern clusters') THEN
    CREATE POLICY "Platform admins can select pattern clusters"
      ON parser_pattern_clusters FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_pattern_clusters' AND policyname = 'Platform admins can insert pattern clusters') THEN
    CREATE POLICY "Platform admins can insert pattern clusters"
      ON parser_pattern_clusters FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_pattern_clusters' AND policyname = 'Platform admins can update pattern clusters') THEN
    CREATE POLICY "Platform admins can update pattern clusters"
      ON parser_pattern_clusters FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_rule_suggestions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_rule_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  suggestion_type text NOT NULL CHECK (suggestion_type IN (
    'add_summary_phrase', 'remove_summary_phrase',
    'adjust_threshold', 'adjust_weighting',
    'add_exclusion_rule', 'adjust_window'
  )),
  pattern_key text NOT NULL,
  cluster_id uuid REFERENCES parser_pattern_clusters(id),
  description text NOT NULL,
  proposed_rule_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_impact_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score numeric(4,3) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'testing', 'tested', 'adopted')),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  review_notes text,
  tested_rule_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parser_rule_suggestions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prs_module_key  ON parser_rule_suggestions(module_key);
CREATE INDEX IF NOT EXISTS idx_prs_status      ON parser_rule_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_prs_pattern_key ON parser_rule_suggestions(pattern_key);
CREATE INDEX IF NOT EXISTS idx_prs_confidence  ON parser_rule_suggestions(confidence_score DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_rule_suggestions' AND policyname = 'Platform admins can select rule suggestions') THEN
    CREATE POLICY "Platform admins can select rule suggestions"
      ON parser_rule_suggestions FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_rule_suggestions' AND policyname = 'Platform admins can insert rule suggestions') THEN
    CREATE POLICY "Platform admins can insert rule suggestions"
      ON parser_rule_suggestions FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_rule_suggestions' AND policyname = 'Platform admins can update rule suggestions') THEN
    CREATE POLICY "Platform admins can update rule suggestions"
      ON parser_rule_suggestions FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_rule_versions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  version text NOT NULL,
  label text NOT NULL DEFAULT '',
  rules_json jsonb NOT NULL,
  parent_version_id uuid REFERENCES parser_rule_versions(id),
  source_suggestion_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  regression_run_id text,
  regression_pass_rate numeric(4,3),
  is_active_shadow bool NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (module_key, version)
);

ALTER TABLE parser_rule_versions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prv_module_key ON parser_rule_versions(module_key);
CREATE INDEX IF NOT EXISTS idx_prv_is_active  ON parser_rule_versions(is_active_shadow);
CREATE INDEX IF NOT EXISTS idx_prv_created_at ON parser_rule_versions(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_rule_versions' AND policyname = 'Platform admins can select rule versions') THEN
    CREATE POLICY "Platform admins can select rule versions"
      ON parser_rule_versions FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_rule_versions' AND policyname = 'Platform admins can insert rule versions') THEN
    CREATE POLICY "Platform admins can insert rule versions"
      ON parser_rule_versions FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_rule_versions' AND policyname = 'Platform admins can update rule versions') THEN
    CREATE POLICY "Platform admins can update rule versions"
      ON parser_rule_versions FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
