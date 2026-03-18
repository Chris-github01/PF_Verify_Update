/*
  # Fix Unindexed Foreign Keys - Batch 1
  
  Adds covering indexes for all foreign key columns that lack them.
  Covers: base_tracker_*, boq_exports, bt_* tables, commercial_baseline_items,
  contract_variations, fire_engineer_schedules, payment_claim_*, payment_claims,
  progress_claims
*/

-- base_tracker_claims
CREATE INDEX IF NOT EXISTS idx_btc_supplier_id ON public.base_tracker_claims (supplier_id);

-- base_tracker_exports
CREATE INDEX IF NOT EXISTS idx_bte_generated_by_user_id ON public.base_tracker_exports (generated_by_user_id);

-- boq_exports
CREATE INDEX IF NOT EXISTS idx_boqe_generated_by_user_id ON public.boq_exports (generated_by_user_id);

-- bt_activity_logs
CREATE INDEX IF NOT EXISTS idx_bt_al_action_by ON public.bt_activity_logs (action_by);

-- bt_attachments
CREATE INDEX IF NOT EXISTS idx_bt_att_organisation_id ON public.bt_attachments (organisation_id);
CREATE INDEX IF NOT EXISTS idx_bt_att_uploaded_by ON public.bt_attachments (uploaded_by);

-- bt_baseline_headers
CREATE INDEX IF NOT EXISTS idx_bt_bh_confirmed_by ON public.bt_baseline_headers (confirmed_by);
CREATE INDEX IF NOT EXISTS idx_bt_bh_organisation_id ON public.bt_baseline_headers (organisation_id);

-- bt_baseline_line_items
CREATE INDEX IF NOT EXISTS idx_bt_bli_organisation_id ON public.bt_baseline_line_items (organisation_id);

-- bt_claim_line_items
CREATE INDEX IF NOT EXISTS idx_bt_cli_organisation_id ON public.bt_claim_line_items (organisation_id);

-- bt_claim_periods
CREATE INDEX IF NOT EXISTS idx_bt_cp_organisation_id ON public.bt_claim_periods (organisation_id);
CREATE INDEX IF NOT EXISTS idx_bt_cp_submitted_by ON public.bt_claim_periods (submitted_by);

-- bt_progress_updates
CREATE INDEX IF NOT EXISTS idx_bt_pu_claim_period_id ON public.bt_progress_updates (claim_period_id);
CREATE INDEX IF NOT EXISTS idx_bt_pu_entered_by ON public.bt_progress_updates (entered_by);
CREATE INDEX IF NOT EXISTS idx_bt_pu_organisation_id ON public.bt_progress_updates (organisation_id);

-- bt_projects
CREATE INDEX IF NOT EXISTS idx_bt_proj_created_by ON public.bt_projects (created_by);

-- bt_variations
CREATE INDEX IF NOT EXISTS idx_bt_var_baseline_header_id ON public.bt_variations (baseline_header_id);
CREATE INDEX IF NOT EXISTS idx_bt_var_created_by ON public.bt_variations (created_by);
CREATE INDEX IF NOT EXISTS idx_bt_var_organisation_id ON public.bt_variations (organisation_id);
CREATE INDEX IF NOT EXISTS idx_bt_var_related_baseline_line_item_id ON public.bt_variations (related_baseline_line_item_id);

-- commercial_baseline_items
CREATE INDEX IF NOT EXISTS idx_cbi_baseline_locked_by_user_id ON public.commercial_baseline_items (baseline_locked_by_user_id);
CREATE INDEX IF NOT EXISTS idx_cbi_source_quote_item_id ON public.commercial_baseline_items (source_quote_item_id);

-- contract_variations
CREATE INDEX IF NOT EXISTS idx_cv_approved_by ON public.contract_variations (approved_by);
CREATE INDEX IF NOT EXISTS idx_cv_created_by ON public.contract_variations (created_by);

-- fire_engineer_schedules
CREATE INDEX IF NOT EXISTS idx_fes_imported_by_user_id ON public.fire_engineer_schedules (imported_by_user_id);

-- payment_claim_activity_logs
CREATE INDEX IF NOT EXISTS idx_pcal_action_by ON public.payment_claim_activity_logs (action_by);

-- payment_claim_exports
CREATE INDEX IF NOT EXISTS idx_pce_exported_by ON public.payment_claim_exports (exported_by);

-- payment_claim_lines
CREATE INDEX IF NOT EXISTS idx_pcl_organisation_id ON public.payment_claim_lines (organisation_id);

-- payment_claims
CREATE INDEX IF NOT EXISTS idx_pc_claim_period_id ON public.payment_claims (claim_period_id);
CREATE INDEX IF NOT EXISTS idx_pc_created_by ON public.payment_claims (created_by);

-- progress_claims
CREATE INDEX IF NOT EXISTS idx_pgc_created_by ON public.progress_claims (created_by);
