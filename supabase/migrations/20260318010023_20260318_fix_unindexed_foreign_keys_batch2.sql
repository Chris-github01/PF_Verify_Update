/*
  # Fix Unindexed Foreign Keys - Batch 2
  
  Adds covering indexes for scc_*, subcontract_*, variation_register,
  scope_gaps, and vs_* tables.
*/

-- scc_claim_lines
CREATE INDEX IF NOT EXISTS idx_scc_cl_early_warning_id ON public.scc_claim_lines (early_warning_id);

-- scc_claim_periods
CREATE INDEX IF NOT EXISTS idx_scc_cp_project_id ON public.scc_claim_periods (project_id);

-- scc_contracts
CREATE INDEX IF NOT EXISTS idx_scc_con_created_by ON public.scc_contracts (created_by);
CREATE INDEX IF NOT EXISTS idx_scc_con_quote_import_id ON public.scc_contracts (quote_import_id);
CREATE INDEX IF NOT EXISTS idx_scc_con_source_quote_id ON public.scc_contracts (source_quote_id);

-- scc_early_warning_reports
CREATE INDEX IF NOT EXISTS idx_scc_ewr_claim_period_id ON public.scc_early_warning_reports (claim_period_id);

-- scc_off_site_materials
CREATE INDEX IF NOT EXISTS idx_scc_osm_claim_period_id ON public.scc_off_site_materials (claim_period_id);
CREATE INDEX IF NOT EXISTS idx_scc_osm_created_by ON public.scc_off_site_materials (created_by);
CREATE INDEX IF NOT EXISTS idx_scc_osm_organisation_id ON public.scc_off_site_materials (organisation_id);

-- scc_on_site_materials
CREATE INDEX IF NOT EXISTS idx_scc_onsm_created_by ON public.scc_on_site_materials (created_by);
CREATE INDEX IF NOT EXISTS idx_scc_onsm_organisation_id ON public.scc_on_site_materials (organisation_id);

-- scc_payment_certificates
CREATE INDEX IF NOT EXISTS idx_scc_pc_organisation_id ON public.scc_payment_certificates (organisation_id);

-- scc_quote_imports
CREATE INDEX IF NOT EXISTS idx_scc_qi_created_by ON public.scc_quote_imports (created_by);
CREATE INDEX IF NOT EXISTS idx_scc_qi_reviewed_by ON public.scc_quote_imports (reviewed_by);

-- scc_quote_line_items
CREATE INDEX IF NOT EXISTS idx_scc_qli_organisation_id ON public.scc_quote_line_items (organisation_id);

-- scc_retention_ledger
CREATE INDEX IF NOT EXISTS idx_scc_rl_claim_period_id ON public.scc_retention_ledger (claim_period_id);
CREATE INDEX IF NOT EXISTS idx_scc_rl_organisation_id ON public.scc_retention_ledger (organisation_id);

-- scc_scope_lines
CREATE INDEX IF NOT EXISTS idx_scc_sl_project_id ON public.scc_scope_lines (project_id);
CREATE INDEX IF NOT EXISTS idx_scc_sl_source_quote_line_id ON public.scc_scope_lines (source_quote_line_id);

-- scc_variations
CREATE INDEX IF NOT EXISTS idx_scc_var_project_id ON public.scc_variations (project_id);

-- scope_gaps
CREATE INDEX IF NOT EXISTS idx_sg_tenderer_id ON public.scope_gaps (tenderer_id);

-- subcontract_agreement_versions
CREATE INDEX IF NOT EXISTS idx_sav_agreement_id ON public.subcontract_agreement_versions (agreement_id);
CREATE INDEX IF NOT EXISTS idx_sav_completed_by ON public.subcontract_agreement_versions (completed_by);

