import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Download, MoreHorizontal, RefreshCw, ChevronDown, Award, Shield, TrendingUp, BarChart3, Printer, FileSpreadsheet, Trash2, Edit3, AlertCircle, CheckCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ComparisonRow } from '../types/comparison.types';
import type { EqualisationMode } from '../types/equalisation.types';
import type { AwardSummary } from '../types/award.types';
import * as XLSX from 'xlsx';
import type { DashboardMode } from '../App';

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
  dashboardMode?: DashboardMode;
  preselectedQuoteIds?: string[];
}

type ReportView = 'MODEL' | 'PEER_MEDIAN' | 'SIMPLE';

export default function AwardReport({
  projectId,
  reportId,
  onToast,
  onNavigate,
  dashboardMode = 'original',
  preselectedQuoteIds = []
}: AwardReportProps) {
  const [comparisonData, setComparisonData] = useState<ComparisonRow[]>([]);
  const [awardSummary, setAwardSummary] = useState<AwardSummary | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [reportView, setReportView] = useState<ReportView>('MODEL');
  const [loading, setLoading] = useState(true);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showMoreDropdown, setShowMoreDropdown] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [currentReportId, setCurrentReportId] = useState<string | null>(reportId || null);
  const [reportTimestamp, setReportTimestamp] = useState<string>('');
  const [showItemizedDetails, setShowItemizedDetails] = useState(false);
  const [quotesMap, setQuotesMap] = useState<Map<string, string>>(new Map());

  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const moreDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProjectInfo();
    if (reportId) {
      loadSavedReport(reportId);
    } else {
      loadLatestReport();
    }
  }, [reportId, projectId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setShowExportDropdown(false);
      }
      if (moreDropdownRef.current && !moreDropdownRef.current.contains(event.target as Node)) {
        setShowMoreDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadProjectInfo = async () => {
    try {
      const { data } = await supabase
        .from('projects')
        .select('id, name, client, approved_quote_id')
        .eq('id', projectId)
        .maybeSingle();

      if (data) {
        setCurrentProject(data);
      }
    } catch (error) {
      console.error('Error loading project:', error);
    }
  };

  const loadLatestReport = async () => {
    try {
      setLoading(true);

      const { data: reportData, error: reportError } = await supabase
        .from('award_reports')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (reportError || !reportData) {
        throw new Error('No report found');
      }

      if (reportData.result_json) {
        setComparisonData(reportData.result_json.comparisonData || []);
        setAwardSummary(reportData.result_json.awardSummary || null);
        setAiAnalysis(reportData.result_json.aiAnalysis || null);
        if (reportData.params_json?.equalisationMode) {
          setReportView(reportData.params_json.equalisationMode);
        }
      }

      setCurrentReportId(reportData.id);
      setReportTimestamp(reportData.created_at);

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
      onToast?.(error.message || 'Failed to load report', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadSavedReport = async (reportId: string) => {
    try {
      setLoading(true);
      console.log('🔍 Loading saved report:', reportId);

      const { data: reportData, error: reportError } = await supabase
        .from('award_reports')
        .select('*')
        .eq('id', reportId)
        .maybeSingle();

      console.log('📊 Report query result:', { reportData, reportError });

      if (reportError) {
        console.error('❌ Report query error:', reportError);
        throw new Error(`Report query failed: ${reportError.message || JSON.stringify(reportError)}`);
      }

      if (!reportData) {
        console.error('❌ No report data returned for ID:', reportId);
        throw new Error(`Report not found with ID: ${reportId}. It may have been deleted or you may not have permission to view it.`);
      }

      if (reportData.result_json) {
        setComparisonData(reportData.result_json.comparisonData || []);
        setAwardSummary(reportData.result_json.awardSummary || null);
        setAiAnalysis(reportData.result_json.aiAnalysis || null);
        if (reportData.params_json?.equalisationMode) {
          setReportView(reportData.params_json.equalisationMode);
        }
      }

      setCurrentReportId(reportData.id);
      setReportTimestamp(reportData.created_at);

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
      onToast?.(error.message || 'Failed to load report', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compute_award_report`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId,
          force: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate report');
      }

      const result = await response.json();

      if (result.reportId) {
        await loadSavedReport(result.reportId);
        onToast?.('Report recalculated successfully', 'success');
      }
    } catch (error: any) {
      console.error('Error recalculating:', error);
      onToast?.(error.message || 'Failed to recalculate report', 'error');
    } finally {
      setRecalculating(false);
    }
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

      setShowExportDropdown(false);
      onToast?.('Itemized comparison exported successfully', 'success');
    } catch (error) {
      console.error('Error exporting itemized comparison:', error);
      onToast?.('Failed to export itemized comparison', 'error');
    }
  };

  const handlePrint = () => {
    setShowExportDropdown(false);
    window.print();
  };

  const handleApproveQuote = async (supplierName: string) => {
    const quoteId = quotesMap.get(supplierName);
    if (!quoteId) {
      onToast?.('Quote not found', 'error');
      return;
    }

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
    } catch (error: any) {
      console.error('Error approving quote:', error);
      onToast?.(error.message || 'Failed to approve quote', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!awardSummary || awardSummary.suppliers.length === 0) {
    return (
      <div className="p-8">
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Award className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 text-lg font-semibold mb-2">No Award Report Available</p>
          <p className="text-gray-600">Generate a report from the Reports Hub to view analysis.</p>
        </div>
      </div>
    );
  }

  const bestValue = awardSummary.recommendations.find(r => r.type === 'BEST_VALUE');
  const lowestRisk = awardSummary.recommendations.find(r => r.type === 'LOWEST_RISK');
  const balanced = awardSummary.recommendations.find(r => r.type === 'BALANCED');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-NZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getViewLabel = (view: ReportView) => {
    switch(view) {
      case 'MODEL': return 'Model';
      case 'PEER_MEDIAN': return 'Client';
      case 'SIMPLE': return 'Simple';
    }
  };

  const criticalGaps = aiAnalysis?.gapsAndRisks?.filter((g: any) => g.severity === 'HIGH') || [];
  const nonCriticalGaps = aiAnalysis?.gapsAndRisks?.filter((g: any) => g.severity !== 'HIGH') || [];

  return (
    <div className="min-h-screen bg-gray-50">
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
              padding: 20px;
            }
            .no-print {
              display: none !important;
            }

            @page {
              margin: 0.75in;
              size: letter;
            }

            .page-break-avoid {
              page-break-inside: avoid;
            }

            .page-break-before {
              page-break-before: always;
            }

            h2, h3, h4, h5 {
              page-break-after: avoid;
            }

            table {
              page-break-inside: auto;
            }

            tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }

            thead {
              display: table-header-group;
            }

            tfoot {
              display: table-footer-group;
            }
          }
        `}
      </style>

      <div className="bg-white border-b border-gray-200 no-print">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => onNavigate?.('reports')}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft size={16} />
                Back to Reports
              </button>
              <div className="h-4 w-px bg-gray-300"></div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {currentProject?.name || 'Project'}  Report
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Generated {formatDate(reportTimestamp)} " Award Recommendation & Itemized Comparison
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-lg border border-gray-300 bg-white shadow-sm overflow-hidden">
                <button
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    reportView === 'MODEL'
                      ? 'bg-gray-900 text-white'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                  onClick={() => setReportView('MODEL')}
                >
                  Model
                </button>
                <button
                  className={`px-3 py-1.5 text-sm font-medium border-l border-gray-300 transition-colors ${
                    reportView === 'PEER_MEDIAN'
                      ? 'bg-gray-900 text-white'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                  onClick={() => setReportView('PEER_MEDIAN')}
                >
                  Client
                </button>
                <button
                  className={`px-3 py-1.5 text-sm font-medium border-l border-gray-300 transition-colors ${
                    reportView === 'SIMPLE'
                      ? 'bg-gray-900 text-white'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                  onClick={() => setReportView('SIMPLE')}
                >
                  Simple
                </button>
              </div>

              <div className="relative" ref={exportDropdownRef}>
                <button
                  onClick={() => setShowExportDropdown(!showExportDropdown)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  <Download size={16} />
                  Export report
                  <ChevronDown size={14} className={`transition-transform ${showExportDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showExportDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="py-1">
                      <button
                        onClick={handlePrint}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <Printer size={16} />
                        Export PDF
                      </button>
                      <button
                        onClick={exportItemizedComparisonToExcel}
                        disabled={comparisonData.length === 0}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FileSpreadsheet size={16} />
                        Export items (Excel)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" ref={moreDropdownRef}>
                <button
                  onClick={() => setShowMoreDropdown(!showMoreDropdown)}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm"
                >
                  <MoreHorizontal size={16} />
                  More actions
                </button>

                {showMoreDropdown && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setShowMoreDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <Edit3 size={16} />
                        Rename report
                      </button>
                      <button
                        onClick={() => {
                          setShowMoreDropdown(false);
                          handleRecalculate();
                        }}
                        disabled={recalculating}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50"
                      >
                        <RefreshCw size={16} className={recalculating ? 'animate-spin' : ''} />
                        Regenerate report
                      </button>
                      <button
                        onClick={() => {
                          setShowMoreDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <Trash2 size={16} />
                        Delete report
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleRecalculate}
                disabled={recalculating}
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors text-sm"
              >
                <RefreshCw size={16} className={recalculating ? 'animate-spin' : ''} />
                Recalculate
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="printable-report" className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-gradient-to-br from-blue-50 to-sky-50 rounded-lg border border-blue-100 p-8 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Award Recommendation Report</h2>
              <p className="text-lg text-gray-600 mb-4">Project Analysis & Supplier Evaluation</p>
              <div className="flex items-center gap-6 text-sm text-gray-600">
                <div>
                  <span className="font-medium">Project:</span> {currentProject?.name}
                </div>
                <div>
                  <span className="font-medium">Mode:</span> {getViewLabel(reportView)}
                </div>
                <div>
                  <span className="font-medium">Suppliers:</span> {awardSummary.suppliers.length}
                </div>
                <div>
                  <span className="font-medium">Systems:</span> {awardSummary.totalSystems}
                </div>
              </div>
            </div>
            <div className="text-right text-sm text-gray-500">
              Generated by<br />
              <span className="font-semibold text-gray-900">PassiveFire Verify+</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow border border-gray-200 p-8 mb-6 page-break-avoid">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Report Overview & Methodology</h3>
          <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
            <p className="leading-relaxed">
              This report represents a comprehensive analysis of supplier quotes for your project,
              processed through PassiveFire Verify+'s advanced workflow. Each quote has been systematically
              evaluated across multiple dimensions to provide you with actionable recommendations.
            </p>

            <div className="mt-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-3">Analysis Workflow</h4>
              <p className="mb-4 text-gray-600">
                Your quotes have been processed through a five-stage workflow designed to ensure accuracy,
                completeness, and fair comparison:
              </p>

              <div className="space-y-6 mt-4">
                <div className="border-l-4 border-blue-500 pl-4 py-2">
                  <h5 className="font-semibold text-gray-900 mb-2">1. Import Quotes</h5>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>What happened:</strong> Supplier quotes were imported from PDF and Excel files using
                    advanced parsing technology including OCR (Optical Character Recognition) and intelligent
                    data extraction.
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>What this means:</strong> Each line item, including descriptions, quantities, units,
                    and prices, was automatically extracted and structured into a standardized format. This eliminates
                    manual data entry errors and ensures all quotes are compared on an equal basis.
                  </p>
                </div>

                <div className="border-l-4 border-green-500 pl-4 py-2">
                  <h5 className="font-semibold text-gray-900 mb-2">2. Review & Clean</h5>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>What happened:</strong> Each line item was normalized using AI-powered analysis to
                    ensure consistent descriptions, units of measurement, and quantities across all suppliers.
                    Items were validated for completeness and accuracy.
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>What this means:</strong> When one supplier quotes "fire-rated board per m²" and
                    another quotes "FR board per square meter," the system recognizes these as the same item.
                    Quantities are converted to common units (e.g., all areas in m², all lengths in linear meters)
                    enabling accurate like-for-like comparisons.
                  </p>
                </div>

                <div className="border-l-4 border-purple-500 pl-4 py-2">
                  <h5 className="font-semibold text-gray-900 mb-2">3. Scope Matrix Analysis</h5>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>What happened:</strong> A comprehensive scope matrix was built, mapping all line items
                    to fire protection systems (e.g., "Penetration Seals," "Fire Doors," "Cavity Barriers").
                    Coverage analysis identified which suppliers quoted for which systems.
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>What this means:</strong> The Coverage % in this report shows what proportion of your
                    total project scope each supplier has addressed. A supplier with 85% coverage may have excellent
                    pricing but is missing 15% of required systems, which creates risk and requires additional sourcing.
                  </p>
                </div>

                <div className="border-l-4 border-orange-500 pl-4 py-2">
                  <h5 className="font-semibold text-gray-900 mb-2">4. Quote Intelligence</h5>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>What happened:</strong> AI analysis examined each quote for quality indicators, pricing
                    patterns, specification compliance, and potential risks. This includes checking for outlier pricing,
                    incomplete specifications, and non-standard terms.
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>What this means:</strong> The Risk Score reflects factors beyond just price and coverage.
                    It considers specification quality, pricing consistency, completeness of information, and compliance
                    with project requirements. A higher risk score indicates potential issues that may lead to variations
                    or delays during construction.
                  </p>
                </div>

                <div className="border-l-4 border-red-500 pl-4 py-2">
                  <h5 className="font-semibold text-gray-900 mb-2">5. Award Report Generation</h5>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>What happened:</strong> All suppliers were ranked using multi-criteria analysis considering
                    total price, scope coverage, risk factors, and specification quality. Three recommendation types
                    were generated to suit different procurement strategies.
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>What this means:</strong> This final report synthesizes all analysis stages. The recommendations
                    are not based solely on lowest price, but balance cost, risk, and completeness. The "Best Value"
                    considers price-to-coverage ratio, "Lowest Risk" prioritizes completeness and quality, and "Balanced"
                    finds the optimal middle ground.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-base font-semibold text-blue-900 mb-2">Understanding the Key Metrics</h4>
              <div className="space-y-2 text-sm text-gray-700">
                <p>
                  <strong className="text-blue-900">Total Price:</strong> The sum of all line items quoted by each supplier.
                  For suppliers with incomplete coverage, this represents only the systems they quoted for.
                </p>
                <p>
                  <strong className="text-blue-900">Systems Covered:</strong> The number of distinct fire protection systems
                  included in the supplier's quote out of {awardSummary.totalSystems} total systems in your project scope.
                </p>
                <p>
                  <strong className="text-blue-900">Coverage %:</strong> The percentage of your total project scope addressed
                  by this supplier. 100% means they quoted for everything; lower percentages indicate gaps requiring additional
                  sourcing.
                </p>
                <p>
                  <strong className="text-blue-900">Risk Score (0-10):</strong> A composite risk assessment where lower is better.
                  Considers scope gaps, pricing anomalies, specification quality, and completeness. Scores below 3.0 are low risk,
                  3.0-6.0 are moderate, above 6.0 are high risk.
                </p>
              </div>
            </div>

            <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="text-base font-semibold text-amber-900 mb-2">How to Use This Report</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                <li>Review the three recommendation types and consider which aligns with your procurement priorities.</li>
                <li>Examine the Risk & Exceptions section carefully - these items require clarification or additional sourcing.</li>
                <li>Check the Coverage % for your preferred supplier - gaps below 90% may indicate significant scope omissions.</li>
                <li>Use the Itemized Comparison to identify specific areas of price variation and verify scope alignment.</li>
                <li>Consider the Risk Score alongside price - a low-price quote with high risk may lead to costly variations later.</li>
              </ol>
            </div>
          </div>
        </div>

        {reportView !== 'SIMPLE' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6 page-break-avoid">
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">Best Value Supplier</p>
                  <p className="text-xl font-bold text-gray-900 mb-1">
                    {bestValue?.supplier.supplierName || 'N/A'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {bestValue ? `${formatCurrency(bestValue.supplier.adjustedTotal)} " ${Math.round(bestValue.supplier.coveragePercent)}% coverage` : 'Best balance of price and coverage'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-green-50 text-green-700">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">Lowest Risk</p>
                  <p className="text-xl font-bold text-gray-900 mb-1">
                    {lowestRisk?.supplier.supplierName || 'N/A'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {lowestRisk ? `Risk Score ${lowestRisk.supplier.riskScore.toFixed(1)} " ${Math.round(lowestRisk.supplier.coveragePercent)}% coverage` : 'Lowest risk profile'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 text-blue-700">
                  <Shield className="w-6 h-6" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">Balanced Choice</p>
                  <p className="text-xl font-bold text-gray-900 mb-1">
                    {balanced?.supplier.supplierName || 'N/A'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {balanced ? 'Optimal balance of all factors' : 'Best overall recommendation'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-orange-50 text-orange-700">
                  <Award className="w-6 h-6" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">Key Metrics</p>
                  <div className="space-y-1 mt-2">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Quotes:</span> {awardSummary.suppliers.length}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Systems:</span> {awardSummary.totalSystems}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Avg Coverage:</span> {
                        (awardSummary.suppliers.reduce((sum, s) => sum + s.coveragePercent, 0) / awardSummary.suppliers.length).toFixed(1)
                      }%
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 text-slate-700">
                  <BarChart3 className="w-6 h-6" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">Best Value Supplier</p>
                  <p className="text-xl font-bold text-gray-900 mb-1">
                    {bestValue?.supplier.supplierName || 'N/A'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {bestValue ? `${formatCurrency(bestValue.supplier.adjustedTotal)}` : 'Best price'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-green-50 text-green-700">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">Lowest Risk</p>
                  <p className="text-xl font-bold text-gray-900 mb-1">
                    {lowestRisk?.supplier.supplierName || 'N/A'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {lowestRisk ? 'Most complete coverage' : 'Lowest risk'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 text-blue-700">
                  <Shield className="w-6 h-6" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">Balanced Choice</p>
                  <p className="text-xl font-bold text-gray-900 mb-1">
                    {balanced?.supplier.supplierName || 'N/A'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Recommended choice
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-orange-50 text-orange-700">
                  <Award className="w-6 h-6" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow border border-gray-200 page-break-avoid">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Why this recommendation</h3>
            </div>
            <div className="p-6">
              <ul className="space-y-3">
                {awardSummary.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-gray-900">
                        {rec.supplier.supplierName} - {rec.type.replace('_', ' ')}
                      </p>
                      <p className="text-sm text-gray-600 mt-0.5">{rec.reason}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200 page-break-before">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Supplier comparison summary</h3>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left text-sm font-medium text-gray-600 pb-3">Supplier</th>
                      <th className="text-right text-sm font-medium text-gray-600 pb-3">Total Price</th>
                      <th className="text-right text-sm font-medium text-gray-600 pb-3">Systems Covered</th>
                      <th className="text-right text-sm font-medium text-gray-600 pb-3">Coverage %</th>
                      <th className="text-right text-sm font-medium text-gray-600 pb-3">Risk Score</th>
                      {reportView !== 'SIMPLE' && (
                        <th className="text-left text-sm font-medium text-gray-600 pb-3 pl-6">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {awardSummary.suppliers.map((supplier, idx) => (
                      <tr key={idx} className="border-b border-gray-100 last:border-0">
                        <td className="py-3 text-sm font-medium text-gray-900">{supplier.supplierName}</td>
                        <td className="py-3 text-sm text-right text-gray-900">{formatCurrency(supplier.adjustedTotal)}</td>
                        <td className="py-3 text-sm text-right text-gray-700">{supplier.itemsQuoted}</td>
                        <td className="py-3 text-sm text-right text-gray-700">{Math.round(supplier.coveragePercent)}%</td>
                        <td className="py-3 text-sm text-right">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            supplier.riskScore <= 2 ? 'bg-green-100 text-green-800' :
                            supplier.riskScore <= 4 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {supplier.riskScore.toFixed(1)}
                          </span>
                        </td>
                        {reportView !== 'SIMPLE' && (
                          <td className="py-3 text-sm pl-6">
                            <button
                              onClick={() => handleApproveQuote(supplier.supplierName)}
                              disabled={currentProject?.approved_quote_id === quotesMap.get(supplier.supplierName)}
                              className="text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
                            >
                              {currentProject?.approved_quote_id === quotesMap.get(supplier.supplierName) ? 'Approved' : 'Approve'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {reportView !== 'SIMPLE' && (criticalGaps.length > 0 || nonCriticalGaps.length > 0) && (
            <div className="bg-white rounded-lg shadow border border-gray-200">
              <div className="border-b border-gray-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-gray-900">Risk & exceptions</h3>
              </div>
              <div className="p-6 space-y-6">
                {criticalGaps.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-red-900 mb-3 flex items-center gap-2">
                      <AlertCircle size={16} className="text-red-600" />
                      Critical gaps (must resolve)
                    </h4>
                    <ul className="space-y-2">
                      {criticalGaps.map((gap: any, idx: number) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className="w-1.5 h-1.5 bg-red-600 rounded-full mt-1.5 flex-shrink-0"></span>
                          <span className="text-gray-700">{gap.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {nonCriticalGaps.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-yellow-900 mb-3 flex items-center gap-2">
                      <AlertCircle size={16} className="text-yellow-600" />
                      Non-critical gaps (clarifications)
                    </h4>
                    <ul className="space-y-2">
                      {nonCriticalGaps.map((gap: any, idx: number) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className="w-1.5 h-1.5 bg-yellow-600 rounded-full mt-1.5 flex-shrink-0"></span>
                          <span className="text-gray-700">{gap.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {reportView !== 'SIMPLE' && comparisonData.length > 0 && (
            <div className="bg-white rounded-lg shadow border border-gray-200">
              <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Itemized comparison</h3>
                <button
                  onClick={() => setShowItemizedDetails(!showItemizedDetails)}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  {showItemizedDetails ? 'Hide details' : 'View full comparison'}
                  <ChevronRight size={16} className={`transition-transform ${showItemizedDetails ? 'rotate-90' : ''}`} />
                </button>
              </div>
              <div className="p-6">
                {showItemizedDetails ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left font-medium text-gray-600 pb-3 pr-4">Description</th>
                          <th className="text-right font-medium text-gray-600 pb-3 px-4">Qty</th>
                          <th className="text-left font-medium text-gray-600 pb-3 px-4">Unit</th>
                          {awardSummary.suppliers.map((supplier, idx) => (
                            <th key={idx} className="text-right font-medium text-gray-600 pb-3 px-4">
                              {supplier.supplierName}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonData.slice(0, 50).map((row, idx) => (
                          <tr key={idx} className="border-b border-gray-100">
                            <td className="py-2 pr-4 text-gray-900">{row.description}</td>
                            <td className="py-2 px-4 text-right text-gray-700">{row.quantity}</td>
                            <td className="py-2 px-4 text-gray-700">{row.unit}</td>
                            {awardSummary.suppliers.map((supplier, sidx) => {
                              const supplierData = row.suppliers?.[supplier.supplierName];
                              return (
                                <td key={sidx} className="py-2 px-4 text-right text-gray-700">
                                  {supplierData && supplierData.unitPrice !== null
                                    ? formatCurrency(supplierData.unitPrice)
                                    : 'N/A'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {comparisonData.length > 50 && (
                      <p className="text-sm text-gray-500 mt-4 text-center">
                        Showing first 50 of {comparisonData.length} items. Export to Excel for full data.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-600 mb-4">
                      {comparisonData.length} line items available for detailed comparison
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => setShowItemizedDetails(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        View full itemized comparison
                      </button>
                      <button
                        onClick={exportItemizedComparisonToExcel}
                        className="px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
                      >
                        <FileSpreadsheet size={16} className="inline mr-2" />
                        Export itemized Excel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
