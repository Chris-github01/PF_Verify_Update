/*
  # Phase 13 – Controlled Autonomous Optimization Engine

  ## Summary
  Four additive tables that support the full optimization pipeline:
  candidate generation → bundle creation → simulation runs → ranked recommendations.
  No existing tables are modified. No live parser behavior is affected.
  Passive Fire parser is untouched.

  ## New Tables

  ### parser_optimization_candidates
  Individual rule improvement suggestions sourced from Phase 9 (rule suggestions),
  Phase 11 (review feedback), Phase 10 (predictive FP/FN), or manual entry.
  Each candidate stores the precise rule_changes_json it would apply, the patterns
  it originates from, and a confidence score. Candidates are never applied directly
  to the live parser.

  ### parser_optimization_bundles
  Groups of compatible candidates assembled into a single testable unit. Each bundle
  stores the merged rule changes (pre-validated by the merge engine) and references
  the candidate IDs it contains. Bundles are immutable once created — a new bundle
  is created for each new combination.

  ### parser_optimization_runs
  One row per bundle test execution. Records before/after metrics for all four signal
  types (regression pass rate, anomaly rate, financial impact delta, predictive
  accuracy delta) plus a composite overall_score. Every run is traceable to its bundle.

  ### parser_optimization_rankings
  Final ranking output. One row per bundle per ranking pass, with rank_position,
  rank_score, and recommendation_level (strong/moderate/experimental). Retains
  historical ranking snapshots for trend analysis.

  ## Security
  - RLS enabled on all tables
  - Platform admins only (read + write for pipeline execution, read for reporting)

  ## Important Notes
  1. All additive — no existing tables altered
  2. IF NOT EXISTS / IF NOT EXISTS guards throughout
  3. No bundle is auto-deployed — all bundles require explicit admin promotion
  4. rule_changes_json is JSON-typed to allow safe merge validation in application layer
*/