-- subcontract_agreements
CREATE INDEX IF NOT EXISTS idx_sa_completed_by ON public.subcontract_agreements (completed_by);
CREATE INDEX IF NOT EXISTS idx_sa_created_by ON public.subcontract_agreements (created_by);
CREATE INDEX IF NOT EXISTS idx_sa_template_id ON public.subcontract_agreements (template_id);

-- subcontract_attachments
CREATE INDEX IF NOT EXISTS idx_satt_uploaded_by ON public.subcontract_attachments (uploaded_by);

-- subcontract_field_values
CREATE INDEX IF NOT EXISTS idx_sfv_updated_by ON public.subcontract_field_values (updated_by);

-- variation_register
CREATE INDEX IF NOT EXISTS idx_vr_approved_by_user_id ON public.variation_register (approved_by_user_id);
CREATE INDEX IF NOT EXISTS idx_vr_base_tracker_id ON public.variation_register (base_tracker_id);

-- vs_order_items
CREATE INDEX IF NOT EXISTS idx_vs_oi_from_location_id ON public.vs_order_items (from_location_id);
CREATE INDEX IF NOT EXISTS idx_vs_oi_material_id ON public.vs_order_items (material_id);
CREATE INDEX IF NOT EXISTS idx_vs_oi_organisation_id ON public.vs_order_items (organisation_id);
CREATE INDEX IF NOT EXISTS idx_vs_oi_supplier_id ON public.vs_order_items (supplier_id);

-- vs_orders
CREATE INDEX IF NOT EXISTS idx_vs_ord_created_by ON public.vs_orders (created_by);
CREATE INDEX IF NOT EXISTS idx_vs_ord_project_id ON public.vs_orders (project_id);

-- vs_plant_assets
CREATE INDEX IF NOT EXISTS idx_vs_pa_created_by ON public.vs_plant_assets (created_by);
CREATE INDEX IF NOT EXISTS idx_vs_pa_current_location_id ON public.vs_plant_assets (current_location_id);
CREATE INDEX IF NOT EXISTS idx_vs_pa_updated_by ON public.vs_plant_assets (updated_by);

-- vs_plant_bookings
CREATE INDEX IF NOT EXISTS idx_vs_pb_created_by ON public.vs_plant_bookings (created_by);
CREATE INDEX IF NOT EXISTS idx_vs_pb_site_location_id ON public.vs_plant_bookings (site_location_id);
CREATE INDEX IF NOT EXISTS idx_vs_pb_updated_by ON public.vs_plant_bookings (updated_by);

-- vs_plant_categories
CREATE INDEX IF NOT EXISTS idx_vs_pcat_created_by ON public.vs_plant_categories (created_by);
CREATE INDEX IF NOT EXISTS idx_vs_pcat_organisation_id ON public.vs_plant_categories (organisation_id);
CREATE INDEX IF NOT EXISTS idx_vs_pcat_updated_by ON public.vs_plant_categories (updated_by);

-- vs_plant_charge_events
CREATE INDEX IF NOT EXISTS idx_vs_pce_claimed_in_period_id ON public.vs_plant_charge_events (claimed_in_period_id);
CREATE INDEX IF NOT EXISTS idx_vs_pce_created_by ON public.vs_plant_charge_events (created_by);
CREATE INDEX IF NOT EXISTS idx_vs_pce_movement_id ON public.vs_plant_charge_events (movement_id);
CREATE INDEX IF NOT EXISTS idx_vs_pce_organisation_id ON public.vs_plant_charge_events (organisation_id);

-- vs_plant_claim_lines
CREATE INDEX IF NOT EXISTS idx_vs_pcl_booking_id ON public.vs_plant_claim_lines (booking_id);
CREATE INDEX IF NOT EXISTS idx_vs_pcl_charge_event_id ON public.vs_plant_claim_lines (charge_event_id);
CREATE INDEX IF NOT EXISTS idx_vs_pcl_created_by ON public.vs_plant_claim_lines (created_by);
CREATE INDEX IF NOT EXISTS idx_vs_pcl_organisation_id ON public.vs_plant_claim_lines (organisation_id);

