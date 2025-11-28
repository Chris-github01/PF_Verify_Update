export interface PassiveFireQuoteSchema {
  metadata: QuoteMetadata;
  line_items: LineItem[];
  financials: Financials;
  validation: ValidationResult;
}

export interface QuoteMetadata {
  supplier_name: string;
  quote_number: string;
  quote_date: string;
  quote_reference?: string;
  project_name?: string;
  customer_name?: string;
  currency: string;
  payment_terms?: string;
  validity_period?: string;
}

export interface LineItem {
  line_number?: number;
  item_code?: string;
  description: string;
  quantity: number;
  unit: string;
  unit_rate: number;
  line_total: number;
  trade?: string;
  system_code?: string;
  fire_rating?: string;
  notes?: string;
  confidence: number;
}

export interface Financials {
  subtotal: number;
  tax_rate?: number;
  tax_amount?: number;
  discount?: number;
  grand_total: number;
  currency: string;
}

export interface ValidationResult {
  is_valid: boolean;
  confidence_score: number;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  checks: ValidationCheck[];
}

export interface ValidationError {
  type: 'arithmetic' | 'format' | 'missing_required' | 'inconsistent';
  field: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  expected?: any;
  actual?: any;
}

export interface ValidationWarning {
  type: 'suspicious_value' | 'unusual_format' | 'potential_ocr_error' | 'duplicate';
  field: string;
  message: string;
  suggestion?: string;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

export interface ExtractionResult {
  primary: PassiveFireQuoteSchema;
  secondary?: PassiveFireQuoteSchema;
  consensus?: PassiveFireQuoteSchema;
  confidence_breakdown: ConfidenceBreakdown;
  extraction_metadata: ExtractionMetadata;
}

export interface ConfidenceBreakdown {
  overall: number;
  metadata: number;
  line_items: number;
  financials: number;
  cross_model_agreement: number;
  arithmetic_consistency: number;
  format_validity: number;
}

export interface ExtractionMetadata {
  models_used: string[];
  extraction_method: 'primary' | 'fallback' | 'consensus';
  processing_time_ms: number;
  page_count: number;
  table_detection_confidence?: number;
  ocr_used: boolean;
  fallback_reason?: string;
}

export interface SimilarityMatch {
  description: string;
  similarity_score: number;
  suggested_system_code?: string;
  suggested_trade?: string;
  suggested_unit?: string;
  reference_item_id?: string;
}
