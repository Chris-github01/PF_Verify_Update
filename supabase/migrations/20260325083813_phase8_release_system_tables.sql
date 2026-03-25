/*
  # Phase 8 – Controlled Expansion Engine + Production Release System

  ## Summary
  Adds two new shadow/admin tables to support structured, auditable parser promotion
  workflows. All tables are internal to the Shadow Admin system only.

  ## New Tables

  ### module_release_checklists
  Stores the release readiness checklist for a given module+version. Each row tracks
  which checklist items are completed and whether the overall status is incomplete,
  ready, or blocked. Admins must satisfy this checklist before promoting to release
  candidate or production.

  ### module_version_history
  Immutable audit log of every live_version change for a module — promotions,
  rollbacks, and the previous version preserved for instant rollback.

  ## Columns & Constraints
  - checklist_items_json: full list of items with name/required/description
  - completed_items_json: map of item_key → { passed, notes, checked_at }
  - status: incomplete | ready | blocked
  - module_version_history tracks: event_type, from/to versions, actor, timestamp

  ## Security
  - RLS enabled on both tables
  - Platform admins only
  - Service role implicitly bypasses for background writes

  ## Notes
  1. Fully additive — no existing tables modified
  2. IF NOT EXISTS guards on all objects
*/

-- ─── module_release_checklists ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS module_release_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  version text NOT NULL,
  checklist_items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_items_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'incomplete' CHECK (status IN ('incomplete', 'ready', 'blocked')),
  blocked_reasons_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_key, version)
);

ALTER TABLE module_release_checklists ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mrc_module_key ON module_release_checklists(module_key);
CREATE INDEX IF NOT EXISTS idx_mrc_status     ON module_release_checklists(status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'module_release_checklists' AND policyname = 'Platform admins can view release checklists') THEN
    CREATE POLICY "Platform admins can view release checklists"
      ON module_release_checklists FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'module_release_checklists' AND policyname = 'Platform admins can insert release checklists') THEN
    CREATE POLICY "Platform admins can insert release checklists"
      ON module_release_checklists FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'module_release_checklists' AND policyname = 'Platform admins can update release checklists') THEN
    CREATE POLICY "Platform admins can update release checklists"
      ON module_release_checklists FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── module_version_history ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS module_version_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'promoted_to_rc', 'promoted_to_production', 'rolled_back',
    'beta_started', 'beta_expanded', 'beta_paused', 'version_set'
  )),
  from_version text,
  to_version text NOT NULL,
  from_rollout_status text,
  to_rollout_status text,
  actor_user_id uuid REFERENCES auth.users(id),
  notes text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE module_version_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mvh_module_key  ON module_version_history(module_key);
CREATE INDEX IF NOT EXISTS idx_mvh_event_type  ON module_version_history(event_type);
CREATE INDEX IF NOT EXISTS idx_mvh_created_at  ON module_version_history(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'module_version_history' AND policyname = 'Platform admins can view version history') THEN
    CREATE POLICY "Platform admins can view version history"
      ON module_version_history FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'module_version_history' AND policyname = 'Platform admins can insert version history') THEN
    CREATE POLICY "Platform admins can insert version history"
      ON module_version_history FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
