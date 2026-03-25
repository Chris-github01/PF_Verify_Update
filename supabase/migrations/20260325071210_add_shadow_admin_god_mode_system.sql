/*
  # Shadow Admin / God Mode System

  ## Summary
  Adds a complete shadow admin control plane for safely testing, comparing, and
  promoting new module versions without disrupting the live production app.

  ## New Tables
  1. `admin_roles` - Maps users to internal_admin or god_mode roles
  2. `module_registry` - Registers every shadow-capable module
  3. `module_versions` - Tracks live/shadow/promoted versions per module
  4. `feature_flags` - Fine-grained rollout flags (global/org/user/percentage)
  5. `shadow_runs` - One record per admin-triggered shadow execution
  6. `shadow_run_results` - Detailed live/shadow/diff outputs per run
  7. `shadow_drafts` - Shadow outputs awaiting promotion review
  8. `rollout_events` - Immutable log of every rollout state change
  9. `admin_audit_log` - Central admin action log
  10. `regression_suites` - Named test suites for pre-promotion validation
  11. `regression_suite_cases` - Individual test cases per suite
  12. `regression_suite_runs` - Execution results per regression suite run

  ## Security
  - RLS enabled on all tables
  - Only god_mode/internal_admin users can read/write shadow tables
  - Admin audit log is append-only (no delete policy)
*/

-- ─────────────────────────────────────────────────────────────
-- 1. admin_roles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('internal_admin', 'god_mode')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "god_mode can manage admin_roles"
  ON public.admin_roles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  );

CREATE POLICY "god_mode can insert admin_roles"
  ON public.admin_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  );

CREATE POLICY "god_mode can update admin_roles"
  ON public.admin_roles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  );

CREATE POLICY "users can read own admin role"
  ON public.admin_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 2. module_registry
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.module_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL UNIQUE,
  module_name text NOT NULL,
  module_type text NOT NULL CHECK (module_type IN ('parser', 'scoring', 'export', 'classifier', 'workflow')),
  description text,
  is_shadow_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.module_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can read module_registry"
  ON public.module_registry FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

CREATE POLICY "god_mode can write module_registry"
  ON public.module_registry FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  );

CREATE POLICY "god_mode can update module_registry"
  ON public.module_registry FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3. module_versions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.module_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL REFERENCES public.module_registry(module_key) ON DELETE CASCADE,
  live_version text NOT NULL DEFAULT 'v1',
  shadow_version text,
  promoted_candidate_version text,
  rollback_version text,
  rollout_status text NOT NULL DEFAULT 'live_only' CHECK (
    rollout_status IN (
      'live_only', 'shadow_only', 'internal_beta',
      'org_beta', 'partial_rollout', 'global_live', 'rolled_back'
    )
  ),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.module_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can read module_versions"
  ON public.module_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

CREATE POLICY "god_mode can write module_versions"
  ON public.module_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  );

CREATE POLICY "god_mode can update module_versions"
  ON public.module_versions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 4. feature_flags
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL,
  module_key text,
  environment text NOT NULL DEFAULT 'production' CHECK (
    environment IN ('development', 'staging', 'production')
  ),
  target_type text NOT NULL CHECK (
    target_type IN ('global', 'user', 'org', 'role', 'percentage')
  ),
  target_id text,
  enabled boolean NOT NULL DEFAULT false,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 100,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can read feature_flags"
  ON public.feature_flags FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

CREATE POLICY "god_mode can insert feature_flags"
  ON public.feature_flags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  );

CREATE POLICY "god_mode can update feature_flags"
  ON public.feature_flags FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 5. shadow_runs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shadow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL REFERENCES public.module_registry(module_key) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  source_label text,
  initiated_by uuid NOT NULL,
  org_id uuid,
  live_version text,
  shadow_version text,
  run_mode text NOT NULL CHECK (
    run_mode IN ('shadow_only', 'live_vs_shadow', 'regression_suite')
  ),
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'running', 'completed', 'failed', 'cancelled')
  ),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_runs_module_key ON public.shadow_runs(module_key);
CREATE INDEX IF NOT EXISTS idx_shadow_runs_initiated_by ON public.shadow_runs(initiated_by);
CREATE INDEX IF NOT EXISTS idx_shadow_runs_status ON public.shadow_runs(status);

ALTER TABLE public.shadow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can read shadow_runs"
  ON public.shadow_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

