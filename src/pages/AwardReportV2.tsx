import { useState, useEffect } from 'react';
import { Award, FileText, Download, Printer, TrendingUp, AlertTriangle, CheckCircle, Info, Sparkles, Brain } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../i18n';
import * as XLSX from 'xlsx';
import { analyzeQuoteIntelligence } from '../lib/quoteIntelligence/analyzer';
import type { QuoteIntelligenceAnalysis } from '../types/quoteIntelligence.types';
import ReportExportBar, { type ExportType } from '../components/ReportExportBar';
import SupplierApprovalPanel from '../components/SupplierApprovalPanel';
import RFIGenerator from '../components/RFIGenerator';
import UnsuccessfulLettersGenerator from '../components/UnsuccessfulLettersGenerator';
import { generateModernPdfHtml, downloadPdfHtml } from '../lib/reports/modernPdfTemplate';

interface SupplierScore {
  supplierName: string;
  priceScore: number;
  complianceScore: number;
  scopeCoverageScore: number;
  riskScore: number;
  weightedScore: number;
  rank: number;
  price: number;
  coveragePercent: number;
  itemsQuoted: number;
  totalItems: number;
  notes: string[];
  risks: string[];
  clarifications: string[];
}

interface ReportData {
  projectName: string;
  clientName: string;
  generatedAt: string;
  suppliers: SupplierScore[];
  recommendedSupplier: SupplierScore;
  weightings: {
    price: number;
    compliance: number;
    scopeCoverage: number;
    risk: number;
  };
  executiveSummary: string;
  awardRationale: string;
  conditionsOfAward: string[];
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

interface AwardReportV2Props {
  projectId: string;
  onToast?: (message: string, type: 'success' | 'error') => void;
  onNavigateToEqualisation?: () => void;
  onNavigateBack?: () => void;
  onNavigateNext?: () => void;
}

export default function AwardReportV2({ projectId, onToast, onNavigateToEqualisation, onNavigateBack, onNavigateNext }: AwardReportV2Props) {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiNarrativeEnabled, setAiNarrativeEnabled] = useState(false);
  const [generatingNarrative, setGeneratingNarrative] = useState(false);
  const [intelligenceData, setIntelligenceData] = useState<QuoteIntelligenceAnalysis | null>(null);
  const [loadingIntelligence, setLoadingIntelligence] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [approvedSupplierQuoteId, setApprovedSupplierQuoteId] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [quoteDate, setQuoteDate] = useState<string>('');
  const [approvalData, setApprovalData] = useState<ApprovalData | null>(null);

  useEffect(() => {
    if (projectId) {
      loadReportData();
      loadIntelligenceData();
    }
  }, [projectId]);

  useEffect(() => {
    if (reportId) {
      loadApprovalData();
    }
  }, [reportId]);

  const loadIntelligenceData = async () => {
    setLoadingIntelligence(true);
    try {
      const analysis = await analyzeQuoteIntelligence(projectId);
      setIntelligenceData(analysis);
    } catch (error) {
      console.error('Error loading intelligence data:', error);
    } finally {
      setLoadingIntelligence(false);
    }
  };

