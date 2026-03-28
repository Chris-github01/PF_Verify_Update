/*
  # Add unique constraint on run_id for commercial_validation_results

  Enables upsert with onConflict: 'run_id' in the validation engine.
  One validation result per run_id.
*/

ALTER TABLE commercial_validation_results
  ADD CONSTRAINT commercial_validation_results_run_id_unique UNIQUE (run_id);
