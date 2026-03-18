/*
  # Fix RLS Auth Initialization Plan - Batch 6: SCC, BT, VS, Payment Claims, Organisations

  Replaces auth.uid() with (select auth.uid()) in all policies for:
  - scc_contracts, scc_claim_periods, scc_claim_lines, scc_variations
  - scc_early_warning_reports, scc_quote_imports, scc_quote_line_items
  - scc_on_site_materials, scc_off_site_materials, scc_retention_ledger
  - scc_payment_certificates, scc_scope_lines
  - bt_projects, bt_baseline_headers, bt_baseline_line_items
  - bt_claim_periods, bt_claim_line_items, bt_progress_updates
  - bt_variations, bt_attachments, bt_activity_logs
  - vs_stock_items (created_by based), vs_user_profiles
  - vs_stock_adjustments, vs_stock_alerts, vs_stock_levels, vs_verifications (via stock_item join)
  - payment_claims, payment_claim_lines
  - payment_claim_activity_logs, payment_claim_exports (via payment_claim join)
  - organisations
*/

-- ============================================================
-- SCC_CONTRACTS
-- ============================================================
DROP POLICY IF EXISTS "scc_contracts_select" ON public.scc_contracts;
DROP POLICY IF EXISTS "scc_contracts_insert" ON public.scc_contracts;
DROP POLICY IF EXISTS "scc_contracts_update" ON public.scc_contracts;
DROP POLICY IF EXISTS "scc_contracts_delete" ON public.scc_contracts;

CREATE POLICY "scc_contracts_select"
  ON public.scc_contracts FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_contracts.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_contracts_insert"
  ON public.scc_contracts FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_contracts.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_contracts_update"
  ON public.scc_contracts FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_contracts.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_contracts.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_contracts_delete"
  ON public.scc_contracts FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_contracts.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- SCC_CLAIM_PERIODS
-- ============================================================
DROP POLICY IF EXISTS "scc_claim_periods_select" ON public.scc_claim_periods;
DROP POLICY IF EXISTS "scc_claim_periods_insert" ON public.scc_claim_periods;
DROP POLICY IF EXISTS "scc_claim_periods_update" ON public.scc_claim_periods;
DROP POLICY IF EXISTS "scc_claim_periods_delete" ON public.scc_claim_periods;

CREATE POLICY "scc_claim_periods_select"
  ON public.scc_claim_periods FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_claim_periods.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_claim_periods_insert"
  ON public.scc_claim_periods FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_claim_periods.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_claim_periods_update"
  ON public.scc_claim_periods FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_claim_periods.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_claim_periods.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_claim_periods_delete"
  ON public.scc_claim_periods FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_claim_periods.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- SCC_CLAIM_LINES
-- ============================================================
DROP POLICY IF EXISTS "scc_claim_lines_select" ON public.scc_claim_lines;
DROP POLICY IF EXISTS "scc_claim_lines_insert" ON public.scc_claim_lines;
DROP POLICY IF EXISTS "scc_claim_lines_update" ON public.scc_claim_lines;
DROP POLICY IF EXISTS "scc_claim_lines_delete" ON public.scc_claim_lines;

CREATE POLICY "scc_claim_lines_select"
  ON public.scc_claim_lines FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.scc_contracts c
    JOIN public.organisation_members om ON om.organisation_id = c.organisation_id
    WHERE c.id = scc_claim_lines.contract_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_claim_lines_insert"
  ON public.scc_claim_lines FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.scc_contracts c
    JOIN public.organisation_members om ON om.organisation_id = c.organisation_id
    WHERE c.id = scc_claim_lines.contract_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_claim_lines_update"
  ON public.scc_claim_lines FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.scc_contracts c
    JOIN public.organisation_members om ON om.organisation_id = c.organisation_id
    WHERE c.id = scc_claim_lines.contract_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.scc_contracts c
    JOIN public.organisation_members om ON om.organisation_id = c.organisation_id
    WHERE c.id = scc_claim_lines.contract_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_claim_lines_delete"
  ON public.scc_claim_lines FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.scc_contracts c
    JOIN public.organisation_members om ON om.organisation_id = c.organisation_id
    WHERE c.id = scc_claim_lines.contract_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- SCC_VARIATIONS
