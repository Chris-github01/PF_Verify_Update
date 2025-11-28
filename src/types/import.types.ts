export type SectionType =
  | 'Electrical Services'
  | 'Fire Protection Services'
  | 'Hydraulics Services'
  | 'Mechanical Services'
  | 'Structural Penetrations'
  | 'Passive Fire (General)'
  | 'Optional Extras'
  | 'Excluded'
  | 'Summary Blocks'
  | 'Admin / Notes / T&Cs';

export type LineFlag =
  | 'MISSING UNIT'
  | 'SIZE AMBIGUOUS'
  | 'MISSING QTY'
  | 'MISSING RATE'
  | 'MISSING TOTAL'
  | 'INVALID FORMAT';

export interface ParsedQuoteLine {
  id: string;
  supplier: string;
  section: SectionType;
  service_type?: string;
  description: string;
  size?: string;
  substrate_frr?: string;
  materials?: string;
  reference?: string;
  qty?: number;
  unit?: string;
  rate?: number;
  total?: number;
  flags: LineFlag[];
  source_line: string;
  page_no?: number;
  general?: boolean;
}

export interface SectionConfig {
  name: SectionType;
  enabled: boolean;
  count: number;
  keywords?: string[];
}

export interface ImportSegmentation {
  linesAll: ParsedQuoteLine[];
  linesValid: ParsedQuoteLine[];
  sectionsIndex: Map<SectionType, ParsedQuoteLine[]>;
  summaryBlocks: SummaryBlock[];
  notesBlocks: string[];
}

export interface SummaryBlock {
  label: string;
  value: number;
  type: 'subtotal' | 'pg' | 'margin' | 'ps3' | 'qa' | 'grand_total';
}

export interface SupplierQuoteLine {
  id: string;
  supplierId: string;
  supplierName: string;
  section?: string;
  reference?: string;
  description: string;
  qty?: number;
  unit?: string;
  rate?: number;
  total?: number;
  notes?: string;
  raw?: string;
  included: boolean;
}

export interface ParsedQuote {
  supplierName: string;
  lines: SupplierQuoteLine[];
  segmentation?: ImportSegmentation;
  metadata?: {
    fileName: string;
    fileType: string;
    parseMethod: string;
  };
}

export interface ExcelSheetInfo {
  name: string;
  rowCount: number;
  hasDescription: boolean;
  hasQty: boolean;
  hasUnit: boolean;
  hasRate: boolean;
  hasTotal: boolean;
  isCandidate: boolean;
  selected: boolean;
}

export interface ColumnMapping {
  description?: number;
  qty?: number;
  unit?: number;
  rate?: number;
  total?: number;
  section?: number;
  service?: number;
  notes?: number;
}

export interface SheetPreview {
  sheetName: string;
  headers: string[];
  sampleRows: string[][];
  mapping: ColumnMapping;
}

export interface NormalisedBOQRow {
  id: string;
  supplier: string;
  sourceSheet: string;
  section: string;
  service?: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
  notes?: string;
  flags: LineFlag[];
  modelRate?: number;
  modelTotal?: number;
  deviation?: number;
}

export interface BOQValidationSummary {
  supplier: string;
  sheetsImported: number;
  linesDetected: number;
  missingQty: number;
  missingRate: number;
  invalidUnit: number;
  totalSum: number;
}

export interface BOQImportState {
  step: 'upload' | 'select-sheets' | 'map-columns' | 'validate' | 'confirm';
  files: File[];
  supplierNames: Map<string, string>;
  detectedSheets: Map<string, ExcelSheetInfo[]>;
  sheetPreviews: Map<string, SheetPreview[]>;
  normalisedData: NormalisedBOQRow[];
  validationSummaries: BOQValidationSummary[];
}
