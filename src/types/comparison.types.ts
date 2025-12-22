import type { ModelRateResult } from './modelRate.types';

export type VarianceFlag = 'GREEN' | 'AMBER' | 'RED' | 'NA';

export interface ComparisonRow {
  quoteId?: string;
  quoteItemId?: string;
  supplier?: string;
  systemId?: string;
  systemLabel?: string;
  section?: string;
  service?: string;
  subclass?: string;
  category?: string;
  frr?: string;
  sizeBucket?: string;
  description?: string;
  unit?: string;
  quantity?: number;
  unitRate?: number | null;
  total?: number | null;
  modelRate?: number | null;
  componentCount?: number | null;
  variancePct?: number | null;
  flag?: VarianceFlag;
  suppliers?: Record<string, {
    unitPrice: number | null;
    total: number | null;
    originalDescription: string;
    quantity: number | null;
    unit: string | null;
    normalisedUnit: string | null;
  }>;
  matchStatus?: string;
  matchConfidence?: number;
  notes?: string;
}

export interface MatrixCell {
  unitRate: number | null;
  flag: VarianceFlag;
  modelRate: number | null;
  variancePct: number | null;
  componentCount: number | null;
  quoteId: string;
  quoteItemId: string;
  totalQuantity?: number;
  totalValue?: number;
  unit?: string | null;
  normalisedUnit?: string | null;
}

export interface MatrixRow {
  systemId: string;
  systemLabel: string;
  section?: string;
  service?: string;
  subclass?: string;
  frr?: string;
  sizeBucket?: string;
  cells: Record<string, MatrixCell>;
}

export interface MatrixFilters {
  section?: string;
  service?: string;
  subclass?: string;
  frr?: string;
  sizeBucket?: string;
}
