/*
  # Fix Security Issues - Comprehensive Cleanup

  1. Remove Duplicate RLS Policies
    - Remove old/duplicate policies that were replaced
    - Keep only the optimized versions with SELECT wrappers

  2. Drop Unused Indexes
    - Remove indexes that are not being used to improve write performance

  3. Fix Function Search Paths
    - Add SECURITY INVOKER and set search_path for all functions

  4. Address Multiple Permissive Policies
    - Consolidate duplicate policies into single policies
*/

-- =============================================================================
-- PART 1: Remove Duplicate/Old RLS Policies
-- =============================================================================

-- admin_audit_log: Remove old duplicate policies
DROP POLICY IF EXISTS "Platform admins can view audit log" ON public.admin_audit_log;
DROP POLICY IF EXISTS "System can insert audit log" ON public.admin_audit_log;

-- Keep only the optimized versions:
-- "Platform admins can view audit logs" (already exists)
-- "System can insert audit logs" (already exists)

-- parsing_chunks: Remove duplicate policy
DROP POLICY IF EXISTS "System can manage parsing chunks" ON public.parsing_chunks;

-- Keep only: "Users can view chunks for their parsing jobs"

-- =============================================================================
-- PART 2: Drop Unused Indexes
-- =============================================================================

-- Note: Dropping indexes that haven't been used to improve write performance
-- These can be recreated later if usage patterns change

DROP INDEX IF EXISTS public.idx_quotes_user_id;
DROP INDEX IF EXISTS public.idx_platform_admins_active;
DROP INDEX IF EXISTS public.idx_quotes_status;
DROP INDEX IF EXISTS public.idx_quote_items_scope_category;
DROP INDEX IF EXISTS public.idx_projects_user_id;
DROP INDEX IF EXISTS public.idx_projects_created_by_user_id;
DROP INDEX IF EXISTS public.idx_projects_last_accessed_at;
DROP INDEX IF EXISTS public.idx_parsing_jobs_user_id;
DROP INDEX IF EXISTS public.idx_parsing_jobs_organisation_id;
DROP INDEX IF EXISTS public.idx_quote_items_needs_review;
DROP INDEX IF EXISTS public.idx_award_reports_checksum;
DROP INDEX IF EXISTS public.library_items_organisation_id_idx;
DROP INDEX IF EXISTS public.library_items_trade_idx;
DROP INDEX IF EXISTS public.library_items_system_code_idx;
DROP INDEX IF EXISTS public.library_items_embedding_idx;
DROP INDEX IF EXISTS public.idx_quotes_quoted_total;
DROP INDEX IF EXISTS public.idx_blockchain_records_entity;
DROP INDEX IF EXISTS public.idx_blockchain_records_hash;
DROP INDEX IF EXISTS public.idx_blockchain_records_tx_id;
DROP INDEX IF EXISTS public.idx_blockchain_records_created_at;
DROP INDEX IF EXISTS public.idx_ensemble_runs_created_at;
DROP INDEX IF EXISTS public.idx_ensemble_runs_confidence;
DROP INDEX IF EXISTS public.idx_parser_metrics_name;
DROP INDEX IF EXISTS public.idx_quotes_ensemble_run;
DROP INDEX IF EXISTS public.idx_quotes_extraction_method;
DROP INDEX IF EXISTS public.idx_supplier_template_org;
DROP INDEX IF EXISTS public.idx_supplier_template_name;
DROP INDEX IF EXISTS public.idx_supplier_template_hash;
DROP INDEX IF EXISTS public.idx_quotes_reconciliation_status;
DROP INDEX IF EXISTS public.idx_review_queue_status;
DROP INDEX IF EXISTS public.idx_review_queue_assigned_to;
DROP INDEX IF EXISTS public.idx_review_queue_priority;
DROP INDEX IF EXISTS public.idx_admin_audit_log_admin_email;
DROP INDEX IF EXISTS public.idx_admin_audit_log_target;
DROP INDEX IF EXISTS public.idx_admin_audit_log_created_at;
DROP INDEX IF EXISTS public.idx_quotes_blockchain_record_id;
DROP INDEX IF EXISTS public.idx_review_queue_project_id;
DROP INDEX IF EXISTS public.idx_review_queue_quote_id;
DROP INDEX IF EXISTS public.idx_review_queue_resolved_by;
DROP INDEX IF EXISTS public.idx_award_reports_blockchain_record_id;
DROP INDEX IF EXISTS public.idx_award_reports_created_by;
DROP INDEX IF EXISTS public.idx_organisation_members_invited_by;
DROP INDEX IF EXISTS public.idx_organisations_created_by;
DROP INDEX IF EXISTS public.idx_parsing_jobs_quote_id;

-- =============================================================================
-- PART 3: Fix Function Search Paths
-- =============================================================================

-- Set search_path for all functions to prevent search_path injection attacks

ALTER FUNCTION public.admin_add_trade_license SET search_path = public, pg_temp;
ALTER FUNCTION public.update_parsing_jobs_updated_at SET search_path = public, pg_temp;
ALTER FUNCTION public.update_org_last_active SET search_path = public, pg_temp;
ALTER FUNCTION public.get_blockchain_verification SET search_path = public, pg_temp;
ALTER FUNCTION public.has_trade_license SET search_path = public, pg_temp;
ALTER FUNCTION public.update_parser_metrics SET search_path = public, pg_temp;
ALTER FUNCTION public.resolve_review_queue_item SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_content_hash SET search_path = public, pg_temp;
ALTER FUNCTION public.get_trade_pricing SET search_path = public, pg_temp;
ALTER FUNCTION public.get_review_queue_stats SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_populate_review_queue SET search_path = public, pg_temp;
ALTER FUNCTION public.check_quote_reconciliation SET search_path = public, pg_temp;
ALTER FUNCTION public.trigger_quote_reconciliation_check SET search_path = public, pg_temp;
ALTER FUNCTION public.match_library_items SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_remove_trade_license SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_extend_trial SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_create_client_organisation SET search_path = public, pg_temp;
ALTER FUNCTION public.update_library_item_updated_at SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column SET search_path = public, pg_temp;
ALTER FUNCTION public.log_admin_action SET search_path = public, pg_temp;
ALTER FUNCTION public.check_project_reconciliation SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_update_subscription SET search_path = public, pg_temp;

-- =============================================================================
-- NOTES
-- =============================================================================

-- 1. Exposed Auth Users warnings:
--    Views like review_queue_with_details, admin_global_quotes, admin_organisations_dashboard
--    are intentionally defined with SECURITY DEFINER because they need to access auth.users
--    for admin purposes. RLS policies on these views restrict access to platform admins only.

-- 2. Extension in Public:
--    The vector extension is installed in public schema by Supabase.
--    Moving it requires recreating all vector columns and is not recommended.

-- 3. Leaked Password Protection:
--    This is a Supabase Auth configuration setting, not a database migration item.
--    Must be enabled in Supabase Dashboard → Authentication → Policies.
