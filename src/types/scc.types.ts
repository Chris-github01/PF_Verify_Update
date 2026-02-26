export interface SCCContract {
  id: string;
  project_id: string | null;
  organisation_id: string | null;
  contract_number: string;
  contract_name: string;
  subcontractor_name: string;
  subcontractor_company: string;
  subcontractor_email: string;
  subcontractor_phone: string;
  contract_value: number;
  retention_percentage: number;
  retention_release_method: 'practical_completion' | 'on_demand' | 'staged';
  payment_terms_days: number;
  claim_cutoff_day: number;
  contract_start_date: string | null;
  contract_end_date: string | null;
  status: 'setup' | 'active' | 'complete' | 'disputed';
  snapshot_locked: boolean;
  snapshot_hash: string | null;
  source_quote_id: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SCCScopeLine {
  id: string;
  contract_id: string;
  project_id: string | null;
  organisation_id: string | null;
  line_number: string;
  section: string;
  description: string;
  system_category: string;
  unit: string;
  qty_contract: number;
  unit_rate: number;
  line_total: number;
  claim_method: 'percentage' | 'quantity' | 'milestone';
  evidence_required: boolean;
  is_variation: boolean;
  variation_id: string | null;
  notes: string;
  created_at: string;
}

export interface SCCClaimPeriod {
  id: string;
  contract_id: string;
  project_id: string | null;
  organisation_id: string | null;
  period_number: number;
  period_name: string;
  claim_date: string;
  period_start: string | null;
  period_end: string | null;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'partial' | 'rejected';
  total_claimed_this_period: number;
  total_claimed_cumulative: number;
  retention_deducted_this_period: number;
  retention_held_cumulative: number;
  net_payable_this_period: number;
  approved_amount: number | null;
  disputed_amount: number;
  notes: string;
  mc_notes: string;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SCCClaimLine {
  id: string;
  claim_period_id: string;
  scope_line_id: string;
  contract_id: string;
  qty_previous_cumulative: number;
  qty_this_claim: number;
  qty_cumulative: number;
  percent_this_claim: number;
  percent_cumulative: number;
  amount_this_claim: number;
  amount_cumulative: number;
  amount_remaining: number;
  mc_approved_qty: number | null;
  mc_approved_amount: number | null;
  dispute_flag: boolean;
  dispute_note: string;
  created_at: string;
  updated_at: string;
}

export interface SCCVariation {
  id: string;
  contract_id: string;
  project_id: string | null;
  organisation_id: string | null;
  vo_number: string;
  title: string;
  description: string;
  type: 'addition' | 'omission' | 'adjustment';
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'claimed' | 'paid';
  submitted_by: string;
  instructed_by: string;
  instruction_reference: string;
  claimed_amount: number;
  approved_amount: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SCCContractSummary {
  contract_value: number;
  claimed_to_date: number;
  approved_to_date: number;
  retention_held: number;
  net_paid: number;
  variations_approved: number;
  variations_pending: number;
  percent_complete: number;
  remaining_value: number;
  claim_count: number;
}
