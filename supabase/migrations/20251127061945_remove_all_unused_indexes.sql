/*
  # Remove all unused indexes to reduce maintenance overhead
  
  Removing all indexes that are not being used by any queries.
  This reduces:
  - Storage space
  - Index maintenance overhead during INSERT/UPDATE/DELETE
  - Query planner analysis time
  
  ## Indexes Removed
  - Projects table (4 indexes)
  - Quotes table (3 indexes)
  - Parsing jobs table (3 indexes)
  - Quote revisions diff table (2 indexes)
  - Quote revision timeline table (1 index)
  - Award reports table (1 index)
  - Parsing chunks table (3 indexes)
  
  Total: 17 unused indexes
  
  ## Performance Impact
  - Faster write operations (INSERT/UPDATE/DELETE)
  - Reduced storage footprint
  - Cleaner execution plans
  
  ## Note
  These indexes were recently added but are not being used by current queries.
  If query patterns change, we can add them back selectively.
*/

-- Remove unused indexes from projects table
DROP INDEX IF EXISTS idx_projects_approved_quote_id;
DROP INDEX IF EXISTS idx_projects_created_by;
DROP INDEX IF EXISTS idx_projects_created_by_user_id;
DROP INDEX IF EXISTS idx_projects_user_id;

-- Remove unused indexes from quotes table
DROP INDEX IF EXISTS idx_quotes_created_by;
DROP INDEX IF EXISTS idx_quotes_parent_quote_id;
DROP INDEX IF EXISTS idx_quotes_revised_by;

-- Remove unused indexes from parsing_jobs table
DROP INDEX IF EXISTS idx_parsing_jobs_created_by;
DROP INDEX IF EXISTS idx_parsing_jobs_organisation_id;
DROP INDEX IF EXISTS idx_parsing_jobs_user_id;

-- Remove unused indexes from quote_revisions_diff table
DROP INDEX IF EXISTS idx_quote_revisions_diff_project_id;
DROP INDEX IF EXISTS idx_quote_revisions_diff_revised_quote_id;

-- Remove unused indexes from quote_revision_timeline table
DROP INDEX IF EXISTS idx_quote_revision_timeline_created_by;

-- Remove unused indexes from award_reports table
DROP INDEX IF EXISTS idx_award_reports_created_by;

-- Remove unused indexes from parsing_chunks table
DROP INDEX IF EXISTS idx_parsing_chunks_job_id;
DROP INDEX IF EXISTS idx_parsing_chunks_status;
DROP INDEX IF EXISTS idx_parsing_chunks_job_chunk;
