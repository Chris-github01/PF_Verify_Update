/*
  # Add missing foreign key indexes for performance optimization
  
  This migration adds indexes for all foreign key columns that don't have covering indexes.
  These indexes significantly improve JOIN performance and foreign key constraint checks.
  
  ## New Indexes
  1. award_reports
    - idx_award_reports_created_by on created_by
  
  2. parsing_jobs
    - idx_parsing_jobs_created_by on created_by
    - idx_parsing_jobs_organisation_id on organisation_id
    - idx_parsing_jobs_user_id on user_id
  
  3. projects
    - idx_projects_approved_quote_id on approved_quote_id
    - idx_projects_created_by on created_by
    - idx_projects_created_by_user_id on created_by_user_id
    - idx_projects_user_id on user_id
  
  4. quote_revision_timeline
    - idx_quote_revision_timeline_created_by on created_by
  
  5. quote_revisions_diff
    - idx_quote_revisions_diff_project_id on project_id
    - idx_quote_revisions_diff_revised_quote_id on revised_quote_id
  
  6. quotes
    - idx_quotes_created_by on created_by
    - idx_quotes_parent_quote_id on parent_quote_id
    - idx_quotes_revised_by on revised_by
  
  ## Performance Impact
  - Improves JOIN operations with these foreign key columns
  - Speeds up foreign key constraint validation
  - Reduces query execution time for related lookups
*/

-- Award Reports indexes
CREATE INDEX IF NOT EXISTS idx_award_reports_created_by ON award_reports(created_by);

-- Parsing Jobs indexes
CREATE INDEX IF NOT EXISTS idx_parsing_jobs_created_by ON parsing_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_parsing_jobs_organisation_id ON parsing_jobs(organisation_id);
CREATE INDEX IF NOT EXISTS idx_parsing_jobs_user_id ON parsing_jobs(user_id);

-- Projects indexes
CREATE INDEX IF NOT EXISTS idx_projects_approved_quote_id ON projects(approved_quote_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_created_by_user_id ON projects(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- Quote Revision Timeline indexes
CREATE INDEX IF NOT EXISTS idx_quote_revision_timeline_created_by ON quote_revision_timeline(created_by);

-- Quote Revisions Diff indexes
CREATE INDEX IF NOT EXISTS idx_quote_revisions_diff_project_id ON quote_revisions_diff(project_id);
CREATE INDEX IF NOT EXISTS idx_quote_revisions_diff_revised_quote_id ON quote_revisions_diff(revised_quote_id);

-- Quotes indexes
CREATE INDEX IF NOT EXISTS idx_quotes_created_by ON quotes(created_by);
CREATE INDEX IF NOT EXISTS idx_quotes_parent_quote_id ON quotes(parent_quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_revised_by ON quotes(revised_by);
