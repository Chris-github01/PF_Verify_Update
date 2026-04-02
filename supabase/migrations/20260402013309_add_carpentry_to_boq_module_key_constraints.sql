/*
  # Add carpentry to BOQ module_key constraints

  ## Summary
  The BOQ Builder system was built with a CHECK constraint on `module_key` that only
  allowed: passive_fire, active_fire, electrical, plumbing, hvac.
  The carpentry trade module is now supported but could not use the BOQ Builder because
  inserts would fail the CHECK constraint.

  ## Changes
  - Drop and recreate CHECK constraints on boq_lines, boq_tenderer_map, scope_gaps,
    boq_exports, and project_tags tables to include 'carpentry'
  - No data is dropped or modified — only constraint definitions change

  ## Tables Modified
  - boq_lines: module_key constraint updated
  - boq_tenderer_map: module_key constraint updated
  - scope_gaps: module_key constraint updated
  - boq_exports: module_key constraint updated
  - project_tags: module_key constraint updated (also allows 'all')
*/

-- boq_lines
ALTER TABLE boq_lines DROP CONSTRAINT IF EXISTS boq_lines_module_key_check;
ALTER TABLE boq_lines
  ADD CONSTRAINT boq_lines_module_key_check
  CHECK (module_key IN ('passive_fire', 'active_fire', 'electrical', 'plumbing', 'hvac', 'carpentry'));

-- boq_tenderer_map
ALTER TABLE boq_tenderer_map DROP CONSTRAINT IF EXISTS boq_tenderer_map_module_key_check;
ALTER TABLE boq_tenderer_map
  ADD CONSTRAINT boq_tenderer_map_module_key_check
  CHECK (module_key IN ('passive_fire', 'active_fire', 'electrical', 'plumbing', 'hvac', 'carpentry'));

-- scope_gaps
ALTER TABLE scope_gaps DROP CONSTRAINT IF EXISTS scope_gaps_module_key_check;
ALTER TABLE scope_gaps
  ADD CONSTRAINT scope_gaps_module_key_check
  CHECK (module_key IN ('passive_fire', 'active_fire', 'electrical', 'plumbing', 'hvac', 'carpentry'));

-- boq_exports
ALTER TABLE boq_exports DROP CONSTRAINT IF EXISTS boq_exports_module_key_check;
ALTER TABLE boq_exports
  ADD CONSTRAINT boq_exports_module_key_check
  CHECK (module_key IN ('passive_fire', 'active_fire', 'electrical', 'plumbing', 'hvac', 'carpentry'));

-- project_tags (also allows 'all')
ALTER TABLE project_tags DROP CONSTRAINT IF EXISTS project_tags_module_key_check;
ALTER TABLE project_tags
  ADD CONSTRAINT project_tags_module_key_check
  CHECK (module_key IN ('passive_fire', 'active_fire', 'electrical', 'plumbing', 'hvac', 'carpentry', 'all'));