-- vs_plant_claim_periods
CREATE INDEX IF NOT EXISTS idx_vs_pcp_created_by ON public.vs_plant_claim_periods (created_by);

-- vs_plant_movements
CREATE INDEX IF NOT EXISTS idx_vs_pm_created_by ON public.vs_plant_movements (created_by);
CREATE INDEX IF NOT EXISTS idx_vs_pm_from_location_id ON public.vs_plant_movements (from_location_id);
CREATE INDEX IF NOT EXISTS idx_vs_pm_to_location_id ON public.vs_plant_movements (to_location_id);

-- vs_plant_rate_cards
CREATE INDEX IF NOT EXISTS idx_vs_prc_created_by ON public.vs_plant_rate_cards (created_by);
CREATE INDEX IF NOT EXISTS idx_vs_prc_updated_by ON public.vs_plant_rate_cards (updated_by);

-- vs_plant_settings
CREATE INDEX IF NOT EXISTS idx_vs_ps_created_by ON public.vs_plant_settings (created_by);
CREATE INDEX IF NOT EXISTS idx_vs_ps_updated_by ON public.vs_plant_settings (updated_by);

-- vs_sourcing_decisions
CREATE INDEX IF NOT EXISTS idx_vs_sd_approved_by ON public.vs_sourcing_decisions (approved_by);
CREATE INDEX IF NOT EXISTS idx_vs_sd_order_id ON public.vs_sourcing_decisions (order_id);
CREATE INDEX IF NOT EXISTS idx_vs_sd_organisation_id ON public.vs_sourcing_decisions (organisation_id);

-- vs_sourcing_plan_items
CREATE INDEX IF NOT EXISTS idx_vs_spi_material_id ON public.vs_sourcing_plan_items (material_id);
CREATE INDEX IF NOT EXISTS idx_vs_spi_source_id ON public.vs_sourcing_plan_items (source_id);
CREATE INDEX IF NOT EXISTS idx_vs_spi_sourcing_decision_id ON public.vs_sourcing_plan_items (sourcing_decision_id);

-- vs_stock_adjustments
CREATE INDEX IF NOT EXISTS idx_vs_sa_adjusted_by ON public.vs_stock_adjustments (adjusted_by);

-- vs_stock_balances
CREATE INDEX IF NOT EXISTS idx_vs_sb_organisation_id ON public.vs_stock_balances (organisation_id);

-- vs_stock_levels
CREATE INDEX IF NOT EXISTS idx_vs_sl_last_verified_by ON public.vs_stock_levels (last_verified_by);

-- vs_stock_movements
CREATE INDEX IF NOT EXISTS idx_vs_sm_allocated_project_id ON public.vs_stock_movements (allocated_project_id);
CREATE INDEX IF NOT EXISTS idx_vs_sm_created_by ON public.vs_stock_movements (created_by);
CREATE INDEX IF NOT EXISTS idx_vs_sm_location_id ON public.vs_stock_movements (location_id);
CREATE INDEX IF NOT EXISTS idx_vs_sm_order_id ON public.vs_stock_movements (order_id);
CREATE INDEX IF NOT EXISTS idx_vs_sm_supplier_id ON public.vs_stock_movements (supplier_id);

-- vs_transfer_requests
CREATE INDEX IF NOT EXISTS idx_vs_tr_from_location_id ON public.vs_transfer_requests (from_location_id);
CREATE INDEX IF NOT EXISTS idx_vs_tr_material_id ON public.vs_transfer_requests (material_id);
CREATE INDEX IF NOT EXISTS idx_vs_tr_order_id ON public.vs_transfer_requests (order_id);
CREATE INDEX IF NOT EXISTS idx_vs_tr_requested_by ON public.vs_transfer_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_vs_tr_to_location_id ON public.vs_transfer_requests (to_location_id);