  const loadApprovalData = async () => {
    if (!reportId) return;

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
        const { data: userData } = await supabase
          .from('organisation_members')
          .select('user_id')
          .eq('user_id', approvals.approved_by_user_id)
          .maybeSingle();

        const approvalWithEmail = {
          ...approvals,
          approved_by_email: userData?.user_id || 'Unknown'
        };

        setApprovalData(approvalWithEmail);
        setIsApproved(true);
      }
    } catch (error) {
      console.error('Error loading approval data:', error);
    }
  };

  const loadReportData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: settings } = await supabase
        .from('project_settings')
        .select('settings')
        .eq('project_id', projectId)
        .maybeSingle();

      if (!settings?.settings?.last_equalisation_run) {
        setError('Equalisation has not been completed for this project yet. Please run Equalisation before generating an Award Report.');
        setLoading(false);
        return;
      }

      const { data: projectData } = await supabase
        .from('projects')
        .select('name, client')
        .eq('id', projectId)
        .maybeSingle();

      const { data: reportRecord } = await supabase
        .from('award_reports')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!reportRecord || !reportRecord.result_json) {
        setError('No report found. Please generate one from the Reports Hub.');
        setLoading(false);
        return;
      }

      setReportId(reportRecord.id);
      setIsApproved(!!reportRecord.approved_supplier_id);
      setApprovedSupplierQuoteId(reportRecord.approved_supplier_id);

      const awardSummary = reportRecord.result_json.awardSummary;

      const suppliers: SupplierScore[] = awardSummary.suppliers.map((s: any, idx: number) => ({
        supplierName: s.supplierName,
        priceScore: calculatePriceScore(s.adjustedTotal, awardSummary.suppliers),
        complianceScore: 10 - (s.riskScore * 0.5),
        scopeCoverageScore: s.coveragePercent / 10,
        riskScore: 10 - s.riskScore,
        weightedScore: 0,
        rank: idx + 1,
        price: s.adjustedTotal,
        coveragePercent: s.coveragePercent,
        itemsQuoted: s.itemsQuoted,
        totalItems: s.totalItems,
        notes: s.notes || [],
        risks: extractRisks(s.notes || []),
        clarifications: extractClarifications(s.notes || []),
      }));

      const weightings = {
        price: 40,
        compliance: 25,
        scopeCoverage: 20,
        risk: 15,
      };

      suppliers.forEach(s => {
        s.weightedScore =
          (s.priceScore * weightings.price / 100) +
          (s.complianceScore * weightings.compliance / 100) +
          (s.scopeCoverageScore * weightings.scopeCoverage / 100) +
          (s.riskScore * weightings.risk / 100);
      });

      suppliers.sort((a, b) => b.weightedScore - a.weightedScore);
      suppliers.forEach((s, idx) => s.rank = idx + 1);

      const recommended = suppliers[0];

      const { data: recommendedQuote } = await supabase
        .from('quotes')
        .select('id, created_at')
        .eq('project_id', projectId)
        .eq('supplier_name', recommended.supplierName)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recommendedQuote && !approvedSupplierQuoteId) {
        setApprovedSupplierQuoteId(recommendedQuote.id);
      }
      if (recommendedQuote) {
        setQuoteDate(new Date(recommendedQuote.created_at).toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' }));
      }

      setReportData({
        projectName: projectData?.name || 'Unknown Project',
        clientName: projectData?.client || 'N/A',
        generatedAt: new Date().toISOString(),
        suppliers,
        recommendedSupplier: recommended,
        weightings,
        executiveSummary: generateExecutiveSummary(suppliers, recommended, awardSummary),
        awardRationale: generateAwardRationale(recommended, suppliers),
        conditionsOfAward: generateConditionsOfAward(recommended),
      });

    } catch (error: any) {
      console.error('Error loading report data:', error);
      setError(error.message || 'Failed to load report data');
      onToast?.(error.message || 'Failed to load report', 'error');
    } finally {
      setLoading(false);
    }
  };

  const calculatePriceScore = (price: number, allSuppliers: any[]): number => {
    const prices = allSuppliers.map(s => s.adjustedTotal);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    if (maxPrice === minPrice) return 10;
    return 10 - ((price - minPrice) / (maxPrice - minPrice) * 10);
  };

  const extractRisks = (notes: string[]): string[] => {
    return notes.filter(n =>
      n.toLowerCase().includes('risk') ||
      n.toLowerCase().includes('concern') ||
      n.toLowerCase().includes('missing') ||
      n.toLowerCase().includes('variance')
    );
  };

  const extractClarifications = (notes: string[]): string[] => {
    return notes.filter(n =>
      n.toLowerCase().includes('clarif') ||
      n.toLowerCase().includes('confirm') ||
      n.toLowerCase().includes('verify')
    );
  };

  const generateExecutiveSummary = (suppliers: SupplierScore[], recommended: SupplierScore, awardSummary: any): string => {
    return `This report evaluates ${suppliers.length} competitive quotes for ${awardSummary.totalSystems} passive fire protection systems. Following a comprehensive analysis of pricing, technical compliance, scope coverage, and risk factors, ${recommended.supplierName} has been identified as the recommended supplier with the highest weighted score of ${recommended.weightedScore.toFixed(2)}/10.`;
  };

  const generateAwardRationale = (recommended: SupplierScore, suppliers: SupplierScore[]): string => {
    const priceDiff = ((recommended.price - Math.min(...suppliers.map(s => s.price))) / Math.min(...suppliers.map(s => s.price)) * 100).toFixed(1);
    return `${recommended.supplierName} demonstrates the optimal balance of value, compliance, and delivery capability. Their submission achieves ${recommended.coveragePercent.toFixed(0)}% scope coverage (${recommended.itemsQuoted}/${recommended.totalItems} items) and maintains a competitive price position within ${priceDiff}% of the lowest bid, while presenting minimal technical and commercial risk.`;
  };

  const generateConditionsOfAward = (recommended: SupplierScore): string[] => {
    const conditions = [
      'All work to be completed in accordance with approved specifications and drawings',
      'Supplier to provide updated project schedule within 5 business days of award',
      'All materials to comply with specified fire ratings and relevant Australian Standards',
      'Progress claims to be submitted monthly with supporting documentation',
    ];

    if (recommended.risks.length > 0) {
      conditions.push('Supplier to address identified clarifications prior to contract execution');
    }

    if (recommended.coveragePercent < 100) {
      conditions.push('Pricing for scope gaps to be confirmed before commencement');
    }

    return conditions;
  };

  const generateAINarrative = async (section: string, data: any) => {
    setGeneratingNarrative(true);
    try {
      const prompt = `Write a professional assessment explaining the supplier's performance in commercial value, technical compliance, scope completeness, and risk, based on the following data: ${JSON.stringify(data)}`;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai_proxy_ask`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      const result = await response.json();
      return result.answer || 'AI narrative generation unavailable.';
    } catch (error) {
      console.error('Error generating AI narrative:', error);
      return null;
    } finally {
      setGeneratingNarrative(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    if (!reportData) return;

    // Transform suppliers data for modern PDF template
    const suppliers = reportData.suppliers.map(s => ({
      rank: s.rank,
      supplierName: s.supplierName,
      adjustedTotal: s.price,
      riskScore: s.riskScore,
      coveragePercent: s.coveragePercent,
      itemsQuoted: s.itemsQuoted,
      totalItems: s.totalItems,
      weightedScore: s.weightedScore,
      notes: s.notes
    }));

    // Create recommendation cards (Best Value, Lowest Risk, Balanced)
    const recommendations = [
      {
        type: 'best_value' as const,
        supplierName: reportData.recommendedSupplier.supplierName,
        price: reportData.recommendedSupplier.price,
        coverage: reportData.recommendedSupplier.coveragePercent,
        riskScore: reportData.recommendedSupplier.riskScore,
        score: reportData.recommendedSupplier.weightedScore
      },
      // Find lowest risk supplier
      ...(() => {
        const lowestRisk = [...reportData.suppliers].sort((a, b) => a.riskScore - b.riskScore)[0];
        return lowestRisk ? [{
          type: 'lowest_risk' as const,
          supplierName: lowestRisk.supplierName,
          price: lowestRisk.price,
          coverage: lowestRisk.coveragePercent,
          riskScore: lowestRisk.riskScore,
          score: lowestRisk.weightedScore
        }] : [];
      })(),
      // Find balanced choice (middle of the pack in overall score)
      ...(() => {
        const sorted = [...reportData.suppliers].sort((a, b) => b.weightedScore - a.weightedScore);
        const balanced = sorted[Math.floor(sorted.length / 2)] || sorted[0];
        return balanced ? [{
          type: 'balanced' as const,
          supplierName: balanced.supplierName,
          price: balanced.price,
          coverage: balanced.coveragePercent,
          riskScore: balanced.riskScore,
          score: balanced.weightedScore
        }] : [];
      })()
    ].slice(0, 3);

    // Generate additional sections
    const additionalSections = [];

    // Add Award Rationale section if available
    if (reportData.awardRationale) {
      additionalSections.push({
        title: 'Award Rationale',
        content: `<div style="line-height: 1.8; color: #374151;">${reportData.awardRationale.replace(/\n/g, '<br>')}</div>`
      });
    }

    // Add Conditions of Award if available
    if (reportData.conditionsOfAward && reportData.conditionsOfAward.length > 0) {
      additionalSections.push({
        title: 'Conditions of Award',
        content: `
          <ul style="padding-left: 24px; line-height: 1.8; color: #374151;">
            ${reportData.conditionsOfAward.map(condition => `<li style="margin-bottom: 8px;">${condition}</li>`).join('')}
          </ul>
        `
      });
    }

    // Add Approval Details if available
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

    // Add Key Risks section
    const topSuppliers = reportData.suppliers.slice(0, 3);
    const allRisks = topSuppliers.flatMap(s => s.risks || []).filter(Boolean);
    if (allRisks.length > 0) {
      additionalSections.push({
        title: 'Key Risks & Clarifications',
        content: `
          <div style="line-height: 1.8;">
            ${topSuppliers.map(s => {
              const risks = s.risks || [];
              const clarifications = s.clarifications || [];
              if (risks.length === 0 && clarifications.length === 0) return '';
              return `
                <div style="margin-bottom: 24px;">
                  <h4 style="color: #111827; font-weight: 600; margin-bottom: 8px;">${s.supplierName}</h4>
                  ${risks.length > 0 ? `
                    <div style="color: #dc2626; font-size: 14px; margin-bottom: 8px;">
                      <strong>Risks:</strong> ${risks.join(', ')}
                    </div>
                  ` : ''}
                  ${clarifications.length > 0 ? `
                    <div style="color: #d97706; font-size: 14px;">
                      <strong>Clarifications:</strong> ${clarifications.join(', ')}
                    </div>
                  ` : ''}
                </div>
              `;
            }).filter(Boolean).join('')}
          </div>
        `
      });
    }

    // Generate modern PDF HTML
    const htmlContent = generateModernPdfHtml({
      projectName: reportData.projectName,
      clientName: reportData.clientName || undefined,
      generatedAt: reportData.generatedAt,
      recommendations,
      suppliers,
      executiveSummary: reportData.executiveSummary,
      methodology: [
        'Quote Import & Validation',
        'Data Normalization',
        'Scope Gap Analysis',
        'Risk Assessment',
        'Multi-Criteria Scoring'
      ],
      additionalSections
    });

    // Download the HTML file
    const filename = `Award_Report_${reportData.projectName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.html`;
    downloadPdfHtml(htmlContent, filename);

    onToast?.('Modern PDF report downloaded! Open the HTML file and use "Print to PDF" to save as PDF.', 'success');
  };

  const handleExportExcel = () => {
    if (!reportData) return;

    const wb = XLSX.utils.book_new();

    const summaryData = [
      ['Award Recommendation Report V2.0'],
      ['Project:', reportData.projectName],
      ['Client:', reportData.clientName],
      ['Generated:', new Date(reportData.generatedAt).toLocaleString()],
      [],
      ['Recommended Supplier:', reportData.recommendedSupplier.supplierName],
      ['Weighted Score:', reportData.recommendedSupplier.weightedScore.toFixed(2)],
      ['Price:', `$${reportData.recommendedSupplier.price.toLocaleString()}`],
      [],
      ['Supplier', 'Rank', 'Weighted Score', 'Price Score', 'Compliance Score', 'Coverage Score', 'Risk Score', 'Total Price'],
      ...reportData.suppliers.map(s => [
        s.supplierName,
        s.rank,
        s.weightedScore.toFixed(2),
        s.priceScore.toFixed(2),
        s.complianceScore.toFixed(2),
        s.scopeCoverageScore.toFixed(2),
        s.riskScore.toFixed(2),
        s.price,
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws, 'Award Report');

    const filename = `${reportData.projectName}_AwardReport_V2.xlsx`;
    XLSX.writeFile(wb, filename);
    onToast?.('Excel report exported successfully', 'success');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mb-4"></div>
          <p className="text-slate-400">Loading award report...</p>
        </div>
      </div>
    );
  }

  const handleGenerateReport = async () => {
    try {
      setLoading(true);
      setError(null);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compute_award_report`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Report generation failed:', errorData);
        throw new Error(errorData.message || 'Failed to generate report');
      }

      const result = await response.json();
      console.log('Report generated successfully:', result);

      await loadReportData();

      if (onToast) {
        onToast('Award report generated successfully', 'success');
      }
    } catch (error) {
      console.error('Error generating report:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate report. Please try again.';
      setError(errorMessage);

      if (onToast) {
        onToast(errorMessage, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  if (error || !reportData) {
    const isEqualisationMissing = error?.includes('Equalisation has not been completed');
    const isNoReport = error?.includes('No report found');

    return (
      <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-8 text-center max-w-2xl mx-auto mt-12">
        <div className="w-16 h-16 bg-blue-900/200/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-blue-400" />
        </div>
        <h3 className="text-xl font-bold text-slate-100 mb-2">
          {isEqualisationMissing ? 'Equalisation Required' : 'No Report Available'}
        </h3>
        <p className="text-slate-400 mb-6">{error || 'Unable to load report data'}</p>
        {isEqualisationMissing && onNavigateToEqualisation && (
          <button
            type="button"
            onClick={onNavigateToEqualisation}
            className="btn-primary mx-auto"
          >
            Go to Equalisation
          </button>
        )}
        {isNoReport && !isEqualisationMissing && (
          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={loading}
            className="btn-primary mx-auto"
          >
            {loading ? 'Generating Report...' : 'Generate Award Report'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
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
              padding: 20mm;
              background: white !important;
            }
            #printable-report * {
              background: white !important;
              color: black !important;
              border-color: #e5e7eb !important;
            }
            #printable-report .bg-slate-800\\/60,
            #printable-report .bg-slate-800\\/40,
            #printable-report .bg-slate-700,
            #printable-report .bg-slate-600 {
              background: white !important;
            }
            #printable-report .bg-red-900\\/20,
            #printable-report .bg-yellow-900\\/20,
            #printable-report .bg-green-900\\/20,
            #printable-report .bg-blue-900\\/20 {
              background: #f9fafb !important;
            }
            #printable-report .text-slate-100,
            #printable-report .text-slate-200,
            #printable-report .text-slate-300,
            #printable-report .text-slate-400 {
              color: #1f2937 !important;
            }
            #printable-report table th {
              background: #3b82f6 !important;
              color: white !important;
            }
            #printable-report table tbody tr:nth-child(even) {
              background: #f9fafb !important;
            }
            .no-print {
              display: none !important;
            }
            .page-break {
              page-break-after: always;
            }
          }
        `}
      </style>

      <div className="no-print bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{t('report.title')}</h1>
            <p className="text-sm text-slate-400 mt-1">
              Professional board-level award recommendation
            </p>
          </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={aiNarrativeEnabled}
              onChange={(e) => setAiNarrativeEnabled(e.target.checked)}
              className="rounded border-slate-600 bg-slate-700 text-blue-400 focus:ring-blue-500"
            />
            <Sparkles className="w-4 h-4" />
            AI Narrative
          </label>
          <ReportExportBar
            onExport={(type) => {
              if (type === 'print') handlePrint();
              else if (type === 'html') handleExportPDF();
              else if (type === 'excel') handleExportExcel();
            }}
            availableTypes={['print', 'html', 'excel']}
          />
        </div>
        </div>
      </div>

      {/* Approval Panel and Document Generation (No Print) */}
      {reportId && approvedSupplierQuoteId && reportData && (
        <div className="no-print space-y-4">
          <SupplierApprovalPanel
            projectId={projectId}
            reportId={reportId}
            supplierName={reportData.recommendedSupplier.supplierName}
            supplierQuoteId={approvedSupplierQuoteId}
            totalValue={reportData.recommendedSupplier.price}
            isApproved={isApproved}
            onApprovalComplete={() => {
              setIsApproved(true);
              loadReportData();
            }}
          />

          {isApproved && (
            <div className="grid grid-cols-2 gap-4">
              <RFIGenerator
                projectId={projectId}
                projectName={reportData.projectName}
                supplierName={reportData.recommendedSupplier.supplierName}
                quoteId={approvedSupplierQuoteId}
                quoteDate={quoteDate}
                intelligenceData={intelligenceData}
                onGenerated={() => loadReportData()}
              />
              <UnsuccessfulLettersGenerator
                projectId={projectId}
                projectName={reportData.projectName}
                allSuppliers={reportData.suppliers}
                preferredSupplier={reportData.recommendedSupplier}
                intelligenceData={intelligenceData}
                onGenerated={() => loadReportData()}
              />
            </div>
          )}
        </div>
      )}

      <div id="printable-report" className="space-y-6">
          {/* 1. Cover Page */}
          <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-8 text-center page-break">
          <div className="py-16">
            <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Award className="w-10 h-10 text-blue-400" />
            </div>
            <h1 className="text-4xl font-bold text-slate-100 mb-4">{t('report.title')}</h1>
            <div className="text-lg text-slate-300 mb-8">
              <p className="font-semibold">{reportData.projectName}</p>
              <p className="text-slate-400">{reportData.clientName}</p>
            </div>
            <div className="inline-block bg-blue-900/20 border-2 border-blue-500 rounded-lg px-8 py-4 mb-8">
              <p className="text-sm text-blue-300 font-medium mb-2">{t('report.recommended_supplier')}</p>
              <p className="text-3xl font-bold text-blue-200">{reportData.recommendedSupplier.supplierName}</p>
              <p className="text-lg text-blue-300 mt-2">
                Score: {reportData.recommendedSupplier.weightedScore.toFixed(2)}/10
              </p>
            </div>
            <p className="text-sm text-slate-400 mt-12">
              Generated: {new Date(reportData.generatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* 2. Executive Summary */}
        <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6 page-break">
          <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-400" />
            {t('report.executive_summary')}
          </h2>
          <div className="prose max-w-none">
            <p className="text-slate-300 leading-relaxed text-lg mb-4">
              {reportData.executiveSummary}
            </p>
            <div className="grid grid-cols-3 gap-4 mt-6 p-6 bg-slate-700/50 rounded-lg border border-slate-600">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">{reportData.suppliers.length}</div>
                <div className="text-sm text-slate-300 mt-1">Suppliers Evaluated</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">${reportData.recommendedSupplier.price.toLocaleString()}</div>
                <div className="text-sm text-slate-300 mt-1">Recommended Price</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">{reportData.recommendedSupplier.coveragePercent.toFixed(0)}%</div>
                <div className="text-sm text-slate-300 mt-1">Scope Coverage</div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Quote Intelligence Summary */}
        {intelligenceData && (
          <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6 page-break">
            <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3">
              <Brain className="w-6 h-6 text-blue-400" />
              Quote Intelligence Summary
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              This analysis identifies scope coverage, red flags, and potential risks across all supplier quotes to support informed decision-making.
            </p>

            {loadingIntelligence ? (
              <div className="text-center py-8 text-slate-400">
                Loading intelligence analysis...
              </div>
            ) : (
              <div className="space-y-6">
                {/* Key Metrics */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-red-400">{intelligenceData.summary.totalRedFlags}</div>
                    <div className="text-xs text-red-300 mt-1">Red Flags</div>
                  </div>
                  <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-yellow-400">{intelligenceData.summary.criticalIssues}</div>
                    <div className="text-xs text-yellow-300 mt-1">Critical Issues</div>
                  </div>
                  <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-400">{Math.round(intelligenceData.summary.coverageScore)}%</div>
                    <div className="text-xs text-green-300 mt-1">Coverage Score</div>
                  </div>
                  <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-400">{Math.round(intelligenceData.summary.averageQualityScore)}%</div>
                    <div className="text-xs text-blue-300 mt-1">Quality Score</div>
                  </div>
                </div>

                {/* Red Flags */}
                {intelligenceData.redFlags && intelligenceData.redFlags.length > 0 ? (
                  <div className="bg-red-900/20 border-l-4 border-red-500 p-4 rounded-r-lg">
                    <h3 className="font-semibold text-red-200 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      Red Flags Overview ({intelligenceData.redFlags.length})
                    </h3>
                    <ul className="space-y-2">
                      {intelligenceData.redFlags.slice(0, 5).map((flag, idx) => (
                        <li key={idx} className="text-sm text-red-300">
                          <span className="font-medium">{flag.title}:</span> {flag.description}
                          {flag.recommendation && <span className="block text-xs mt-1 text-red-400">→ {flag.recommendation}</span>}
                        </li>
                      ))}
                    </ul>
                    {intelligenceData.redFlags.length > 5 && (
                      <p className="text-xs text-red-400 mt-2">+ {intelligenceData.redFlags.length - 5} more red flags identified</p>
                    )}
                  </div>
                ) : (
                  <div className="bg-green-900/20 border-l-4 border-green-500 p-4 rounded-r-lg">
                    <h3 className="font-semibold text-green-200 mb-2 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      No Red Flags Detected
                    </h3>
                    <p className="text-sm text-green-300">All quotes appear to be in good order with no critical issues identified.</p>
                  </div>
                )}

                {/* Coverage Gaps */}
                {intelligenceData.coverageGaps && intelligenceData.coverageGaps.length > 0 ? (
                  <div className="bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded-r-lg">
                    <h3 className="font-semibold text-yellow-200 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      Coverage Gaps Between Suppliers ({intelligenceData.coverageGaps.length})
                    </h3>
                    <ul className="space-y-2">
                      {intelligenceData.coverageGaps.slice(0, 5).map((gap, idx) => (
                        <li key={idx} className="text-sm text-yellow-300">
                          <span className="font-medium">{gap.title}:</span> Missing from {gap.missingIn.join(', ')}
                          {gap.estimatedImpact > 0 && <span className="block text-xs mt-1 text-yellow-400">Estimated impact: ${gap.estimatedImpact.toLocaleString()}</span>}
                        </li>
                      ))}
                    </ul>
                    {intelligenceData.coverageGaps.length > 5 && (
                      <p className="text-xs text-yellow-400 mt-2">+ {intelligenceData.coverageGaps.length - 5} more gaps identified</p>
                    )}
                  </div>
                ) : (
                  <div className="bg-green-900/20 border-l-4 border-green-500 p-4 rounded-r-lg">
                    <h3 className="font-semibold text-green-200 mb-2 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      No Coverage Gaps Detected
                    </h3>
                    <p className="text-sm text-green-300">All suppliers cover the required scope consistently.</p>
                  </div>
                )}

                {/* Best Value Supplier */}
                <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-300 font-medium">Best Value Supplier</p>
                      <p className="text-lg font-bold text-blue-200">{intelligenceData.summary.bestValueSupplier}</p>
                    </div>
                    <div>
                      <p className="text-sm text-blue-300 font-medium">Most Complete Supplier</p>
                      <p className="text-lg font-bold text-blue-200">{intelligenceData.summary.mostCompleteSupplier}</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-400 italic">
                  For detailed intelligence analysis including all red flags, coverage gaps, and supplier insights, please see the full Quote Intelligence Report.
                </p>
              </div>
            )}
          </div>
        )}

        {/* 4. How to Interpret This Report */}
        <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6 page-break">
          <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3">
            <Info className="w-6 h-6 text-blue-400" />
            {t('report.interpretation_title')}
          </h2>
          <div className="space-y-6">
            <div className="bg-blue-900/20 border-l-4 border-blue-600 p-4 rounded-r-lg">
              <h3 className="font-semibold text-slate-100 mb-2">{t('report.scoring_definitions')}</h3>
              <p className="text-sm text-slate-300 mb-3">
                Each supplier is evaluated across four key criteria, weighted according to project priorities:
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-100">{t('report.price')}</h4>
                  <span className="text-blue-400 font-bold">{reportData.weightings.price}%</span>
                </div>
                <p className="text-sm text-slate-400">
                  Competitive pricing relative to market and other submissions
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-100">{t('report.compliance')}</h4>
                  <span className="text-blue-400 font-bold">{reportData.weightings.compliance}%</span>
                </div>
                <p className="text-sm text-slate-400">
                  Technical compliance with specifications and standards
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-100">{t('report.scope_coverage')}</h4>
                  <span className="text-blue-400 font-bold">{reportData.weightings.scopeCoverage}%</span>
                </div>
                <p className="text-sm text-slate-400">
                  Completeness of scope and items quoted
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-100">{t('report.risk')}</h4>
                  <span className="text-blue-400 font-bold">{reportData.weightings.risk}%</span>
                </div>
                <p className="text-sm text-slate-400">
                  Commercial and delivery risk assessment
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Supplier Comparison Summary */}
        <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6 page-break">
          <h2 className="text-2xl font-bold text-slate-100 mb-6">{t('report.supplier_summary')}</h2>
          <div className="overflow-x-auto">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>{t('report.rank')}</th>
                  <th>Supplier</th>
                  <th className="text-right">{t('report.weighted_score')}</th>
                  <th className="text-right">{t('report.price')}</th>
                  <th className="text-right">{t('report.compliance')}</th>
                  <th className="text-right">{t('report.scope_coverage')}</th>
                  <th className="text-right">{t('report.risk')}</th>
                  <th className="text-right">Total Price</th>
                </tr>
              </thead>
              <tbody>
                {reportData.suppliers.map((supplier, idx) => (
                  <tr key={idx} className={supplier.rank === 1 ? 'bg-blue-900/20' : ''}>
                    <td className="font-bold">
                      {supplier.rank === 1 ? (
                        <span className="inline-flex items-center gap-1 text-blue-400">
                          <Award className="w-4 h-4" />
                          {supplier.rank}
                        </span>
                      ) : supplier.rank}
                    </td>
                    <td className="font-semibold text-slate-100">{supplier.supplierName}</td>
                    <td className="text-right font-bold text-blue-400">{supplier.weightedScore.toFixed(2)}</td>
                    <td className="text-right">{supplier.priceScore.toFixed(1)}</td>
                    <td className="text-right">{supplier.complianceScore.toFixed(1)}</td>
                    <td className="text-right">{supplier.scopeCoverageScore.toFixed(1)}</td>
                    <td className="text-right">{supplier.riskScore.toFixed(1)}</td>
                    <td className="text-right font-semibold">${supplier.price.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 5. Detailed Supplier Commentary */}
        <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6 page-break">
          <h2 className="text-2xl font-bold text-slate-100 mb-6">{t('report.detailed_commentary')}</h2>
          <div className="space-y-6">
            {reportData.suppliers.map((supplier, idx) => (
              <div key={idx} className="border-l-4 border-gray-300 pl-4 pb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    {supplier.rank === 1 && <Award className="w-5 h-5 text-blue-400" />}
                    {supplier.supplierName}
                  </h3>
                  <span className="px-3 py-1 bg-slate-700 rounded-full text-sm font-medium">
                    Rank #{supplier.rank}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="metric-tile-mini">
                    <div className="text-xs text-slate-400">Price</div>
                    <div className="text-lg font-bold text-slate-100">${supplier.price.toLocaleString()}</div>
                  </div>
                  <div className="metric-tile-mini">
                    <div className="text-xs text-slate-400">Coverage</div>
                    <div className="text-lg font-bold text-slate-100">{supplier.coveragePercent.toFixed(0)}%</div>
                  </div>
                  <div className="metric-tile-mini">
                    <div className="text-xs text-slate-400">Items</div>
                    <div className="text-lg font-bold text-slate-100">{supplier.itemsQuoted}/{supplier.totalItems}</div>
                  </div>
                  <div className="metric-tile-mini">
                    <div className="text-xs text-slate-400">Score</div>
                    <div className="text-lg font-bold text-blue-400">{supplier.weightedScore.toFixed(2)}</div>
                  </div>
                </div>
                {supplier.notes.length > 0 && (
                  <div className="text-sm text-slate-300">
                    <p className="font-medium mb-2">Key Notes:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {supplier.notes.slice(0, 3).map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 6. Identified Risks & Clarifications */}
        <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6 page-break">
          <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-orange-500" />
            {t('report.risk_section')}
          </h2>
          <div className="space-y-4">
            {reportData.suppliers.map((supplier, idx) => (
              (supplier.risks.length > 0 || supplier.clarifications.length > 0) && (
                <div key={idx} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-100 mb-3">{supplier.supplierName}</h3>
                  {supplier.risks.length > 0 && (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-orange-700 mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Risks
                      </p>
                      <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                        {supplier.risks.map((risk, i) => (
                          <li key={i}>{risk}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {supplier.clarifications.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-blue-300 mb-2 flex items-center gap-2">
                        <Info className="w-4 h-4" />
                        Clarifications Required
                      </p>
                      <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                        {supplier.clarifications.map((clarif, i) => (
                          <li key={i}>{clarif}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            ))}
            {reportData.suppliers.every(s => s.risks.length === 0 && s.clarifications.length === 0) && (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="text-slate-400">No significant risks or clarifications identified</p>
              </div>
            )}
          </div>
        </div>

        {/* 7. Weighted Score Breakdown */}
        <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6 page-break">
          <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-blue-400" />
            {t('report.score_breakdown')}
          </h2>
          <div className="space-y-6">
            {reportData.suppliers.map((supplier, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-100">{supplier.supplierName}</h3>
                  <div className="text-2xl font-bold text-blue-400">{supplier.weightedScore.toFixed(2)}/10</div>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Price', score: supplier.priceScore, weight: reportData.weightings.price, color: 'bg-blue-900/200' },
                    { label: 'Compliance', score: supplier.complianceScore, weight: reportData.weightings.compliance, color: 'bg-green-900/200' },
                    { label: 'Scope Coverage', score: supplier.scopeCoverageScore, weight: reportData.weightings.scopeCoverage, color: 'bg-purple-500' },
                    { label: 'Risk', score: supplier.riskScore, weight: reportData.weightings.risk, color: 'bg-orange-500' },
                  ].map((item, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-slate-300">{item.label} ({item.weight}%)</span>
                        <span className="text-slate-100">{item.score.toFixed(2)}/10</span>
                      </div>
                      <div className="w-full bg-slate-600 rounded-full h-2">
                        <div className={`${item.color} h-2 rounded-full`} style={{ width: `${(item.score / 10) * 100}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 8. Award Recommendation */}
        <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6 page-break">
          <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3">
            <Award className="w-6 h-6 text-blue-400" />
            {t('report.award_recommendation')}
          </h2>
          <div className="bg-blue-900/20 border-2 border-blue-600 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              <Award className="w-12 h-12 text-blue-400" />
              <div>
                <p className="text-sm text-blue-300 font-medium">Recommended for Award</p>
                <h3 className="text-3xl font-bold text-blue-200">{reportData.recommendedSupplier.supplierName}</h3>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div>
                <div className="text-sm text-blue-300">Total Price</div>
                <div className="text-xl font-bold text-blue-200">${reportData.recommendedSupplier.price.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-blue-300">Weighted Score</div>
                <div className="text-xl font-bold text-blue-200">{reportData.recommendedSupplier.weightedScore.toFixed(2)}/10</div>
              </div>
              <div>
                <div className="text-sm text-blue-300">Coverage</div>
                <div className="text-xl font-bold text-blue-200">{reportData.recommendedSupplier.coveragePercent.toFixed(0)}%</div>
              </div>
              <div>
                <div className="text-sm text-blue-300">Items Quoted</div>
                <div className="text-xl font-bold text-blue-200">{reportData.recommendedSupplier.itemsQuoted}/{reportData.recommendedSupplier.totalItems}</div>
              </div>
            </div>
          </div>
          <div className="prose max-w-none">
            <h3 className="text-lg font-semibold text-slate-100 mb-3">Rationale</h3>
            <p className="text-slate-300 leading-relaxed">
              {reportData.awardRationale}
            </p>
          </div>
        </div>

        {/* 9. Conditions of Award */}
        <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6 page-break">
          <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-600" />
            {t('report.conditions_of_award')}
          </h2>
          <div className="space-y-3">
            {reportData.conditionsOfAward.map((condition, idx) => (
              <div key={idx} className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600/20 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-blue-400">{idx + 1}</span>
                </div>
                <p className="text-slate-300">{condition}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 10. Appendices */}
        <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6">
          <h2 className="text-2xl font-bold text-slate-100 mb-6">{t('report.appendices')}</h2>
          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-100 mb-2">Appendix A: Scoring Methodology</h3>
              <p className="text-sm text-slate-300">
                Detailed scoring methodology available in project documentation.
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-100 mb-2">Appendix B: Supplier Submissions</h3>
              <p className="text-sm text-slate-300">
                Original supplier quote documents retained in project files.
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-100 mb-2">Appendix C: Scope Matrix</h3>
              <p className="text-sm text-slate-300">
                Complete scope comparison matrix available via Scope Matrix module.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
