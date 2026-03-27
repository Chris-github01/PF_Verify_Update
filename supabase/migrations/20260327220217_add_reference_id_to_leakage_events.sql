/*
  # Add reference_id to shadow_revenue_leakage_events

  Adds reference_id column so each leakage event can point back to the
  exact rate intelligence record, scope gap, or failure that triggered it.
  This makes leakage traceable to its root cause.

  Column: reference_id (uuid, nullable) — references the id of the source row
  (shadow_rate_intelligence, shadow_scope_gaps, shadow_scope_exclusions, etc.)
  No FK constraint because events can reference rows across multiple tables.
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shadow_revenue_leakage_events' AND column_name = 'reference_id'
  ) THEN
    ALTER TABLE shadow_revenue_leakage_events ADD COLUMN reference_id uuid NULL;
  END IF;
END $$;
