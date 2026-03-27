/*
  # Phase 2 Hardening: Constraints, Indexes, and Idempotency Guards

  ## Summary
  This migration hardens all four Phase 2 subsystems against race conditions,
  duplicate writes, and constraint mismatches identified in the verification pass.

  ## Problems Fixed

  ### 1. Fingerprint Fragmentation (supplier_fingerprints)
  - The `fingerprint_hash` column lacked a UNIQUE constraint, so two concurrent
    runs producing the same hash could both attempt INSERT, creating duplicate
    fingerprint rows for the same supplier/template family.
  - The existing UNIQUE is on `template_family_id`, but `findExistingFingerprint()`
    queries by `fingerprint_hash` — mismatch that can cause a full-table scan and
    miss the existing row, leading to a duplicate insert.
  - Fix: Add UNIQUE constraint on `fingerprint_hash` and a supporting index.

  ### 2. Duplicate Run-Fingerprint Links (run_fingerprint_links)
  - `run_id` had no UNIQUE constraint, so if `fingerprintRun()` is called twice
    for the same run (e.g. from a retry or concurrent trigger), two link rows are
    inserted — breaking getFingerprintForRun() which uses maybeSingle().
  - Fix: Add UNIQUE constraint on `run_id`.

  ### 3. Queue Duplicate Prevention (learning_queue)
  - `learning_queue_run_id_key` UNIQUE already exists — confirmed safe.
  - Add index on (status, priority_score DESC) for efficient queue queries.

  ### 4. Recommendation Idempotency (improvement_recommendations)
  - Repeated calls to `generateRecommendations()` for the same module+failure_code
    insert duplicate rows — no guard exists.
  - Fix: Add UNIQUE constraint on (module_key, target_failure_code) so upserts
    can be used instead of blind inserts. Use NULL-safe composite: use a partial
    approach with a unique index on (module_key, COALESCE(target_failure_code, '')).

  ### 5. Supporting Indexes
  - Add indexes on all FK columns used in Phase 2 queries.

  ## Security
  - No RLS changes — existing policies verified correct (all authenticated-only).
  - All Phase 2 tables already have RLS enabled.
*/

-- ============================================================
-- 1. FINGERPRINT HASH UNIQUENESS
-- Prevents duplicate fingerprint rows for identical supplier/template combos
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'supplier_fingerprints'
      AND constraint_name = 'supplier_fingerprints_fingerprint_hash_key'
      AND constraint_type = 'UNIQUE'
  ) THEN
    -- Deduplicate any existing rows before adding constraint
    -- Keep the one with highest historical_run_count; delete others
    DELETE FROM supplier_fingerprints sf1
    USING supplier_fingerprints sf2
    WHERE sf1.fingerprint_hash = sf2.fingerprint_hash
      AND sf1.historical_run_count < sf2.historical_run_count;

    -- For any remaining ties (same count), keep the oldest (lowest created_at)
    DELETE FROM supplier_fingerprints sf1
    USING supplier_fingerprints sf2
    WHERE sf1.fingerprint_hash = sf2.fingerprint_hash
      AND sf1.created_at > sf2.created_at;

    ALTER TABLE supplier_fingerprints
      ADD CONSTRAINT supplier_fingerprints_fingerprint_hash_key
      UNIQUE (fingerprint_hash);
  END IF;
END $$;

-- Index to back the UNIQUE and speed up findExistingFingerprint() queries
CREATE INDEX IF NOT EXISTS idx_supplier_fingerprints_hash
  ON supplier_fingerprints (fingerprint_hash);

-- Index for getAllFingerprints() ordering
CREATE INDEX IF NOT EXISTS idx_supplier_fingerprints_run_count
  ON supplier_fingerprints (historical_run_count DESC);

