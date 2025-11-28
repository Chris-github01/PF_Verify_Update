import type { EqualisationResult } from './equalisation.types';

export interface SupplierRiskFactors {
  redCells: number;
  amberCells: number;
  missingScope: number;
  lowConfidenceItems: number;
  totalItems: number;
}

export interface SupplierAward {
  supplierId: string;
  supplierName: string;
  adjustedTotal: number;
  riskScore: number;
  riskFactors: SupplierRiskFactors;
  coveragePercent: number;
  itemsQuoted: number;
  totalItems: number;
  notes: string[];
}

export interface AwardRecommendation {
  type: 'BEST_VALUE' | 'LOWEST_RISK' | 'BALANCED';
  supplier: SupplierAward;
  reason: string;
}

export interface AwardSummary {
  suppliers: SupplierAward[];
  recommendations: AwardRecommendation[];
  totalSystems: number;
  equalisationMode: string;
  generatedAt: string;
}
