/*
  # Add unique constraints to CI tables for upsert support

  ## Summary
  Adds unique constraints needed for safe upsert operations in the commercial
  intelligence layer. Without these constraints the upsert onConflict clauses
  in the TypeScript services would fail.

  ## Changes
  - ci_decision_gate_results: unique (project_id, quote_id)
  - ci_supplier_scope_summaries: already has unique on quote_id (from migration 1)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'ci_decision_gate_results'
    AND indexname = 'idx_ci_gate_results_project_quote_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_ci_gate_results_project_quote_unique
      ON ci_decision_gate_results(project_id, quote_id)
      WHERE quote_id IS NOT NULL;
  END IF;
END $$;