-- ============================================================
DROP POLICY IF EXISTS "scc_variations_select" ON public.scc_variations;
DROP POLICY IF EXISTS "scc_variations_insert" ON public.scc_variations;
DROP POLICY IF EXISTS "scc_variations_update" ON public.scc_variations;
DROP POLICY IF EXISTS "scc_variations_delete" ON public.scc_variations;

CREATE POLICY "scc_variations_select"
  ON public.scc_variations FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_variations.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_variations_insert"
  ON public.scc_variations FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_variations.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_variations_update"
  ON public.scc_variations FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_variations.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_variations.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_variations_delete"
  ON public.scc_variations FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_variations.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- SCC_EARLY_WARNING_REPORTS
-- ============================================================
DROP POLICY IF EXISTS "scc_early_warning_reports_select" ON public.scc_early_warning_reports;
DROP POLICY IF EXISTS "scc_early_warning_reports_insert" ON public.scc_early_warning_reports;
DROP POLICY IF EXISTS "scc_early_warning_reports_update" ON public.scc_early_warning_reports;
DROP POLICY IF EXISTS "scc_early_warning_reports_delete" ON public.scc_early_warning_reports;

CREATE POLICY "scc_early_warning_reports_select"
  ON public.scc_early_warning_reports FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_early_warning_reports.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_early_warning_reports_insert"
  ON public.scc_early_warning_reports FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_early_warning_reports.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_early_warning_reports_update"
  ON public.scc_early_warning_reports FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_early_warning_reports.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_early_warning_reports.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_early_warning_reports_delete"
  ON public.scc_early_warning_reports FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_early_warning_reports.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- SCC_QUOTE_IMPORTS
-- ============================================================
DROP POLICY IF EXISTS "scc_quote_imports_select" ON public.scc_quote_imports;
DROP POLICY IF EXISTS "scc_quote_imports_insert" ON public.scc_quote_imports;
DROP POLICY IF EXISTS "scc_quote_imports_update" ON public.scc_quote_imports;
DROP POLICY IF EXISTS "scc_quote_imports_delete" ON public.scc_quote_imports;

CREATE POLICY "scc_quote_imports_select"
  ON public.scc_quote_imports FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_quote_imports.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_quote_imports_insert"
  ON public.scc_quote_imports FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_quote_imports.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_quote_imports_update"
  ON public.scc_quote_imports FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_quote_imports.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_quote_imports.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_quote_imports_delete"
  ON public.scc_quote_imports FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_quote_imports.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- SCC_QUOTE_LINE_ITEMS
-- ============================================================
DROP POLICY IF EXISTS "scc_quote_line_items_select" ON public.scc_quote_line_items;
DROP POLICY IF EXISTS "scc_quote_line_items_insert" ON public.scc_quote_line_items;
DROP POLICY IF EXISTS "scc_quote_line_items_update" ON public.scc_quote_line_items;
DROP POLICY IF EXISTS "scc_quote_line_items_delete" ON public.scc_quote_line_items;

CREATE POLICY "scc_quote_line_items_select"
  ON public.scc_quote_line_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_quote_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_quote_line_items_insert"
  ON public.scc_quote_line_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_quote_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_quote_line_items_update"
  ON public.scc_quote_line_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_quote_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_quote_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_quote_line_items_delete"
  ON public.scc_quote_line_items FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_quote_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- SCC_ON_SITE_MATERIALS
-- ============================================================
DROP POLICY IF EXISTS "scc_on_site_materials_select" ON public.scc_on_site_materials;
DROP POLICY IF EXISTS "scc_on_site_materials_insert" ON public.scc_on_site_materials;
DROP POLICY IF EXISTS "scc_on_site_materials_update" ON public.scc_on_site_materials;
DROP POLICY IF EXISTS "scc_on_site_materials_delete" ON public.scc_on_site_materials;

CREATE POLICY "scc_on_site_materials_select"
  ON public.scc_on_site_materials FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_on_site_materials.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_on_site_materials_insert"
  ON public.scc_on_site_materials FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_on_site_materials.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_on_site_materials_update"
  ON public.scc_on_site_materials FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_on_site_materials.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_on_site_materials.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_on_site_materials_delete"
  ON public.scc_on_site_materials FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_on_site_materials.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- SCC_OFF_SITE_MATERIALS
