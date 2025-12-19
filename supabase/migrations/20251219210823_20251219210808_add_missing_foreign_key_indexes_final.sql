/*
  # Add Missing Foreign Key Indexes

  ## Summary
  Adds indexes for all foreign key columns that don't have covering indexes to improve query performance.

  1. Changes
    - Add indexes on foreign key columns across multiple tables
    - Improves JOIN performance and foreign key constraint checking
    
  2. Performance
    - Significantly improves query performance for tables with foreign key lookups
    - Reduces query execution time for JOIN operations
*/

-- Audit system foreign keys
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_user_id ON public.audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_exports_audit_id ON public.audit_exports(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_audit_id ON public.audit_findings(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_supplier_id ON public.audit_findings(supplier_id);
CREATE INDEX IF NOT EXISTS idx_audits_project_id ON public.audits(project_id);

-- Award system foreign keys
CREATE INDEX IF NOT EXISTS idx_award_approvals_final_approved_quote_id ON public.award_approvals(final_approved_quote_id);
CREATE INDEX IF NOT EXISTS idx_award_reports_approval_id ON public.award_reports(approval_id);

-- Contract management foreign keys
CREATE INDEX IF NOT EXISTS idx_contract_allowances_created_by ON public.contract_allowances(created_by);
CREATE INDEX IF NOT EXISTS idx_letters_of_intent_created_by ON public.letters_of_intent(created_by);

-- Onboarding foreign keys
CREATE INDEX IF NOT EXISTS idx_onboarding_audit_log_user_id ON public.onboarding_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_compliance_documents_verified_by ON public.onboarding_compliance_documents(verified_by);

-- Core foreign keys
CREATE INDEX IF NOT EXISTS idx_quotes_supplier_id ON public.quotes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_scope_categories_project_id ON public.scope_categories(project_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_organisation_id ON public.suppliers(organisation_id);
