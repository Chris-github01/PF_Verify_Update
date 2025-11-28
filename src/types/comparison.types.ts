import type { ModelRateResult } from './modelRate.types';

export type VarianceFlag = 'GREEN' | 'AMBER' | 'RED' | 'NA';

export interface ComparisonRow {
  quoteId: string;
  quoteItemId: string;
  supplier: string;
  systemId: string;
  systemLabel: string;
  section?: string;
  service?: string;
  subclass?: string;
  frr?: string;
  sizeBucket?: string;
  quantity: number;
  unitRate: number | null;
  total: number | null;
  modelRate: number | null;
  componentCount: number | null;
  variancePct: number | null;
  flag: VarianceFlag;
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