-- ============================================================
DROP POLICY IF EXISTS "scc_off_site_materials_select" ON public.scc_off_site_materials;
DROP POLICY IF EXISTS "scc_off_site_materials_insert" ON public.scc_off_site_materials;
DROP POLICY IF EXISTS "scc_off_site_materials_update" ON public.scc_off_site_materials;
DROP POLICY IF EXISTS "scc_off_site_materials_delete" ON public.scc_off_site_materials;

CREATE POLICY "scc_off_site_materials_select"
  ON public.scc_off_site_materials FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_off_site_materials.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_off_site_materials_insert"
  ON public.scc_off_site_materials FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_off_site_materials.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_off_site_materials_update"
  ON public.scc_off_site_materials FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_off_site_materials.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_off_site_materials.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_off_site_materials_delete"
  ON public.scc_off_site_materials FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_off_site_materials.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- SCC_RETENTION_LEDGER
-- ============================================================
DROP POLICY IF EXISTS "scc_retention_ledger_select" ON public.scc_retention_ledger;
DROP POLICY IF EXISTS "scc_retention_ledger_insert" ON public.scc_retention_ledger;
DROP POLICY IF EXISTS "scc_retention_ledger_update" ON public.scc_retention_ledger;
DROP POLICY IF EXISTS "scc_retention_ledger_delete" ON public.scc_retention_ledger;

CREATE POLICY "scc_retention_ledger_select"
  ON public.scc_retention_ledger FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_retention_ledger.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_retention_ledger_insert"
  ON public.scc_retention_ledger FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_retention_ledger.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_retention_ledger_update"
  ON public.scc_retention_ledger FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_retention_ledger.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_retention_ledger.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_retention_ledger_delete"
  ON public.scc_retention_ledger FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_retention_ledger.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- SCC_PAYMENT_CERTIFICATES
-- ============================================================
DROP POLICY IF EXISTS "scc_payment_certificates_select" ON public.scc_payment_certificates;
DROP POLICY IF EXISTS "scc_payment_certificates_insert" ON public.scc_payment_certificates;
DROP POLICY IF EXISTS "scc_payment_certificates_update" ON public.scc_payment_certificates;
DROP POLICY IF EXISTS "scc_payment_certificates_delete" ON public.scc_payment_certificates;

CREATE POLICY "scc_payment_certificates_select"
  ON public.scc_payment_certificates FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_payment_certificates.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_payment_certificates_insert"
  ON public.scc_payment_certificates FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_payment_certificates.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_payment_certificates_update"
  ON public.scc_payment_certificates FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_payment_certificates.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_payment_certificates.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_payment_certificates_delete"
  ON public.scc_payment_certificates FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_payment_certificates.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- SCC_SCOPE_LINES
-- ============================================================
DROP POLICY IF EXISTS "scc_scope_lines_select" ON public.scc_scope_lines;
DROP POLICY IF EXISTS "scc_scope_lines_insert" ON public.scc_scope_lines;
DROP POLICY IF EXISTS "scc_scope_lines_update" ON public.scc_scope_lines;
DROP POLICY IF EXISTS "scc_scope_lines_delete" ON public.scc_scope_lines;

CREATE POLICY "scc_scope_lines_select"
  ON public.scc_scope_lines FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_scope_lines.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_scope_lines_insert"
  ON public.scc_scope_lines FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_scope_lines.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_scope_lines_update"
  ON public.scc_scope_lines FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_scope_lines.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_scope_lines.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "scc_scope_lines_delete"
  ON public.scc_scope_lines FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = scc_scope_lines.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- BT_PROJECTS
-- ============================================================
DROP POLICY IF EXISTS "bt_projects_select" ON public.bt_projects;
DROP POLICY IF EXISTS "bt_projects_insert" ON public.bt_projects;
DROP POLICY IF EXISTS "bt_projects_update" ON public.bt_projects;
DROP POLICY IF EXISTS "bt_projects_delete" ON public.bt_projects;

CREATE POLICY "bt_projects_select"
  ON public.bt_projects FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_projects.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_projects_insert"
  ON public.bt_projects FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_projects.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_projects_update"
  ON public.bt_projects FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_projects.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_projects.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_projects_delete"
  ON public.bt_projects FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_projects.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- BT_BASELINE_HEADERS
-- ============================================================
DROP POLICY IF EXISTS "bt_baseline_headers_select" ON public.bt_baseline_headers;
DROP POLICY IF EXISTS "bt_baseline_headers_insert" ON public.bt_baseline_headers;
DROP POLICY IF EXISTS "bt_baseline_headers_update" ON public.bt_baseline_headers;
DROP POLICY IF EXISTS "bt_baseline_headers_delete" ON public.bt_baseline_headers;

