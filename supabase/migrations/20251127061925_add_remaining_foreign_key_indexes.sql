/*
  # Add remaining missing foreign key indexes
  
  This migration adds indexes for foreign keys that are still missing covering indexes.
  
  ## New Indexes
  1. parsing_jobs
    - idx_parsing_jobs_quote_id on quote_id
  
  2. quotes
    - idx_quotes_organisation_id on organisation_id
  
  3. scope_categories
    - idx_scope_categories_project_id on project_id
  
  ## Performance Impact
  - Improves JOIN performance with these foreign key columns
  - Speeds up foreign key constraint validation
  - Reduces query execution time for related lookups
*/

-- Add missing foreign key indexes
CREATE INDEX IF NOT EXISTS idx_parsing_jobs_quote_id ON parsing_jobs(quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_organisation_id ON quotes(organisation_id);
CREATE INDEX IF NOT EXISTS idx_scope_categories_project_id ON scope_categories(project_id);
