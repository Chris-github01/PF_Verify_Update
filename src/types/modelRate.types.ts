export interface ModelRateCriteria {
  systemId?: string;
  size?: string;
  frr?: string;
  service?: string;
  subclass?: string;
}

export interface BOMItem {
  sku: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  coverage?: number;
}

export interface ModelRateResult {
  systemId: string;
  modelRate: number;
  componentCount: number;
  confidence?: number;
  evidence?: string;
  bom?: BOMItem[];
}

export interface CSVModelRate {
  systemId: string;
  sizeBucket: string;
  frr: string;
  service: string;
  subclass: string;
  componentCount: number;
  modelRate: number;
}

export type ModelRateSource = 'api' | 'csv';

export interface ProjectSettings {
  id?: string;
  project_id: string;
  model_rate_source: ModelRateSource;
  api_base_url: string;
  csv_data?: CSVModelRate[];
  created_at?: string;
  updated_at?: string;
}
