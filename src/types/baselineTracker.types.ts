export type BTProjectStatus = 'draft' | 'active' | 'claim_in_progress' | 'submitted' | 'closed' | 'archived';
export type BTBaselineStatus = 'draft' | 'review' | 'confirmed' | 'locked' | 'superseded';
export type BTClaimStatus = 'draft' | 'under_review' | 'ready_to_submit' | 'submitted' | 'certified' | 'part_paid' | 'paid' | 'disputed';
export type BTVariationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'withdrawn';
export type BTVariationType = 'addition' | 'omission' | 'substitution' | 'rework' | 'rate_change';
export type BTClaimMethod = 'quantity_based' | 'percent_based' | 'milestone_based' | 'manual_value';
export type BTLineStatus = 'not_started' | 'in_progress' | 'substantially_complete' | 'complete';
export type BTSourceType = 'manual' | 'imported_from_quote_audit' | 'imported_from_file';
export type BTClaimFrequency = 'monthly' | 'fortnightly' | 'milestone' | 'custom';
export type BTEntityType = 'baseline' | 'claim_period' | 'claim_line' | 'variation' | 'progress_update' | 'general';
export type BTUploadCategory = 'photo' | 'delivery_docket' | 'site_record' | 'marked_up_drawing' | 'timesheet' | 'invoice_support' | 'variation_support' | 'general';

export interface BTProject {
  id: string;
  organisation_id: string;
  project_name: string;
  project_code: string | null;
  client_name: string | null;
  main_contractor_name: string | null;
  site_address: string | null;
  contract_reference: string | null;
  linked_quote_audit_reference: string | null;
  source_type: BTSourceType;
  status: BTProjectStatus;
  baseline_locked_at: string | null;
  start_date: string | null;
  end_date: string | null;
  retention_percent: number;
  payment_terms_days: number;
  claim_frequency: BTClaimFrequency;
  gst_rate: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BTBaselineHeader {
  id: string;
  project_id: string;
  organisation_id: string;
  baseline_reference: string | null;
  awarded_quote_reference: string | null;
  baseline_version: number;
  contract_value_excl_gst: number;
  contract_value_incl_gst: number;
  retention_percent: number;
  payment_terms_days: number;
  claim_frequency: BTClaimFrequency;
  baseline_status: BTBaselineStatus;
  baseline_source_snapshot_json: any | null;
  notes: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BTBaselineLineItem {
  id: string;
  baseline_header_id: string;
  organisation_id: string;
  line_number: string;
  work_breakdown_code: string | null;
  cost_code: string | null;
  trade_category: string | null;
  location: string | null;
  area_or_zone: string | null;
  item_title: string;
  item_description: string | null;
  unit: string;
  baseline_quantity: number;
  baseline_rate: number;
  baseline_amount: number;
  claim_method: BTClaimMethod;
  milestone_label: string | null;
  display_order: number;
  exclusions_notes: string | null;
  assumptions_notes: string | null;
  is_variation_origin: boolean;
  source_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface BTClaimPeriod {
  id: string;
  project_id: string;
  baseline_header_id: string;
  organisation_id: string;
  claim_no: number;
  claim_period_name: string;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  status: BTClaimStatus;
  previous_claimed_total: number;
  current_claim_subtotal: number;
  approved_variations_total: number;
  gross_claim: number;
  retention_amount: number;
  net_before_gst: number;
  gst_amount: number;
  total_this_claim_incl_gst: number;
  submitted_at: string | null;
  submitted_by: string | null;
  certified_amount: number | null;
  paid_amount: number | null;
  payment_received_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BTClaimLineItem {
  id: string;
  claim_period_id: string;
  baseline_line_item_id: string;
  organisation_id: string;
  previous_quantity_claimed: number;
  previous_value_claimed: number;
  this_period_quantity: number;
  this_period_percent: number;
  this_period_value: number;
  total_quantity_claimed_to_date: number;
  total_value_claimed_to_date: number;
  remaining_quantity: number;
  remaining_value: number;
  progress_percent_to_date: number;
  line_status: BTLineStatus;
  supporting_notes: string | null;
  created_at: string;
  updated_at: string;
  baseline_line_item?: BTBaselineLineItem;
}

export interface BTProgressUpdate {
  id: string;
  project_id: string;
  baseline_line_item_id: string;
  organisation_id: string;
  claim_period_id: string | null;
  update_date: string;
  quantity_complete: number;
  percent_complete: number;
  value_complete: number;
  status: BTLineStatus;
  notes: string | null;
  entered_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BTVariation {
  id: string;
  project_id: string;
  baseline_header_id: string;
  organisation_id: string;
  variation_reference: string;
  title: string;
  description: string | null;
  variation_type: BTVariationType;
  status: BTVariationStatus;
  quotation_reference: string | null;
  quantity: number;
  rate: number;
  amount: number;
  approved_amount: number | null;
  claimed_to_date: number;
  related_baseline_line_item_id: string | null;
  approved_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BTAttachment {
  id: string;
  project_id: string;
  organisation_id: string;
  entity_type: BTEntityType;
  entity_id: string | null;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number;
  upload_category: BTUploadCategory;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface BTActivityLog {
  id: string;
  organisation_id: string;
  project_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action_type: string;
  action_label: string;
  old_value_json: any | null;
  new_value_json: any | null;
  action_by: string | null;
  action_at: string;
}

export interface BTProjectSummary extends BTProject {
  baseline_header?: BTBaselineHeader | null;
  latest_claim?: BTClaimPeriod | null;
  total_claimed_to_date: number;
  remaining_value: number;
  approved_variations_total: number;
  open_claim_count: number;
}