CREATE POLICY "admin can insert shadow_runs"
  ON public.shadow_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

CREATE POLICY "admin can update shadow_runs"
  ON public.shadow_runs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 6. shadow_run_results
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shadow_run_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shadow_run_id uuid NOT NULL REFERENCES public.shadow_runs(id) ON DELETE CASCADE,
  result_type text NOT NULL CHECK (result_type IN ('live', 'shadow', 'diff', 'summary')),
  output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_run_results_run_id ON public.shadow_run_results(shadow_run_id);

ALTER TABLE public.shadow_run_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can read shadow_run_results"
  ON public.shadow_run_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

CREATE POLICY "admin can insert shadow_run_results"
  ON public.shadow_run_results FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 7. shadow_drafts
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shadow_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  draft_name text NOT NULL,
  payload_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'approved', 'rejected', 'promoted', 'archived')
  ),
  created_by uuid NOT NULL,
  approved_by uuid,
  promoted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shadow_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can read shadow_drafts"
  ON public.shadow_drafts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

CREATE POLICY "admin can insert shadow_drafts"
  ON public.shadow_drafts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

CREATE POLICY "god_mode can update shadow_drafts"
  ON public.shadow_drafts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 8. rollout_events
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rollout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'shadow_enabled', 'beta_enabled', 'org_rollout_enabled',
      'global_promoted', 'rollback_triggered',
      'kill_switch_enabled', 'kill_switch_disabled'
    )
  ),
  previous_state_json jsonb,
  new_state_json jsonb,
  triggered_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rollout_events_module_key ON public.rollout_events(module_key);

ALTER TABLE public.rollout_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can read rollout_events"
  ON public.rollout_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

CREATE POLICY "god_mode can insert rollout_events"
  ON public.rollout_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 9. admin_audit_log
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  module_key text,
  before_json jsonb,
  after_json jsonb,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON public.admin_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON public.admin_audit_log(created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can read audit_log"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

CREATE POLICY "admin can insert audit_log"
  ON public.admin_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 10. regression_suites
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regression_suites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  suite_name text NOT NULL,
  description text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.regression_suites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can read regression_suites"
  ON public.regression_suites FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

CREATE POLICY "god_mode can write regression_suites"
  ON public.regression_suites FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 11. regression_suite_cases
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regression_suite_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id uuid NOT NULL REFERENCES public.regression_suites(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  expected_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.regression_suite_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can read regression_suite_cases"
  ON public.regression_suite_cases FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

CREATE POLICY "god_mode can write regression_suite_cases"
  ON public.regression_suite_cases FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'god_mode'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 12. regression_suite_runs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regression_suite_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id uuid NOT NULL REFERENCES public.regression_suites(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  version_under_test text NOT NULL,
  initiated_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'running', 'completed', 'failed')
  ),
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.regression_suite_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can read regression_suite_runs"
  ON public.regression_suite_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

CREATE POLICY "admin can insert regression_suite_runs"
  ON public.regression_suite_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

CREATE POLICY "admin can update regression_suite_runs"
  ON public.regression_suite_runs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('god_mode', 'internal_admin')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Seed initial module registry
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.module_registry (module_key, module_name, module_type, description, is_shadow_enabled)
VALUES
  ('plumbing_parser',      'Plumbing Quote Parser',        'parser',     'Parses plumbing PDF/Excel quotes into line items', true),
  ('passive_fire_parser',  'Passive Fire Quote Parser',    'parser',     'Parses passive fire protection quotes', false),
  ('active_fire_parser',   'Active Fire Quote Parser',     'parser',     'Parses active fire system quotes', true),
  ('quote_scoring',        'Quote Scoring Engine',         'scoring',    'Weights and scores supplier quotes', true),
  ('comparison_export',    'Comparison Export',            'export',     'Generates comparison Excel/PDF exports', true),
  ('scope_classifier',     'Scope Classifier',             'classifier', 'Classifies quote line items into scope categories', true),
  ('award_report',         'Award Report Generator',       'workflow',   'Generates award recommendation reports', true)
ON CONFLICT (module_key) DO NOTHING;

-- Seed initial module versions
INSERT INTO public.module_versions (module_key, live_version, rollout_status)
SELECT module_key, 'v1', 'live_only'
FROM public.module_registry
ON CONFLICT DO NOTHING;
