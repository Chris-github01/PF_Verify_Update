export interface BaseTrackerItem {
  id: string;
  project_id: string;
  system_id: string;
  system_label: string;
  section: string;
  description: string;
  size: string;
  size_bucket: string;
  unit: string;
  qty_base: number;
  unit_rate: number;
  total: number;
  drawing_ref: string;
  status: 'Planned' | 'Issued' | 'Completed';
  frr: string;
  material: string;
  notes: string;
  source_quote_id: string | null;
  created_from_quote_item_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBaseTrackerPayload {
  projectId: string;
  quoteId: string;
  items: BaseTrackerItemInput[];
}

export interface BaseTrackerItemInput {
  system_id: string;
  system_label: string;
  section: string;
  description: string;
  size: string;
  size_bucket: string;
  unit: string;
  qty_base: number;
  unit_rate: number;
  total: number;
  drawing_ref?: string;
  status?: 'Planned' | 'Issued' | 'Completed';
  frr?: string;
  material?: string;
  notes?: string;
  created_from_quote_item_id?: string;
}

export interface BaseTrackerSummary {
  totalItems: number;
  totalValue: number;
  byStatus: {
    Planned: { count: number; value: number };
    Issued: { count: number; value: number };
    Completed: { count: number; value: number };
  };
  bySystem: Array<{
    systemId: string;
    systemLabel: string;
    count: number;
    value: number;
  }>;
  bySection: Array<{
    section: string;
    count: number;
    value: number;
  }>;
}
