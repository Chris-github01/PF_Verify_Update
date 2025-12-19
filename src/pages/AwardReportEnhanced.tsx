import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Download, RefreshCw, Award, CheckCircle2, FileSpreadsheet, Printer, ChevronDown, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ComparisonRow } from '../types/comparison.types';
import type { AwardSummary } from '../types/award.types';
import * as XLSX from 'xlsx';
import ApprovalModal from '../components/ApprovalModal';
import RevisionRequestModal from '../components/RevisionRequestModal';
import { generateModernPdfHtml, generatePdfWithPrint } from '../lib/reports/modernPdfTemplate';
import EnhancedSupplierTable from '../components/award/EnhancedSupplierTable';
import WeightedScoringBreakdown from '../components/award/WeightedScoringBreakdown';
import CoverageBreakdownChart from '../components/award/CoverageBreakdownChart';
import MethodologyFlowchart from '../components/award/MethodologyFlowchart';
import EnhancedRecommendationsCard from '../components/award/EnhancedRecommendationsCard';
import {
  calculatePriceScore,
  calculateComplianceScore,
  calculateCoverageScore,
  calculateRiskMitigationScore,
  calculateWeightedTotal,
  calculateNormalizedPrice,
  calculateVariancePercent,
  generateSystemsBreakdown,
  estimateScopeGapCosts,
  DEFAULT_WEIGHTS,
  formatCurrency,
  type EnhancedSupplierMetrics,
  type ScoringWeights,
} from '../lib/reports/awardReportEnhancements';

interface Project {
  id: string;
  name: string;
  client: string | null;
  approved_quote_id: string | null;
}

interface ApprovalData {
  id: string;
  ai_recommended_supplier: string;
  final_approved_supplier: string;
  is_override: boolean;
  override_reason_category: string | null;
  override_reason_detail: string | null;
  approved_at: string;
  approved_by_email: string;
}

interface AwardReportEnhancedProps {
  projectId: string;
  reportId?: string;
  organisationId: string;
  onToast?: (message: string, type: 'success' | 'error') => void;
  onNavigate?: (page: string) => void;
}

