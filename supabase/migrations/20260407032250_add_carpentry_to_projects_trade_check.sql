/*
  # Add carpentry to projects trade check constraint

  The projects_trade_check constraint was missing 'carpentry' as a valid trade value,
  causing project creation to fail when the Carpentry trade was selected.

  Changes:
  - Drop the existing projects_trade_check constraint
  - Re-add it with 'carpentry' included as a valid value
*/

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_trade_check;

ALTER TABLE projects ADD CONSTRAINT projects_trade_check
  CHECK (trade = ANY (ARRAY[
    'passive_fire'::text,
    'electrical'::text,
    'plumbing'::text,
    'hvac'::text,
    'mechanical'::text,
    'general'::text,
    'carpentry'::text,
    'active_fire'::text
  ]));