CREATE POLICY "bt_baseline_headers_select"
  ON public.bt_baseline_headers FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_baseline_headers.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_baseline_headers_insert"
  ON public.bt_baseline_headers FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_baseline_headers.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_baseline_headers_update"
  ON public.bt_baseline_headers FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_baseline_headers.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_baseline_headers.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_baseline_headers_delete"
  ON public.bt_baseline_headers FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_baseline_headers.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- BT_BASELINE_LINE_ITEMS
-- ============================================================
DROP POLICY IF EXISTS "bt_baseline_line_items_select" ON public.bt_baseline_line_items;
DROP POLICY IF EXISTS "bt_baseline_line_items_insert" ON public.bt_baseline_line_items;
DROP POLICY IF EXISTS "bt_baseline_line_items_update" ON public.bt_baseline_line_items;
DROP POLICY IF EXISTS "bt_baseline_line_items_delete" ON public.bt_baseline_line_items;

CREATE POLICY "bt_baseline_line_items_select"
  ON public.bt_baseline_line_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_baseline_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_baseline_line_items_insert"
  ON public.bt_baseline_line_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_baseline_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_baseline_line_items_update"
  ON public.bt_baseline_line_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_baseline_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_baseline_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_baseline_line_items_delete"
  ON public.bt_baseline_line_items FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_baseline_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- BT_CLAIM_PERIODS
-- ============================================================
DROP POLICY IF EXISTS "bt_claim_periods_select" ON public.bt_claim_periods;
DROP POLICY IF EXISTS "bt_claim_periods_insert" ON public.bt_claim_periods;
DROP POLICY IF EXISTS "bt_claim_periods_update" ON public.bt_claim_periods;
DROP POLICY IF EXISTS "bt_claim_periods_delete" ON public.bt_claim_periods;

CREATE POLICY "bt_claim_periods_select"
  ON public.bt_claim_periods FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_claim_periods.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_claim_periods_insert"
  ON public.bt_claim_periods FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_claim_periods.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_claim_periods_update"
  ON public.bt_claim_periods FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_claim_periods.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_claim_periods.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_claim_periods_delete"
  ON public.bt_claim_periods FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_claim_periods.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- BT_CLAIM_LINE_ITEMS
-- ============================================================
DROP POLICY IF EXISTS "bt_claim_line_items_select" ON public.bt_claim_line_items;
DROP POLICY IF EXISTS "bt_claim_line_items_insert" ON public.bt_claim_line_items;
DROP POLICY IF EXISTS "bt_claim_line_items_update" ON public.bt_claim_line_items;
DROP POLICY IF EXISTS "bt_claim_line_items_delete" ON public.bt_claim_line_items;

CREATE POLICY "bt_claim_line_items_select"
  ON public.bt_claim_line_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_claim_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_claim_line_items_insert"
  ON public.bt_claim_line_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_claim_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_claim_line_items_update"
  ON public.bt_claim_line_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_claim_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_claim_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_claim_line_items_delete"
  ON public.bt_claim_line_items FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_claim_line_items.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- BT_PROGRESS_UPDATES
-- ============================================================
DROP POLICY IF EXISTS "bt_progress_updates_select" ON public.bt_progress_updates;
DROP POLICY IF EXISTS "bt_progress_updates_insert" ON public.bt_progress_updates;
DROP POLICY IF EXISTS "bt_progress_updates_update" ON public.bt_progress_updates;
DROP POLICY IF EXISTS "bt_progress_updates_delete" ON public.bt_progress_updates;

CREATE POLICY "bt_progress_updates_select"
  ON public.bt_progress_updates FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_progress_updates.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_progress_updates_insert"
  ON public.bt_progress_updates FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_progress_updates.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_progress_updates_update"
  ON public.bt_progress_updates FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_progress_updates.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_progress_updates.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_progress_updates_delete"
  ON public.bt_progress_updates FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_progress_updates.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- BT_VARIATIONS
-- ============================================================
DROP POLICY IF EXISTS "bt_variations_select" ON public.bt_variations;
DROP POLICY IF EXISTS "bt_variations_insert" ON public.bt_variations;
DROP POLICY IF EXISTS "bt_variations_update" ON public.bt_variations;
DROP POLICY IF EXISTS "bt_variations_delete" ON public.bt_variations;