export default function AwardReportEnhanced({
  projectId,
  reportId,
  organisationId,
  onToast,
  onNavigate,
}: AwardReportEnhancedProps) {
  const [comparisonData, setComparisonData] = useState<ComparisonRow[]>([]);
  const [awardSummary, setAwardSummary] = useState<AwardSummary | null>(null);
  const [enhancedSuppliers, setEnhancedSuppliers] = useState<EnhancedSupplierMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [currentReportId, setCurrentReportId] = useState<string | null>(reportId || null);
  const [weights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalData, setApprovalData] = useState<ApprovalData | null>(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);

  const exportDropdownRef = useRef<HTMLDivElement>(null);

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

  const loadApprovalData = async (reportId: string) => {
    try {
      const { data: approvals } = await supabase
        .from('award_approvals')
        .select(`
          id,
          ai_recommended_supplier,
          final_approved_supplier,
          is_override,
          override_reason_category,
          override_reason_detail,
          approved_at,
          approved_by_user_id
        `)
        .eq('award_report_id', reportId)
        .order('approved_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (approvals) {
        // Get user email using the RPC function
        const { data: userData } = await supabase
          .rpc('get_user_details', { p_user_id: approvals.approved_by_user_id })
          .maybeSingle();

        setApprovalData({
          ...approvals,
          approved_by_email: userData?.email || 'Unknown',
        });
      }
    } catch (error) {
      console.error('Error loading approval data:', error);
    }
  };

  const processSupplierData = (suppliers: any[], comparisonData: ComparisonRow[]): EnhancedSupplierMetrics[] => {
    const prices = suppliers.map(s => s.adjustedTotal);
    const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);
    const maxRisk = Math.max(...suppliers.map(s => s.riskScore));

    const enhanced = suppliers.map((supplier) => {
      // Calculate scores (0-10)
      const priceScore = calculatePriceScore(supplier.adjustedTotal, lowestPrice, highestPrice);
      const complianceScore = calculateComplianceScore(supplier.riskScore, maxRisk);
      const coverageScore = calculateCoverageScore(supplier.coveragePercent);
      const riskScore = calculateRiskMitigationScore(supplier.riskScore, maxRisk);

      // Calculate weighted total (0-100)
      const weightedTotal = calculateWeightedTotal(
        priceScore,
        complianceScore,
        coverageScore,
        riskScore,
        weights
      );

      // Get items for this supplier
      const supplierItems = comparisonData.map(row => ({
        category: row.category || 'General',
        isQuoted: row.suppliers[supplier.supplierName]?.unitPrice !== null
      }));

      const missingItems = comparisonData
        .filter(row => !row.suppliers[supplier.supplierName]?.unitPrice)
        .map(row => ({ description: row.description, category: row.category }));

      return {
        supplierName: supplier.supplierName,
        totalPrice: supplier.adjustedTotal,
        systemsCovered: supplier.itemsQuoted,
        totalSystems: supplier.totalItems,
        coveragePercent: supplier.coveragePercent,

        normalizedPricePerSystem: calculateNormalizedPrice(supplier.adjustedTotal, supplier.itemsQuoted),
        variancePercent: calculateVariancePercent(supplier.adjustedTotal, averagePrice),
        varianceFromLowest: supplier.adjustedTotal - lowestPrice,

        rawRiskScore: supplier.riskScore,
        riskMitigationScore: riskScore,

        priceScore,
        complianceScore,
        coverageScore,
        riskScore,
        weightedTotal,

        systemsBreakdown: generateSystemsBreakdown(supplierItems, supplier.totalItems),
        scopeGaps: estimateScopeGapCosts(
          missingItems,
          supplier.itemsQuoted > 0 ? supplier.adjustedTotal / supplier.itemsQuoted : 0,
          supplier.itemsQuoted,
          supplier.totalItems
        ),

        rank: 0,
        isBestValue: false,
        isLowestRisk: false,
      };
    });

    // Sort and rank
    enhanced.sort((a, b) => b.weightedTotal - a.weightedTotal);
    enhanced.forEach((s, idx) => {
      s.rank = idx + 1;
      s.isBestValue = s.totalPrice === lowestPrice;
      s.isLowestRisk = s.rawRiskScore === Math.min(...enhanced.map(x => x.rawRiskScore));
    });

    return enhanced;
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
        const comparison = reportData.result_json.comparisonData || [];
        const summary = reportData.result_json.awardSummary || null;

        setComparisonData(comparison);
        setAwardSummary(summary);

        if (summary && summary.suppliers) {
          const enhanced = processSupplierData(summary.suppliers, comparison);
          setEnhancedSuppliers(enhanced);
        }
      }

      setCurrentReportId(reportData.id);
      await loadApprovalData(reportData.id);
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

      const { data: reportData, error: reportError } = await supabase
        .from('award_reports')
        .select('*')
        .eq('id', reportId)
        .maybeSingle();

      if (reportError || !reportData) {
        throw new Error('Report not found');
      }

      if (reportData.result_json) {
        const comparison = reportData.result_json.comparisonData || [];
        const summary = reportData.result_json.awardSummary || null;

        setComparisonData(comparison);
        setAwardSummary(summary);

        if (summary && summary.suppliers) {
          const enhanced = processSupplierData(summary.suppliers, comparison);
          setEnhancedSuppliers(enhanced);
        }
      }

      setCurrentReportId(reportData.id);
      await loadApprovalData(reportData.id);
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
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId, force: true }),
      });

      if (!response.ok) throw new Error('Failed to regenerate report');

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

  const exportToExcel = () => {
    if (!awardSummary || !currentProject) return;

    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summaryData = [
      ['Award Recommendation Report'],
      ['Project:', currentProject.name],
      ['Client:', currentProject.client || 'N/A'],
      ['Generated:', new Date().toLocaleString()],
      [],
      ['Supplier', 'Rank', 'Weighted Score', 'Total Price', 'Coverage %', 'Risk Score'],
      ...enhancedSuppliers.map(s => [
        s.supplierName,
        s.rank,
        s.weightedTotal.toFixed(1),
        s.totalPrice,
        s.coveragePercent.toFixed(1),
        s.riskMitigationScore.toFixed(1),
      ]),
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

    // Sheet 2: Audit Trail
    if (approvalData) {
      const auditData = [
        ['Approval Audit Trail'],
        [],
        ['Field', 'Value'],
        ['AI Recommended', approvalData.ai_recommended_supplier],
        ['Final Approved', approvalData.final_approved_supplier],
        ['Is Override', approvalData.is_override ? 'Yes' : 'No'],
        ['Override Reason', approvalData.override_reason_category || 'N/A'],
        ['Override Detail', approvalData.override_reason_detail || 'N/A'],
        ['Approved By', approvalData.approved_by_email],
        ['Approved At', new Date(approvalData.approved_at).toLocaleString()],
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(auditData);
      XLSX.utils.book_append_sheet(wb, ws2, 'Approval Audit');
    }

    const filename = `Award_Report_${currentProject.name.replace(/[^a-z0-9]/gi, '_')}.xlsx`;
    XLSX.writeFile(wb, filename);
    onToast?.('Excel exported successfully', 'success');
  };

  const handlePrintPDF = async () => {
    if (!currentProject || !awardSummary) return;

    try {
      // Fetch organization logo if available
      let organisationLogoUrl: string | undefined = undefined;
      if ((currentProject as any).organisation_id) {
        const { data: orgData } = await supabase
          .from('organisations')
          .select('logo_url')
          .eq('id', (currentProject as any).organisation_id)
          .maybeSingle();

        if (orgData?.logo_url) {
          const { data: urlData } = supabase.storage
            .from('organisation-logos')
            .getPublicUrl(orgData.logo_url);

          if (urlData?.publicUrl) {
            try {
              const response = await fetch(urlData.publicUrl);
              const blob = await response.blob();
              const reader = new FileReader();
              const dataUrl = await new Promise<string>((resolve) => {
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              organisationLogoUrl = dataUrl;
            } catch (err) {
              console.error('Error loading organization logo:', err);
            }
          }
        }
      }

      // Transform suppliers to match PDF template format
      const suppliers = enhancedSuppliers.map((s, idx) => ({
        rank: idx + 1,
        supplierName: s.supplierName,
        adjustedTotal: s.totalPrice,
        riskScore: s.riskMitigationScore,
        coveragePercent: s.coveragePercent,
        itemsQuoted: s.itemsQuoted,
        totalItems: awardSummary.totalSystems,
        weightedScore: s.weightedTotal,
        notes: []
      }));

      // Transform recommendations
      const recommendations = [];
      if (bestValue) {
        recommendations.push({
          type: 'best_value' as const,
          supplierName: bestValue.supplierName,
          price: bestValue.totalPrice,
          coverage: bestValue.coveragePercent,
          riskScore: bestValue.riskMitigationScore,
          score: bestValue.weightedTotal
        });
      }
      if (lowestRisk) {
        recommendations.push({
          type: 'lowest_risk' as const,
          supplierName: lowestRisk.supplierName,
          price: lowestRisk.totalPrice,
          coverage: lowestRisk.coveragePercent,
          riskScore: lowestRisk.riskMitigationScore,
          score: lowestRisk.weightedTotal
        });
      }
      if (topSupplier) {
        recommendations.push({
          type: 'balanced' as const,
          supplierName: topSupplier.supplierName,
          price: topSupplier.totalPrice,
          coverage: topSupplier.coveragePercent,
          riskScore: topSupplier.riskMitigationScore,
          score: topSupplier.weightedTotal
        });
      }

      // Add approval details if available
      const additionalSections = [];
      if (approvalData) {
        const overrideTag = approvalData.is_override
          ? `<span style="display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-left: 8px;">OVERRIDE</span>`
          : '';

        additionalSections.push({
          title: `Approval Decision${overrideTag}`,
          content: `
            <div style="background: ${approvalData.is_override ? '#fef3c7' : '#dcfce7'}; border: 2px solid ${approvalData.is_override ? '#f59e0b' : '#22c55e'}; border-radius: 8px; padding: 20px; margin-top: 16px;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                <div>
                  <p style="font-size: 12px; color: #6b7280; margin-bottom: 4px; font-weight: 600;">Verify+ Recommended</p>
                  <p style="font-size: 16px; color: #111827; font-weight: 600;">${approvalData.ai_recommended_supplier}</p>
                </div>
                <div>
                  <p style="font-size: 12px; color: #6b7280; margin-bottom: 4px; font-weight: 600;">Final Approved Supplier</p>
                  <p style="font-size: 16px; color: ${approvalData.is_override ? '#d97706' : '#059669'}; font-weight: 700;">${approvalData.final_approved_supplier}</p>
                </div>
              </div>
              ${approvalData.is_override ? `
                <div style="border-top: 2px solid #f59e0b; padding-top: 16px; margin-top: 16px;">
                  <p style="font-size: 12px; color: #92400e; font-weight: 600; margin-bottom: 8px;">Override Reason:</p>
                  <p style="font-size: 14px; color: #78350f; font-weight: 600; margin-bottom: 8px;">${approvalData.override_reason_category?.replace(/_/g, ' ').toUpperCase() || 'N/A'}</p>
                  <p style="font-size: 14px; color: #451a03; line-height: 1.6;">${approvalData.override_reason_detail || 'No additional details provided.'}</p>
                </div>
              ` : ''}
              <div style="border-top: 1px solid ${approvalData.is_override ? '#fbbf24' : '#86efac'}; padding-top: 12px; margin-top: 16px; display: flex; justify-content: space-between; font-size: 12px; color: #6b7280;">
                <span><strong>Approved By:</strong> ${approvalData.approved_by_email}</span>
                <span><strong>Approved At:</strong> ${new Date(approvalData.approved_at).toLocaleString()}</span>
              </div>
            </div>
          `
        });
      }

      const htmlContent = generateModernPdfHtml({
        projectName: currentProject.name,
        clientName: currentProject.client || undefined,
        generatedAt: new Date().toLocaleDateString(),
        recommendations,
        suppliers,
        organisationLogoUrl,
        executiveSummary: `This report provides a comprehensive evaluation of ${suppliers.length} supplier quotes received for ${currentProject.name}. Our analysis employs a multi-criteria assessment framework evaluating pricing competitiveness, technical compliance, scope completeness, and risk factors. The recommended supplier demonstrates optimal value delivery across all evaluation dimensions.`,
        methodology: [
          'Quote Import & Validation',
          'Data Normalization',
          'Scope Gap Analysis',
          'Risk Assessment',
          'Multi-Criteria Scoring'
        ],
        additionalSections
      });

      const filename = `Award_Report_${currentProject.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      generatePdfWithPrint(htmlContent, filename);

      onToast?.('PDF print dialog opened! Choose "Save as PDF" as your printer destination.', 'success');
    } catch (error) {
      console.error('Error generating PDF:', error);
      onToast?.('Failed to generate PDF report', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-900">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!awardSummary || enhancedSuppliers.length === 0) {
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

  const topSupplier = enhancedSuppliers[0];
  const bestValue = enhancedSuppliers.find(s => s.isBestValue);
  const lowestRisk = enhancedSuppliers.find(s => s.isLowestRisk);

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="bg-slate-800/60 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-3">
              <button
                onClick={handleRecalculate}
                disabled={recalculating}
                className="flex items-center gap-2 px-3 py-2 border border-slate-600 bg-slate-800/60 text-slate-300 rounded-md hover:bg-slate-700/50 disabled:opacity-50 transition-colors text-sm"
              >
                <RefreshCw size={16} className={recalculating ? 'animate-spin' : ''} />
                Recalculate
              </button>

              <button
                onClick={() => setShowRevisionModal(true)}
                className="flex items-center gap-2 px-4 py-2 border border-blue-600 bg-blue-900/30 text-blue-300 rounded-md hover:bg-blue-900/50 transition-all text-sm font-semibold"
              >
                <Mail size={16} />
                Request Revisions
              </button>

              <button
                onClick={() => setShowApprovalModal(true)}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-md hover:from-orange-700 hover:to-orange-800 transition-all text-sm font-bold shadow-lg"
              >
                <CheckCircle2 size={16} />
                {approvalData ? 'Change Approval' : 'Approve Award'}
              </button>

              <div className="relative" ref={exportDropdownRef}>
                <button
                  onClick={() => setShowExportDropdown(!showExportDropdown)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 transition-all text-sm font-medium shadow-lg"
                >
                  <Download size={16} />
                  Export Report
                  <ChevronDown size={14} className={`transition-transform ${showExportDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showExportDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-slate-800 rounded-lg shadow-xl border border-slate-700 z-50">
                    <div className="py-1">
                      <button
                        onClick={() => {
                          handlePrintPDF();
                          setShowExportDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                      >
                        <Printer size={16} />
                        Export PDF
                      </button>
                      <button
                        onClick={() => {
                          exportToExcel();
                          setShowExportDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                      >
                        <FileSpreadsheet size={16} />
                        Export Excel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-5xl font-bold text-white mb-3">Award Recommendation Report</h1>
          <p className="text-xl text-slate-300 mb-6">Project Analysis & Supplier Evaluation</p>
          <div className="inline-flex items-center gap-6 text-sm text-slate-400 bg-slate-800/40 px-8 py-3 rounded-lg border border-slate-700/50">
            <div>
              <span className="font-semibold text-slate-300">Project:</span> {currentProject?.name}
            </div>
            <div className="h-4 w-px bg-slate-600"></div>
            <div>
              <span className="font-semibold text-slate-300">Suppliers:</span> {enhancedSuppliers.length}
            </div>
            <div className="h-4 w-px bg-slate-600"></div>
            <div>
              <span className="font-semibold text-slate-300">Systems:</span> {awardSummary.totalSystems}
            </div>
          </div>
        </div>

        {/* Approval Status Banner */}
        {approvalData && (
          <div className={`rounded-xl p-6 border-2 ${
            approvalData.is_override
              ? 'bg-yellow-900/20 border-yellow-600/50'
              : 'bg-green-900/20 border-green-600/50'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  approvalData.is_override ? 'bg-yellow-600' : 'bg-green-600'
                }`}>
                  <Award className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${
                    approvalData.is_override ? 'text-yellow-300' : 'text-green-300'
                  }`}>
                    {approvalData.is_override ? 'Award Approved with Override' : 'Award Approved'}
                  </p>
                  <p className="text-white font-bold text-lg">{approvalData.final_approved_supplier}</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Approved by {approvalData.approved_by_email} on {new Date(approvalData.approved_at).toLocaleString()}
                  </p>
                </div>
              </div>
              {approvalData.is_override && (
                <div className="text-right">
                  <p className="text-xs text-yellow-400 mb-1">AI Recommended</p>
                  <p className="text-yellow-200 font-semibold">{approvalData.ai_recommended_supplier}</p>
                  <p className="text-xs text-yellow-400 mt-2">Override Reason</p>
                  <p className="text-yellow-200 text-sm">{approvalData.override_reason_category?.replace('_', ' ')}</p>
                </div>
              )}
            </div>
            {approvalData.is_override && approvalData.override_reason_detail && (
              <div className="mt-4 pt-4 border-t border-yellow-600/30">
                <p className="text-sm text-yellow-300 font-semibold mb-2">Rationale:</p>
                <p className="text-yellow-100 text-sm leading-relaxed">{approvalData.override_reason_detail}</p>
              </div>
            )}
          </div>
        )}

        {/* Enhanced Recommendations */}
        <EnhancedRecommendationsCard
          bestValue={bestValue || null}
          lowestRisk={lowestRisk || null}
          balanced={topSupplier}
          highestPrice={Math.max(...enhancedSuppliers.map(s => s.totalPrice))}
          lowestPrice={Math.min(...enhancedSuppliers.map(s => s.totalPrice))}
        />

        {/* Methodology */}
        <MethodologyFlowchart />

        {/* Enhanced Supplier Table */}
        <EnhancedSupplierTable suppliers={enhancedSuppliers} />

        {/* Weighted Scoring Breakdown */}
        <WeightedScoringBreakdown suppliers={enhancedSuppliers} weights={weights} />

        {/* Coverage Breakdown Charts */}
        {enhancedSuppliers.slice(0, 3).map((supplier) => (
          <CoverageBreakdownChart key={supplier.supplierName} supplier={supplier} />
        ))}
      </div>

      {/* Approval Modal */}
      {showApprovalModal && currentReportId && (
        <ApprovalModal
          isOpen={showApprovalModal}
          onClose={() => setShowApprovalModal(false)}
          reportId={currentReportId}
          projectId={projectId}
          organisationId={organisationId}
          aiRecommendedSupplier={topSupplier}
          allSuppliers={enhancedSuppliers}
          onApprovalComplete={(approvalId) => {
            setShowApprovalModal(false);
            loadSavedReport(currentReportId);
          }}
          onToast={onToast}
          existingApprovalId={approvalData?.id || null}
        />
      )}

      {/* Revision Request Modal */}
      {showRevisionModal && currentProject && (
        <RevisionRequestModal
          projectId={projectId}
          projectName={currentProject.name}
          clientName={currentProject.client || undefined}
          reportId={currentReportId || undefined}
          suppliers={enhancedSuppliers.map(s => ({
            quoteId: s.quoteId || '',
            supplierName: s.supplierName,
            coveragePercent: s.coveragePercent,
            itemsQuoted: s.itemsQuoted,
            totalItems: awardSummary?.totalSystems || 0,
            gapsCount: (awardSummary?.totalSystems || 0) - s.itemsQuoted,
            scopeGaps: s.scopeGaps?.map(gap => ({
              system: gap.system || 'Unknown System',
              category: gap.category,
              itemsCount: gap.itemsCount || 1,
              estimatedImpact: gap.estimatedImpact || 'Incomplete coverage',
              details: gap.details || []
            })) || []
          }))}
          onClose={() => setShowRevisionModal(false)}
          onSuccess={(requestId) => {
            setShowRevisionModal(false);
            onToast?.('Revision requests created successfully', 'success');
          }}
          onToast={onToast}
        />
      )}
    </div>
  );
}
