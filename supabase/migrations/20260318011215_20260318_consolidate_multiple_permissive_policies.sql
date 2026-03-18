/*
  # Consolidate Multiple Permissive Policies

  Drops old duplicate policies that were superseded by our new
  standardized _select/_insert/_update/_delete named policies.
  
  Tables fixed:
  - vs_user_profiles: drop 5 old policies
  - payment_claim_lines: drop 4 old policies
  - payment_claims: drop 4 old policies
  - contract_allowances: drop 3 duplicate policies
  - contract_exclusions: drop 3 duplicate policies
  - contract_inclusions: drop 3 duplicate policies
  - prelet_appendix: drop 3 old policies (keep service role + new ones)
  - project_settings: drop 3 duplicate policies
  - scc_early_warning_reports: drop 3 old policies
  - scc_off_site_materials: drop 3 old policies
  - scc_on_site_materials: drop 3 old policies
  - scc_payment_certificates: drop 3 old policies
  - scc_quote_imports: drop 3 old policies
  - scc_quote_line_items: drop 3 old policies
  - scope_categories: drop 3 duplicate policies
  - parsing_chunks: drop 2 old service role policies
  - parsing_jobs: drop 2 old service role policies
  - quote_items: drop 2 old service role policies
  - quotes: drop 2 old service role policies
  - revision_request_suppliers: drop 2 duplicate policies
  - revision_requests: drop 2 duplicate policies
  - scc_retention_ledger: drop 2 old policies
  - contract_tags_clarifications: drop 1 duplicate insert policy
  - organisations: drop 2 old policies (keep platform admin ones + new)
  - payment_claim_activity_logs: drop 2 old policies
  - payment_claim_exports: drop 2 old policies
  - vs_stock_adjustments: drop 2 old policies
  - vs_verifications: drop 2 old policies
*/

-- vs_user_profiles: drop the old named policies (keep new standardized ones)
DROP POLICY IF EXISTS "Admins can update profiles in org" ON public.vs_user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles in org" ON public.vs_user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.vs_user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.vs_user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.vs_user_profiles;

-- payment_claim_lines: drop old named policies
DROP POLICY IF EXISTS "Org members can delete payment claim lines" ON public.payment_claim_lines;
DROP POLICY IF EXISTS "Org members can insert payment claim lines" ON public.payment_claim_lines;
DROP POLICY IF EXISTS "Org members can select payment claim lines" ON public.payment_claim_lines;
DROP POLICY IF EXISTS "Org members can update payment claim lines" ON public.payment_claim_lines;

-- payment_claims: drop old named policies
DROP POLICY IF EXISTS "Org members can delete payment claims" ON public.payment_claims;
DROP POLICY IF EXISTS "Org members can insert payment claims" ON public.payment_claims;
DROP POLICY IF EXISTS "Org members can select payment claims" ON public.payment_claims;
DROP POLICY IF EXISTS "Org members can update payment claims" ON public.payment_claims;

-- contract_allowances: drop duplicate policies (keep the shorter named ones)
DROP POLICY IF EXISTS "Users can delete allowances in their organisation's projects" ON public.contract_allowances;
DROP POLICY IF EXISTS "Users can insert allowances in their organisation's projects" ON public.contract_allowances;
DROP POLICY IF EXISTS "Users can update allowances in their organisation's projects" ON public.contract_allowances;

-- contract_exclusions: drop duplicate policies
DROP POLICY IF EXISTS "Users can delete exclusions in their organisation's projects" ON public.contract_exclusions;
DROP POLICY IF EXISTS "Users can insert exclusions in their organisation's projects" ON public.contract_exclusions;
DROP POLICY IF EXISTS "Users can update exclusions in their organisation's projects" ON public.contract_exclusions;

-- contract_inclusions: drop duplicate policies
DROP POLICY IF EXISTS "Users can delete inclusions in their organisation's projects" ON public.contract_inclusions;
DROP POLICY IF EXISTS "Users can insert inclusions in their organisation's projects" ON public.contract_inclusions;
DROP POLICY IF EXISTS "Users can update inclusions in their organisation's projects" ON public.contract_inclusions;

-- prelet_appendix: drop old conflicting policies (keep new standardized ones + service role)
DROP POLICY IF EXISTS "Users can delete non-finalised prelet appendix" ON public.prelet_appendix;
DROP POLICY IF EXISTS "Users can delete prelet appendix in their org projects" ON public.prelet_appendix;
DROP POLICY IF EXISTS "Users can insert prelet appendix in their org projects" ON public.prelet_appendix;
DROP POLICY IF EXISTS "Users can update non-finalised prelet appendix" ON public.prelet_appendix;
DROP POLICY IF EXISTS "Users can update prelet appendix in their org projects" ON public.prelet_appendix;
DROP POLICY IF EXISTS "Users can view prelet appendix in their org projects" ON public.prelet_appendix;

-- project_settings: drop duplicate policies
DROP POLICY IF EXISTS "Users can delete project settings in their organisation" ON public.project_settings;
DROP POLICY IF EXISTS "Users can insert project settings in their organisation" ON public.project_settings;
DROP POLICY IF EXISTS "Users can update project settings in their organisation" ON public.project_settings;

-- scc_early_warning_reports: drop old named policies
DROP POLICY IF EXISTS "Org members can insert early warning reports" ON public.scc_early_warning_reports;
DROP POLICY IF EXISTS "Org members can update early warning reports" ON public.scc_early_warning_reports;
DROP POLICY IF EXISTS "Org members can view early warning reports" ON public.scc_early_warning_reports;

