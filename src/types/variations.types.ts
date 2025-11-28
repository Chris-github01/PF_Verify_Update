export interface Variation {
  id: string;
  project_id: string;
  variation_number: string;
  source: 'Quote' | 'Claim' | 'Instruction' | 'Manual';
  description: string;
  qty: number;
  unit: string;
  unit_rate: number;
  total: number;
  reason: 'Scope' | 'Design' | 'Rework' | 'VO' | 'Other';
  status: 'Pending' | 'Approved' | 'Rejected' | 'Billed';
  linked_ref: string;
  date_identified: string | null;
  date_submitted: string | null;
  date_approved: string | null;
  date_billed: string | null;
  base_tracker_id: string | null;
  claim_id: string | null;
  auto_created: boolean;
  detection_rule: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CreateVariationPayload {
  projectId: string;
  source: Variation['source'];
  description: string;
  qty: number;
  unit: string;
  unit_rate: number;
  total: number;
  reason: Variation['reason'];
  status?: Variation['status'];
  linked_ref?: string;
  date_identified?: string;
  base_tracker_id?: string;
  claim_id?: string;
  auto_created?: boolean;
  detection_rule?: string;
  notes?: string;
}

export interface VariationDetectionRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: (params: VariationTriggerParams) => boolean;
  priority: number;
}

export interface VariationTriggerParams {
  claimItem?: any;
  baseItem?: any;
  variancePercent?: number;
}

export const DETECTION_RULES = {
  ITEM_NOT_IN_BASE: 'item_not_in_base',
  UNIT_CHANGED: 'unit_changed',
  QTY_EXCEEDS_BASE: 'qty_exceeds_base',
  RATE_CHANGED: 'rate_changed',
  FRR_MISMATCH: 'frr_mismatch',
  SIZE_MISMATCH: 'size_mismatch',
} as const;

export interface VariationSummary {
  totalVariations: number;
  totalValue: number;
  byStatus: {
    Pending: { count: number; value: number };
    Approved: { count: number; value: number };
    Rejected: { count: number; value: number };
    Billed: { count: number; value: number };
  };
  bySource: {
    Quote: { count: number; value: number };
    Claim: { count: number; value: number };
    Instruction: { count: number; value: number };
    Manual: { count: number; value: number };
  };
  byReason: {
    Scope: { count: number; value: number };
    Design: { count: number; value: number };
    Rework: { count: number; value: number };
    VO: { count: number; value: number };
    Other: { count: number; value: number };
  };
}
