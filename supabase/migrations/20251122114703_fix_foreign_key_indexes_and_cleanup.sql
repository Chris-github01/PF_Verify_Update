/*
  # Fix Foreign Key Indexes and Security Issues

  1. New Indexes (Foreign Keys)
    - Add missing indexes on foreign key columns for optimal query performance:
      - `award_reports.blockchain_record_id`
      - `award_reports.created_by`
      - `organisation_members.invited_by_user_id`
      - `organisations.created_by_user_id`
      - `projects.created_by_user_id`
      - `projects.user_id`
      - `quotes.blockchain_record_id`
      - `quotes.ensemble_run_id`
      - `quotes.user_id`
      - `review_queue.assigned_to`
      - `review_queue.resolved_by`

  2. Index Cleanup
    - Remove unused indexes that are not being utilized:
      - `idx_library_items_organisation_id`
      - `idx_parsing_jobs_organisation_id`
      - `idx_review_queue_project_id`
      - `idx_review_queue_quote_id`
      - `idx_supplier_template_fingerprints_organisation_id`

  3. Security Notes
    - All foreign key columns now have covering indexes for optimal performance
    - Unused indexes removed to reduce database maintenance overhead
    - Vector extension schema issue noted (requires manual intervention)
*/

-- Add missing foreign key indexes for award_reports
CREATE INDEX IF NOT EXISTS idx_award_reports_blockchain_record_id 
  ON public.award_reports(blockchain_record_id);

CREATE INDEX IF NOT EXISTS idx_award_reports_created_by 
  ON public.award_reports(created_by);

-- Add missing foreign key indexes for organisation_members
CREATE INDEX IF NOT EXISTS idx_organisation_members_invited_by_user_id 
  ON public.organisation_members(invited_by_user_id);

-- Add missing foreign key indexes for organisations
CREATE INDEX IF NOT EXISTS idx_organisations_created_by_user_id 
  ON public.organisations(created_by_user_id);

-- Add missing foreign key indexes for projects
CREATE INDEX IF NOT EXISTS idx_projects_created_by_user_id 
  ON public.projects(created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_projects_user_id 
  ON public.projects(user_id);

-- Add missing foreign key indexes for quotes
CREATE INDEX IF NOT EXISTS idx_quotes_blockchain_record_id 
  ON public.quotes(blockchain_record_id);

CREATE INDEX IF NOT EXISTS idx_quotes_ensemble_run_id 
  ON public.quotes(ensemble_run_id);

CREATE INDEX IF NOT EXISTS idx_quotes_user_id 
  ON public.quotes(user_id);

-- Add missing foreign key indexes for review_queue
CREATE INDEX IF NOT EXISTS idx_review_queue_assigned_to 
  ON public.review_queue(assigned_to);

CREATE INDEX IF NOT EXISTS idx_review_queue_resolved_by 
  ON public.review_queue(resolved_by);

-- Remove unused indexes
DROP INDEX IF EXISTS public.idx_library_items_organisation_id;
DROP INDEX IF EXISTS public.idx_parsing_jobs_organisation_id;
DROP INDEX IF EXISTS public.idx_review_queue_project_id;
DROP INDEX IF EXISTS public.idx_review_queue_quote_id;
DROP INDEX IF EXISTS public.idx_supplier_template_fingerprints_organisation_id;
