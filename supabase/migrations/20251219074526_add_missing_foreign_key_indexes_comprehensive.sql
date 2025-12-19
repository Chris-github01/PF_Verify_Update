/*
  # Add Missing Foreign Key Indexes - Comprehensive Fix

  This migration adds indexes for all foreign keys that are currently unindexed.
  Foreign key indexes are critical for:
  - Join performance
  - Cascade delete performance
  - Foreign key constraint validation

  ## Foreign Keys Being Indexed

  ### audit_exports
  - generated_by_user_id → users

  ### audits
  - audited_by_user_id → users
  - recommended_supplier_id → suppliers

  ### award_reports
  - created_by → users

  ### organisations
  - created_by_admin_id → users
  - demo_account_id → demo_accounts

  ### parsing_jobs
  - created_by → users
  - organisation_id → organisations
  - user_id → users

  ### projects
  - approved_quote_id → quotes
  - created_by → users
  - created_by_user_id → users
  - user_id → users

  ### quote_revision_timeline
  - created_by → users

  ### quote_revisions_diff
  - project_id → projects
  - revised_quote_id → quotes

  ### quotes
  - created_by → users
  - parent_quote_id → quotes
  - revised_by → users
  - uploaded_by_user_id → users
*/

-- audit_exports indexes
CREATE INDEX IF NOT EXISTS idx_audit_exports_generated_by_user_id
  ON public.audit_exports(generated_by_user_id);

-- audits indexes
CREATE INDEX IF NOT EXISTS idx_audits_audited_by_user_id
  ON public.audits(audited_by_user_id);

CREATE INDEX IF NOT EXISTS idx_audits_recommended_supplier_id
  ON public.audits(recommended_supplier_id);

-- award_reports indexes
CREATE INDEX IF NOT EXISTS idx_award_reports_created_by
  ON public.award_reports(created_by);

-- organisations indexes
CREATE INDEX IF NOT EXISTS idx_organisations_created_by_admin_id
  ON public.organisations(created_by_admin_id);

CREATE INDEX IF NOT EXISTS idx_organisations_demo_account_id
  ON public.organisations(demo_account_id);

-- parsing_jobs indexes
CREATE INDEX IF NOT EXISTS idx_parsing_jobs_created_by
  ON public.parsing_jobs(created_by);

CREATE INDEX IF NOT EXISTS idx_parsing_jobs_organisation_id_fk
  ON public.parsing_jobs(organisation_id);

CREATE INDEX IF NOT EXISTS idx_parsing_jobs_user_id
  ON public.parsing_jobs(user_id);

-- projects indexes
CREATE INDEX IF NOT EXISTS idx_projects_approved_quote_id
  ON public.projects(approved_quote_id);

CREATE INDEX IF NOT EXISTS idx_projects_created_by
  ON public.projects(created_by);

CREATE INDEX IF NOT EXISTS idx_projects_created_by_user_id
  ON public.projects(created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_projects_user_id
  ON public.projects(user_id);

-- quote_revision_timeline indexes
CREATE INDEX IF NOT EXISTS idx_quote_revision_timeline_created_by
  ON public.quote_revision_timeline(created_by);

-- quote_revisions_diff indexes
CREATE INDEX IF NOT EXISTS idx_quote_revisions_diff_project_id
  ON public.quote_revisions_diff(project_id);

CREATE INDEX IF NOT EXISTS idx_quote_revisions_diff_revised_quote_id
  ON public.quote_revisions_diff(revised_quote_id);

-- quotes indexes
CREATE INDEX IF NOT EXISTS idx_quotes_created_by
  ON public.quotes(created_by);

CREATE INDEX IF NOT EXISTS idx_quotes_parent_quote_id
  ON public.quotes(parent_quote_id);

CREATE INDEX IF NOT EXISTS idx_quotes_revised_by
  ON public.quotes(revised_by);

CREATE INDEX IF NOT EXISTS idx_quotes_uploaded_by_user_id
  ON public.quotes(uploaded_by_user_id);
