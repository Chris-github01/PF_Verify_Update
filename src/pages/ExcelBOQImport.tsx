import { useState, useRef } from 'react';
import { Upload, CheckCircle, XCircle, FileSpreadsheet, ArrowRight, AlertCircle, Download } from 'lucide-react';
import { detectExcelSheets, parseExcelSheet, normaliseExcelSheet } from '../lib/parsers/excelBOQParser';
import { autoMap, normaliseRows, type MapConfig } from '../lib/parsers/mappingGuard';
import type {
  ExcelSheetInfo,
  SheetPreview,
  NormalisedBOQRow,
  BOQValidationSummary,
  ColumnMapping,
} from '../types/import.types';

interface ExcelBOQImportProps {
  projectId: string;
  onComplete: (data: NormalisedBOQRow[]) => void;
  onCancel: () => void;
}

type Step = 'upload' | 'select-sheets' | 'map-columns' | 'validate' | 'confirm';

export default function ExcelBOQImport({ projectId, onComplete, onCancel }: ExcelBOQImportProps) {
  const [step, setStep] = useState<Step>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [supplierNames, setSupplierNames] = useState<Map<string, string>>(new Map());
  const [detectedSheets, setDetectedSheets] = useState<Map<string, ExcelSheetInfo[]>>(new Map());
  const [sheetPreviews, setSheetPreviews] = useState<Map<string, SheetPreview[]>>(new Map());
  const [normalisedData, setNormalisedData] = useState<NormalisedBOQRow[]>([]);
  const [validationSummaries, setValidationSummaries] = useState<BOQValidationSummary[]>([]);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const selectedFiles = Array.from(e.target.files).filter(f =>
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    );

    if (selectedFiles.length === 0) {
      alert('Please select Excel files (.xlsx or .xls)');
      return;
    }

    setFiles(selectedFiles);
    setProcessing(true);

    const newDetectedSheets = new Map<string, ExcelSheetInfo[]>();
    const newSupplierNames = new Map<string, string>();

    try {
      for (const file of selectedFiles) {
        console.log('[ExcelBOQImport] Processing file:', file.name);
        const sheets = await detectExcelSheets(file);
        newDetectedSheets.set(file.name, sheets);
        newSupplierNames.set(file.name, file.name.replace(/\.[^/.]+$/, ''));

        // Allow UI to breathe between files
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      setDetectedSheets(newDetectedSheets);
      setSupplierNames(newSupplierNames);
      setProcessing(false);
      setStep('select-sheets');
    } catch (error: any) {
      console.error('[ExcelBOQImport] Error processing files:', error);
      setProcessing(false);
      const errorMessage = error?.message || 'Unknown error';
      alert(`Failed to process Excel files: ${errorMessage}\n\nPlease ensure the file is a valid Excel file (.xlsx or .xls).`);
    }
  };

  const handleToggleSheet = (fileName: string, sheetName: string) => {
    setDetectedSheets(prev => {
      const newMap = new Map(prev);
      const sheets = newMap.get(fileName);
      if (sheets) {
        const updated = sheets.map(s =>
          s.name === sheetName ? { ...s, selected: !s.selected } : s
        );
        newMap.set(fileName, updated);
      }
      return newMap;
    });
  };

  const handleProceedToMapping = async () => {
    setProcessing(true);
    const newPreviews = new Map<string, SheetPreview[]>();

    try {
      for (const file of files) {
        const fileName = file.name;
        const sheets = detectedSheets.get(fileName) || [];
        const selectedSheets = sheets.filter(s => s.selected);
        const supplierName = supplierNames.get(fileName) || fileName;

        const previews: SheetPreview[] = [];
        for (const sheet of selectedSheets) {
          console.log('[ExcelBOQImport] Parsing sheet:', sheet.name);
          const preview = await parseExcelSheet(file, sheet.name, supplierName);
          previews.push(preview);

          // Allow UI to breathe between sheets
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        newPreviews.set(fileName, previews);
      }

      setSheetPreviews(newPreviews);
      setProcessing(false);
      setStep('map-columns');
    } catch (error: any) {
      console.error('[ExcelBOQImport] Error parsing sheets:', error);
      setProcessing(false);
      const errorMessage = error?.message || 'Unknown error';
      alert(`Failed to parse Excel sheets: ${errorMessage}\n\nPlease check the console for more details.`);
    }
  };

  const handleProceedToValidation = async () => {
    setProcessing(true);
    const allNormalisedData: NormalisedBOQRow[] = [];

    console.log('[ExcelBOQImport] Starting validation', {
      fileCount: files.length,
      previewsMap: Array.from(sheetPreviews.entries()).map(([k, v]) => ({ file: k, sheets: v.length }))
    });

    try {
      for (const file of files) {
        const fileName = file.name;
        const previews = sheetPreviews.get(fileName) || [];
        const supplierName = supplierNames.get(fileName) || fileName;

        console.log('[ExcelBOQImport] Processing file:', fileName, 'with', previews.length, 'sheet previews');

        for (const preview of previews) {
          console.log('[ExcelBOQImport] Normalising sheet:', preview.sheetName, 'with mapping:', preview.mapping);
          const data = await normaliseExcelSheet(file, preview.sheetName, supplierName, preview.mapping);
          console.log('[ExcelBOQImport] Got', data.length, 'rows from sheet:', preview.sheetName);
          allNormalisedData.push(...data);

          // Allow UI to breathe between sheets
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      console.log('[ExcelBOQImport] Total normalised data:', allNormalisedData.length);
      setNormalisedData(allNormalisedData);

      const summaries = computeValidationSummaries(allNormalisedData);
      console.log('[ExcelBOQImport] Validation summaries:', summaries);
      setValidationSummaries(summaries);

      setProcessing(false);
      setStep('validate');
    } catch (error: any) {
      console.error('[ExcelBOQImport] Validation failed:', error);
      setProcessing(false);

      // Show detailed error message
      const errorMsg = error.message || 'Unknown error';
      const helpText = errorMsg.includes('check Description/Qty/Unit/Rate mapping')
        ? '\n\nTip: Ensure your Rate column contains numeric values, not text like "Plasterboard Wall".'
        : '\n\nPlease go back and verify:\n• Column mappings are correct\n• The Excel file has a header row\n• There are data rows below the header';

      alert(`Import failed: ${errorMsg}${helpText}`);
    }
  };

  const handleConfirm = () => {
    console.log('[ExcelBOQImport] handleConfirm called with', normalisedData.length, 'rows');

    if (normalisedData.length === 0) {
      console.error('[ExcelBOQImport] ERROR: No data to confirm!');
      alert('Cannot save BOQ: No valid data was extracted. Please check:\n\n1. The Excel file contains data rows\n2. Column mappings are correct\n3. At least one sheet is selected');
      return;
    }

    // Filter out completely invalid rows (no description or no quantity)
    const validRows = normalisedData.filter(row => {
      const hasDescription = row.description && row.description.trim().length > 0;
      const hasQty = row.qty > 0 || row.total > 0;
      return hasDescription && hasQty;
    });

    console.log('[ExcelBOQImport] Valid rows after filtering:', validRows.length);

    if (validRows.length === 0) {
      console.error('[ExcelBOQImport] ERROR: No valid rows after filtering!');
      alert('Cannot save BOQ: All rows are invalid (missing description or quantity).');
      return;
    }

    onComplete(validRows);
  };

  const computeValidationSummaries = (data: NormalisedBOQRow[]): BOQValidationSummary[] => {
    const supplierMap = new Map<string, NormalisedBOQRow[]>();

    for (const row of data) {
      if (!supplierMap.has(row.supplier)) {
        supplierMap.set(row.supplier, []);
      }
      supplierMap.get(row.supplier)!.push(row);
    }

    return Array.from(supplierMap.entries()).map(([supplier, rows]) => {
      const sheets = new Set(rows.map(r => r.sourceSheet)).size;

      return {
        supplier,
        sheetsImported: sheets,
        linesDetected: rows.length,
        missingQty: rows.filter(r => r.flags.includes('MISSING QTY')).length,
        missingRate: rows.filter(r => r.flags.includes('MISSING RATE')).length,
        invalidUnit: rows.filter(r => r.flags.includes('MISSING UNIT')).length,
        totalSum: rows.reduce((sum, r) => sum + r.total, 0),
      };
    });
  };

  const getStepIndex = (currentStep: Step): number => {
    const steps: Step[] = ['upload', 'select-sheets', 'map-columns', 'validate', 'confirm'];
    return steps.indexOf(currentStep);
  };

  const totalSheets = Array.from(detectedSheets.values()).reduce((sum, sheets) => sum + sheets.length, 0);
  const selectedSheets = Array.from(detectedSheets.values()).reduce(
    (sum, sheets) => sum + sheets.filter(s => s.selected).length,
    0
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Import PQS / Engineer BOQ</h2>
        <p className="text-gray-600 mb-6">
          Upload multi-sheet Excel BOQs for automatic detection, normalization, and trade analysis
        </p>

        <div className="flex items-center gap-4 mb-8">
          {['Upload', 'Select Sheets', 'Map Columns', 'Validate', 'Confirm'].map((label, idx) => {
            const isActive = idx === getStepIndex(step);
            const isComplete = idx < getStepIndex(step);

            return (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    isComplete
                      ? 'bg-green-600 text-white'
                      : isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {isComplete ? <CheckCircle size={16} /> : idx + 1}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isActive ? 'text-blue-600' : isComplete ? 'text-green-600' : 'text-gray-500'
                  }`}
                >
                  {label}
                </span>
                {idx < 4 && <ArrowRight size={16} className="text-gray-300" />}
              </div>
            );
          })}
        </div>

        {step === 'upload' && (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
            >
              <Upload className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-lg font-medium text-gray-700 mb-2">Click to upload Excel BOQs</p>
              <p className="text-sm text-gray-500">Supports .xlsx and .xls files with multiple sheets</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                multiple={false}
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {processing && (
              <div className="text-center text-gray-600">
                <div className="animate-spin inline-block w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full mr-2"></div>
                Processing files...
              </div>
            )}
          </div>
        )}

        {step === 'select-sheets' && (
          <div style={{ padding: '20px 0' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
              <p style={{ margin: 0, fontSize: '18px', color: '#FFFFFF', fontWeight: 600 }}>
                Detected {totalSheets} sheets across {files.length} file(s). Select sheets to import:
              </p>
              <span style={{ color: '#7DD3FC', fontWeight: 700, fontSize: '14px' }}>{selectedSheets} selected</span>
            </div>

            {/* Steps (visual indicator) */}
            <div style={{ display: 'flex', gap: '14px', margin: '12px 0 20px', color: '#A7B0C3', fontSize: '13px' }}>
              <span style={{ color: '#10B981' }}>✔️ Upload</span>
              <span style={{ color: '#FFFFFF', fontWeight: 700 }}>2 Select Sheets</span>
              <span>3 Map Columns</span>
              <span>4 Validate</span>
              <span>5 Confirm</span>
            </div>

            {Array.from(detectedSheets.entries()).map(([fileName, sheets]) => (
              <div
                key={fileName}
                style={{
                  border: '1px solid #1F2A44',
                  borderRadius: '12px',
                  padding: '16px',
                  background: '#0E162B',
                  marginBottom: '16px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileSpreadsheet className="text-green-400" size={20} />
                    <span style={{ fontWeight: 800, color: '#FFFFFF', fontSize: '16px' }}>{fileName}</span>
                  </div>
                  <input
                    type="text"
                    value={supplierNames.get(fileName) || ''}
                    onChange={(e) => {
                      const newNames = new Map(supplierNames);
                      newNames.set(fileName, e.target.value);
                      setSupplierNames(newNames);
                    }}
                    placeholder="Supplier name"
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      background: '#FFFFFF',
                      color: '#111827',
                      fontSize: '14px',
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sheets.map(sheet => (
                    <label
                      key={sheet.name}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr auto',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        borderRadius: '8px',
                        border: sheet.isCandidate ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #162038',
                        background: sheet.isCandidate ? 'rgba(16, 185, 129, 0.08)' : '#0B1020',
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={sheet.selected}
                        onChange={() => handleToggleSheet(fileName, sheet.name)}
                        style={{
                          width: '20px',
                          height: '20px',
                          cursor: 'pointer',
                          accentColor: '#3B82F6',
                        }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, color: '#E2E8F0', fontSize: '14px' }}>{sheet.name}</span>
                        {sheet.isCandidate && (
                          <span style={{
                            fontSize: '11px',
                            background: '#10B981',
                            color: '#FFFFFF',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontWeight: 600
                          }}>
                            Recommended
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#94A3B8' }}>
                        {sheet.hasDescription && <CheckCircle size={14} className="text-green-400" />}
                        {sheet.hasQty && <span>Qty</span>}
                        {sheet.hasRate && <span>Rate</span>}
                        {sheet.hasTotal && <span>Total</span>}
                        <span style={{ color: '#6B7280' }}>{sheet.rowCount} rows</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={onCancel}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid #334155',
                  background: '#FFFFFF',
                  color: '#111827',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleProceedToMapping}
                disabled={selectedSheets === 0}
                style={{
                  padding: '12px 24px',
                  borderRadius: '10px',
                  border: '1px solid transparent',
                  background: selectedSheets > 0 ? '#3B82F6' : '#1E293B',
                  color: selectedSheets > 0 ? '#FFFFFF' : '#94A3B8',
                  fontWeight: 700,
                  cursor: selectedSheets > 0 ? 'pointer' : 'not-allowed',
                  fontSize: '15px',
                  boxShadow: selectedSheets > 0 ? '0 0 0 2px rgba(59,130,246,0.25)' : 'none',
                  transition: 'all 150ms ease',
                }}
              >
                Proceed to Mapping
              </button>
            </div>
          </div>
        )}

        {step === 'map-columns' && (
          <div className="space-y-4">
            <p className="text-gray-700 mb-4">Column mappings detected automatically. Review first 10 rows:</p>

            {Array.from(sheetPreviews.entries()).map(([fileName, previews]) => (
              <div key={fileName} className="space-y-4">
                {previews.map(preview => (
                  <div key={preview.sheetName} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">
                      {fileName} - {preview.sheetName}
                    </h4>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            {preview.headers.map((header, idx) => (
                              <th key={idx} className="px-2 py-1 text-left text-gray-600 border border-gray-200">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.sampleRows.slice(0, 10).map((row, rowIdx) => (
                            <tr key={rowIdx} className="border-t border-gray-200">
                              {row.map((cell, cellIdx) => (
                                <td key={cellIdx} className="px-2 py-1 text-gray-900 border border-gray-200">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 space-y-2">
                      <div className="text-xs text-gray-600">
                        {(() => {
                          // Build MapConfig from preview headers and mapping indices
                          const headers = preview.headers;
                          const map = autoMap(headers);
                          return `Mapped: Description="${map.description || 'N/A'}", Qty="${map.qty || 'N/A'}", Unit="${map.unit || 'Each'}", Rate="${map.rate || 'N/A'}", Amount="${map.amount || 'N/A'}"`;
                        })()}
                      </div>
                      {(() => {
                        // Validate preview rows using normaliseRows
                        const headers = preview.headers;
                        const map = autoMap(headers);
                        const previewRows = preview.sampleRows.map(row => {
                          const obj: Record<string, any> = {};
                          headers.forEach((header, idx) => {
                            obj[header] = row[idx];
                          });
                          return obj;
                        });
                        const { lines, reasons } = normaliseRows(previewRows, map);

                        if (reasons.length > 0) {
                          return (
                            <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                              <strong>⚠ Validation Warning:</strong> {reasons.join('; ')}
                            </div>
                          );
                        }
                        if (lines.length > 0) {
                          return (
                            <div className="text-xs text-green-600">
                              ✓ Preview valid: {lines.length} of {previewRows.length} rows parsed successfully
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStep('select-sheets')}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleProceedToValidation}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {processing ? 'Processing...' : 'Proceed to Validation'}
              </button>
            </div>
          </div>
        )}

        {step === 'validate' && (
          <div className="space-y-4">
            <p className="text-gray-700 mb-4">Validation complete. Review summary:</p>

            {validationSummaries.length === 0 ? (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-md mb-4">
                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                <div className="text-sm text-red-900">
                  <p className="font-semibold mb-1">No Data Found</p>
                  <p>
                    No valid rows were extracted from the Excel file. This usually means:
                  </p>
                  <ul className="list-disc ml-4 mt-2 space-y-1">
                    <li>Column mappings are incorrect</li>
                    <li>The header row was not detected properly</li>
                    <li>The data is in an unexpected format</li>
                  </ul>
                  <p className="mt-2">Please go back and check the column mappings.</p>
                </div>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Supplier</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Sheets</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Lines</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Missing Qty</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Missing Rate</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Invalid Unit</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Total Sum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {validationSummaries.map((summary, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">{summary.supplier}</td>
                      <td className="px-4 py-2 text-sm text-gray-600 text-center">{summary.sheetsImported}</td>
                      <td className="px-4 py-2 text-sm text-gray-900 text-center">{summary.linesDetected}</td>
                      <td className="px-4 py-2 text-sm text-amber-600 text-center">{summary.missingQty}</td>
                      <td className="px-4 py-2 text-sm text-amber-600 text-center">{summary.missingRate}</td>
                      <td className="px-4 py-2 text-sm text-amber-600 text-center">{summary.invalidUnit}</td>
                      <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                        ${summary.totalSum.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-1">Ready for Trade Analysis</p>
                <p>
                  All data has been normalized and validated. You can now proceed to analyze this data in the Trade
                  Analysis Report.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStep('map-columns')}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={normalisedData.length === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-md ${
                  normalisedData.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                <CheckCircle size={18} />
                Confirm & Proceed to Analysis
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