CREATE POLICY "bt_variations_select"
  ON public.bt_variations FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_variations.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_variations_insert"
  ON public.bt_variations FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_variations.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_variations_update"
  ON public.bt_variations FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_variations.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_variations.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_variations_delete"
  ON public.bt_variations FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_variations.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- BT_ATTACHMENTS
-- ============================================================
DROP POLICY IF EXISTS "bt_attachments_select" ON public.bt_attachments;
DROP POLICY IF EXISTS "bt_attachments_insert" ON public.bt_attachments;
DROP POLICY IF EXISTS "bt_attachments_update" ON public.bt_attachments;
DROP POLICY IF EXISTS "bt_attachments_delete" ON public.bt_attachments;

CREATE POLICY "bt_attachments_select"
  ON public.bt_attachments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_attachments.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_attachments_insert"
  ON public.bt_attachments FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_attachments.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_attachments_update"
  ON public.bt_attachments FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_attachments.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_attachments.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_attachments_delete"
  ON public.bt_attachments FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_attachments.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- BT_ACTIVITY_LOGS
-- ============================================================
DROP POLICY IF EXISTS "bt_activity_logs_select" ON public.bt_activity_logs;
DROP POLICY IF EXISTS "bt_activity_logs_insert" ON public.bt_activity_logs;
DROP POLICY IF EXISTS "bt_activity_logs_delete" ON public.bt_activity_logs;

CREATE POLICY "bt_activity_logs_select"
  ON public.bt_activity_logs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_activity_logs.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_activity_logs_insert"
  ON public.bt_activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_activity_logs.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "bt_activity_logs_delete"
  ON public.bt_activity_logs FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = bt_activity_logs.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- VS_STOCK_ITEMS (no organisation_id - use created_by)
-- ============================================================
DROP POLICY IF EXISTS "vs_items_select" ON public.vs_stock_items;
DROP POLICY IF EXISTS "vs_items_insert" ON public.vs_stock_items;
DROP POLICY IF EXISTS "vs_items_update" ON public.vs_stock_items;
DROP POLICY IF EXISTS "vs_items_delete" ON public.vs_stock_items;

CREATE POLICY "vs_items_select"
  ON public.vs_stock_items FOR SELECT
  TO authenticated
  USING (created_by = (SELECT auth.uid()));

CREATE POLICY "vs_items_insert"
  ON public.vs_stock_items FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "vs_items_update"
  ON public.vs_stock_items FOR UPDATE
  TO authenticated
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "vs_items_delete"
  ON public.vs_stock_items FOR DELETE
  TO authenticated
  USING (created_by = (SELECT auth.uid()));

-- ============================================================
-- VS_USER_PROFILES (has organisation_id)
-- ============================================================
DROP POLICY IF EXISTS "vs_user_profiles_select" ON public.vs_user_profiles;
DROP POLICY IF EXISTS "vs_user_profiles_insert" ON public.vs_user_profiles;
DROP POLICY IF EXISTS "vs_user_profiles_update" ON public.vs_user_profiles;
DROP POLICY IF EXISTS "vs_user_profiles_delete" ON public.vs_user_profiles;

CREATE POLICY "vs_user_profiles_select"
  ON public.vs_user_profiles FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = vs_user_profiles.organisation_id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
    )
  );

CREATE POLICY "vs_user_profiles_insert"
  ON public.vs_user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "vs_user_profiles_update"
  ON public.vs_user_profiles FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "vs_user_profiles_delete"
  ON public.vs_user_profiles FOR DELETE
  TO authenticated
  USING (id = (SELECT auth.uid()));

-- ============================================================
-- VS_STOCK_ADJUSTMENTS (only stock_item_id, no org)
-- ============================================================
DROP POLICY IF EXISTS "vs_adjustments_select" ON public.vs_stock_adjustments;
DROP POLICY IF EXISTS "vs_adjustments_insert" ON public.vs_stock_adjustments;
DROP POLICY IF EXISTS "vs_adjustments_delete" ON public.vs_stock_adjustments;

CREATE POLICY "vs_adjustments_select"
  ON public.vs_stock_adjustments FOR SELECT
  TO authenticated
  USING (adjusted_by = (SELECT auth.uid()));

