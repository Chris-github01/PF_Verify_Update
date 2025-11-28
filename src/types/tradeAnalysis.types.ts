export type MatchStatus = 'matched' | 'missing_supplier1' | 'missing_supplier2' | 'missing_supplier3' | 'missing_supplier4' | 'missing_supplier5' | 'unmatched';

export type VarianceLevel = 'exact' | 'good' | 'moderate' | 'high' | 'missing';

export interface SupplierQuoteItem {
  id: string;
  quoteId: string;
  supplierName: string;
  section: string;
  service: string;
  description: string;
  size?: string;
  substrate?: string;
  frr?: string;
  materials?: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
  reference?: string;
}

export interface ComparisonRow {
  id: string;
  section: string;
  description: string;
  size?: string;
  unit: string;
  qty: number;
  supplier1Item?: SupplierQuoteItem;
  supplier2Item?: SupplierQuoteItem;
  supplier3Item?: SupplierQuoteItem;
  supplier4Item?: SupplierQuoteItem;
  supplier5Item?: SupplierQuoteItem;
  supplier1Rate?: number;
  supplier2Rate?: number;
  supplier3Rate?: number;
  supplier4Rate?: number;
  supplier5Rate?: number;
  supplier1Total?: number;
  supplier2Total?: number;
  supplier3Total?: number;
  supplier4Total?: number;
  supplier5Total?: number;
  rateVariance?: number;
  totalVariance?: number;
  varianceLevel: VarianceLevel;
  matchStatus: MatchStatus;
  matchScore?: number;
  notes?: string;
}

export interface SectionStats {
  section: string;
  linesCompared: number;
  linesMissing: number;
  averageRateVariance: number;
  sectionTotalVariance: number;
  supplier1Total: number;
  supplier2Total: number;
  supplier3Total?: number;
  supplier4Total?: number;
  supplier5Total?: number;
}

export interface TotalsSummary {
  overallVariancePercent: number;
  totalValueDifference: number;
  missingItemsCount: number;
  weightedAverageDifference: number;
  supplier1GrandTotal: number;
  supplier2GrandTotal: number;
  supplier3GrandTotal?: number;
  supplier4GrandTotal?: number;
  supplier5GrandTotal?: number;
  totalItemsCompared: number;
}

export interface TradeAnalysisFilters {
  supplier1Id: string | null;
  supplier2Id: string | null;
  supplier3Id?: string | null;
  supplier4Id?: string | null;
  supplier5Id?: string | null;
  sections: string[];
  unitTolerancePercent: number;
  showOnlyVariances: boolean;
}

export interface SupplierOption {
  id: string;
  name: string;
  totalAmount: number;
  itemsCount: number;
  importedAt: string;
}

export interface TradeAnalysisCache {
  supplierPair: string;
  timestamp: string;
  comparisonRows: ComparisonRow[];
  sectionStats: SectionStats[];
  totalsSummary: TotalsSummary;
}
