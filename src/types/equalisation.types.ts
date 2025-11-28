export type EqualisationMode = 'MODEL' | 'PEER_MEDIAN';

export interface EqualisationLogEntry {
  supplierName: string;
  systemId: string;
  systemLabel: string;
  reason: string;
  source: string;
  rateUsed: number;
  quantity: number;
  total: number;
}

export interface SupplierTotal {
  supplierName: string;
  originalTotal: number;
  equalisedTotal: number;
  adjustment: number;
  adjustmentPct: number;
  itemsAdded: number;
}

export interface EqualisationResult {
  supplierTotals: SupplierTotal[];
  equalisationLog: EqualisationLogEntry[];
  mode: EqualisationMode;
}