CREATE POLICY "vs_adjustments_insert"
  ON public.vs_stock_adjustments FOR INSERT
  TO authenticated
  WITH CHECK (adjusted_by = (SELECT auth.uid()));

CREATE POLICY "vs_adjustments_delete"
  ON public.vs_stock_adjustments FOR DELETE
  TO authenticated
  USING (adjusted_by = (SELECT auth.uid()));

-- ============================================================
-- VS_STOCK_ALERTS (only stock_item_id, no user ref - allow authenticated read)
-- ============================================================
DROP POLICY IF EXISTS "vs_alerts_select" ON public.vs_stock_alerts;
DROP POLICY IF EXISTS "vs_alerts_insert" ON public.vs_stock_alerts;
DROP POLICY IF EXISTS "vs_alerts_update" ON public.vs_stock_alerts;
DROP POLICY IF EXISTS "vs_alerts_delete" ON public.vs_stock_alerts;

CREATE POLICY "vs_alerts_select"
  ON public.vs_stock_alerts FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vs_stock_items si
    WHERE si.id = vs_stock_alerts.stock_item_id
      AND si.created_by = (SELECT auth.uid())
  ));

CREATE POLICY "vs_alerts_insert"
  ON public.vs_stock_alerts FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vs_stock_items si
    WHERE si.id = vs_stock_alerts.stock_item_id
      AND si.created_by = (SELECT auth.uid())
  ));

CREATE POLICY "vs_alerts_update"
  ON public.vs_stock_alerts FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vs_stock_items si
    WHERE si.id = vs_stock_alerts.stock_item_id
      AND si.created_by = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vs_stock_items si
    WHERE si.id = vs_stock_alerts.stock_item_id
      AND si.created_by = (SELECT auth.uid())
  ));

CREATE POLICY "vs_alerts_delete"
  ON public.vs_stock_alerts FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vs_stock_items si
    WHERE si.id = vs_stock_alerts.stock_item_id
      AND si.created_by = (SELECT auth.uid())
  ));

-- ============================================================
-- VS_STOCK_LEVELS (only stock_item_id and last_verified_by)
-- ============================================================
DROP POLICY IF EXISTS "vs_levels_select" ON public.vs_stock_levels;
DROP POLICY IF EXISTS "vs_levels_insert" ON public.vs_stock_levels;
DROP POLICY IF EXISTS "vs_levels_update" ON public.vs_stock_levels;
DROP POLICY IF EXISTS "vs_levels_delete" ON public.vs_stock_levels;

CREATE POLICY "vs_levels_select"
  ON public.vs_stock_levels FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vs_stock_items si
    WHERE si.id = vs_stock_levels.stock_item_id
      AND si.created_by = (SELECT auth.uid())
  ));

CREATE POLICY "vs_levels_insert"
  ON public.vs_stock_levels FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vs_stock_items si
    WHERE si.id = vs_stock_levels.stock_item_id
      AND si.created_by = (SELECT auth.uid())
  ));

CREATE POLICY "vs_levels_update"
  ON public.vs_stock_levels FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vs_stock_items si
    WHERE si.id = vs_stock_levels.stock_item_id
      AND si.created_by = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vs_stock_items si
    WHERE si.id = vs_stock_levels.stock_item_id
      AND si.created_by = (SELECT auth.uid())
  ));

CREATE POLICY "vs_levels_delete"
  ON public.vs_stock_levels FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vs_stock_items si
    WHERE si.id = vs_stock_levels.stock_item_id
      AND si.created_by = (SELECT auth.uid())
  ));

-- ============================================================
-- VS_VERIFICATIONS (stock_item_id and verified_by)
-- ============================================================
DROP POLICY IF EXISTS "vs_verifications_select" ON public.vs_verifications;
DROP POLICY IF EXISTS "vs_verifications_insert" ON public.vs_verifications;
DROP POLICY IF EXISTS "vs_verifications_delete" ON public.vs_verifications;

CREATE POLICY "vs_verifications_select"
  ON public.vs_verifications FOR SELECT
  TO authenticated
  USING (verified_by = (SELECT auth.uid()));

CREATE POLICY "vs_verifications_insert"
  ON public.vs_verifications FOR INSERT
  TO authenticated
  WITH CHECK (verified_by = (SELECT auth.uid()));

CREATE POLICY "vs_verifications_delete"
  ON public.vs_verifications FOR DELETE
  TO authenticated
  USING (verified_by = (SELECT auth.uid()));

