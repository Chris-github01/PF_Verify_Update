export interface VsOrder {
  id: string;
  organisation_id: string;
  project_id: string | null;
  project?: { name: string; project_number: string | null } | null;
  status: 'DRAFT' | 'PLANNED' | 'COMPLETE' | 'CANCELLED';
  po_number: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  order_items?: VsOrderItem[];
}

export interface VsOrderItem {
  id: string;
  order_id: string;
  organisation_id: string;
  material_id: string | null;
  material_name: string;
  supplier_id: string | null;
  supplier_name: string | null;
  quantity: number;
  source_type: 'SUPPLIER' | 'STOREROOM' | 'VAN' | null;
  from_location_id: string | null;
  from_location_name: string | null;
  unit: string;
  notes: string | null;
}

export interface VsStockBalance {
  id: string;
  organisation_id: string;
  material_id: string;
  location_id: string;
  quantity: number;
  updated_at: string;
}

export interface StockSearchRow {
  material_id: string;
  material_name: string;
  material_type: string | null;
  unit: string;
  sku: string | null;
  organisation_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  location_id: string | null;
  location_name: string | null;
  location_type: string | null;
  quantity: number;
}

export interface SourcingPlanItem {
  material_id: string;
  material_name: string;
  source_type: 'VAN' | 'STOREROOM' | 'SUPPLIER';
  source_id: string | null;
  source_name: string | null;
  available_quantity: number;
  recommended_quantity: number;
  collection_cost: number;
  material_value: number;
  efficiency_ratio: number;
  priority_rank: number;
}

export interface VsTransferRequest {
  id: string;
  organisation_id: string;
  material_id: string | null;
  material_name: string;
  from_location_id: string | null;
  from_location_name: string | null;
  to_location_id: string | null;
  to_location_name: string | null;
  quantity: number;
  requested_by: string;
  requester_name: string | null;
  po_number: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  order_id: string | null;
  created_at: string;
}

export interface CartItem {
  material_id: string | null;
  material_name: string;
  supplier_id: string | null;
  supplier_name: string | null;
  unit: string;
  quantity: number;
  source_type?: 'SUPPLIER' | 'STOREROOM' | 'VAN';
  from_location_id?: string | null;
  from_location_name?: string | null;
  available_qty?: number;
}
