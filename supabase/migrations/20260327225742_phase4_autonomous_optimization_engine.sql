/*
  # Phase 4 — Autonomous Optimization Engine

  ## Overview
  Introduces governance infrastructure for safe, evidence-based promotion of shadow
  parser improvements into production. No production parsing logic is altered.

  ## New Tables

  ### 1. shadow_versions
  Tracks all shadow parser / rule configurations as versioned, testable units.
  Each version represents a distinct configuration snapshot that can be benchmarked
  and promoted independently of code changes.

  ### 2. shadow_version_runs
  Join table linking shadow runs to specific versions. Allows performance
  attribution across multiple benchmark sets.

  ### 3. promotion_decisions
  Records the evaluation result for each version — whether it is recommended for
  promotion, needs review, or is rejected. Always human-approved before acting.

  ### 4. rollout_plans
  Controls the staged rollout of approved versions. Supports shadow_only → limited
  → expanded → full rollout stages with explicit rollback support.

  ### 5. rollout_plan_events
  Immutable event log for every state change on a rollout plan.

  ## Security
  - RLS enabled on all tables
  - All tables require authenticated platform admins for write access
  - Read access for organisation members through separate policies
  - No public access to any table

  ## Notes
  - These tables are SHADOW-ONLY infrastructure
  - No live parser paths are modified
  - All promotion decisions are recommendations, not automatic actions
*/

-- ============================================================
-- 1. shadow_versions
-- ============================================================
CREATE TABLE IF NOT EXISTS shadow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  version_name text NOT NULL,
  parser_version text NOT NULL,
  rules_version text NOT NULL DEFAULT 'v1',
  config_snapshot_json jsonb NOT NULL DEFAULT '{}',
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'testing', 'approved', 'rejected')),
  benchmark_score numeric,
  benchmark_run_count integer DEFAULT 0,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_shadow_versions_module_key ON shadow_versions(module_key);
CREATE INDEX IF NOT EXISTS idx_shadow_versions_status ON shadow_versions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shadow_versions_module_version_name
  ON shadow_versions(module_key, version_name);

ALTER TABLE shadow_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage shadow versions"
  ON shadow_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Platform admins can insert shadow versions"
  ON shadow_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Platform admins can update shadow versions"
  ON shadow_versions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- ============================================================
-- 2. shadow_version_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS shadow_version_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES shadow_versions(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES shadow_runs(id) ON DELETE CASCADE,
  benchmark_set_id text,
  result_summary_json jsonb NOT NULL DEFAULT '{}',
  pass_rate numeric,
  financial_accuracy_score numeric,
  line_accuracy_score numeric,
  failure_severity_score numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE (version_id, run_id)
);

CREATE INDEX IF NOT EXISTS idx_shadow_version_runs_version_id ON shadow_version_runs(version_id);
CREATE INDEX IF NOT EXISTS idx_shadow_version_runs_run_id ON shadow_version_runs(run_id);

ALTER TABLE shadow_version_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view version runs"
  ON shadow_version_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Platform admins can insert version runs"
  ON shadow_version_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- ============================================================
-- 3. promotion_decisions
-- ============================================================
CREATE TABLE IF NOT EXISTS promotion_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES shadow_versions(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  decision text NOT NULL DEFAULT 'needs_review'
    CHECK (decision IN ('approve_candidate', 'reject', 'needs_review')),
  decision_score numeric NOT NULL DEFAULT 0
    CHECK (decision_score >= 0 AND decision_score <= 100),
  risk_score numeric NOT NULL DEFAULT 0
    CHECK (risk_score >= 0 AND risk_score <= 100),
  benchmark_score numeric NOT NULL DEFAULT 0
    CHECK (benchmark_score >= 0 AND benchmark_score <= 100),
  financial_accuracy_score numeric NOT NULL DEFAULT 0,
  failure_reduction_score numeric NOT NULL DEFAULT 0,
  line_accuracy_score numeric NOT NULL DEFAULT 0,
  consistency_score numeric NOT NULL DEFAULT 0,
  regression_flags_json jsonb NOT NULL DEFAULT '[]',
  reasoning_text text NOT NULL DEFAULT '',
  run_count integer NOT NULL DEFAULT 0,
  baseline_version text,
  created_at timestamptz DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  admin_override_decision text
    CHECK (admin_override_decision IS NULL OR admin_override_decision IN ('approve', 'reject'))
);

CREATE INDEX IF NOT EXISTS idx_promotion_decisions_version_id ON promotion_decisions(version_id);
CREATE INDEX IF NOT EXISTS idx_promotion_decisions_module_key ON promotion_decisions(module_key);
CREATE INDEX IF NOT EXISTS idx_promotion_decisions_decision ON promotion_decisions(decision);

ALTER TABLE promotion_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view promotion decisions"
  ON promotion_decisions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Platform admins can insert promotion decisions"
  ON promotion_decisions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Platform admins can update promotion decisions"
  ON promotion_decisions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- ============================================================
-- 4. rollout_plans
-- ============================================================
CREATE TABLE IF NOT EXISTS rollout_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES shadow_versions(id) ON DELETE RESTRICT,
  module_key text NOT NULL,
  rollout_stage text NOT NULL DEFAULT 'shadow_only'
    CHECK (rollout_stage IN ('shadow_only', 'limited', 'expanded', 'full')),
  rollout_percentage integer NOT NULL DEFAULT 0
    CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  success_metrics_json jsonb NOT NULL DEFAULT '{}',
  rollback_trigger_conditions_json jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'paused', 'rolled_back', 'completed')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  activated_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rollout_plans_version_id ON rollout_plans(version_id);
CREATE INDEX IF NOT EXISTS idx_rollout_plans_module_key ON rollout_plans(module_key);
CREATE INDEX IF NOT EXISTS idx_rollout_plans_status ON rollout_plans(status);

ALTER TABLE rollout_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view rollout plans"
  ON rollout_plans
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Platform admins can insert rollout plans"
  ON rollout_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Platform admins can update rollout plans"
  ON rollout_plans
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- ============================================================
-- 5. rollout_plan_events (immutable audit log)
-- ============================================================
CREATE TABLE IF NOT EXISTS rollout_plan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rollout_plan_id uuid NOT NULL REFERENCES rollout_plans(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  description text NOT NULL DEFAULT '',
  previous_stage text,
  new_stage text,
  previous_status text,
  new_status text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rollout_plan_events_plan_id ON rollout_plan_events(rollout_plan_id);
CREATE INDEX IF NOT EXISTS idx_rollout_plan_events_created_at ON rollout_plan_events(created_at DESC);

ALTER TABLE rollout_plan_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view rollout plan events"
  ON rollout_plan_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Platform admins can insert rollout plan events"
  ON rollout_plan_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