-- scc_off_site_materials: drop old named policies
DROP POLICY IF EXISTS "Org members can insert scc_off_site_materials" ON public.scc_off_site_materials;
DROP POLICY IF EXISTS "Org members can select scc_off_site_materials" ON public.scc_off_site_materials;
DROP POLICY IF EXISTS "Org members can update scc_off_site_materials" ON public.scc_off_site_materials;

-- scc_on_site_materials: drop old named policies
DROP POLICY IF EXISTS "Org members can insert scc_on_site_materials" ON public.scc_on_site_materials;
DROP POLICY IF EXISTS "Org members can select scc_on_site_materials" ON public.scc_on_site_materials;
DROP POLICY IF EXISTS "Org members can update scc_on_site_materials" ON public.scc_on_site_materials;

-- scc_payment_certificates: drop old named policies
DROP POLICY IF EXISTS "Org members can insert scc_payment_certificates" ON public.scc_payment_certificates;
DROP POLICY IF EXISTS "Org members can select scc_payment_certificates" ON public.scc_payment_certificates;
DROP POLICY IF EXISTS "Org members can update scc_payment_certificates" ON public.scc_payment_certificates;

-- scc_quote_imports: drop old named policies
DROP POLICY IF EXISTS "Org members can insert scc_quote_imports" ON public.scc_quote_imports;
DROP POLICY IF EXISTS "Org members can select scc_quote_imports" ON public.scc_quote_imports;
DROP POLICY IF EXISTS "Org members can update scc_quote_imports" ON public.scc_quote_imports;

-- scc_quote_line_items: drop old named policies
DROP POLICY IF EXISTS "Org members can insert scc_quote_line_items" ON public.scc_quote_line_items;
DROP POLICY IF EXISTS "Org members can select scc_quote_line_items" ON public.scc_quote_line_items;
DROP POLICY IF EXISTS "Org members can update scc_quote_line_items" ON public.scc_quote_line_items;

-- scope_categories: drop duplicate policies
DROP POLICY IF EXISTS "Users can delete scope categories in their org" ON public.scope_categories;
DROP POLICY IF EXISTS "Users can insert scope categories in their org" ON public.scope_categories;
DROP POLICY IF EXISTS "Users can update scope categories in their org" ON public.scope_categories;

-- parsing_chunks: drop old service role policies (keep "Service role bypass RLS")
DROP POLICY IF EXISTS "Service role can manage all parsing chunks" ON public.parsing_chunks;

-- parsing_jobs: drop old service role policies (keep "Service role bypass RLS")
DROP POLICY IF EXISTS "Service role can manage all parsing jobs" ON public.parsing_jobs;

-- quote_items: drop old service role policies (keep "Service role bypass RLS")
DROP POLICY IF EXISTS "Service role can manage all quote items" ON public.quote_items;

-- quotes: drop old service role policies (keep "Service role bypass RLS")
DROP POLICY IF EXISTS "Service role can manage all quotes" ON public.quotes;

-- revision_request_suppliers: drop the old duplicate policies
DROP POLICY IF EXISTS "Users can create revision request suppliers for their organisat" ON public.revision_request_suppliers;
DROP POLICY IF EXISTS "Users can update revision request suppliers for their organisat" ON public.revision_request_suppliers;

-- revision_requests: drop the old duplicate policies
DROP POLICY IF EXISTS "Users can create revision requests for their organisation proje" ON public.revision_requests;
DROP POLICY IF EXISTS "Users can update revision requests for their organisation proje" ON public.revision_requests;

-- scc_retention_ledger: drop old named policies
DROP POLICY IF EXISTS "Org members can insert scc_retention_ledger" ON public.scc_retention_ledger;
DROP POLICY IF EXISTS "Org members can select scc_retention_ledger" ON public.scc_retention_ledger;

-- contract_tags_clarifications: drop duplicate insert policy
DROP POLICY IF EXISTS "Users can create tags" ON public.contract_tags_clarifications;

-- organisations: drop old policies replaced by new standardized ones
DROP POLICY IF EXISTS "Users can view their member organisations" ON public.organisations;
DROP POLICY IF EXISTS "Platform admins can update organisations" ON public.organisations;

-- payment_claim_activity_logs: drop old named policies
DROP POLICY IF EXISTS "Org members can insert payment claim activity logs" ON public.payment_claim_activity_logs;
DROP POLICY IF EXISTS "Org members can select payment claim activity logs" ON public.payment_claim_activity_logs;

-- payment_claim_exports: drop old named policies
DROP POLICY IF EXISTS "Org members can insert payment claim exports" ON public.payment_claim_exports;
DROP POLICY IF EXISTS "Org members can select payment claim exports" ON public.payment_claim_exports;

-- vs_stock_adjustments: drop old named policies (keep new standardized ones)
DROP POLICY IF EXISTS "vs_adjs_insert" ON public.vs_stock_adjustments;
DROP POLICY IF EXISTS "vs_adjs_select" ON public.vs_stock_adjustments;

-- vs_verifications: drop old named policies (keep new standardized ones)
DROP POLICY IF EXISTS "vs_verifs_insert" ON public.vs_verifications;
DROP POLICY IF EXISTS "vs_verifs_select" ON public.vs_verifications;
