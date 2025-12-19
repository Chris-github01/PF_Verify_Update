/*
  # Remove Unused Indexes

  ## Summary
  Removes indexes that are not being used to improve write performance and reduce storage.

  1. Changes
    - Drop unused indexes identified by database analysis
    - Keeps only actively used indexes
    
  2. Performance
    - Improves INSERT/UPDATE/DELETE performance
    - Reduces storage overhead
    - Reduces index maintenance costs
*/

-- Audit system unused indexes
DROP INDEX IF EXISTS public.idx_audit_exports_generated_by_user_id;
DROP INDEX IF EXISTS public.idx_audits_audited_by_user_id;
DROP INDEX IF EXISTS public.idx_audits_recommended_supplier_id;

-- Award system unused indexes
DROP INDEX IF EXISTS public.idx_award_reports_created_by;
DROP INDEX IF EXISTS public.idx_award_approvals_project_id;
DROP INDEX IF EXISTS public.idx_award_approvals_organisation_id;
DROP INDEX IF EXISTS public.idx_award_approvals_approved_by;
DROP INDEX IF EXISTS public.idx_award_approvals_is_override;
DROP INDEX IF EXISTS public.idx_award_approvals_approved_at;

-- Organisation unused indexes
DROP INDEX IF EXISTS public.idx_organisations_created_by_admin_id;
DROP INDEX IF EXISTS public.idx_organisations_demo_account_id;

-- Parsing unused indexes
DROP INDEX IF EXISTS public.idx_parsing_jobs_created_by;
DROP INDEX IF EXISTS public.idx_parsing_jobs_organisation_id_fk;
DROP INDEX IF EXISTS public.idx_parsing_jobs_user_id;

-- Projects unused indexes
DROP INDEX IF EXISTS public.idx_projects_created_by;
DROP INDEX IF EXISTS public.idx_projects_created_by_user_id;
DROP INDEX IF EXISTS public.idx_projects_user_id;

-- Quote revision unused indexes
DROP INDEX IF EXISTS public.idx_quote_revision_timeline_created_by;
DROP INDEX IF EXISTS public.idx_quote_revisions_diff_project_id;
DROP INDEX IF EXISTS public.idx_quote_revisions_diff_revised_quote_id;

-- Quotes unused indexes
DROP INDEX IF EXISTS public.idx_quotes_created_by;
DROP INDEX IF EXISTS public.idx_quotes_parent_quote_id;
DROP INDEX IF EXISTS public.idx_quotes_revised_by;
DROP INDEX IF EXISTS public.idx_quotes_uploaded_by_user_id;

-- Contract unused indexes
DROP INDEX IF EXISTS public.idx_contract_allowances_project_id;
DROP INDEX IF EXISTS public.idx_letters_of_intent_status;
DROP INDEX IF EXISTS public.idx_contract_inclusions_project_id;
DROP INDEX IF EXISTS public.idx_contract_exclusions_project_id;

-- Onboarding unused indexes
DROP INDEX IF EXISTS public.idx_compliance_documents_status;
DROP INDEX IF EXISTS public.idx_onboarding_audit_log_project_id;
DROP INDEX IF EXISTS public.idx_onboarding_audit_log_created_at;

-- Revision request unused indexes
DROP INDEX IF EXISTS public.idx_revision_requests_project_id;
DROP INDEX IF EXISTS public.idx_revision_requests_award_report_id;
DROP INDEX IF EXISTS public.idx_revision_requests_status;
DROP INDEX IF EXISTS public.idx_revision_requests_deadline;
DROP INDEX IF EXISTS public.idx_revision_request_suppliers_revision_request_id;
DROP INDEX IF EXISTS public.idx_revision_request_suppliers_quote_id;
DROP INDEX IF EXISTS public.idx_revision_request_suppliers_status;
