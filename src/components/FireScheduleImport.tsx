import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Download, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { detectScheduleSection, extractScheduleRows, validateScheduleRows, type ParsedScheduleRow } from '../lib/parsers/fireScheduleParser';
import type { FireEngineerSchedule, FireScheduleImportResult } from '../types/boq.types';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface FireScheduleImportProps {
  projectId: string;
  moduleKey: 'passive_fire';
  onImportComplete?: (result: FireScheduleImportResult) => void;
}

export default function FireScheduleImport({ projectId, moduleKey, onImportComplete }: FireScheduleImportProps) {
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [pdfText, setPdfText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedScheduleRow[]>([]);
  const [validation, setValidation] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      alert('Please select a PDF file');
      return;
    }

    setUploading(true);
    setFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }

      setPdfText(fullText);
      await parsePDF(fullText, file.name);
    } catch (error) {
      console.error('Error reading PDF:', error);
      alert('Failed to read PDF file. Please ensure it is a valid PDF.');
    } finally {
      setUploading(false);
    }
  };

  const parsePDF = async (text: string, filename: string) => {
    setParsing(true);

    try {
      const detection = detectScheduleSection(text);

      if (!detection.found || detection.startPage === null || detection.endPage === null) {
        alert('No passive fire schedule section found in this PDF. Please ensure the PDF contains a section titled "Passive Fire Schedule", "Appendix A", or similar.');
        setParsing(false);
        return;
      }

      const rows = extractScheduleRows(text, detection.startPage, detection.endPage);

      if (rows.length === 0) {
        alert('No schedule rows could be extracted. The PDF may have a non-standard format.');
        setParsing(false);
        return;
      }

      const validationResults = validateScheduleRows(rows);

      setParsedRows(rows);
      setValidation(validationResults);
      setShowPreview(true);
    } catch (error) {
      console.error('Error parsing PDF:', error);
      alert('Failed to parse PDF. The schedule format may not be supported.');
    } finally {
      setParsing(false);
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
        average_confidence: validation.averageConfidence,
        low_confidence_count: validation.lowConfidenceCount,
      };

      alert(`Successfully imported ${parsedRows.length} schedule rows with ${(validation.averageConfidence * 100).toFixed(1)}% average confidence.`);

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
    setPdfText('');
    setFileName('');
    setParsedRows([]);
    setValidation(null);
    setShowPreview(false);
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
              The system will automatically detect and extract the schedule section.
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
                  {uploading ? 'Reading PDF...' : 'Parsing Schedule...'}
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
      {showPreview && validation && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Total Rows</div>
              <div className="text-2xl font-bold text-white">{validation.totalRows}</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Avg Confidence</div>
              <div className={`text-2xl font-bold ${getConfidenceColor(validation.averageConfidence)}`}>
                {(validation.averageConfidence * 100).toFixed(1)}%
              </div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Low Confidence</div>
              <div className="text-2xl font-bold text-yellow-400">{validation.lowConfidenceCount}</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Missing Fields</div>
              <div className="text-2xl font-bold text-red-400">
                {validation.missingCriticalFields.solution_id + validation.missingCriticalFields.frr_rating + validation.missingCriticalFields.service_size}
              </div>
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
