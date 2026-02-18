export interface BaseTrackerImportRow {
  itemNumber?: string;
  description: string;
  unit?: string;
  quantity?: number;
  rate?: number;
  previousCertified?: number;
  currentClaim?: number;
  totalToDate?: number;
  balance?: number;
  notes?: string;
  [key: string]: any;
}

export interface BaseTrackerImportResult {
  success: boolean;
  totalRowsProcessed: number;
  successfulUpdates: number;
  errors: ImportError[];
  warnings: ImportWarning[];
  summary: ImportSummary;
  auditLogId?: string;
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
  severity: 'error' | 'critical';
}

export interface ImportWarning {
  row: number;
  field?: string;
  message: string;
  suggestion?: string;
}

export interface ImportSummary {
  totalValueChange: number;
  itemsUpdated: number;
  itemsCreated: number;
  itemsSkipped: number;
  runningTotalBefore: number;
  runningTotalAfter: number;
  certifiedAmountChange: number;
}

export interface BaseTrackerImportConfig {
  projectId: string;
  awardApprovalId: string;
  supplierId: string;
  period: string;
  version: number;
  importMode: 'incremental' | 'full_refresh';
  validateOnly?: boolean;
  autoMatchItems?: boolean;
  createMissingItems?: boolean;
}

export interface ColumnMapping {
  description: string[];
  quantity: string[];
  unit: string[];
  rate: string[];
  previousCertified: string[];
  currentClaim: string[];
  totalToDate: string[];
  balance: string[];
  itemNumber: string[];
}

export interface ParsedExcelData {
  headers: string[];
  rows: BaseTrackerImportRow[];
  detectedColumns: Partial<ColumnMapping>;
  sheetName: string;
  totalRows: number;
}

export interface ImportAuditLog {
  id: string;
  project_id: string;
  award_approval_id: string;
  supplier_id: string;
  import_type: 'base_tracker';
  file_name: string;
  file_size: number;
  imported_by: string;
  import_config: BaseTrackerImportConfig;
  result: BaseTrackerImportResult;
  created_at: string;
}
