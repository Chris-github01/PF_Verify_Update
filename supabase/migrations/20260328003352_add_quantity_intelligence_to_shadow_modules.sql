/*
  # Add Quantity Intelligence Module to Shadow Registry

  Adds the quantity_intelligence module to the module_registry and module_versions tables,
  making it available for shadow testing, versioned rollout, and kill-switch control
  in the Shadow Admin Dashboard.

  1. New Module
    - module_registry: quantity_intelligence — Quantity variance analysis engine
    - module_versions: starts at v1 / live_only rollout status

  2. Notes
    - Uses ON CONFLICT DO NOTHING so safe to re-run
    - No RLS changes required — existing policies cover these tables
*/

INSERT INTO module_registry (id, module_key, module_name, module_type, description, is_shadow_enabled)
VALUES (
  gen_random_uuid(),
  'quantity_intelligence',
  'Quantity Intelligence Engine',
  'workflow',
  'Analyses supplier quantity deviations against consensus reference quantities. Flags variance outliers, scores supplier accuracy, and surfaces adjustment recommendations.',
  true
)
ON CONFLICT DO NOTHING;

INSERT INTO module_versions (id, module_key, live_version, shadow_version, promoted_candidate_version, rollback_version, rollout_status, updated_at)
SELECT
  gen_random_uuid(),
  'quantity_intelligence',
  'v1',
  null,
  null,
  null,
  'live_only',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM module_versions WHERE module_key = 'quantity_intelligence'
);
