import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Download, X, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { FireEngineerSchedule, FireScheduleImportResult } from '../types/boq.types';

interface FireScheduleImportProps {
  projectId: string;
  moduleKey: 'passive_fire';
  onImportComplete?: (result: FireScheduleImportResult) => void;
}

interface ParsedScheduleRow {
  solution_id: string | null;
  system_classification: string | null;
  substrate: string | null;
  orientation: string | null;
  frr_rating: string | null;
  service_type: string | null;
  service_size_text: string | null;
  service_size_min_mm: number | null;
  service_size_max_mm: number | null;
  insulation_type: string | null;
  insulation_thickness_mm: number | null;
  test_reference: string | null;
  notes: string | null;
  raw_text: string;
  parse_confidence: number;
  page_number: number;
  row_index: number;
}

interface ParseResponse {
  success: boolean;
  rows: ParsedScheduleRow[];
  metadata: {
    total_rows: number;
    average_confidence: number;
    low_confidence_count: number;
    parsing_notes: string;
  };
  error?: string;
}

export default function FireScheduleImport({ projectId, moduleKey, onImportComplete }: FireScheduleImportProps) {
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedScheduleRow[]>([]);
  const [metadata, setMetadata] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      alert('Please select a PDF file');
      return;
    }

    setUploading(true);
    setParsing(true);
    setFileName(file.name);
    setParseError('');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      await parsePDFWithOpenAI(base64, file.name);
    } catch (error) {
      console.error('Error reading PDF:', error);
      setParseError('Failed to read PDF file. Please ensure it is a valid PDF.');
      alert('Failed to read PDF file. Please ensure it is a valid PDF.');
    } finally {
      setUploading(false);
      setParsing(false);
    }
  };

  const parsePDFWithOpenAI = async (pdfBase64: string, filename: string) => {
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse_fire_schedule`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          pdfBase64,
          fileName: filename,
          projectId
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} ${errorText}`);
      }

      const result: ParseResponse = await response.json();

      if (!result.success || !result.rows || result.rows.length === 0) {
        setParseError(result.error || 'No schedule rows could be extracted. The PDF may not contain a valid fire schedule.');
        alert('No schedule rows found. Please ensure the PDF contains a Passive Fire Schedule section.');
        return;
      }

      setParsedRows(result.rows);
      setMetadata(result.metadata);
      setShowPreview(true);
    } catch (error) {
      console.error('Error parsing PDF with OpenAI:', error);
      setParseError(error instanceof Error ? error.message : 'Unknown error');
      alert('Failed to parse PDF. Please try again or contact support if the issue persists.');
    }
  };

  const handleConfirmImport = async () => {
    if (parsedRows.length === 0) return;

    setImporting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const scheduleData = {
        project_id: projectId,
        module_key: moduleKey,
        source_file_name: fileName,
        imported_by_user_id: user?.id,
        is_active: true,
      };

      const { data: schedule, error: scheduleError } = await supabase
        .from('fire_engineer_schedules')
        .insert(scheduleData)
        .select()
        .single();

      if (scheduleError) throw scheduleError;

      const rowsData = parsedRows.map(row => ({
        schedule_id: schedule.id,
        page_number: row.page_number,
        row_index: row.row_index,
        solution_id: row.solution_id,
        system_classification: row.system_classification,
        substrate: row.substrate,
        orientation: row.orientation,
        frr_rating: row.frr_rating,
        service_type: row.service_type,
        service_size_text: row.service_size_text,
        service_size_min_mm: row.service_size_min_mm,
        service_size_max_mm: row.service_size_max_mm,
        insulation_type: row.insulation_type,
        insulation_thickness_mm: row.insulation_thickness_mm,
        test_reference: row.test_reference,
        notes: row.notes,
        raw_text: row.raw_text,
        parse_confidence: row.parse_confidence,
      }));

      const { error: rowsError } = await supabase
        .from('fire_engineer_schedule_rows')
        .insert(rowsData);

      if (rowsError) throw rowsError;

      await supabase
        .from('projects')
        .update({
          fire_schedule_imported: true,
          fire_schedule_imported_at: new Date().toISOString()
        })
        .eq('id', projectId);

      const result: FireScheduleImportResult = {
        schedule_id: schedule.id,
        rows_imported: parsedRows.length,
        average_confidence: metadata.average_confidence,
        low_confidence_count: metadata.low_confidence_count,
      };

      alert(`Successfully imported ${parsedRows.length} schedule rows with ${(metadata.average_confidence * 100).toFixed(1)}% average confidence.`);

      if (onImportComplete) {
        onImportComplete(result);
      }

      resetImport();
    } catch (error) {
      console.error('Error importing schedule:', error);
      alert('Failed to import schedule. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setFileName('');
    setParsedRows([]);
    setMetadata(null);
    setShowPreview(false);
    setParseError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getConfidenceBg = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500/20';
    if (confidence >= 0.6) return 'bg-yellow-500/20';
    return 'bg-red-500/20';
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      {!showPreview && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500/20 rounded-lg mb-4">
              <Upload className="text-orange-400" size={32} />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Import Fire Engineer Schedule</h3>
            <p className="text-slate-400 mb-6 max-w-2xl mx-auto">
              Upload a PDF containing the Passive Fire Schedule (Appendix A, Fire Stopping Schedule, etc.).
              <span className="flex items-center justify-center gap-2 mt-2 text-purple-400">
                <Sparkles size={16} />
                AI-powered extraction using OpenAI GPT-4 Vision
              </span>
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || parsing}
              className="px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
            >
              {uploading || parsing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  {uploading ? 'Reading PDF...' : 'AI Analyzing Schedule...'}
                </>
              ) : (
                <>
                  <FileText size={20} />
                  Select PDF File
                </>
              )}
            </button>

            {fileName && (
              <p className="mt-4 text-sm text-slate-400">
                Selected: <span className="text-white font-medium">{fileName}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Preview Section */}
      {showPreview && metadata && (
        <div className="space-y-6">
          {/* AI Processing Banner */}
          <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <Sparkles className="text-purple-400" size={24} />
              </div>
              <div>
                <div className="text-white font-medium">AI-Powered Schedule Extraction</div>
                <div className="text-sm text-slate-400 mt-1">
                  {metadata.parsing_notes || 'OpenAI GPT-4 Vision analyzed your fire schedule and extracted structured data with high accuracy.'}
                </div>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Total Rows Detected</div>
              <div className="text-2xl font-bold text-white">{metadata.total_rows}</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Avg Parse Quality</div>
              <div className={`text-2xl font-bold ${getConfidenceColor(metadata.average_confidence)}`}>
                {(metadata.average_confidence * 100).toFixed(1)}%
              </div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Needs Review</div>
              <div className="text-2xl font-bold text-yellow-400">{metadata.low_confidence_count}</div>
            </div>
          </div>

          {/* Parsed Rows Table */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Parsed Schedule Rows</h3>
              <button
                onClick={resetImport}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-900/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Confidence</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Solution ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">System</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">FRR Rating</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Service Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Size</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Substrate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {parsedRows.slice(0, 50).map((row, index) => (
                    <tr key={index} className="hover:bg-slate-700/30">
                      <td className="px-4 py-3">
                        <div className={`inline-flex items-center gap-2 px-2 py-1 rounded ${getConfidenceBg(row.parse_confidence)}`}>
                          {row.parse_confidence >= 0.7 ? (
                            <CheckCircle size={14} className="text-green-400" />
                          ) : (
                            <AlertTriangle size={14} className="text-yellow-400" />
                          )}
                          <span className={`text-sm font-medium ${getConfidenceColor(row.parse_confidence)}`}>
                            {(row.parse_confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-white">{row.solution_id || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.system_classification || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.frr_rating || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.service_type || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.service_size_text || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.substrate || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {parsedRows.length > 50 && (
              <div className="p-4 border-t border-slate-700 text-center text-sm text-slate-400">
                Showing first 50 of {parsedRows.length} rows
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-4">
            <button
              onClick={resetImport}
              className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={importing}
              className="px-6 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
            >
              {importing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Importing...
                </>
              ) : (
                <>
                  <CheckCircle size={20} />
                  Confirm & Import {parsedRows.length} Rows
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
