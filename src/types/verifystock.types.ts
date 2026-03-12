export interface StockItem {
  id: string;
  organisation_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  min_quantity: number;
  max_quantity: number | null;
  location: string | null;
  supplier_name: string | null;
  unit_cost: number | null;
  notes: string | null;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface StockLevel {
  id: string;
  organisation_id: string;
  stock_item_id: string;
  quantity_on_hand: number;
  last_verified_at: string | null;
  last_verified_by: string | null;
  created_at: string;
  updated_at: string;
  stock_item?: StockItem;
}

export interface StockVerification {
  id: string;
  organisation_id: string;
  stock_item_id: string;
  verified_quantity: number;
  previous_quantity: number;
  discrepancy: number;
  notes: string | null;
  verified_by: string;
  verified_at: string;
  stock_item?: StockItem;
}

export interface StockAdjustment {
  id: string;
  organisation_id: string;
  stock_item_id: string;
  adjustment_type: 'ADD' | 'REMOVE' | 'ADJUST' | 'TRANSFER_IN' | 'TRANSFER_OUT';
  quantity: number;
  reason: string | null;
  reference: string | null;
  adjusted_by: string;
  adjusted_at: string;
  stock_item?: StockItem;
}

export type AlertType = 'LOW_STOCK' | 'OUT_OF_STOCK' | 'OVERSTOCK' | 'DISCREPANCY' | 'CUSTOM';

export interface StockAlert {
  id: string;
  organisation_id: string;
  stock_item_id: string;
  alert_type: AlertType;
  message: string;
  is_read: boolean;
  created_at: string;
  stock_item?: StockItem;
}

export type StockStatus = 'ok' | 'low' | 'out' | 'over';

export interface StockItemWithLevel extends StockItem {
  stock_level?: StockLevel;
  status: StockStatus;
}

export interface VerifyStockSummary {
  total_items: number;
  low_stock_count: number;
  out_of_stock_count: number;
  overstock_count: number;
  unread_alerts: number;
  total_portfolio_value: number;
}

export interface CategoryReport {
  category: string;
  item_count: number;
  total_value: number;
  low_count: number;
  out_count: number;
}