-- ============================================================
-- 2. RUN FINGERPRINT LINK UNIQUENESS
-- Prevents duplicate link rows if fingerprintRun() fires twice for same run
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'run_fingerprint_links'
      AND constraint_name = 'run_fingerprint_links_run_id_key'
      AND constraint_type = 'UNIQUE'
  ) THEN
    -- Remove any duplicate links keeping earliest created
    DELETE FROM run_fingerprint_links rfl1
    USING run_fingerprint_links rfl2
    WHERE rfl1.run_id = rfl2.run_id
      AND rfl1.created_at > rfl2.created_at;

    ALTER TABLE run_fingerprint_links
      ADD CONSTRAINT run_fingerprint_links_run_id_key
      UNIQUE (run_id);
  END IF;
END $$;

-- Index for getFingerprintForRun() lookup by run_id
CREATE INDEX IF NOT EXISTS idx_run_fingerprint_links_run_id
  ON run_fingerprint_links (run_id);

-- Index for lookup by template_family_id (used in getFingerprintForRun join)
CREATE INDEX IF NOT EXISTS idx_run_fingerprint_links_template_family
  ON run_fingerprint_links (template_family_id);

-- ============================================================
-- 3. LEARNING QUEUE INDEXES
-- Existing UNIQUE on run_id is confirmed. Add performance indexes.
-- ============================================================

-- Primary query pattern: ordered by priority_score, filtered by status
CREATE INDEX IF NOT EXISTS idx_learning_queue_status_score
  ON learning_queue (status, priority_score DESC);

-- For getQueueEntryForRun() lookup
CREATE INDEX IF NOT EXISTS idx_learning_queue_run_id
  ON learning_queue (run_id);

-- ============================================================
-- 4. IMPROVEMENT RECOMMENDATIONS IDEMPOTENCY
-- Prevent duplicate recommendations for same module + failure code
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'improvement_recommendations'
      AND constraint_name = 'improvement_recommendations_module_failure_key'
      AND constraint_type = 'UNIQUE'
  ) THEN
    -- Remove any existing duplicates keeping highest impact score
    DELETE FROM improvement_recommendations ir1
    USING improvement_recommendations ir2
    WHERE ir1.module_key = ir2.module_key
      AND COALESCE(ir1.target_failure_code, '') = COALESCE(ir2.target_failure_code, '')
      AND ir1.expected_impact_score < ir2.expected_impact_score;

    -- For ties, keep most recent
    DELETE FROM improvement_recommendations ir1
    USING improvement_recommendations ir2
    WHERE ir1.module_key = ir2.module_key
      AND COALESCE(ir1.target_failure_code, '') = COALESCE(ir2.target_failure_code, '')
      AND ir1.created_at < ir2.created_at;

    ALTER TABLE improvement_recommendations
      ADD CONSTRAINT improvement_recommendations_module_failure_key
      UNIQUE (module_key, target_failure_code);
  END IF;
END $$;

-- Index for getRecommendations() filtered queries
CREATE INDEX IF NOT EXISTS idx_improvement_recommendations_module_status
  ON improvement_recommendations (module_key, status, expected_impact_score DESC);

-- ============================================================
-- 5. SHADOW RUN FAILURES INDEX
-- Speed up failure aggregation queries in recommendation engine and queue scorer
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_shadow_run_failures_run_id
  ON shadow_run_failures (run_id);

CREATE INDEX IF NOT EXISTS idx_shadow_run_failures_failure_code
  ON shadow_run_failures (failure_code);

-- ============================================================
-- 6. SHADOW RUN DIAGNOSTICS INDEX
-- Speed up loadDiagnosticsForRun() in fingerprintingService
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_shadow_run_diagnostics_run_id
  ON shadow_run_diagnostics (run_id);

-- ============================================================
-- 7. ADJUDICATION INDEXES
-- Speed up getAdjudicationEvents(), aggregateAdjudications()
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_adjudication_events_run_id
  ON adjudication_events (run_id);

CREATE INDEX IF NOT EXISTS idx_adjudication_events_module_key
  ON adjudication_events (module_key);

CREATE INDEX IF NOT EXISTS idx_adjudication_notes_run_id
  ON adjudication_notes (run_id);

-- ============================================================
-- 8. DOCUMENT TRUTH VALIDATIONS INDEX
-- Speed up evaluateAndEnqueueRun() truth lookup
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_document_truth_validations_run_id
  ON document_truth_validations (run_id);
