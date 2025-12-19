/*
  # Drop Unused and Duplicate Indexes

  This migration removes unused indexes that are not being used by queries
  and duplicate indexes that provide redundant coverage.

  ## Unused Indexes Dropped (24 total)

  These indexes have not been used and are consuming storage and insert/update performance:
  - organisations: country_region, industry_type, subscription_status, trial_end_date, is_demo
  - scope_categories: project_id
  - organisation_members: org_user_status
  - projects: org (keeping org_id)
  - suppliers: org_id, name
  - quotes: supplier_id
  - audits: project_id, created_at, risk_score
  - audit_findings: audit_id, type, severity, supplier_id
  - audit_exports: audit_id, generated_at
  - demo_accounts: access_token, status
  - audit_events: actor
  - system_config: key

  ## Duplicate Indexes Dropped (3 total)

  These indexes are identical to others and provide no additional benefit:
  - parsing_jobs: idx_parsing_jobs_project (keeping idx_parsing_jobs_project_id)
  - projects: idx_projects_org (keeping idx_projects_org_id)
  - quotes: idx_quotes_project (keeping idx_quotes_project_id)
*/

-- Drop unused indexes on organisations
DROP INDEX IF EXISTS public.idx_organisations_country_region;
DROP INDEX IF EXISTS public.idx_organisations_industry_type;
DROP INDEX IF EXISTS public.idx_organisations_subscription_status;
DROP INDEX IF EXISTS public.idx_organisations_trial_end_date;
DROP INDEX IF EXISTS public.idx_organisations_is_demo;

-- Drop unused indexes on scope_categories
DROP INDEX IF EXISTS public.idx_scope_categories_project_id;

-- Drop unused indexes on organisation_members
DROP INDEX IF EXISTS public.idx_organisation_members_org_user_status;

-- Drop unused indexes on suppliers
DROP INDEX IF EXISTS public.idx_suppliers_org_id;
DROP INDEX IF EXISTS public.idx_suppliers_name;

-- Drop unused indexes on quotes
DROP INDEX IF EXISTS public.idx_quotes_supplier_id;

-- Drop unused indexes on audits
DROP INDEX IF EXISTS public.idx_audits_project_id;
DROP INDEX IF EXISTS public.idx_audits_created_at;
DROP INDEX IF EXISTS public.idx_audits_risk_score;

-- Drop unused indexes on audit_findings
DROP INDEX IF EXISTS public.idx_audit_findings_audit_id;
DROP INDEX IF EXISTS public.idx_audit_findings_type;
DROP INDEX IF EXISTS public.idx_audit_findings_severity;
DROP INDEX IF EXISTS public.idx_audit_findings_supplier_id;

-- Drop unused indexes on audit_exports
DROP INDEX IF EXISTS public.idx_audit_exports_audit_id;
DROP INDEX IF EXISTS public.idx_audit_exports_generated_at;

-- Drop unused indexes on demo_accounts
DROP INDEX IF EXISTS public.idx_demo_accounts_access_token;
DROP INDEX IF EXISTS public.idx_demo_accounts_status;

-- Drop unused indexes on audit_events
DROP INDEX IF EXISTS public.idx_audit_events_actor;

-- Drop unused indexes on system_config
DROP INDEX IF EXISTS public.idx_system_config_key;

-- Drop duplicate indexes (keeping the better-named versions)
DROP INDEX IF EXISTS public.idx_parsing_jobs_project;
DROP INDEX IF EXISTS public.idx_projects_org;
DROP INDEX IF EXISTS public.idx_quotes_project;
