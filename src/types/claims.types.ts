export interface PaymentClaim {
  id: string;
  project_id: string;
  claim_number: number;
  period: string;
  description: string;
  qty_claimed: number;
  qty_previous: number;
  qty_total: number;
  unit: string;
  unit_rate: number;
  amount: number;
  certified_qty: number;
  certified_amount: number;
  retentions: number;
  deductions: number;
  base_tracker_id: string | null;
  matching_confidence: number;
  matching_method: string;
  variance_pct: number;
  variance_flag: '' | 'Green' | 'Amber' | 'Red';
  import_date: string;
  raw_data: any;
  created_at: string;
  updated_at: string;
}

export interface ImportClaimPayload {
  projectId: string;
  claimNumber: number;
  period: string;
  items: ClaimItemInput[];
}

export interface ClaimItemInput {
  description: string;
  qty_claimed: number;
  qty_previous?: number;
  unit: string;
  unit_rate: number;
  amount: number;
  certified_qty?: number;
  certified_amount?: number;
  retentions?: number;
  deductions?: number;
}

export interface ClaimReconciliationResult {
  claimId: string;
  matched: number;
  unmatched: number;
  variationsCreated: number;
  matchedItems: Array<{
    claimItemId: string;
    baseTrackerId: string;
    confidence: number;
    method: string;
    variancePct: number;
    flag: 'Green' | 'Amber' | 'Red';
  }>;
  unmatchedItems: Array<{
    claimItemId: string;
    description: string;
    amount: number;
    reason: string;
  }>;
}

export interface VarianceThresholds {
  green: number;
  amber: number;
}

export const DEFAULT_VARIANCE_THRESHOLDS: VarianceThresholds = {
  green: 5,
  amber: 15,
};
