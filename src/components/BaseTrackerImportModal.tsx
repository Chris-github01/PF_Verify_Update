import { useState, useRef } from 'react';
import { X, Upload, AlertCircle, CheckCircle, FileSpreadsheet, AlertTriangle, TrendingUp, Info } from 'lucide-react';
import { parseExcelFile, processBaseTrackerImport } from '../lib/import/baseTrackerImporter';
import type {
  BaseTrackerImportConfig,
  BaseTrackerImportResult,
  ParsedExcelData
} from '../types/baseTrackerImport.types';

interface BaseTrackerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  awardApprovalId: string;
  supplierId: string;
  onImportComplete?: (result: BaseTrackerImportResult) => void;
}

export default function BaseTrackerImportModal({
  isOpen,
  onClose,
  projectId,
  awardApprovalId,
  supplierId,
  onImportComplete
}: BaseTrackerImportModalProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'configure' | 'processing' | 'complete'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedExcelData | null>(null);
  const [config, setConfig] = useState<BaseTrackerImportConfig>({
    projectId,
    awardApprovalId,
    supplierId,
    period: new Date().toISOString().slice(0, 7),
    version: 1,
    importMode: 'incremental',
    validateOnly: false,
    autoMatchItems: true,
    createMissingItems: false
  });
  const [result, setResult] = useState<BaseTrackerImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);

    try {
      const parsed = await parseExcelFile(selectedFile);
      setParsedData(parsed);
      setStep('preview');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      if (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls')) {
        handleFileSelect(droppedFile);
      } else {
        setError('Please select an Excel file (.xlsx or .xls)');
      }
    }
  };

  const handleProcessImport = async () => {
    if (!parsedData) return;

    setStep('processing');
    setError(null);

    try {
      const importResult = await processBaseTrackerImport(parsedData, config);
      setResult(importResult);
      setStep('complete');

      if (onImportComplete) {
        onImportComplete(importResult);
      }
    } catch (err: any) {
      setError(err.message);
      setStep('configure');
    }
  };

  const handleClose = () => {
    setStep('upload');
    setFile(null);
    setParsedData(null);
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-700">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">Import Base Tracker</h2>
            <p className="text-sm text-gray-400 mt-1">
              Upload Excel file to update running totals
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div>
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-gray-600 rounded-lg p-12 text-center hover:border-blue-500 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                <p className="text-lg font-medium text-white mb-2">
                  Drop Excel file here or click to browse
                </p>
                <p className="text-sm text-gray-400">
                  Supports .xlsx and .xls files
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) handleFileSelect(selectedFile);
                  }}
                  className="hidden"
                />
              </div>

              {error && (
                <div className="mt-4 bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-300">{error}</div>
                </div>
              )}

              <div className="mt-6 bg-blue-900/20 border border-blue-500/50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-300">
                    <p className="font-medium mb-2">Import Requirements:</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-300/80">
                      <li>Excel file must contain item descriptions</li>
                      <li>Column headers will be automatically detected</li>
                      <li>Supported columns: Description, Quantity, Rate, Current Claim, Total to Date</li>
                      <li>Items are matched by description to existing baseline</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'preview' && parsedData && (
            <div>
              <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
                <h3 className="text-lg font-semibold text-white mb-3">File Preview</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">File:</span>
                    <span className="text-white ml-2">{file?.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Sheet:</span>
                    <span className="text-white ml-2">{parsedData.sheetName}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Total Rows:</span>
                    <span className="text-white ml-2">{parsedData.totalRows}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Detected Columns:</span>
                    <span className="text-white ml-2">
                      {Object.keys(parsedData.detectedColumns).length}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-sm text-gray-400 mb-2">Detected Columns:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(parsedData.detectedColumns).map(col => (
                      <span
                        key={col}
                        className="px-2 py-1 bg-blue-900/30 text-blue-300 rounded text-xs border border-blue-500/30"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-gray-900/50 rounded-lg p-4 mb-4 max-h-64 overflow-y-auto">
                <h3 className="text-lg font-semibold text-white mb-3">Sample Data (First 5 Rows)</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-800">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-300">#</th>
                        <th className="px-3 py-2 text-left text-gray-300">Description</th>
                        <th className="px-3 py-2 text-right text-gray-300">Qty</th>
                        <th className="px-3 py-2 text-right text-gray-300">Rate</th>
                        <th className="px-3 py-2 text-right text-gray-300">Current</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.rows.slice(0, 5).map((row, idx) => (
                        <tr key={idx} className="border-t border-gray-700">
                          <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                          <td className="px-3 py-2 text-white">{row.description}</td>
                          <td className="px-3 py-2 text-right text-gray-300">{row.quantity?.toFixed(2) || '-'}</td>
                          <td className="px-3 py-2 text-right text-gray-300">${row.rate?.toFixed(2) || '-'}</td>
                          <td className="px-3 py-2 text-right text-gray-300">${row.currentClaim?.toFixed(2) || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 'configure' && (
            <div className="space-y-4">
              <div className="bg-gray-900/50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-4">Import Configuration</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Import Mode
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setConfig({ ...config, importMode: 'incremental' })}
                        className={`p-3 rounded-lg border transition-all ${
                          config.importMode === 'incremental'
                            ? 'bg-blue-900/30 border-blue-500 text-white'
                            : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        <p className="font-medium">Incremental</p>
                        <p className="text-xs mt-1 opacity-80">Update existing items only</p>
                      </button>
                      <button
                        onClick={() => setConfig({ ...config, importMode: 'full_refresh' })}
                        className={`p-3 rounded-lg border transition-all ${
                          config.importMode === 'full_refresh'
                            ? 'bg-blue-900/30 border-blue-500 text-white'
                            : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        <p className="font-medium">Full Refresh</p>
                        <p className="text-xs mt-1 opacity-80">Replace all data</p>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="createMissing"
                      checked={config.createMissingItems}
                      onChange={(e) => setConfig({ ...config, createMissingItems: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700"
                    />
                    <label htmlFor="createMissing" className="text-sm text-gray-300">
                      Create missing items automatically
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="validateOnly"
                      checked={config.validateOnly}
                      onChange={(e) => setConfig({ ...config, validateOnly: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700"
                    />
                    <label htmlFor="validateOnly" className="text-sm text-gray-300">
                      Validate only (don't import)
                    </label>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-300">{error}</div>
                </div>
              )}
            </div>
          )}

          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mb-4"></div>
              <p className="text-lg font-medium text-white">Processing import...</p>
              <p className="text-sm text-gray-400 mt-2">This may take a moment</p>
            </div>
          )}

          {step === 'complete' && result && (
            <div>
              <div className={`rounded-lg p-6 mb-4 ${
                result.success
                  ? 'bg-green-900/20 border border-green-500/50'
                  : 'bg-orange-900/20 border border-orange-500/50'
              }`}>
                <div className="flex items-center gap-3 mb-4">
                  {result.success ? (
                    <CheckCircle className="w-8 h-8 text-green-400" />
                  ) : (
                    <AlertTriangle className="w-8 h-8 text-orange-400" />
                  )}
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {result.success ? 'Import Successful' : 'Import Completed with Warnings'}
                    </h3>
                    <p className="text-sm text-gray-300 mt-1">
                      {result.successfulUpdates} of {result.totalRowsProcessed} items processed
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="bg-gray-900/50 rounded-lg p-3">
                    <p className="text-sm text-gray-400">Items Updated</p>
                    <p className="text-2xl font-bold text-white mt-1">{result.summary.itemsUpdated}</p>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg p-3">
                    <p className="text-sm text-gray-400">Items Created</p>
                    <p className="text-2xl font-bold text-white mt-1">{result.summary.itemsCreated}</p>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg p-3">
                    <p className="text-sm text-gray-400">Items Skipped</p>
                    <p className="text-2xl font-bold text-white mt-1">{result.summary.itemsSkipped}</p>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg p-3">
                    <p className="text-sm text-gray-400">Value Change</p>
                    <p className="text-2xl font-bold text-white mt-1 flex items-center gap-1">
                      <TrendingUp className="w-5 h-5 text-green-400" />
                      ${Math.abs(result.summary.totalValueChange).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-red-300 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Errors ({result.errors.length})
                  </h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {result.errors.map((error, idx) => (
                      <div key={idx} className="text-sm text-red-300">
                        Row {error.row}: {error.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.warnings.length > 0 && (
                <div className="bg-orange-900/20 border border-orange-500/50 rounded-lg p-4">
                  <h4 className="font-semibold text-orange-300 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Warnings ({result.warnings.length})
                  </h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {result.warnings.slice(0, 10).map((warning, idx) => (
                      <div key={idx} className="text-sm text-orange-300">
                        Row {warning.row}: {warning.message}
                      </div>
                    ))}
                    {result.warnings.length > 10 && (
                      <p className="text-sm text-orange-400 italic">
                        And {result.warnings.length - 10} more warnings...
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-gray-700">
          {step === 'upload' && (
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep('configure')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Continue
              </button>
            </>
          )}

          {step === 'configure' && (
            <>
              <button
                onClick={() => setStep('preview')}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleProcessImport}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {config.validateOnly ? 'Validate' : 'Import Data'}
              </button>
            </>
          )}

          {step === 'complete' && (
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors ml-auto"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
