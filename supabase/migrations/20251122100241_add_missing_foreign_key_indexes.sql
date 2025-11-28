/*
  # Add Missing Foreign Key Indexes

  1. Performance Optimization
    - Add indexes for all foreign keys that don't have covering indexes
    - Improves JOIN performance and foreign key constraint checking
    - Reduces query planning time for related table lookups

  2. Indexes Added
    - award_reports: blockchain_record_id, created_by
    - library_items: organisation_id
    - organisation_members: invited_by_user_id
    - organisations: created_by_user_id
    - parsing_jobs: organisation_id, quote_id
    - projects: created_by_user_id, user_id
    - quotes: blockchain_record_id, ensemble_run_id, user_id
    - review_queue: assigned_to, project_id, quote_id, resolved_by
    - supplier_template_fingerprints: organisation_id

  3. Important Notes
    - These indexes significantly improve query performance
    - Foreign key lookups will be much faster
    - Minimal storage overhead, major performance gain
*/

-- Award Reports
CREATE INDEX IF NOT EXISTS idx_award_reports_blockchain_record_id 
  ON award_reports(blockchain_record_id) 
  WHERE blockchain_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_award_reports_created_by 
  ON award_reports(created_by) 
  WHERE created_by IS NOT NULL;

-- Library Items
CREATE INDEX IF NOT EXISTS idx_library_items_organisation_id 
  ON library_items(organisation_id);

-- Organisation Members
CREATE INDEX IF NOT EXISTS idx_organisation_members_invited_by_user_id 
  ON organisation_members(invited_by_user_id) 
  WHERE invited_by_user_id IS NOT NULL;

-- Organisations
CREATE INDEX IF NOT EXISTS idx_organisations_created_by_user_id 
  ON organisations(created_by_user_id) 
  WHERE created_by_user_id IS NOT NULL;

-- Parsing Jobs
CREATE INDEX IF NOT EXISTS idx_parsing_jobs_organisation_id 
  ON parsing_jobs(organisation_id);

CREATE INDEX IF NOT EXISTS idx_parsing_jobs_quote_id 
  ON parsing_jobs(quote_id) 
  WHERE quote_id IS NOT NULL;

-- Projects
CREATE INDEX IF NOT EXISTS idx_projects_created_by_user_id 
  ON projects(created_by_user_id) 
  WHERE created_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_user_id 
  ON projects(user_id) 
  WHERE user_id IS NOT NULL;

-- Quotes
CREATE INDEX IF NOT EXISTS idx_quotes_blockchain_record_id 
  ON quotes(blockchain_record_id) 
  WHERE blockchain_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_ensemble_run_id 
  ON quotes(ensemble_run_id) 
  WHERE ensemble_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_user_id 
  ON quotes(user_id) 
  WHERE user_id IS NOT NULL;

-- Review Queue
CREATE INDEX IF NOT EXISTS idx_review_queue_assigned_to 
  ON review_queue(assigned_to) 
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_review_queue_project_id 
  ON review_queue(project_id);

CREATE INDEX IF NOT EXISTS idx_review_queue_quote_id 
  ON review_queue(quote_id);

CREATE INDEX IF NOT EXISTS idx_review_queue_resolved_by 
  ON review_queue(resolved_by) 
  WHERE resolved_by IS NOT NULL;

-- Supplier Template Fingerprints
CREATE INDEX IF NOT EXISTS idx_supplier_template_fingerprints_organisation_id 
  ON supplier_template_fingerprints(organisation_id) 
  WHERE organisation_id IS NOT NULL;
