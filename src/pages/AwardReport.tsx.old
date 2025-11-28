import { useState, useEffect, useRef } from 'react';
import { Award, TrendingUp, Shield, Download, FileText, Table as TableIcon, Printer, FolderOpen, ChevronDown, CheckCircle, Clipboard, AlertCircle, FileSpreadsheet, MoreHorizontal, RefreshCw, Copy, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ComparisonRow } from '../types/comparison.types';
import type { EqualisationMode } from '../types/equalisation.types';
import type { AwardSummary } from '../types/award.types';
import * as XLSX from 'xlsx';

interface Project {
  id: string;
  name: string;
  client: string | null;
  approved_quote_id: string | null;
}

interface AwardReportProps {
  projectId: string;
  reportId?: string;
  onToast?: (message: string, type: 'success' | 'error') => void;
  onNavigate?: (page: string) => void;
}

export default function AwardReport({ projectId, reportId, onToast, onNavigate }: AwardReportProps) {
  const [comparisonData, setComparisonData] = useState<ComparisonRow[]>([]);
  const [awardSummary, setAwardSummary] = useState<AwardSummary | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [equalisationMode, setEqualisationMode] = useState<EqualisationMode>('MODEL');
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportType, setExportType] = useState<'pdf' | 'excel'>('excel');
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [quotesMap, setQuotesMap] = useState<Map<string, string>>(new Map());
  const [showModeModal, setShowModeModal] = useState(false);
  const [generatingTracker, setGeneratingTracker] = useState(false);
  const [currentReportId, setCurrentReportId] = useState<string | null>(reportId || null);
  const [error, setError] = useState<string | null>(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showMoreActionsDropdown, setShowMoreActionsDropdown] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const moreActionsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProjects();
    if (reportId) {
      loadSavedReport(reportId);
    } else if (projectId) {
      loadLatestReport();
    } else {
      setLoading(false);
      setError('No project ID provided');
    }
  }, [reportId, projectId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProjectDropdown(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setShowExportDropdown(false);
      }
      if (moreActionsDropdownRef.current && !moreActionsDropdownRef.current.contains(event.target as Node)) {
        setShowMoreActionsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadProjects = async () => {
    try {
      const { data } = await supabase
        .from('projects')
        .select('id, name, client, approved_quote_id')
        .order('last_accessed_at', { ascending: false })
        .limit(10);

      if (data) {
        setProjects(data);
        const current = data.find(p => p.id === projectId);
        setCurrentProject(current || null);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const handleProjectSwitch = (id: string) => {
    window.location.href = `?project=${id}`;
  };

  const getSuggestedFolderPath = (): string => {
    const projectName = currentProject?.name || 'Unknown-Project';
    const sanitizedName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `05_Exports_Reports/VerifyPlus/${sanitizedName}/`;
  };

  const loadLatestReport = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: reportData, error: reportError } = await supabase
        .from('award_reports')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (reportError) {
        throw new Error('Failed to load report');
      }

      if (!reportData) {
        setError('No report found for this project. Generate one from the Reports Hub.');
        setLoading(false);
        return;
      }

      if (reportData.result_json) {
        setComparisonData(reportData.result_json.comparisonData || []);
        setAwardSummary(reportData.result_json.awardSummary || null);
        setAiAnalysis(reportData.result_json.aiAnalysis || null);
        if (reportData.params_json?.equalisationMode) {
          setEqualisationMode(reportData.params_json.equalisationMode);
        }
      }

      setCurrentReportId(reportData.id);

      const { data: quotesData } = await supabase
        .from('quotes')
        .select('id, supplier_name')
        .eq('project_id', reportData.project_id);

      if (quotesData) {
        const map = new Map<string, string>();
        quotesData.forEach(q => map.set(q.supplier_name, q.id));
        setQuotesMap(map);
      }
    } catch (error: any) {
      console.error('Error loading report:', error);
      setError(error.message || 'Failed to load report');
      onToast?.(error.message || 'Failed to load report', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadSavedReport = async (reportId: string) => {
    try {
      setLoading(true);
      setError(null);

      const { data: reportData, error: reportError } = await supabase
        .from('award_reports')
        .select('*')
        .eq('id', reportId)
        .maybeSingle();

      if (reportError) {
        throw new Error('Failed to load report');
      }

      if (!reportData) {
        throw new Error('Report not found');
      }

      if (reportData.result_json) {
        setComparisonData(reportData.result_json.comparisonData || []);
        setAwardSummary(reportData.result_json.awardSummary || null);
        setAiAnalysis(reportData.result_json.aiAnalysis || null);
        if (reportData.params_json?.equalisationMode) {
          setEqualisationMode(reportData.params_json.equalisationMode);
        }
      }

      setCurrentReportId(reportData.id);

      const { data: quotesData } = await supabase
        .from('quotes')
        .select('id, supplier_name')
        .eq('project_id', reportData.project_id);

      if (quotesData) {
        const map = new Map<string, string>();
        quotesData.forEach(q => map.set(q.supplier_name, q.id));
        setQuotesMap(map);
      }
    } catch (error: any) {
      console.error('Error loading report:', error);
      setError(error.message || 'Failed to load report');
      onToast?.(error.message || 'Failed to load report', 'error');
    } finally {
      setLoading(false);
    }
  };

  const regenerateReport = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('[Award Report] Regenerating report for project:', projectId);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compute_award_report`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      console.log('[Award Report] Calling function:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId,
          force: true,
        }),
      });

      console.log('[Award Report] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Award Report] Error response:', errorText);
        throw new Error(`Server returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('[Award Report] Response data:', result);

      if (!result || !result.reportId) {
        console.error('[Award Report] Invalid response:', result);
        throw new Error(result?.error || result?.message || 'No report ID returned from server');
      }

      setCurrentReportId(result.reportId);
      await loadSavedReport(result.reportId);
      setError(null);
      onToast?.('Report generated successfully', 'success');
    } catch (error: any) {
      console.error('Error regenerating report:', error);
      setError(error.message || 'Failed to regenerate report');
      onToast?.(error.message || 'Failed to regenerate report', 'error');
    } finally {
      setLoading(false);
    }
  };


  const handlePrint = () => {
    window.print();
  };

  const handleExportClick = (type: 'pdf' | 'excel') => {
    setExportType(type);
    setShowExportDialog(true);
  };

  const confirmExport = () => {
    setShowExportDialog(false);
    if (exportType === 'excel') {
      exportExcel();
    } else {
      exportPDF();
    }
  };

  const exportExcel = () => {
    if (!awardSummary) return;

    const wb = XLSX.utils.book_new();

    const summaryData = [
      ['Award Summary Report'],
      ['Generated:', new Date().toLocaleDateString()],
      ['Equalisation Mode:', awardSummary.equalisationMode],
      ['Total Systems:', awardSummary.totalSystems.toString()],
      [],
      ['Supplier', 'Adjusted Total', 'Risk Score', 'Coverage %', 'Items Quoted', 'Notes'],
      ...awardSummary.suppliers.map(s => [
        s.supplierName,
        s.adjustedTotal,
        s.riskScore,
        s.coveragePercent,
        s.itemsQuoted,
        s.notes.join('; '),
      ]),
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

    const recommendationsData = [
      ['Recommendations'],
      [],
      ['Type', 'Supplier', 'Reason'],
      ...awardSummary.recommendations.map(r => [
        r.type.replace('_', ' '),
        r.supplier.supplierName,
        r.reason,
      ]),
    ];

    const ws2 = XLSX.utils.aoa_to_sheet(recommendationsData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Recommendations');

    const matrixHeaders = ['System ID', 'System Label'];
    const suppliers = awardSummary.suppliers.map(s => s.supplierName);
    matrixHeaders.push(...suppliers);

    const systemMap = new Map<string, Map<string, number | null>>();
    comparisonData.forEach(row => {
      const key = `${row.systemId}|${row.systemLabel}`;
      if (!systemMap.has(key)) {
        systemMap.set(key, new Map());
      }
      systemMap.get(key)!.set(row.supplier, row.unitRate);
    });

    const matrixData = [matrixHeaders];
    systemMap.forEach((supplierRates, systemKey) => {
      const [systemId, systemLabel] = systemKey.split('|');
      const row = [systemId, systemLabel];
      suppliers.forEach(supplier => {
        const rate = supplierRates.get(supplier);
        row.push(rate !== null && rate !== undefined ? rate.toFixed(2) : '');
      });
      matrixData.push(row);
    });

    const ws3 = XLSX.utils.aoa_to_sheet(matrixData);
    XLSX.utils.book_append_sheet(wb, ws3, 'Matrix');

    const filename = `${projectId}_AwardReport.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const exportPDF = () => {
    handlePrint();
  };

  const exportItemizedComparisonToExcel = async () => {
    if (!awardSummary || comparisonData.length === 0) {
      onToast?.('No itemized comparison data available to export.', 'error');
      return;
    }

    try {
      const templatePath = '/templates/Itemized_Comparison_Global_1.xlsx';
      const response = await fetch(templatePath);

      if (!response.ok) {
        throw new Error('Failed to load template file');
      }

      const arrayBuffer = await response.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true });
      const ws = wb.Sheets[wb.SheetNames[0]];

      ws['A2'] = { t: 's', v: `Project: ${currentProject?.name || projectId}` };
      ws['A3'] = { t: 's', v: `Generated: ${new Date().toLocaleString()}` };

      const suppliers = awardSummary.suppliers;
      const startCol = 3;

      ws['!merges'] = [];

      for (let i = 0; i < suppliers.length; i++) {
        const supplierCol = startCol + (i * 2);
        const cellAddress = XLSX.utils.encode_cell({ r: 4, c: supplierCol });

        ws[cellAddress] = {
          t: 's',
          v: suppliers[i].supplierName,
          s: ws[cellAddress]?.s || {}
        };

        ws['!merges'].push({
          s: { r: 4, c: supplierCol },
          e: { r: 4, c: supplierCol + 1 }
        });

        const unitRateCell = XLSX.utils.encode_cell({ r: 5, c: supplierCol });
        const totalCell = XLSX.utils.encode_cell({ r: 5, c: supplierCol + 1 });

        ws[unitRateCell] = {
          t: 's',
          v: 'Unit Rate',
          s: ws[unitRateCell]?.s || {}
        };
        ws[totalCell] = {
          t: 's',
          v: 'Total',
          s: ws[totalCell]?.s || {}
        };
      }

      const dataStartRow = 6;
      const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 5, c: 2 } };

      comparisonData.forEach((row, idx) => {
        const rowNum = dataStartRow + idx;

        ws[XLSX.utils.encode_cell({ r: rowNum, c: 0 })] = {
          t: 's',
          v: row.description || ''
        };
        ws[XLSX.utils.encode_cell({ r: rowNum, c: 1 })] = {
          t: 'n',
          v: row.quantity || 0
        };
        ws[XLSX.utils.encode_cell({ r: rowNum, c: 2 })] = {
          t: 's',
          v: row.unit || ''
        };

        suppliers.forEach((supplier, supplierIdx) => {
          const supplierData = row.suppliers?.[supplier.supplierName];
          const unitRateCol = startCol + (supplierIdx * 2);
          const totalCol = unitRateCol + 1;

          if (supplierData && supplierData.unitPrice !== null && !isNaN(supplierData.unitPrice)) {
            ws[XLSX.utils.encode_cell({ r: rowNum, c: unitRateCol })] = {
              t: 'n',
              v: supplierData.unitPrice,
              z: '"$"#,##0.00'
            };
            ws[XLSX.utils.encode_cell({ r: rowNum, c: totalCol })] = {
              t: 'n',
              v: supplierData.total,
              z: '"$"#,##0.00'
            };
          } else {
            ws[XLSX.utils.encode_cell({ r: rowNum, c: unitRateCol })] = {
              t: 's',
              v: 'N/A'
            };
            ws[XLSX.utils.encode_cell({ r: rowNum, c: totalCol })] = {
              t: 's',
              v: 'N/A'
            };
          }
        });

        range.e.r = Math.max(range.e.r, rowNum);
        range.e.c = Math.max(range.e.c, startCol + (suppliers.length * 2) - 1);
      });

      ws['!ref'] = XLSX.utils.encode_range(range);

      const sanitizedProjectName = (currentProject?.name || 'Project').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Itemized_Comparison_${sanitizedProjectName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);

      onToast?.('Itemized comparison exported successfully', 'success');
    } catch (error) {
      console.error('Error exporting itemized comparison:', error);
      onToast?.('Failed to export itemized comparison', 'error');
    }
  };

  const handleApproveQuote = async (supplierName: string) => {
    const quoteId = quotesMap.get(supplierName);
    if (!quoteId) {
      onToast?.('Quote not found', 'error');
      return;
    }

    setProcessingAction(quoteId);
    try {
      const { error: projectError } = await supabase
        .from('projects')
        .update({
          approved_quote_id: quoteId,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId);

      if (projectError) {
        throw new Error(projectError.message);
      }

      const { error: quoteError } = await supabase
        .from('quotes')
        .update({
          status: 'accepted',
          updated_at: new Date().toISOString()
        })
        .eq('id', quoteId);

      if (quoteError) {
        throw new Error(quoteError.message);
      }

      onToast?.(`Approved ${supplierName}`, 'success');

      if (currentProject) {
        setCurrentProject({ ...currentProject, approved_quote_id: quoteId });
      }
      await loadProjects();
    } catch (error: any) {
      console.error('Error approving quote:', error);
      onToast?.(error.message || 'Failed to approve quote', 'error');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleCreateBaseTracker = () => {
    if (!currentProject?.approved_quote_id) {
      onToast?.('No approved quote selected', 'error');
      return;
    }
    setShowModeModal(true);
  };

  const handleGenerateBaseTracker = async (mode: 'append' | 'replace') => {
    setShowModeModal(false);
    setGeneratingTracker(true);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate_base_tracker`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId,
          mode,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to generate base tracker');
      }

      onToast?.(`Base Tracker created: ${result.rowsInserted} lines`, 'success');

      if (onNavigate) {
        onNavigate('base-tracker');
      }
    } catch (error: any) {
      console.error('Error generating base tracker:', error);
      onToast?.(error.message || 'Failed to generate base tracker', 'error');
    } finally {
      setGeneratingTracker(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading award report...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center max-w-2xl mx-auto mt-12">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileText className="w-8 h-8 text-blue-600" />
        </div>
        <p className="text-gray-900 text-lg font-semibold mb-2">No Award Report Available</p>
        <p className="text-gray-600 mb-6">{error}</p>
        <button
          onClick={regenerateReport}
          disabled={loading}
          className="btn-primary disabled:opacity-50"
        >
          <Award className="w-5 h-5" />
          {loading ? 'Generating Report...' : 'Generate Award Report'}
        </button>
      </div>
    );
  }

  if (!awardSummary || awardSummary.suppliers.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <p className="text-gray-500 text-lg">No data available.</p>
        <p className="text-gray-400 mt-2">No report data found. Please generate a report from the Reports Hub.</p>
      </div>
    );
  }

  const bestValue = awardSummary.recommendations.find(r => r.type === 'BEST_VALUE');
  const lowestRisk = awardSummary.recommendations.find(r => r.type === 'LOWEST_RISK');
  const balanced = awardSummary.recommendations.find(r => r.type === 'BALANCED');

  return (
    <div id="award-report-root" data-award-needs-project="true">
      <style>
        {`
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-report, #printable-report * {
              visibility: visible;
            }
            #printable-report {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
            }
            .no-print {
              display: none !important;
            }
            .print-break {
              page-break-after: always;
            }
          }
        `}
      </style>

      <div className="space-y-6">
        <div className="no-print">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Award Recommendation Report</h1>
              <p className="text-sm text-gray-600 mt-1">
                Generated {new Date(awardSummary.generatedAt).toLocaleString()}
              </p>
            </div>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
              >
                <FolderOpen size={16} />
                <span className="text-sm">{currentProject?.name || 'Select Project'}</span>
                <ChevronDown size={14} className={`transition-transform ${showProjectDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showProjectDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-2 max-h-80 overflow-y-auto">
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => {
                          setShowProjectDropdown(false);
                          if (project.id !== projectId) {
                            handleProjectSwitch(project.id);
                          }
                        }}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-gray-100 transition-colors ${
                          project.id === projectId ? 'bg-blue-50 text-blue-900 font-medium' : 'text-gray-700'
                        }`}
                      >
                        <div className="font-medium">{project.name}</div>
                        {project.client && (
                          <div className="text-xs text-gray-500">{project.client}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Report view</label>
                <div className="inline-flex rounded-lg border border-gray-300 bg-white shadow-sm overflow-hidden">
                  <button
                    className={`px-4 py-2 text-sm font-medium border-r border-gray-300 transition-colors ${
                      equalisationMode === 'MODEL'
                        ? 'bg-gray-800 text-white'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                    onClick={() => setEqualisationMode('MODEL')}
                  >
                    Model
                  </button>
                  <button
                    className={`px-4 py-2 text-sm font-medium border-r border-gray-300 transition-colors ${
                      equalisationMode === 'PEER_MEDIAN'
                        ? 'bg-gray-800 text-white'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                    onClick={() => setEqualisationMode('PEER_MEDIAN')}
                  >
                    Client
                  </button>
                  <button
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      equalisationMode === 'SIMPLE'
                        ? 'bg-gray-800 text-white'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                    onClick={() => setEqualisationMode('SIMPLE')}
                  >
                    Simple
                  </button>
                </div>
              </div>

              <button
                onClick={regenerateReport}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Recalculating...' : 'Recalculate report'}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative" ref={exportDropdownRef}>
                <button
                  onClick={() => setShowExportDropdown(!showExportDropdown)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                >
                  <Download size={18} />
                  Export report
                  <ChevronDown size={16} className={`transition-transform ${showExportDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showExportDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setShowExportDropdown(false);
                          handleExportClick('pdf');
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <Printer size={16} />
                        Export PDF report
                      </button>
                      <button
                        onClick={() => {
                          setShowExportDropdown(false);
                          handleExportClick('excel');
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <TableIcon size={16} />
                        Export Excel summary
                      </button>
                      <button
                        onClick={() => {
                          setShowExportDropdown(false);
                          exportItemizedComparisonToExcel();
                        }}
                        disabled={comparisonData.length === 0}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FileSpreadsheet size={16} />
                        Export itemized comparison
                      </button>
                      <button
                        onClick={() => {
                          setShowExportDropdown(false);
                          handlePrint();
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <Printer size={16} />
                        Print
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" ref={moreActionsDropdownRef}>
                <button
                  onClick={() => setShowMoreActionsDropdown(!showMoreActionsDropdown)}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <MoreHorizontal size={18} />
                  More actions
                  <ChevronDown size={16} className={`transition-transform ${showMoreActionsDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showMoreActionsDropdown && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setShowMoreActionsDropdown(false);
                          handleCreateBaseTracker();
                        }}
                        disabled={!currentProject?.approved_quote_id || generatingTracker}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Clipboard size={16} />
                        {generatingTracker ? 'Creating...' : 'Create contract baseline'}
                      </button>
                      <button
                        onClick={() => {
                          setShowMoreActionsDropdown(false);
                        }}
                        disabled
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send size={16} />
                        Send to Contract Manager
                      </button>
                      <button
                        onClick={() => {
                          setShowMoreActionsDropdown(false);
                        }}
                        disabled
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Copy size={16} />
                        Duplicate report
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {showModeModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Create Base Tracker
              </h3>

              <p className="text-sm text-gray-700 mb-6">
                Choose how to generate the base tracker from the approved quote:
              </p>

              <div className="space-y-3 mb-6">
                <button
                  onClick={() => handleGenerateBaseTracker('replace')}
                  className="w-full text-left p-4 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-semibold text-gray-900 mb-1">Replace</div>
                  <div className="text-sm text-gray-600">
                    Delete all existing base tracker items and create new ones from the approved quote
                  </div>
                </button>

                <button
                  onClick={() => handleGenerateBaseTracker('append')}
                  className="w-full text-left p-4 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-semibold text-gray-900 mb-1">Append</div>
                  <div className="text-sm text-gray-600">
                    Keep existing base tracker items and add new ones from the approved quote
                  </div>
                </button>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowModeModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showExportDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Export {exportType === 'pdf' ? 'PDF' : 'Excel'} Report
              </h3>

              <div className="mb-4">
                <p className="text-sm text-gray-700 mb-2">
                  <strong>Filename:</strong> {projectId}_AwardReport.{exportType === 'pdf' ? 'pdf' : 'xlsx'}
                </p>

                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-xs font-semibold text-blue-900 mb-1">Suggested Save Location:</p>
                  <p className="text-sm text-blue-800 font-mono break-all">
                    {getSuggestedFolderPath()}
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-6">
                {exportType === 'pdf'
                  ? 'The report will open in your browser\'s print dialog. Save as PDF from there.'
                  : 'The Excel file will be downloaded to your default downloads folder.'}
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowExportDialog(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmExport}
                  className={`px-4 py-2 text-white rounded-md transition-colors ${
                    exportType === 'pdf' ? 'bg-gray-600 hover:bg-gray-700' : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        <div id="printable-report" ref={printRef}>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="text-center mb-8 print:mb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Award Recommendation Report</h1>
              <p className="text-gray-600">Project Analysis & Supplier Evaluation</p>
              <p className="text-sm text-gray-500 mt-2">
                {new Date().toLocaleDateString()} | {awardSummary.totalSystems} Systems | {awardSummary.equalisationMode} Mode
              </p>
            </div>

            <div className="grid grid-cols-3 gap-6 mb-8 print:mb-6">
              <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border-2 border-blue-300">
                <div className="flex items-center gap-3 mb-3">
                  <Award className="text-blue-600" size={28} />
                  <h3 className="text-sm font-semibold text-blue-900 uppercase">Best Value</h3>
                </div>
                {bestValue && (
                  <>
                    <p className="text-2xl font-bold text-blue-900">{bestValue.supplier.supplierName}</p>
                    <p className="text-lg text-blue-800 mt-1">
                      ${bestValue.supplier.adjustedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-sm text-blue-700 mt-2">{bestValue.reason}</p>
                  </>
                )}
              </div>

              <div className="p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border-2 border-green-300">
                <div className="flex items-center gap-3 mb-3">
                  <Shield className="text-green-600" size={28} />
                  <h3 className="text-sm font-semibold text-green-900 uppercase">Lowest Risk</h3>
                </div>
                {lowestRisk && (
                  <>
                    <p className="text-2xl font-bold text-green-900">{lowestRisk.supplier.supplierName}</p>
                    <p className="text-lg text-green-800 mt-1">
                      Risk Score: {lowestRisk.supplier.riskScore.toFixed(1)}
                    </p>
                    <p className="text-sm text-green-700 mt-2">{lowestRisk.reason}</p>
                  </>
                )}
              </div>

              <div className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border-2 border-purple-300">
                <div className="flex items-center gap-3 mb-3">
                  <TrendingUp className="text-purple-600" size={28} />
                  <h3 className="text-sm font-semibold text-purple-900 uppercase">Balanced</h3>
                </div>
                {balanced && (
                  <>
                    <p className="text-2xl font-bold text-purple-900">{balanced.supplier.supplierName}</p>
                    <p className="text-lg text-purple-800 mt-1">
                      ${balanced.supplier.adjustedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-sm text-purple-700 mt-2">{balanced.reason}</p>
                  </>
                )}
              </div>
            </div>

            {aiAnalysis && (
              <div className="mb-8 print:mb-6 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-lg border-2 border-amber-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-amber-900">AI Analysis & Insights</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-white rounded-lg p-4 border border-amber-200">
                    <div className="text-sm text-gray-600 mb-1">Items Compared</div>
                    <div className="text-2xl font-bold text-gray-900">{aiAnalysis.totalItemsCompared || 0}</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-amber-200">
                    <div className="text-sm text-gray-600 mb-1">Matched Items</div>
                    <div className="text-2xl font-bold text-green-600">{aiAnalysis.matchedItems || 0}</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-amber-200">
                    <div className="text-sm text-gray-600 mb-1">Unmatched Items</div>
                    <div className="text-2xl font-bold text-blue-600">{aiAnalysis.unmatchedItems || 0}</div>
                  </div>
                </div>

                {aiAnalysis.priceVariances && (
                  <div className="bg-white rounded-lg p-4 border border-amber-200 mb-3">
                    <h3 className="font-semibold text-gray-900 mb-2">Price Variances</h3>
                    <p className="text-sm text-gray-700">{aiAnalysis.priceVariances}</p>
                  </div>
                )}

                {aiAnalysis.scopeGaps && (
                  <div className="bg-white rounded-lg p-4 border border-amber-200 mb-3">
                    <h3 className="font-semibold text-gray-900 mb-2">Scope Gaps</h3>
                    <p className="text-sm text-gray-700">{aiAnalysis.scopeGaps}</p>
                  </div>
                )}

                {aiAnalysis.recommendations && (
                  <div className="bg-white rounded-lg p-4 border border-amber-200">
                    <h3 className="font-semibold text-gray-900 mb-2">AI Recommendations</h3>
                    <p className="text-sm text-gray-700">{aiAnalysis.recommendations}</p>
                  </div>
                )}
              </div>
            )}

            <div className="mb-8 print:mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Executive Summary</h2>
              <div className="prose prose-sm max-w-none text-gray-700">
                <p className="mb-3">
                  Analysis of {awardSummary.suppliers.length} supplier quotes covering {awardSummary.totalSystems} passive fire protection systems.
                  Equalisation performed using <strong>{awardSummary.equalisationMode}</strong> methodology to ensure fair comparison.
                </p>
                <p>
                  The evaluation considers both financial value and risk factors including price variance from model rates,
                  scope coverage completeness, and data quality. Three recommendations are provided based on different prioritization strategies.
                </p>
              </div>
            </div>

            <div className="mb-8 print:mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Supplier Comparison</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border border-gray-300">
                        Supplier
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 border border-gray-300">
                        Adjusted Total
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 border border-gray-300">
                        Risk Score
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 border border-gray-300">
                        Coverage
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border border-gray-300">
                        Notes
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700 border border-gray-300 no-print">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {awardSummary.suppliers.map((supplier, idx) => {
                      const quoteId = quotesMap.get(supplier.supplierName);
                      const isApproved = currentProject?.approved_quote_id === quoteId;
                      const isProcessing = processingAction === quoteId;

                      return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold text-gray-900 border border-gray-300">
                          {supplier.supplierName}
                          {isApproved && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              Approved
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 border border-gray-300">
                          ${supplier.adjustedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold border border-gray-300 ${
                          supplier.riskScore <= 2 ? 'text-green-700' :
                          supplier.riskScore <= 5 ? 'text-amber-700' :
                          'text-red-700'
                        }`}>
                          {supplier.riskScore.toFixed(1)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 border border-gray-300">
                          {supplier.coveragePercent.toFixed(0)}%
                          <span className="text-xs text-gray-600 ml-1">
                            ({supplier.itemsQuoted}/{supplier.totalItems})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 border border-gray-300">
                          <ul className="text-xs space-y-0.5">
                            {supplier.notes.slice(0, 3).map((note, i) => (
                              <li key={i}>• {note}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="px-4 py-3 border border-gray-300 no-print">
                          <div className="flex items-center justify-center gap-2">
                            {isApproved ? (
                              <div className="flex items-center gap-1.5 text-green-600">
                                <CheckCircle size={20} className="fill-green-600" />
                                <span className="text-sm font-medium">Approved</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleApproveQuote(supplier.supplierName)}
                                disabled={isProcessing}
                                data-testid="btn-approve-quote"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                <CheckCircle size={14} />
                                {isProcessing ? 'Processing...' : 'Approve'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            </div>

            {comparisonData.length > 0 && (
              <div className="mb-8 print:mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Itemized Comparison</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Line-by-line comparison of all items across {awardSummary.suppliers.length} suppliers
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 border border-gray-300 sticky left-0 bg-gray-50 z-10">
                          Item Description
                        </th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-700 border border-gray-300">
                          Qty
                        </th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-700 border border-gray-300">
                          Unit
                        </th>
                        {awardSummary.suppliers.map((supplier, idx) => (
                          <th key={idx} colSpan={2} className="px-3 py-2 text-center font-semibold text-gray-700 border border-gray-300 bg-blue-50">
                            {supplier.supplierName}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 border border-gray-300 sticky left-0 bg-gray-50 z-10"></th>
                        <th className="px-3 py-2 border border-gray-300"></th>
                        <th className="px-3 py-2 border border-gray-300"></th>
                        {awardSummary.suppliers.map((_, idx) => (
                          <>
                            <th key={`${idx}-rate`} className="px-3 py-2 text-center text-xs font-medium text-gray-600 border border-gray-300 bg-blue-50">
                              Unit Rate
                            </th>
                            <th key={`${idx}-total`} className="px-3 py-2 text-center text-xs font-medium text-gray-600 border border-gray-300 bg-blue-50">
                              Total
                            </th>
                          </>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonData.map((row, idx) => {
                        const isUnmatched = row.matchStatus === 'unmatched';
                        return (
                          <tr key={idx} className={`hover:bg-gray-50 ${isUnmatched ? 'bg-amber-50' : ''}`}>
                            <td className="px-3 py-2 text-gray-900 border border-gray-300 sticky left-0 bg-white z-10">
                              <div className="font-medium">{row.description}</div>
                              {row.notes && (
                                <div className="text-xs text-amber-600 mt-1">{row.notes}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center text-gray-700 border border-gray-300">
                              {row.quantity}
                            </td>
                            <td className="px-3 py-2 text-center text-gray-700 border border-gray-300">
                              {row.unit}
                            </td>
                            {awardSummary.suppliers.map((supplier, supplierIdx) => {
                              const supplierData = row.suppliers[supplier.supplierName];
                              const hasData = supplierData && supplierData.unitPrice !== null;

                              return (
                                <>
                                  <td key={`${supplierIdx}-rate`} className={`px-3 py-2 text-right border border-gray-300 ${
                                    !hasData ? 'bg-gray-100 text-gray-400' : ''
                                  }`}>
                                    {hasData ? `$${supplierData.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'}
                                  </td>
                                  <td key={`${supplierIdx}-total`} className={`px-3 py-2 text-right font-medium border border-gray-300 ${
                                    !hasData ? 'bg-gray-100 text-gray-400' : ''
                                  }`}>
                                    {hasData ? `$${supplierData.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'}
                                  </td>
                                </>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr className="font-bold">
                        <td colSpan={3} className="px-3 py-3 text-right text-gray-900 border border-gray-300">
                          Subtotals:
                        </td>
                        {awardSummary.suppliers.map((supplier, idx) => (
                          <>
                            <td key={`${idx}-spacer`} className="border border-gray-300"></td>
                            <td key={`${idx}-total`} className="px-3 py-3 text-right text-gray-900 border border-gray-300">
                              ${supplier.adjustedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Risk Scoring Methodology</h2>
              <div className="text-xs text-gray-600 space-y-1">
                <p>• <strong>+1 point</strong> per RED variance cell (&gt;20% from model rate)</p>
                <p>• <strong>+0.5 points</strong> per AMBER variance cell (10-20% from model rate)</p>
                <p>• <strong>+1 point</strong> per missing scope item requiring equalisation</p>
                <p>• <strong>+1 point</strong> if &gt;10% of items have low mapping confidence (&lt;0.7)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
