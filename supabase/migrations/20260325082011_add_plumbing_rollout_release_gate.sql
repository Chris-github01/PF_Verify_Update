/*
  # Phase 6 – Plumbing Parser Release Gate & Rollout Controls

  ## Summary
  1. Expands the rollout_status CHECK constraint to include Phase 6 states
  2. Creates module_release_approvals table for explicit approval records
  3. Seeds standard plumbing_parser feature flags

  ## Changes

  ### module_versions
  - rollout_status CHECK expanded with: idle, shadow_testing, regression_passed,
    regression_failed, approved_for_beta, beta_internal, beta_limited, full_release
    (existing values preserved)

  ### New Table: module_release_approvals
  - id, module_key, version, approved_by, approval_type, regression_suite_run_id,
    approval_notes, created_at
  - RLS: platform_admins only for insert; platform_admins can select

  ### feature_flags seed
  - plumbing_parser.beta_enabled
  - plumbing_parser.internal_only
  - plumbing_parser.allowed_orgs
  - plumbing_parser.rollout_percentage
  - plumbing_parser.kill_switch

  ## Security
  - RLS enabled and restrictive on module_release_approvals
  - Indexed for performance

  ## Notes
  1. All DDL uses IF NOT EXISTS / DO $$ guards — fully additive
  2. Existing rollout_status values preserved in the new constraint
  3. Seed uses INSERT ... WHERE NOT EXISTS (idempotent)
*/

-- ─── Expand rollout_status check ────────────────────────────────────────────

ALTER TABLE module_versions
  DROP CONSTRAINT IF EXISTS module_versions_rollout_status_check;

ALTER TABLE module_versions
  ADD CONSTRAINT module_versions_rollout_status_check
  CHECK (rollout_status IN (
    'live_only',
    'shadow_only',
    'internal_beta',
    'org_beta',
    'partial_rollout',
    'global_live',
    'rolled_back',
    'idle',
    'shadow_testing',
    'regression_passed',
    'regression_failed',
    'approved_for_beta',
    'beta_internal',
    'beta_limited',
    'full_release'
  ));

-- ─── module_release_approvals ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS module_release_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  version text NOT NULL,
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  approval_type text NOT NULL DEFAULT 'beta' CHECK (approval_type IN ('beta', 'full_release')),
  regression_suite_run_id uuid,
  approval_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE module_release_approvals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_module_release_approvals_module_key
  ON module_release_approvals(module_key);

CREATE INDEX IF NOT EXISTS idx_module_release_approvals_created_at
  ON module_release_approvals(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'module_release_approvals'
      AND policyname = 'Platform admins can view release approvals'
  ) THEN
    CREATE POLICY "Platform admins can view release approvals"
      ON module_release_approvals FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM platform_admins
          WHERE platform_admins.user_id = auth.uid()
            AND platform_admins.is_active = true
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'module_release_approvals'
      AND policyname = 'Platform admins can create release approvals'
  ) THEN
    CREATE POLICY "Platform admins can create release approvals"
      ON module_release_approvals FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM platform_admins
          WHERE platform_admins.user_id = auth.uid()
            AND platform_admins.is_active = true
        )
      );
  END IF;
END $$;

-- ─── Seed standard plumbing_parser feature flags (idempotent) ────────────────

INSERT INTO feature_flags (flag_key, module_key, environment, target_type, enabled, config_json, priority, updated_at)
SELECT
  v.flag_key, v.module_key, v.environment, v.target_type, v.enabled, v.config_json, v.priority, now()
FROM (VALUES
  ('plumbing_parser.kill_switch',         'plumbing_parser', 'production', 'global',     false, '{}'::jsonb,                  1),
  ('plumbing_parser.beta_enabled',        'plumbing_parser', 'production', 'global',     false, '{}'::jsonb,                  10),
  ('plumbing_parser.internal_only',       'plumbing_parser', 'production', 'global',     false, '{"enabled": false}'::jsonb,  20),
  ('plumbing_parser.allowed_orgs',        'plumbing_parser', 'production', 'global',     false, '{"orgIds": []}'::jsonb,      30),
  ('plumbing_parser.rollout_percentage',  'plumbing_parser', 'production', 'percentage', false, '{"percentage": 0}'::jsonb,   40)
) AS v(flag_key, module_key, environment, target_type, enabled, config_json, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM feature_flags f
  WHERE f.flag_key = v.flag_key AND f.environment = v.environment AND f.target_type = v.target_type
);
