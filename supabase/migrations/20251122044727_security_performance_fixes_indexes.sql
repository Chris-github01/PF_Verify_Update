/*
  # Security and Performance Fixes - Part 1: Foreign Key Indexes

  1. New Indexes
    - Add covering indexes for all unindexed foreign keys
    - Improves query performance when joining on foreign key relationships
  
  2. Tables Affected
    - award_reports (blockchain_record_id, created_by)
    - organisation_members (invited_by_user_id)
    - organisations (created_by_user_id)
    - parsing_jobs (quote_id)
    - quotes (blockchain_record_id)
    - review_queue (project_id, quote_id, resolved_by)
*/

-- Award reports indexes
CREATE INDEX IF NOT EXISTS idx_award_reports_blockchain_record_id
  ON public.award_reports(blockchain_record_id);

CREATE INDEX IF NOT EXISTS idx_award_reports_created_by
  ON public.award_reports(created_by);

-- Organisation members indexes
CREATE INDEX IF NOT EXISTS idx_organisation_members_invited_by
  ON public.organisation_members(invited_by_user_id);

-- Organisations indexes
CREATE INDEX IF NOT EXISTS idx_organisations_created_by
  ON public.organisations(created_by_user_id);

-- Parsing jobs indexes
CREATE INDEX IF NOT EXISTS idx_parsing_jobs_quote_id
  ON public.parsing_jobs(quote_id);

-- Quotes indexes
CREATE INDEX IF NOT EXISTS idx_quotes_blockchain_record_id
  ON public.quotes(blockchain_record_id);

-- Review queue indexes
CREATE INDEX IF NOT EXISTS idx_review_queue_project_id
  ON public.review_queue(project_id);

CREATE INDEX IF NOT EXISTS idx_review_queue_quote_id
  ON public.review_queue(quote_id);

CREATE INDEX IF NOT EXISTS idx_review_queue_resolved_by
  ON public.review_queue(resolved_by);