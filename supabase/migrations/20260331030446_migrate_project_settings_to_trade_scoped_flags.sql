/*
  # Migrate project_settings to trade-scoped workflow flags

  ## Problem
  Workflow completion flags (review_clean_completed, quote_intelligence_completed, etc.)
  were stored as flat keys in project_settings.settings. When a project has multiple
  trades, these flags bleed across trades — completing passive_fire steps shows all
  steps as complete when switching to carpentry.

  ## Fix
  For any project_settings row that has legacy flat flags but NO trade-scoped keys yet,
  this migration moves the flat flags under the trade that has the most quotes in that
  project (the "primary trade"). This preserves all existing completion data correctly
  and stops cross-trade contamination.

  ## Changes
  - Reads each project_settings row with legacy flat flags
  - Finds the dominant trade (most quotes) for that project
  - Moves the flat flags under settings.[trade].flag_name
  - Removes the old flat keys
*/

DO $$
DECLARE
  rec RECORD;
  dominant_trade TEXT;
  old_settings JSONB;
  new_settings JSONB;
  trade_block JSONB;
BEGIN
  FOR rec IN
    SELECT ps.id, ps.project_id, ps.settings
    FROM project_settings ps
    WHERE
      ps.settings IS NOT NULL
      AND (
        ps.settings ? 'review_clean_completed'
        OR ps.settings ? 'quote_intelligence_completed'
        OR ps.settings ? 'quantity_intelligence_completed'
        OR ps.settings ? 'scope_matrix_completed'
        OR ps.settings ? 'last_equalisation_run'
        OR ps.settings ? 'equalisation_mode'
        OR ps.settings ? 'boq_builder_completed'
      )
      -- Only migrate rows that don't already have trade-scoped keys
      -- (i.e. no key whose value is a JSON object)
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_each(ps.settings) kv
        WHERE jsonb_typeof(kv.value) = 'object'
      )
  LOOP
    old_settings := rec.settings;

    -- Find the trade with the most quotes for this project
    SELECT trade INTO dominant_trade
    FROM quotes
    WHERE project_id = rec.project_id
    GROUP BY trade
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    -- Default to passive_fire if no quotes found
    IF dominant_trade IS NULL THEN
      dominant_trade := 'passive_fire';
    END IF;

    -- Build the trade-scoped block from legacy flags
    trade_block := '{}'::jsonb;

    IF old_settings ? 'review_clean_completed' THEN
      trade_block := trade_block || jsonb_build_object('review_clean_completed', old_settings->'review_clean_completed');
    END IF;
    IF old_settings ? 'quote_intelligence_completed' THEN
      trade_block := trade_block || jsonb_build_object('quote_intelligence_completed', old_settings->'quote_intelligence_completed');
    END IF;
    IF old_settings ? 'quantity_intelligence_completed' THEN
      trade_block := trade_block || jsonb_build_object('quantity_intelligence_completed', old_settings->'quantity_intelligence_completed');
    END IF;
    IF old_settings ? 'scope_matrix_completed' THEN
      trade_block := trade_block || jsonb_build_object('scope_matrix_completed', old_settings->'scope_matrix_completed');
    END IF;
    IF old_settings ? 'last_equalisation_run' THEN
      trade_block := trade_block || jsonb_build_object('last_equalisation_run', old_settings->'last_equalisation_run');
    END IF;
    IF old_settings ? 'equalisation_mode' THEN
      trade_block := trade_block || jsonb_build_object('equalisation_mode', old_settings->'equalisation_mode');
    END IF;
    IF old_settings ? 'boq_builder_completed' THEN
      trade_block := trade_block || jsonb_build_object('boq_builder_completed', old_settings->'boq_builder_completed');
    END IF;

    -- Build new settings: remove legacy flat keys, add trade-scoped block
    new_settings := old_settings
      - 'review_clean_completed'
      - 'quote_intelligence_completed'
      - 'quantity_intelligence_completed'
      - 'scope_matrix_completed'
      - 'last_equalisation_run'
      - 'equalisation_mode'
      - 'boq_builder_completed';

    new_settings := new_settings || jsonb_build_object(dominant_trade, trade_block);

    UPDATE project_settings
    SET settings = new_settings, updated_at = now()
    WHERE id = rec.id;

    RAISE NOTICE 'Migrated project % settings to trade %', rec.project_id, dominant_trade;
  END LOOP;
END $$;
