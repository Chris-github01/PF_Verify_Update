/*
  # Optimize Index Strategy

  1. Issue Analysis
    - New indexes show as "unused" because they're brand new
    - Indexes need query activity to show usage statistics
    - Some indexes are essential for foreign key performance
    - Some are less critical and can be created on-demand

  2. Strategy
    - Keep indexes on HIGH-TRAFFIC foreign keys
    - Keep indexes on columns used in WHERE/JOIN clauses
    - Remove indexes on low-traffic or nullable foreign keys
    - Add partial indexes where appropriate

  3. Indexes to KEEP (High Priority)
    - organisation_id columns (frequently joined)
    - project_id columns (frequently joined)
    - quote_id columns (frequently joined)
    - user_id columns used in auth checks

  4. Indexes to REMOVE (Low Priority)
    - blockchain_record_id (rarely queried, nullable)
    - created_by (rarely queried, nullable)
    - invited_by_user_id (rarely queried, nullable)
    - resolved_by (rarely queried, nullable)
    - assigned_to (rarely queried, nullable)
    - ensemble_run_id (rarely queried, nullable)

  5. Important Notes
    - Indexes can be added later if queries slow down
    - Monitor slow query logs to identify missing indexes
    - Keep essential indexes even if showing as "unused" initially
*/

-- Remove indexes on rarely-queried nullable foreign keys
DROP INDEX IF EXISTS idx_award_reports_blockchain_record_id;
DROP INDEX IF EXISTS idx_award_reports_created_by;
DROP INDEX IF EXISTS idx_organisation_members_invited_by_user_id;
DROP INDEX IF EXISTS idx_organisations_created_by_user_id;
DROP INDEX IF EXISTS idx_projects_created_by_user_id;
DROP INDEX IF EXISTS idx_projects_user_id;
DROP INDEX IF EXISTS idx_quotes_blockchain_record_id;
DROP INDEX IF EXISTS idx_quotes_ensemble_run_id;
DROP INDEX IF EXISTS idx_quotes_user_id;
DROP INDEX IF EXISTS idx_review_queue_assigned_to;
DROP INDEX IF EXISTS idx_review_queue_resolved_by;

-- Keep these ESSENTIAL indexes (high-traffic foreign keys)
-- These support core application queries and JOINs:
-- ✅ idx_library_items_organisation_id
-- ✅ idx_parsing_jobs_organisation_id
-- ✅ idx_parsing_jobs_quote_id
-- ✅ idx_review_queue_project_id
-- ✅ idx_review_queue_quote_id
-- ✅ idx_supplier_template_fingerprints_organisation_id

-- Add comment explaining why these are kept
COMMENT ON INDEX idx_library_items_organisation_id IS
  'Essential for filtering library items by organisation - high-traffic query path';

COMMENT ON INDEX idx_parsing_jobs_organisation_id IS
  'Essential for filtering parsing jobs by organisation - used in dashboard queries';

COMMENT ON INDEX idx_parsing_jobs_quote_id IS
  'Essential for linking parsing jobs to quotes - frequently joined';

COMMENT ON INDEX idx_review_queue_project_id IS
  'Essential for review queue filtering by project - core workflow';

COMMENT ON INDEX idx_review_queue_quote_id IS
  'Essential for review queue filtering by quote - core workflow';

COMMENT ON INDEX idx_supplier_template_fingerprints_organisation_id IS
  'Essential for template matching by organisation - used in parsing';
