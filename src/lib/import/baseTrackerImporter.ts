import * as XLSX from 'xlsx';
import type {
  BaseTrackerImportRow,
  BaseTrackerImportResult,
  BaseTrackerImportConfig,
  ColumnMapping,
  ParsedExcelData,
  ImportError,
  ImportWarning,
  ImportSummary
} from '../../types/baseTrackerImport.types';
import { supabase } from '../supabase';

const COMMON_COLUMN_PATTERNS: ColumnMapping = {
  description: ['description', 'item', 'work description', 'scope', 'particulars'],
  quantity: ['quantity', 'qty', 'amount', 'no.'],
  unit: ['unit', 'uom', 'unit of measure'],
  rate: ['rate', 'unit price', 'price', 'unit rate'],
  previousCertified: ['previous', 'prev certified', 'cumulative', 'to date', 'previous total'],
  currentClaim: ['current', 'this period', 'this month', 'claim', 'current claim'],
  totalToDate: ['total', 'total to date', 'cumulative total', 'total certified'],
  balance: ['balance', 'remaining', 'outstanding', 'to complete'],
  itemNumber: ['item no', 'no.', 'ref', 'line', 'item number', '#']
};

export async function parseExcelFile(file: File): Promise<ParsedExcelData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error('Failed to read file');
        }

        const workbook = XLSX.read(data, { type: 'binary', cellDates: true, cellText: false });

        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          throw new Error('No sheets found in Excel file');
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: null,
          blankrows: false
        });

        if (jsonData.length === 0) {
          throw new Error('Excel file is empty');
        }

        const headerRow = findHeaderRow(jsonData);
        if (headerRow === -1) {
          throw new Error('Could not identify header row in Excel file');
        }

        const headers = jsonData[headerRow].map((h: any) => {
          if (h === null || h === undefined || h === '') return '';
          return String(h).trim().toLowerCase();
        });

        const detectedColumns = detectColumns(headers);

        const rows: BaseTrackerImportRow[] = [];
        for (let i = headerRow + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (isEmptyRow(row)) continue;

          const parsedRow = parseRow(row, headers, detectedColumns);
          if (parsedRow.description) {
            rows.push(parsedRow);
          }
        }

        resolve({
          headers,
          rows,
          detectedColumns,
          sheetName: firstSheetName,
          totalRows: rows.length
        });
      } catch (error: any) {
        reject(new Error(`Failed to parse Excel file: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsBinaryString(file);
  });
}

function findHeaderRow(data: any[][]): number {
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    const textCells = row.filter((cell: any) =>
      typeof cell === 'string' && cell.trim().length > 0
    );

    if (textCells.length >= 3) {
      const rowText = row.join(' ').toLowerCase();
      if (
        rowText.includes('description') ||
        rowText.includes('item') ||
        rowText.includes('quantity') ||
        rowText.includes('rate')
      ) {
        return i;
      }
    }
  }
  return 0;
}

function isEmptyRow(row: any[]): boolean {
  return row.every(cell =>
    cell === null ||
    cell === undefined ||
    (typeof cell === 'string' && cell.trim() === '')
  );
}

function detectColumns(headers: string[]): Partial<ColumnMapping> {
  const detected: any = {};

  for (const [key, patterns] of Object.entries(COMMON_COLUMN_PATTERNS)) {
    const index = headers.findIndex(header =>
      header && typeof header === 'string' && patterns.some(pattern => header.includes(pattern))
    );
    if (index !== -1) {
      detected[key] = index;
    }
  }

  return detected;
}

function parseRow(
  row: any[],
  headers: string[],
  columnMap: Partial<ColumnMapping>
): BaseTrackerImportRow {
  const parsed: BaseTrackerImportRow = {
    description: '',
  };

  for (const [field, index] of Object.entries(columnMap)) {
    if (typeof index !== 'number') continue;
    const value = row[index];

    switch (field) {
      case 'description':
        parsed.description = String(value || '').trim();
        break;
      case 'itemNumber':
        parsed.itemNumber = String(value || '').trim();
        break;
      case 'unit':
        parsed.unit = String(value || '').trim();
        break;
      case 'quantity':
      case 'rate':
      case 'previousCertified':
      case 'currentClaim':
      case 'totalToDate':
      case 'balance':
        parsed[field] = parseNumber(value);
        break;
    }
  }

  return parsed;
}

function parseNumber(value: any): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

export async function processBaseTrackerImport(
  parsedData: ParsedExcelData,
  config: BaseTrackerImportConfig
): Promise<BaseTrackerImportResult> {
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];
  let successfulUpdates = 0;
  let itemsCreated = 0;
  let itemsSkipped = 0;

  const { data: existingItems } = await supabase
    .from('commercial_baseline_items')
    .select('*')
    .eq('award_approval_id', config.awardApprovalId)
    .eq('is_active', true);

  const existingMap = new Map(
    (existingItems || []).map(item => [
      item.line_description.toLowerCase().trim(),
      item
    ])
  );

  let runningTotalBefore = 0;
  let runningTotalAfter = 0;
  let certifiedAmountChange = 0;

  if (config.validateOnly) {
    for (let i = 0; i < parsedData.rows.length; i++) {
      const row = parsedData.rows[i];
      const rowNum = i + 1;

      validateRow(row, rowNum, errors, warnings);
    }

    return {
      success: errors.length === 0,
      totalRowsProcessed: parsedData.rows.length,
      successfulUpdates: 0,
      errors,
      warnings,
      summary: {
        totalValueChange: 0,
        itemsUpdated: 0,
        itemsCreated: 0,
        itemsSkipped: parsedData.rows.length,
        runningTotalBefore: 0,
        runningTotalAfter: 0,
        certifiedAmountChange: 0
      }
    };
  }

  for (let i = 0; i < parsedData.rows.length; i++) {
    const row = parsedData.rows[i];
    const rowNum = i + 1;

    const validationErrors = validateRow(row, rowNum, errors, warnings);
    if (validationErrors) {
      itemsSkipped++;
      continue;
    }

    const matchKey = row.description.toLowerCase().trim();
    const existingItem = existingMap.get(matchKey);

    if (existingItem) {
      const updates: any = {};
      let hasChanges = false;

      if (row.currentClaim !== undefined && row.currentClaim !== existingItem.claimed_amount) {
        updates.claimed_amount = row.currentClaim;
        updates.total_certified = (existingItem.total_certified || 0) + row.currentClaim;
        certifiedAmountChange += row.currentClaim;
        hasChanges = true;
      }

      if (row.totalToDate !== undefined && row.totalToDate !== existingItem.total_certified) {
        updates.total_certified = row.totalToDate;
        certifiedAmountChange += (row.totalToDate - (existingItem.total_certified || 0));
        hasChanges = true;
      }

      if (row.quantity !== undefined && row.quantity !== existingItem.quantity) {
        updates.quantity = row.quantity;
        hasChanges = true;
      }

      if (row.rate !== undefined && row.rate !== existingItem.unit_price) {
        updates.unit_price = row.rate;
        hasChanges = true;
      }

      if (hasChanges) {
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase
          .from('commercial_baseline_items')
          .update(updates)
          .eq('id', existingItem.id);

        if (error) {
          errors.push({
            row: rowNum,
            message: `Failed to update item: ${error.message}`,
            severity: 'error'
          });
          itemsSkipped++;
        } else {
          successfulUpdates++;
          runningTotalBefore += existingItem.total_certified || 0;
          runningTotalAfter += updates.total_certified || existingItem.total_certified || 0;
        }
      } else {
        itemsSkipped++;
        warnings.push({
          row: rowNum,
          message: 'No changes detected for this item',
          suggestion: 'Item already up to date'
        });
      }
    } else if (config.createMissingItems) {
      const newItem = {
        award_approval_id: config.awardApprovalId,
        project_id: config.projectId,
        line_description: row.description,
        quantity: row.quantity || 0,
        unit: row.unit || 'No',
        unit_price: row.rate || 0,
        line_amount: (row.quantity || 0) * (row.rate || 0),
        line_type: 'awarded_item',
        claimed_amount: row.currentClaim || 0,
        total_certified: row.totalToDate || 0,
        is_active: true
      };

      const { error } = await supabase
        .from('commercial_baseline_items')
        .insert(newItem);

      if (error) {
        errors.push({
          row: rowNum,
          message: `Failed to create new item: ${error.message}`,
          severity: 'error'
        });
        itemsSkipped++;
      } else {
        itemsCreated++;
        runningTotalAfter += newItem.total_certified;
        certifiedAmountChange += newItem.total_certified;
      }
    } else {
      warnings.push({
        row: rowNum,
        message: 'Item not found in baseline',
        suggestion: 'Enable "Create Missing Items" to add this item automatically'
      });
      itemsSkipped++;
    }
  }

  await createAuditLog(config, parsedData, {
    success: errors.filter(e => e.severity === 'critical').length === 0,
    totalRowsProcessed: parsedData.rows.length,
    successfulUpdates,
    errors,
    warnings,
    summary: {
      totalValueChange: runningTotalAfter - runningTotalBefore,
      itemsUpdated: successfulUpdates,
      itemsCreated,
      itemsSkipped,
      runningTotalBefore,
      runningTotalAfter,
      certifiedAmountChange
    }
  });

  return {
    success: errors.filter(e => e.severity === 'critical').length === 0,
    totalRowsProcessed: parsedData.rows.length,
    successfulUpdates,
    errors,
    warnings,
    summary: {
      totalValueChange: runningTotalAfter - runningTotalBefore,
      itemsUpdated: successfulUpdates,
      itemsCreated,
      itemsSkipped,
      runningTotalBefore,
      runningTotalAfter,
      certifiedAmountChange
    }
  };
}

function validateRow(
  row: BaseTrackerImportRow,
  rowNum: number,
  errors: ImportError[],
  warnings: ImportWarning[]
): boolean {
  let hasErrors = false;

  if (!row.description || row.description.trim().length === 0) {
    errors.push({
      row: rowNum,
      field: 'description',
      message: 'Description is required',
      severity: 'error'
    });
    hasErrors = true;
  }

  if (row.quantity !== undefined && (row.quantity < 0 || !isFinite(row.quantity))) {
    errors.push({
      row: rowNum,
      field: 'quantity',
      message: 'Invalid quantity value',
      severity: 'error'
    });
    hasErrors = true;
  }

  if (row.rate !== undefined && (row.rate < 0 || !isFinite(row.rate))) {
    errors.push({
      row: rowNum,
      field: 'rate',
      message: 'Invalid rate value',
      severity: 'error'
    });
    hasErrors = true;
  }

  if (row.currentClaim !== undefined && row.currentClaim < 0) {
    warnings.push({
      row: rowNum,
      field: 'currentClaim',
      message: 'Negative current claim amount detected',
      suggestion: 'Verify this is intentional (e.g., credit)'
    });
  }

  if (row.totalToDate !== undefined && row.previousCertified !== undefined) {
    const calculatedTotal = row.previousCertified + (row.currentClaim || 0);
    const difference = Math.abs(row.totalToDate - calculatedTotal);

    if (difference > 0.01) {
      warnings.push({
        row: rowNum,
        message: `Total to date (${row.totalToDate}) doesn't match previous + current (${calculatedTotal})`,
        suggestion: 'Check calculation accuracy'
      });
    }
  }

  return hasErrors;
}

async function createAuditLog(
  config: BaseTrackerImportConfig,
  parsedData: ParsedExcelData,
  result: BaseTrackerImportResult
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from('import_audit_logs').insert({
    project_id: config.projectId,
    award_approval_id: config.awardApprovalId,
    import_type: 'base_tracker',
    file_name: parsedData.sheetName,
    imported_by: user?.id,
    import_config: config,
    result: result,
    created_at: new Date().toISOString()
  });
}
