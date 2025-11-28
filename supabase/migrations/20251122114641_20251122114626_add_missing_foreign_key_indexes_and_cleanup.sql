/*
  # Add Missing Foreign Key Indexes and Security Cleanup

  ## Changes

  1. **Add Missing Foreign Key Indexes**
     - `award_reports.blockchain_record_id` - improves join performance
     - `award_reports.created_by` - improves user audit queries
     - `organisation_members.invited_by_user_id` - improves invitation tracking queries
     - `organisations.created_by_user_id` - improves user-org queries
     - `projects.created_by_user_id` - improves user-project queries
     - `projects.user_id` - improves user-project queries
     - `quotes.blockchain_record_id` - improves blockchain audit queries
     - `quotes.ensemble_run_id` - improves parsing tracking queries
     - `quotes.user_id` - improves user-quote queries
     - `review_queue.assigned_to` - improves assignment queries
     - `review_queue.resolved_by` - improves resolution tracking queries

  2. **Remove Unused Indexes**
     - `idx_library_items_organisation_id` - not being used
     - `idx_parsing_jobs_organisation_id` - not being used
     - `idx_review_queue_project_id` - not being used
     - `idx_review_queue_quote_id` - not being used
     - `idx_supplier_template_fingerprints_organisation_id` - not being used

  3. **Security Notes**
     - Vector extension in public schema is acceptable for this use case (embeddings)
     - Password protection will be enabled through Supabase dashboard settings
*/

-- Add missing foreign key indexes for optimal query performance

-- Award Reports foreign keys
CREATE INDEX IF NOT EXISTS idx_award_reports_blockchain_record_id 
  ON public.award_reports(blockchain_record_id);

CREATE INDEX IF NOT EXISTS idx_award_reports_created_by 
  ON public.award_reports(created_by);

-- Organisation Members foreign keys
CREATE INDEX IF NOT EXISTS idx_organisation_members_invited_by_user_id 
  ON public.organisation_members(invited_by_user_id);

-- Organisations foreign keys
CREATE INDEX IF NOT EXISTS idx_organisations_created_by_user_id 
  ON public.organisations(created_by_user_id);

-- Projects foreign keys
CREATE INDEX IF NOT EXISTS idx_projects_created_by_user_id 
  ON public.projects(created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_projects_user_id 
  ON public.projects(user_id);

-- Quotes foreign keys
CREATE INDEX IF NOT EXISTS idx_quotes_blockchain_record_id 
  ON public.quotes(blockchain_record_id);

CREATE INDEX IF NOT EXISTS idx_quotes_ensemble_run_id 
  ON public.quotes(ensemble_run_id);

CREATE INDEX IF NOT EXISTS idx_quotes_user_id 
  ON public.quotes(user_id);

-- Review Queue foreign keys
CREATE INDEX IF NOT EXISTS idx_review_queue_assigned_to 
  ON public.review_queue(assigned_to);

CREATE INDEX IF NOT EXISTS idx_review_queue_resolved_by 
  ON public.review_queue(resolved_by);

-- Remove unused indexes to reduce maintenance overhead

DROP INDEX IF EXISTS public.idx_library_items_organisation_id;
DROP INDEX IF EXISTS public.idx_parsing_jobs_organisation_id;
DROP INDEX IF EXISTS public.idx_review_queue_project_id;
DROP INDEX IF EXISTS public.idx_review_queue_quote_id;
DROP INDEX IF EXISTS public.idx_supplier_template_fingerprints_organisation_id;
