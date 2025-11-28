/*
  # Remove unused indexes to reduce maintenance overhead
  
  Removing indexes that are not being used by any queries.
  This reduces:
  - Storage space
  - Index maintenance overhead during INSERT/UPDATE/DELETE
  - Query planner analysis time
  
  ## Indexes Removed
  - idx_quotes_organisation_id (not used)
  - idx_parsing_jobs_quote_id (not used)
  - idx_user_preferences_user_id (not used)
  - idx_scope_categories_project_id (not used)
  - idx_quote_items_system_id (not used)
  - idx_quote_items_confidence (not used)
  - idx_quote_items_system_needs_review (not used)
  - idx_quote_items_is_excluded (not used)
  - idx_parsing_chunks_job_id (keep - needed for foreign key)
  - idx_parsing_chunks_status (keep - used for monitoring)
  - idx_parsing_chunks_job_chunk (keep - unique constraint support)
  
  Note: Keeping parsing_chunks indexes as they're new and will be used.
  
  ## Performance Impact
  - Faster write operations (INSERT/UPDATE/DELETE)
  - Reduced storage footprint
  - Cleaner execution plans
*/

-- Remove unused indexes
DROP INDEX IF EXISTS idx_quotes_organisation_id;
DROP INDEX IF EXISTS idx_parsing_jobs_quote_id;
DROP INDEX IF EXISTS idx_user_preferences_user_id;
DROP INDEX IF EXISTS idx_scope_categories_project_id;
DROP INDEX IF EXISTS idx_quote_items_system_id;
DROP INDEX IF EXISTS idx_quote_items_confidence;
DROP INDEX IF EXISTS idx_quote_items_system_needs_review;
DROP INDEX IF EXISTS idx_quote_items_is_excluded;

-- Note: NOT removing parsing_chunks indexes as they're new and likely to be used:
-- - idx_parsing_chunks_job_id (foreign key lookups)
-- - idx_parsing_chunks_status (monitoring failed chunks)
-- - idx_parsing_chunks_job_chunk (unique constraint support)