-- ─── parser_optimization_candidates ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_optimization_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL DEFAULT 'plumbing_parser',
  source text NOT NULL CHECK (source IN ('learning', 'review', 'predictive', 'manual')),
  description text NOT NULL DEFAULT '',
  rule_changes_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  originating_pattern_keys text[] NOT NULL DEFAULT '{}',
  confidence_score numeric(4,1) NOT NULL DEFAULT 5.0 CHECK (confidence_score >= 0 AND confidence_score <= 10),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'bundled', 'rejected', 'superseded')),
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parser_optimization_candidates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_poc_module_key     ON parser_optimization_candidates(module_key);
CREATE INDEX IF NOT EXISTS idx_poc_source         ON parser_optimization_candidates(source);
CREATE INDEX IF NOT EXISTS idx_poc_status         ON parser_optimization_candidates(status);
CREATE INDEX IF NOT EXISTS idx_poc_confidence     ON parser_optimization_candidates(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_poc_created_at     ON parser_optimization_candidates(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_optimization_candidates' AND policyname = 'Platform admins can select optimization candidates') THEN
    CREATE POLICY "Platform admins can select optimization candidates"
      ON parser_optimization_candidates FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_optimization_candidates' AND policyname = 'Platform admins can insert optimization candidates') THEN
    CREATE POLICY "Platform admins can insert optimization candidates"
      ON parser_optimization_candidates FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_optimization_candidates' AND policyname = 'Platform admins can update optimization candidates') THEN
    CREATE POLICY "Platform admins can update optimization candidates"
      ON parser_optimization_candidates FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_optimization_bundles ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_optimization_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL DEFAULT 'plumbing_parser',
  bundle_name text NOT NULL DEFAULT '',
  bundle_size text NOT NULL DEFAULT 'small' CHECK (bundle_size IN ('small', 'medium', 'strategic')),
  candidate_ids uuid[] NOT NULL DEFAULT '{}',
  combined_rule_changes_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  conflict_detected boolean NOT NULL DEFAULT false,
  conflict_notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'testing', 'passed', 'failed', 'promoted', 'archived')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parser_optimization_bundles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pob_module_key  ON parser_optimization_bundles(module_key);
CREATE INDEX IF NOT EXISTS idx_pob_status      ON parser_optimization_bundles(status);
CREATE INDEX IF NOT EXISTS idx_pob_bundle_size ON parser_optimization_bundles(bundle_size);
CREATE INDEX IF NOT EXISTS idx_pob_created_at  ON parser_optimization_bundles(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_optimization_bundles' AND policyname = 'Platform admins can select optimization bundles') THEN
    CREATE POLICY "Platform admins can select optimization bundles"
      ON parser_optimization_bundles FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_optimization_bundles' AND policyname = 'Platform admins can insert optimization bundles') THEN
    CREATE POLICY "Platform admins can insert optimization bundles"
      ON parser_optimization_bundles FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_optimization_bundles' AND policyname = 'Platform admins can update optimization bundles') THEN
    CREATE POLICY "Platform admins can update optimization bundles"
      ON parser_optimization_bundles FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_optimization_runs ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_optimization_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL DEFAULT 'plumbing_parser',
  bundle_id uuid NOT NULL REFERENCES parser_optimization_bundles(id) ON DELETE CASCADE,
  regression_pass_rate_before numeric(5,2) NOT NULL DEFAULT 0,
  regression_pass_rate_after  numeric(5,2) NOT NULL DEFAULT 0,
  anomaly_rate_before         numeric(5,2) NOT NULL DEFAULT 0,
  anomaly_rate_after          numeric(5,2) NOT NULL DEFAULT 0,
  financial_impact_delta      numeric(14,2) NOT NULL DEFAULT 0,
  predictive_accuracy_delta   numeric(5,2) NOT NULL DEFAULT 0,
  overall_score               numeric(5,2) NOT NULL DEFAULT 0 CHECK (overall_score >= 0 AND overall_score <= 100),
  failures_introduced         integer NOT NULL DEFAULT 0,
  improvements_gained         integer NOT NULL DEFAULT 0,
  safety_guard_triggered      boolean NOT NULL DEFAULT false,
  safety_guard_reason         text,
  simulation_details_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parser_optimization_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_por_module_key  ON parser_optimization_runs(module_key);
CREATE INDEX IF NOT EXISTS idx_por_bundle_id   ON parser_optimization_runs(bundle_id);
CREATE INDEX IF NOT EXISTS idx_por_created_at  ON parser_optimization_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_por_overall     ON parser_optimization_runs(overall_score DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_optimization_runs' AND policyname = 'Platform admins can select optimization runs') THEN
    CREATE POLICY "Platform admins can select optimization runs"
      ON parser_optimization_runs FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_optimization_runs' AND policyname = 'Platform admins can insert optimization runs') THEN
    CREATE POLICY "Platform admins can insert optimization runs"
      ON parser_optimization_runs FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_optimization_rankings ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_optimization_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL DEFAULT 'plumbing_parser',
  bundle_id uuid NOT NULL REFERENCES parser_optimization_bundles(id) ON DELETE CASCADE,
  run_id uuid REFERENCES parser_optimization_runs(id) ON DELETE SET NULL,
  rank_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (rank_score >= 0 AND rank_score <= 100),
  rank_position integer NOT NULL DEFAULT 1,
  recommendation_level text NOT NULL DEFAULT 'experimental' CHECK (recommendation_level IN ('strong', 'moderate', 'experimental')),
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  component_scores_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  promoted_to_shadow boolean NOT NULL DEFAULT false,
  promoted_to_release boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parser_optimization_rankings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prank_module_key   ON parser_optimization_rankings(module_key);
CREATE INDEX IF NOT EXISTS idx_prank_bundle_id    ON parser_optimization_rankings(bundle_id);
CREATE INDEX IF NOT EXISTS idx_prank_position     ON parser_optimization_rankings(rank_position ASC);
CREATE INDEX IF NOT EXISTS idx_prank_created_at   ON parser_optimization_rankings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prank_rec_level     ON parser_optimization_rankings(recommendation_level);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_optimization_rankings' AND policyname = 'Platform admins can select optimization rankings') THEN
    CREATE POLICY "Platform admins can select optimization rankings"
      ON parser_optimization_rankings FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_optimization_rankings' AND policyname = 'Platform admins can insert optimization rankings') THEN
    CREATE POLICY "Platform admins can insert optimization rankings"
      ON parser_optimization_rankings FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_optimization_rankings' AND policyname = 'Platform admins can update optimization rankings') THEN
    CREATE POLICY "Platform admins can update optimization rankings"
      ON parser_optimization_rankings FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
