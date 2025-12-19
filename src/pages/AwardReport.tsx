import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Download, MoreHorizontal, RefreshCw, ChevronDown, Award, Shield, TrendingUp, BarChart3, Printer, FileSpreadsheet, Trash2, Edit3, AlertCircle, CheckCircle, Scale, DollarSign, Activity, CheckSquare, Square, ArrowRight, ChevronRight, Target, FileText, AlertOctagon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ComparisonRow } from '../types/comparison.types';
import type { EqualisationMode } from '../types/equalisation.types';
import type { AwardSummary } from '../types/award.types';
import * as XLSX from 'xlsx';
import type { DashboardMode } from '../App';
import { generateModernPdfHtml, downloadPdfHtml } from '../lib/reports/modernPdfTemplate';

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
  const [loading, setLoading] = useState(true);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showMoreDropdown, setShowMoreDropdown] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [currentReportId, setCurrentReportId] = useState<string | null>(reportId || null);
  const [reportTimestamp, setReportTimestamp] = useState<string>('');
  const [showItemizedDetails, setShowItemizedDetails] = useState(false);
  const [quotesMap, setQuotesMap] = useState<Map<string, string>>(new Map());
  const [showMethodology, setShowMethodology] = useState(false);
  const [actionChecklist, setActionChecklist] = useState<Record<string, boolean>>({});

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

      const supplierTotals = suppliers.map(() => 0);

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
            supplierTotals[supplierIdx] += supplierData.total || 0;
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

      const subtotalRow = dataStartRow + comparisonData.length;
      ws[XLSX.utils.encode_cell({ r: subtotalRow, c: 0 })] = {
        t: 's',
        v: 'Subtotals:'
      };

      suppliers.forEach((supplier, supplierIdx) => {
        const totalCol = startCol + (supplierIdx * 2) + 1;
        ws[XLSX.utils.encode_cell({ r: subtotalRow, c: totalCol })] = {
          t: 'n',
          v: supplierTotals[supplierIdx],
          z: '$#,##0.00'
        };
      });

      range.e.r = Math.max(range.e.r, subtotalRow);
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

    if (!awardSummary || !currentProject) {
      onToast?.('Report data not available', 'error');
      return;
    }

    try {
      const suppliersWithScores = awardSummary.suppliers.map(s => {
        const priceScore = 100 - ((s.adjustedTotal / Math.max(...awardSummary.suppliers.map(sup => sup.adjustedTotal))) * 100);
        const riskScore = 100 - s.riskScore;
        const coverageScore = s.coveragePercent;
        const weightedScore = (priceScore * 0.4 + riskScore * 0.3 + coverageScore * 0.3);
        return { ...s, weightedScore };
      });

      const sortedSuppliers = [...suppliersWithScores].sort((a, b) => b.weightedScore - a.weightedScore);

      const suppliers = sortedSuppliers.map((s, idx) => ({
        rank: idx + 1,
        supplierName: s.supplierName,
        adjustedTotal: s.adjustedTotal,
        riskScore: s.riskScore,
        coveragePercent: s.coveragePercent,
        itemsQuoted: s.itemsQuoted,
        totalItems: s.totalItems,
        weightedScore: s.weightedScore,
        notes: s.notes && s.notes.length > 0 ? s.notes : undefined
      }));

      let recommendations = [];

      if (awardSummary.recommendations && awardSummary.recommendations.length > 0) {
        recommendations = awardSummary.recommendations.slice(0, 3).map(rec => ({
          type: rec.type === 'BEST_VALUE' ? 'best_value' as const :
                rec.type === 'LOWEST_RISK' ? 'lowest_risk' as const :
                'balanced' as const,
          supplierName: rec.supplier.supplierName,
          price: rec.supplier.adjustedTotal,
          coverage: rec.supplier.coveragePercent,
          riskScore: rec.supplier.riskScore,
          score: suppliersWithScores.find(s => s.supplierName === rec.supplier.supplierName)?.weightedScore || 0
        }));
      } else {
        const bestValue = sortedSuppliers[0];
        const lowestRisk = [...sortedSuppliers].sort((a, b) => a.riskScore - b.riskScore)[0];
        const balanced = sortedSuppliers[Math.floor(sortedSuppliers.length / 2)] || sortedSuppliers[0];

        recommendations = [
          bestValue && {
            type: 'best_value' as const,
            supplierName: bestValue.supplierName,
            price: bestValue.adjustedTotal,
            coverage: bestValue.coveragePercent,
            riskScore: bestValue.riskScore,
            score: bestValue.weightedScore
          },
          lowestRisk && {
            type: 'lowest_risk' as const,
            supplierName: lowestRisk.supplierName,
            price: lowestRisk.adjustedTotal,
            coverage: lowestRisk.coveragePercent,
            riskScore: lowestRisk.riskScore,
            score: lowestRisk.weightedScore
          },
          balanced && {
            type: 'balanced' as const,
            supplierName: balanced.supplierName,
            price: balanced.adjustedTotal,
            coverage: balanced.coveragePercent,
            riskScore: balanced.riskScore,
            score: balanced.weightedScore
          }
        ].filter(Boolean).slice(0, 3);
      }

      const htmlContent = generateModernPdfHtml({
        projectName: currentProject.name,
        clientName: currentProject.client || undefined,
        generatedAt: reportTimestamp || awardSummary.generatedAt || new Date().toISOString(),
        recommendations,
        suppliers,
        executiveSummary: `Award recommendation analysis for ${currentProject.name}. Total systems analyzed: ${awardSummary.totalSystems}.`,
        methodology: [
          'Quote Import & Validation',
          'Data Normalization',
          'Scope Gap Analysis',
          'Risk Assessment',
          'Multi-Criteria Scoring'
        ],
        additionalSections: []
      });

      const filename = `Award_Report_${currentProject.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.html`;
      downloadPdfHtml(htmlContent, filename);

      onToast?.('Modern PDF report downloaded! Open the HTML file and use "Print to PDF" to save as PDF.', 'success');
    } catch (error) {
      console.error('Error generating PDF:', error);
      onToast?.('Failed to generate PDF report', 'error');
    }
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
      <div className="flex items-center justify-center h-64 bg-slate-900">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!awardSummary || awardSummary.suppliers.length === 0) {
    return (
      <div className="p-8 bg-slate-900 min-h-screen">
        <div className="bg-slate-800/60 rounded-lg border border-slate-700 p-12 text-center">
          <Award className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-100 text-lg font-semibold mb-2">No Award Report Available</p>
          <p className="text-slate-400">Generate a report from the Reports Hub to view analysis.</p>
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

  const criticalGaps = aiAnalysis?.gapsAndRisks?.filter((g: any) => g.severity === 'HIGH') || [];
  const nonCriticalGaps = aiAnalysis?.gapsAndRisks?.filter((g: any) => g.severity !== 'HIGH') || [];

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="bg-slate-800/60 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => onNavigate?.('reports')}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-100 transition-colors"
              >
                <ArrowLeft size={16} />
                Back to Reports
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleRecalculate}
                disabled={recalculating}
                className="flex items-center gap-2 px-3 py-2 border border-slate-600 bg-slate-800/60 text-slate-300 rounded-md hover:bg-slate-700/50 disabled:opacity-50 transition-colors text-sm"
              >
                <RefreshCw size={16} className={recalculating ? 'animate-spin' : ''} />
                Recalculate
              </button>

              <div className="relative" ref={exportDropdownRef}>
                <button
                  onClick={() => setShowExportDropdown(!showExportDropdown)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-md hover:from-orange-700 hover:to-orange-800 transition-all text-sm font-medium shadow-lg"
                >
                  <Download size={16} />
                  Export report
                  <ChevronDown size={14} className={`transition-transform ${showExportDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showExportDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-slate-800 rounded-lg shadow-xl border border-slate-700 z-50">
                    <div className="py-1">
                      <button
                        onClick={handlePrint}
                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                      >
                        <Printer size={16} />
                        Export PDF
                      </button>
                      <button
                        onClick={exportItemizedComparisonToExcel}
                        disabled={comparisonData.length === 0}
                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  className="flex items-center gap-2 px-3 py-2 border border-slate-600 bg-slate-800/60 text-slate-300 rounded-md hover:bg-slate-700/50 transition-colors text-sm"
                >
                  <MoreHorizontal size={16} />
                </button>

                {showMoreDropdown && (
                  <div className="absolute right-0 mt-2 w-48 bg-slate-800 rounded-lg shadow-xl border border-slate-700 z-50">
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setShowMoreDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors"
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
                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50 transition-colors"
                      >
                        <RefreshCw size={16} className={recalculating ? 'animate-spin' : ''} />
                        Regenerate report
                      </button>
                      <button
                        onClick={() => {
                          setShowMoreDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2 transition-colors"
                      >
                        <Trash2 size={16} />
                        Delete report
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-3">Award Recommendation Report</h1>
          <p className="text-xl text-slate-300 mb-6">Project Analysis & Supplier Evaluation</p>

          <div className="inline-flex items-center gap-6 text-sm text-slate-400 bg-slate-800/40 px-8 py-3 rounded-lg border border-slate-700/50">
            <div>
              <span className="font-semibold text-slate-300">Project:</span> {currentProject?.name}
            </div>
            <div className="h-4 w-px bg-slate-600"></div>
            <div>
              <span className="font-semibold text-slate-300">Mode:</span> Model
            </div>
            <div className="h-4 w-px bg-slate-600"></div>
            <div>
              <span className="font-semibold text-slate-300">Suppliers:</span> {awardSummary.suppliers.length}
            </div>
            <div className="h-4 w-px bg-slate-600"></div>
            <div>
              <span className="font-semibold text-slate-300">Systems:</span> {awardSummary.totalSystems}
            </div>
          </div>

          <div className="mt-4 text-sm text-slate-500">
            Generated by <span className="font-semibold text-orange-500">VerifyTrade</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-gradient-to-br from-green-900/40 to-green-800/20 rounded-xl shadow-xl p-8 border-2 border-green-600/30 hover:border-green-500/50 transition-all">
            <div className="flex items-center justify-center w-16 h-16 bg-green-600 rounded-xl mx-auto mb-4 shadow-lg">
              <TrendingUp className="w-8 h-8 text-white" />
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2">Best Value</p>
              <p className="text-2xl font-bold text-white mb-3">
                {bestValue?.supplier.supplierName || 'N/A'}
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Price</span>
                  <span className="font-bold text-green-400">{bestValue ? formatCurrency(bestValue.supplier.adjustedTotal) : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Coverage</span>
                  <span className="font-bold text-white">{bestValue ? `${Math.round(bestValue.supplier.coveragePercent)}%` : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Risk Score</span>
                  <span className="font-bold text-white">{bestValue ? `${(10 - bestValue.supplier.riskScore).toFixed(1)}/10` : 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 rounded-xl shadow-xl p-8 border-2 border-blue-600/30 hover:border-blue-500/50 transition-all">
            <div className="flex items-center justify-center w-16 h-16 bg-blue-600 rounded-xl mx-auto mb-4 shadow-lg">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Lowest Risk</p>
              <p className="text-2xl font-bold text-white mb-3">
                {lowestRisk?.supplier.supplierName || 'N/A'}
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Price</span>
                  <span className="font-bold text-blue-400">{lowestRisk ? formatCurrency(lowestRisk.supplier.adjustedTotal) : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Coverage</span>
                  <span className="font-bold text-white">{lowestRisk ? `${Math.round(lowestRisk.supplier.coveragePercent)}%` : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Risk Score</span>
                  <span className="font-bold text-white">{lowestRisk ? `${(10 - lowestRisk.supplier.riskScore).toFixed(1)}/10` : 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-900/40 to-orange-800/20 rounded-xl shadow-xl p-8 border-2 border-orange-600/30 hover:border-orange-500/50 transition-all relative">
            <div className="absolute -top-3 -right-3 bg-orange-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
              RECOMMENDED
            </div>
            <div className="flex items-center justify-center w-16 h-16 bg-orange-600 rounded-xl mx-auto mb-4 shadow-lg">
              <Scale className="w-8 h-8 text-white" />
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-2">Balanced Choice</p>
              <p className="text-3xl font-black text-white mb-3">
                {balanced?.supplier.supplierName || 'N/A'}
              </p>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Price</span>
                  <span className="font-bold text-orange-400">{balanced ? formatCurrency(balanced.supplier.adjustedTotal) : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Coverage</span>
                  <span className="font-bold text-white">{balanced ? `${Math.round(balanced.supplier.coveragePercent)}%` : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Risk Score</span>
                  <span className="font-bold text-white">{balanced ? `${(10 - balanced.supplier.riskScore).toFixed(1)}/10` : 'N/A'}</span>
                </div>
              </div>
              <button
                onClick={() => balanced && handleApproveQuote(balanced.supplier.supplierName)}
                className="w-full px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg shadow-lg transition-all transform hover:scale-105 flex items-center justify-center gap-2"
              >
                <Target className="w-5 h-5" />
                Proceed to Approval
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Next Steps & Action Plan */}
        <div className="bg-gradient-to-br from-green-900/20 to-green-800/10 rounded-xl shadow-xl border-2 border-green-600/30 p-8 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center shadow-lg">
              <CheckCircle className="w-7 h-7 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">Next Steps & Action Plan</h3>
              <p className="text-sm text-green-300">Actionable steps for award finalization</p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              {
                id: 'approve',
                title: 'Approve Recommended Supplier',
                description: `Click "Proceed to Approval" to formally approve ${balanced?.supplier.supplierName || 'the recommended supplier'} and initiate contract process`,
                urgent: true,
              },
              {
                id: 'review_gaps',
                title: 'Request Clarification on Scope Gaps',
                description: `Issue RFI for ${criticalGaps.length} critical gaps identified in risk assessment below`,
                urgent: criticalGaps.length > 0,
              },
              {
                id: 'negotiate',
                title: 'Negotiate Price Outliers',
                description: 'Review itemized comparison for high-variance items and negotiate with shortlisted suppliers',
                urgent: false,
              },
              {
                id: 'savings',
                title: 'Review Estimated Savings',
                description: balanced && bestValue
                  ? `Potential savings of ${formatCurrency(Math.abs(balanced.supplier.adjustedTotal - bestValue.supplier.adjustedTotal))} if awarded now vs. re-tender`
                  : 'Review cost-benefit analysis for immediate award',
                urgent: false,
              },
              {
                id: 'contract',
                title: 'Prepare Contract Documentation',
                description: 'Draft formal contract including conditions of award and clarified items',
                urgent: false,
              },
              {
                id: 'unsuccessful',
                title: 'Issue Unsuccessful Letters',
                description: `Notify ${awardSummary.suppliers.length - 1} unsuccessful suppliers with feedback`,
                urgent: false,
              },
            ].map((action) => (
              <div
                key={action.id}
                className={`flex items-start gap-4 p-4 rounded-lg border transition-all ${
                  actionChecklist[action.id]
                    ? 'bg-green-900/20 border-green-600/50'
                    : action.urgent
                    ? 'bg-orange-900/20 border-orange-600/50'
                    : 'bg-slate-700/30 border-slate-600/50'
                }`}
              >
                <button
                  onClick={() => setActionChecklist({ ...actionChecklist, [action.id]: !actionChecklist[action.id] })}
                  className="flex-shrink-0 mt-1 text-slate-300 hover:text-green-400 transition-colors"
                >
                  {actionChecklist[action.id] ? (
                    <CheckSquare className="w-6 h-6 text-green-400" />
                  ) : (
                    <Square className="w-6 h-6" />
                  )}
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-white">{action.title}</h4>
                    {action.urgent && !actionChecklist[action.id] && (
                      <span className="px-2 py-0.5 bg-orange-600 text-white text-xs font-bold rounded">
                        URGENT
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-300">{action.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0 mt-1" />
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-900/20 border border-blue-600/30 rounded-lg">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-200">
                <strong className="text-blue-300">Pro Tip:</strong> Complete urgent actions within 24 hours to maintain quote validity.
                Export this report to PDF for stakeholder presentation and approval workflow.
              </div>
            </div>
          </div>
        </div>

        {/* Risk & Exceptions Table */}
        {(criticalGaps.length > 0 || nonCriticalGaps.length > 0) && (
          <div className="bg-slate-800/60 rounded-xl shadow-xl border border-slate-700 mb-8 overflow-hidden">
            <div className="bg-gradient-to-r from-red-900/40 to-red-800/20 px-8 py-6 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                  <AlertOctagon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">Risk & Exceptions Register</h3>
                  <p className="text-sm text-red-300">Issues requiring attention before final award</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="text-left text-xs font-bold text-slate-300 uppercase tracking-wide px-6 py-4">Issue / Scope Gap</th>
                    <th className="text-center text-xs font-bold text-slate-300 uppercase tracking-wide px-6 py-4 w-32">Severity</th>
                    <th className="text-left text-xs font-bold text-slate-300 uppercase tracking-wide px-6 py-4">Recommended Mitigation / Action</th>
                    <th className="text-center text-xs font-bold text-slate-300 uppercase tracking-wide px-6 py-4 w-40">Responsible Party</th>
                  </tr>
                </thead>
                <tbody>
                  {criticalGaps.slice(0, 10).map((gap: any, idx: number) => (
                    <tr
                      key={idx}
                      className={`border-b border-slate-700 hover:bg-slate-700/30 transition-colors ${
                        gap.severity === 'HIGH' ? 'bg-red-900/10' : 'bg-yellow-900/10'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-2">
                          <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${gap.severity === 'HIGH' ? 'text-red-400' : 'text-yellow-400'}`} />
                          <div>
                            <p className="text-white font-medium">{gap.description || gap.item || 'Unspecified issue'}</p>
                            <p className="text-xs text-slate-400 mt-1">{gap.details || ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${
                            gap.severity === 'HIGH'
                              ? 'bg-red-600/20 text-red-400 border border-red-600/50'
                              : 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/50'
                          }`}
                        >
                          {gap.severity || 'MEDIUM'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-slate-300 text-sm">
                          {gap.severity === 'HIGH'
                            ? 'Issue formal RFI for pricing and clarification before award'
                            : 'Confirm inclusion in final scope or adjust budget accordingly'}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm font-semibold text-blue-400">
                          {gap.severity === 'HIGH' ? 'Procurement Lead' : 'Project Manager'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {nonCriticalGaps.slice(0, 5).map((gap: any, idx: number) => (
                    <tr
                      key={`non-${idx}`}
                      className="border-b border-slate-700 hover:bg-slate-700/30 transition-colors bg-slate-800/30"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-400" />
                          <div>
                            <p className="text-slate-300 font-medium">{gap.description || gap.item || 'Minor clarification'}</p>
                            <p className="text-xs text-slate-500 mt-1">{gap.details || ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold bg-slate-600/20 text-slate-400 border border-slate-600/50">
                          LOW
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-slate-400 text-sm">Noting only - address during contract negotiation if required</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm font-semibold text-slate-400">Site Team</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(criticalGaps.length + nonCriticalGaps.length > 15) && (
              <div className="px-8 py-4 bg-slate-700/30 border-t border-slate-700">
                <p className="text-sm text-slate-400 text-center">
                  Showing first 15 of {criticalGaps.length + nonCriticalGaps.length} identified risks.
                  Full register available in detailed report export.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="bg-slate-800/60 rounded-xl shadow-xl border border-slate-700 p-8 mb-8">
          <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-600/20 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-orange-500" />
            </div>
            Key Metrics
          </h3>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center p-6 bg-slate-700/30 rounded-lg border border-slate-600/50">
              <div className="text-4xl font-bold text-orange-500 mb-2">{awardSummary.suppliers.length}</div>
              <div className="text-sm text-slate-400 uppercase tracking-wide">Quotes Evaluated</div>
            </div>
            <div className="text-center p-6 bg-slate-700/30 rounded-lg border border-slate-600/50">
              <div className="text-4xl font-bold text-orange-500 mb-2">{awardSummary.totalSystems}</div>
              <div className="text-sm text-slate-400 uppercase tracking-wide">Systems Compared</div>
            </div>
            <div className="text-center p-6 bg-slate-700/30 rounded-lg border border-slate-600/50">
              <div className="text-4xl font-bold text-orange-500 mb-2">
                {(awardSummary.suppliers.reduce((sum, s) => sum + s.coveragePercent, 0) / awardSummary.suppliers.length).toFixed(0)}%
              </div>
              <div className="text-sm text-slate-400 uppercase tracking-wide">Avg Coverage</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/60 rounded-xl shadow-xl border border-slate-700 p-8 mb-8">
          <h3 className="text-2xl font-bold text-white mb-6">Why This Recommendation?</h3>
          <ul className="space-y-4">
            {awardSummary.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-6 h-6 bg-green-600 rounded-full flex items-center justify-center mt-1">
                  <CheckCircle className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-white text-lg">
                    {rec.supplier.supplierName} - {rec.type.replace('_', ' ')}
                  </p>
                  <p className="text-slate-400 mt-1 leading-relaxed">{rec.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-slate-800/60 rounded-xl shadow-xl border border-slate-700 mb-8 overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-700">
            <h3 className="text-2xl font-bold text-white">Supplier Comparison Summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-700 to-slate-800">
                <tr>
                  <th className="text-left text-sm font-bold text-white uppercase tracking-wide px-6 py-4">Supplier</th>
                  <th className="text-right text-sm font-bold text-white uppercase tracking-wide px-6 py-4">Total Price</th>
                  <th className="text-right text-sm font-bold text-white uppercase tracking-wide px-6 py-4">Systems Covered</th>
                  <th className="text-right text-sm font-bold text-white uppercase tracking-wide px-6 py-4">Coverage %</th>
                  <th className="text-right text-sm font-bold text-white uppercase tracking-wide px-6 py-4">Risk Score</th>
                  <th className="text-center text-sm font-bold text-white uppercase tracking-wide px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {awardSummary.suppliers.map((supplier, idx) => {
                  const isTopChoice = idx === 0;
                  return (
                    <tr
                      key={idx}
                      className={`border-b border-slate-700 hover:bg-slate-700/30 transition-colors ${
                        isTopChoice ? 'bg-gradient-to-r from-orange-900/20 to-transparent' : idx % 2 === 0 ? 'bg-slate-800/30' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {isTopChoice && (
                            <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                              1
                            </div>
                          )}
                          <span className="font-semibold text-white">{supplier.supplierName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-green-400">{formatCurrency(supplier.adjustedTotal)}</td>
                      <td className="px-6 py-4 text-right text-slate-300">{supplier.itemsQuoted} / {supplier.totalItems}</td>
                      <td className="px-6 py-4 text-right text-slate-300">{Math.round(supplier.coveragePercent)}%</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${
                          supplier.riskScore <= 2 ? 'bg-green-600/20 text-green-400 border border-green-600/50' :
                          supplier.riskScore <= 4 ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/50' :
                          'bg-red-600/20 text-red-400 border border-red-600/50'
                        }`}>
                          {(10 - supplier.riskScore).toFixed(1)}/10
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleApproveQuote(supplier.supplierName)}
                          disabled={currentProject?.approved_quote_id === quotesMap.get(supplier.supplierName)}
                          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all transform hover:scale-105 shadow-md flex items-center gap-2 mx-auto ${
                            currentProject?.approved_quote_id === quotesMap.get(supplier.supplierName)
                              ? 'bg-green-600/20 text-green-400 border-2 border-green-600/50 cursor-not-allowed'
                              : isTopChoice
                              ? 'bg-gradient-to-r from-orange-600 to-orange-700 text-white hover:from-orange-700 hover:to-orange-800 border-2 border-orange-500'
                              : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 border-2 border-blue-500'
                          }`}
                        >
                          {currentProject?.approved_quote_id === quotesMap.get(supplier.supplierName) ? (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              Approved
                            </>
                          ) : (
                            <>
                              <Target className="w-4 h-4" />
                              Approve Award
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {comparisonData.length > 0 && (
          <div className="bg-slate-800/60 rounded-xl shadow-xl border border-slate-700 mb-8 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-700">
              <h3 className="text-2xl font-bold text-white">Itemized Comparison</h3>
              <p className="text-slate-400 mt-2">
                {comparisonData.length} line items available for detailed comparison. Access the full itemized breakdown with side-by-side pricing, quantities, and variance analysis.
              </p>
            </div>
            <div className="p-8">
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setShowItemizedDetails(!showItemizedDetails)}
                  className="px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all text-sm font-semibold shadow-lg flex items-center gap-2"
                >
                  <FileSpreadsheet size={18} />
                  {showItemizedDetails ? 'Hide' : 'View'} Full Itemized Comparison
                </button>
                <button
                  onClick={exportItemizedComparisonToExcel}
                  className="px-6 py-3 border-2 border-slate-600 bg-slate-700/30 text-slate-200 rounded-lg hover:bg-slate-700/50 transition-all text-sm font-semibold flex items-center gap-2"
                >
                  <Download size={18} />
                  Export Itemized Excel
                </button>
              </div>

              {showItemizedDetails && (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gradient-to-r from-slate-700 to-slate-800">
                      <tr>
                        <th className="text-left font-bold text-white uppercase tracking-wide px-4 py-3">Description</th>
                        <th className="text-right font-bold text-white uppercase tracking-wide px-4 py-3">Qty</th>
                        <th className="text-left font-bold text-white uppercase tracking-wide px-4 py-3">Unit</th>
                        {awardSummary.suppliers.map((supplier, idx) => (
                          <th key={idx} className="text-right font-bold text-white uppercase tracking-wide px-4 py-3">
                            {supplier.supplierName}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonData.slice(0, 50).map((row, idx) => (
                        <tr key={idx} className={`border-b border-slate-700 hover:bg-slate-700/30 transition-colors ${idx % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                          <td className="py-3 px-4 text-slate-200">{row.description}</td>
                          <td className="py-3 px-4 text-right text-slate-300">{row.quantity}</td>
                          <td className="py-3 px-4 text-slate-300">{row.unit}</td>
                          {awardSummary.suppliers.map((supplier, sidx) => {
                            const supplierData = row.suppliers?.[supplier.supplierName];
                            return (
                              <td key={sidx} className="py-3 px-4 text-right text-slate-300 font-medium">
                                {supplierData && supplierData.unitPrice !== null
                                  ? formatCurrency(supplierData.unitPrice)
                                  : <span className="text-slate-600">N/A</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {comparisonData.length > 50 && (
                    <p className="text-sm text-slate-400 mt-4 text-center">
                      Showing first 50 of {comparisonData.length} items. Export to Excel for full data.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-slate-800/60 rounded-xl shadow-xl border border-slate-700 overflow-hidden">
          <button
            onClick={() => setShowMethodology(!showMethodology)}
            className="w-full px-8 py-6 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
          >
            <h3 className="text-2xl font-bold text-white">Report Overview & Methodology</h3>
            <ChevronDown
              size={24}
              className={`text-slate-400 transition-transform ${showMethodology ? 'rotate-180' : ''}`}
            />
          </button>

          {showMethodology && (
            <div className="px-8 py-6 border-t border-slate-700 space-y-6">
              <div className="bg-gradient-to-r from-slate-700/50 to-slate-800/50 rounded-xl p-6 border border-slate-600/50">
                <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-orange-500" />
                  5-Stage Evaluation Process
                </h4>
                <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                  Each quote has been systematically evaluated through VerifyTrade's advanced workflow to provide
                  actionable recommendations based on multiple objective criteria.
                </p>

                <div className="flex items-center justify-between gap-3">
                  {[
                    { num: 1, title: 'Import & Validate', icon: '📥', color: 'from-blue-600 to-blue-700' },
                    { num: 2, title: 'Normalize Data', icon: '🔄', color: 'from-green-600 to-green-700' },
                    { num: 3, title: 'Gap Analysis', icon: '🔍', color: 'from-purple-600 to-purple-700' },
                    { num: 4, title: 'Risk Assessment', icon: '⚠️', color: 'from-orange-600 to-orange-700' },
                    { num: 5, title: 'Score & Rank', icon: '🎯', color: 'from-red-600 to-red-700' }
                  ].map((step, idx) => (
                    <div key={step.num} className="flex items-center gap-2">
                      <div className="flex-shrink-0">
                        <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${step.color} flex flex-col items-center justify-center text-white shadow-lg border-2 border-white/20`}>
                          <div className="text-2xl mb-0.5">{step.icon}</div>
                          <div className="text-xs font-bold">{step.num}</div>
                        </div>
                        <div className="text-xs font-semibold text-slate-300 text-center mt-2 leading-tight">{step.title}</div>
                      </div>
                      {idx < 4 && (
                        <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-5">
                  <h4 className="text-md font-bold text-white mb-3 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-orange-500" />
                    Key Metrics Explained
                  </h4>
                  <div className="space-y-2 text-xs text-slate-300">
                    <p><strong className="text-orange-400">Total Price:</strong> Sum of all quoted line items</p>
                    <p><strong className="text-orange-400">Systems Covered:</strong> {awardSummary.totalSystems} systems analyzed</p>
                    <p><strong className="text-orange-400">Coverage %:</strong> Completeness of scope coverage</p>
                    <p><strong className="text-orange-400">Risk Score:</strong> Composite assessment (higher = better)</p>
                  </div>
                </div>

                <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-5">
                  <h4 className="text-md font-bold text-white mb-3 flex items-center gap-2">
                    <Scale className="w-4 h-4 text-orange-500" />
                    Scoring Weights
                  </h4>
                  <div className="space-y-2 text-xs text-slate-300">
                    <div className="flex justify-between items-center">
                      <span>Price Competitiveness</span>
                      <span className="font-bold text-orange-400">40%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Technical Compliance</span>
                      <span className="font-bold text-orange-400">25%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Scope Coverage</span>
                      <span className="font-bold text-orange-400">20%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Risk Factors</span>
                      <span className="font-bold text-orange-400">15%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