-- ============================================================
-- PAYMENT_CLAIMS
-- ============================================================
DROP POLICY IF EXISTS "payment_claims_select" ON public.payment_claims;
DROP POLICY IF EXISTS "payment_claims_insert" ON public.payment_claims;
DROP POLICY IF EXISTS "payment_claims_update" ON public.payment_claims;
DROP POLICY IF EXISTS "payment_claims_delete" ON public.payment_claims;

CREATE POLICY "payment_claims_select"
  ON public.payment_claims FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = payment_claims.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "payment_claims_insert"
  ON public.payment_claims FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = payment_claims.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "payment_claims_update"
  ON public.payment_claims FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = payment_claims.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = payment_claims.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "payment_claims_delete"
  ON public.payment_claims FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = payment_claims.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- PAYMENT_CLAIM_LINES (has organisation_id)
-- ============================================================
DROP POLICY IF EXISTS "payment_claim_lines_select" ON public.payment_claim_lines;
DROP POLICY IF EXISTS "payment_claim_lines_insert" ON public.payment_claim_lines;
DROP POLICY IF EXISTS "payment_claim_lines_update" ON public.payment_claim_lines;
DROP POLICY IF EXISTS "payment_claim_lines_delete" ON public.payment_claim_lines;

CREATE POLICY "payment_claim_lines_select"
  ON public.payment_claim_lines FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = payment_claim_lines.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "payment_claim_lines_insert"
  ON public.payment_claim_lines FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = payment_claim_lines.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "payment_claim_lines_update"
  ON public.payment_claim_lines FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = payment_claim_lines.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = payment_claim_lines.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "payment_claim_lines_delete"
  ON public.payment_claim_lines FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = payment_claim_lines.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- ============================================================
-- PAYMENT_CLAIM_ACTIVITY_LOGS (only payment_claim_id, no org)
-- ============================================================
DROP POLICY IF EXISTS "payment_claim_activity_logs_select" ON public.payment_claim_activity_logs;
DROP POLICY IF EXISTS "payment_claim_activity_logs_insert" ON public.payment_claim_activity_logs;
DROP POLICY IF EXISTS "payment_claim_activity_logs_delete" ON public.payment_claim_activity_logs;

CREATE POLICY "payment_claim_activity_logs_select"
  ON public.payment_claim_activity_logs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payment_claims pc
    JOIN public.organisation_members om ON om.organisation_id = pc.organisation_id
    WHERE pc.id = payment_claim_activity_logs.payment_claim_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "payment_claim_activity_logs_insert"
  ON public.payment_claim_activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (action_by = (SELECT auth.uid()));

CREATE POLICY "payment_claim_activity_logs_delete"
  ON public.payment_claim_activity_logs FOR DELETE
  TO authenticated
  USING (action_by = (SELECT auth.uid()));

-- ============================================================
-- PAYMENT_CLAIM_EXPORTS (only payment_claim_id, no org)
-- ============================================================
DROP POLICY IF EXISTS "payment_claim_exports_select" ON public.payment_claim_exports;
DROP POLICY IF EXISTS "payment_claim_exports_insert" ON public.payment_claim_exports;
DROP POLICY IF EXISTS "payment_claim_exports_delete" ON public.payment_claim_exports;

CREATE POLICY "payment_claim_exports_select"
  ON public.payment_claim_exports FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payment_claims pc
    JOIN public.organisation_members om ON om.organisation_id = pc.organisation_id
    WHERE pc.id = payment_claim_exports.payment_claim_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "payment_claim_exports_insert"
  ON public.payment_claim_exports FOR INSERT
  TO authenticated
  WITH CHECK (exported_by = (SELECT auth.uid()));

CREATE POLICY "payment_claim_exports_delete"
  ON public.payment_claim_exports FOR DELETE
  TO authenticated
  USING (exported_by = (SELECT auth.uid()));

-- ============================================================
-- ORGANISATIONS (self-managed, user is member)
-- ============================================================
DROP POLICY IF EXISTS "organisations_select" ON public.organisations;
DROP POLICY IF EXISTS "organisations_update" ON public.organisations;

CREATE POLICY "organisations_select"
  ON public.organisations FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = organisations.id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

CREATE POLICY "organisations_update"
  ON public.organisations FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = organisations.id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = organisations.id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
  ));
