import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Download, RefreshCw, Award, CheckCircle2, FileSpreadsheet, Printer, ChevronDown, Mail, Square, CheckSquare, ShieldCheck, AlertTriangle, AlertCircle } from 'lucide-react';
import CommercialIntelligencePanel from '../components/intelligence/CommercialIntelligencePanel';
import type { SupplierIntelligenceView, DecisionGateResult } from '../lib/intelligence/types';
import { supabase } from '../lib/supabase';
import type { ComparisonRow } from '../types/comparison.types';
import type { AwardSummary } from '../types/award.types';
import type { EqualisationResult } from '../types/equalisation.types';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import ApprovalModal from '../components/ApprovalModal';
import RevisionRequestModal from '../components/RevisionRequestModal';
import WorkflowNav from '../components/WorkflowNav';
import { generateModernPdfHtml, generatePdfWithPrint } from '../lib/reports/modernPdfTemplate';
import { generateAndDownloadPdf } from '../lib/reports/pdfGenerator';
import { exportScheduleOfRates } from '../lib/export/scheduleOfRatesExport';
import { exportScheduleComparison } from '../lib/export/scheduleComparisonExport';
import { exportSupplierComparison } from '../lib/export/supplierComparisonExport';
import { useTrade } from '../lib/tradeContext';
import EnhancedSupplierTable from '../components/award/EnhancedSupplierTable';
import WeightedScoringBreakdown from '../components/award/WeightedScoringBreakdown';
import CoverageBreakdownChart from '../components/award/CoverageBreakdownChart';
import MethodologyFlowchart from '../components/award/MethodologyFlowchart';
import EnhancedRecommendationsCard from '../components/award/EnhancedRecommendationsCard';
import SupplierDetailModal from '../components/award/SupplierDetailModal';
import { buildEqualisation } from '../lib/equalisation/buildEqualisation';
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
  trade: string;
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
  onNavigateBack?: () => void;
  onNavigateNext?: () => void;
}

export default function AwardReportEnhanced({
  projectId,
  reportId,
  organisationId,
  onToast,
  onNavigate,
  onNavigateBack,
  onNavigateNext,
}: AwardReportEnhancedProps) {
  const { currentTrade } = useTrade();
  const [comparisonData, setComparisonData] = useState<ComparisonRow[]>([]);
  const [awardSummary, setAwardSummary] = useState<AwardSummary | null>(null);
  const [enhancedSuppliers, setEnhancedSuppliers] = useState<EnhancedSupplierMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [currentReportId, setCurrentReportId] = useState<string | null>(reportId || null);
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalData, setApprovalData] = useState<ApprovalData | null>(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [organisationLogoUrl, setOrganisationLogoUrl] = useState<string | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<EnhancedSupplierMetrics | null>(null);
  const [equalisationResult, setEqualisationResult] = useState<EqualisationResult | null>(null);
  const [approvalGateChecked, setApprovalGateChecked] = useState({ scopeGaps: false, commercialRisks: false });
  const [completingWorkflow, setCompletingWorkflow] = useState(false);
  const [intelligenceViews, setIntelligenceViews] = useState<SupplierIntelligenceView[]>([]);

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

  useEffect(() => {
    if (comparisonData.length > 0) {
      const result = buildEqualisation(comparisonData, 'PEER_MEDIAN');
      setEqualisationResult(result);
    } else {
      setEqualisationResult(null);
    }
  }, [comparisonData]);

  const loadProjectInfo = async () => {
    try {
      const { data } = await supabase
        .from('projects')
        .select('id, name, client, approved_quote_id, organisation_id, scoring_weights, trade')
        .eq('id', projectId)
        .maybeSingle();

      if (data) {
        setCurrentProject(data);

        // Load custom scoring weights if available
        if (data.scoring_weights) {
          setWeights(data.scoring_weights as ScoringWeights);
        }

        // Fetch organization logo if available
        if ((data as any).organisation_id) {
          const { data: orgData } = await supabase
            .from('organisations')
            .select('logo_url')
            .eq('id', (data as any).organisation_id)
            .maybeSingle();

          if (orgData?.logo_url) {
            const { data: urlData } = supabase.storage
              .from('organisation-logos')
              .getPublicUrl(orgData.logo_url);

            if (urlData?.publicUrl) {
              setOrganisationLogoUrl(urlData.publicUrl);
            }
          }
        }
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
    const minRisk = Math.min(...suppliers.map(s => s.riskScore));

    // Debug logging for scoring
    console.log('📊 Award Scoring Debug:', {
      supplierCount: suppliers.length,
      priceRange: { lowest: lowestPrice, highest: highestPrice, average: averagePrice },
      riskRange: { min: minRisk, max: maxRisk },
      suppliers: suppliers.map(s => ({
        name: s.supplierName,
        price: s.adjustedTotal,
        riskScore: s.riskScore,
        coverage: s.coveragePercent
      }))
    });

    const enhanced = suppliers.map((supplier) => {
      // Calculate scores (0-10)
      const priceScore = calculatePriceScore(supplier.adjustedTotal, lowestPrice, highestPrice);
      const complianceScore = calculateComplianceScore(supplier.riskScore, maxRisk);
      const coverageScore = calculateCoverageScore(supplier.coveragePercent);
      const riskScore = calculateRiskMitigationScore(supplier.riskScore, maxRisk);

      // Debug individual supplier scoring
      console.log(`📊 ${supplier.supplierName} scores:`, {
        priceScore: priceScore.toFixed(2),
        complianceScore: complianceScore.toFixed(2),
        coverageScore: coverageScore.toFixed(2),
        riskScore: riskScore.toFixed(2),
        rawPrice: supplier.adjustedTotal,
        rawRiskScore: supplier.riskScore,
        coverage: supplier.coveragePercent
      });

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

      // Get missing items with full context for accurate cost estimation
      const missingItems = comparisonData
        .filter(row => !row.suppliers[supplier.supplierName]?.unitPrice)
        .map(row => ({
          description: row.description,
          category: row.category,
          quantity: row.quantity,
          suppliers: row.suppliers, // Include all supplier data for market rate calculation
        }));

      // CRITICAL FIX: Calculate total quantity from comparison data if not provided
      // This is the sum of all quantities across all quoted items, NOT the line item count
      let actualTotalQuantity = (supplier as any).totalQuantity;

      if (!actualTotalQuantity || actualTotalQuantity === 0) {
        // Fallback: Calculate from comparison data
        actualTotalQuantity = comparisonData
          .filter(row => row.suppliers[supplier.supplierName]?.unitPrice !== null)
          .reduce((sum, row) => sum + (row.quantity || 0), 0);
      }

      // If still 0, use items count as last resort
      if (actualTotalQuantity === 0) {
        actualTotalQuantity = supplier.itemsQuoted || 1;
      }

      return {
        supplierName: supplier.supplierName,
        totalPrice: supplier.adjustedTotal,
        systemsCovered: actualTotalQuantity, // FIXED: Use total quantity sum
        totalSystems: supplier.totalItems,
        coveragePercent: supplier.coveragePercent,
        quoteId: supplier.quoteId,
        itemsQuoted: supplier.itemsQuoted,

        normalizedPricePerSystem: calculateNormalizedPrice(supplier.adjustedTotal, actualTotalQuantity), // FIXED: Divide by total quantity
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
          actualTotalQuantity > 0 ? supplier.adjustedTotal / actualTotalQuantity : 0,
          supplier.itemsQuoted || actualTotalQuantity,
          supplier.totalItems
        ),

        rank: 0,
        isBestValue: false,
        isLowestRisk: false,
        isMultiplierQuote: !!(supplier as any).isMultiplierQuote,
        levelsMultiplier: (supplier as any).levelsMultiplier ?? null,
        isLumpSumQuote: !!(supplier as any).isLumpSumQuote,
        itemsTotal: (supplier as any).itemsTotal ?? undefined,
      };
    });

    // Sort and rank
    enhanced.sort((a, b) => b.weightedTotal - a.weightedTotal);

    // Assign Best Value: strictly the single lowest-priced supplier
    const minPrice = Math.min(...enhanced.map(s => s.totalPrice));
    // Assign Lowest Risk: strictly the single supplier with the fewest missing items.
    // If multiple suppliers tie on rawRiskScore, break the tie by highest coverage,
    // then lowest price. Only ONE supplier gets the badge.
    const minRiskScore = Math.min(...enhanced.map(s => s.rawRiskScore));
    const lowestRiskCandidates = enhanced.filter(s => s.rawRiskScore === minRiskScore);
    const lowestRiskWinner = lowestRiskCandidates.sort((a, b) => {
      if (b.coveragePercent !== a.coveragePercent) return b.coveragePercent - a.coveragePercent;
      return a.totalPrice - b.totalPrice;
    })[0];

    enhanced.forEach((s, idx) => {
      s.rank = idx + 1;
      s.isBestValue = s.totalPrice === minPrice && enhanced.filter(x => x.totalPrice === minPrice).length === 1
        ? true
        : s.totalPrice === minPrice && s === enhanced.filter(x => x.totalPrice === minPrice).sort((a, b) => b.weightedTotal - a.weightedTotal)[0];
      s.isLowestRisk = s === lowestRiskWinner;
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
        body: JSON.stringify({ projectId, force: true, trade: currentProject?.trade ?? currentTrade ?? undefined }),
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

  const exportItemizedComparisonToExcel = async () => {
    if (!awardSummary || comparisonData.length === 0) {
      onToast?.('No itemized comparison data available to export.', 'error');
      return;
    }

    // Check if data has required fields
    const hasRequiredFields = comparisonData.length > 0 &&
      comparisonData[0].suppliers &&
      Object.values(comparisonData[0].suppliers).some((s: any) =>
        s.quantity !== undefined || s.unit !== undefined
      );

    if (!hasRequiredFields) {
      onToast?.(
        'This award report was generated with an older version. Please click "Recalculate Award Report" to regenerate with all fields.',
        'error'
      );
      return;
    }

    try {
      // Use ExcelJS for proper color support
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Itemized Comparison');

      const suppliers = awardSummary.suppliers;

      // Soft pastel colors for visual distinction between suppliers (hex without #)
      const supplierColors = [
        'E8F5E9', // Soft mint green
        'FFF3E0', // Soft peach
        'E3F2FD', // Soft sky blue
        'FCE4EC', // Soft pink
        'F3E5F5', // Soft lavender
        'FFF9C4', // Soft yellow
        'E0F2F1', // Soft teal
        'FFEBEE', // Soft rose
        'F1F8E9', // Soft lime
        'FBE9E7', // Soft coral
        'E8EAF6', // Soft periwinkle
        'E0F7FA', // Soft cyan
        'FFF8E1', // Soft cream
        'EFEBE9', // Soft beige
        'F9FBE7'  // Soft olive
      ];

      // Add header rows
      worksheet.addRow(['Itemized Comparison - QS Standard']);
      worksheet.addRow([`Project: ${currentProject?.name || projectId}`]);
      worksheet.addRow([`Generated: ${new Date().toLocaleString()}`]);
      worksheet.addRow([]);

      // Header row 5 - supplier names (5 columns per supplier)
      const supplierNameRow = worksheet.addRow(['Item Description', ...suppliers.flatMap(s => [s.supplierName, '', '', '', ''])]);

      // Header row 6 - column labels
      const columnHeaderRow = worksheet.addRow(['', ...suppliers.flatMap(() => ['Qty', 'UOM', 'Norm UOM', 'Unit Rate', 'Total'])]);

      // Set column widths
      worksheet.getColumn(1).width = 50; // Item Description
      for (let i = 2; i <= 1 + (suppliers.length * 5); i++) {
        const colIdx = (i - 2) % 5;
        if (colIdx === 0) worksheet.getColumn(i).width = 10; // Qty
        else if (colIdx === 1) worksheet.getColumn(i).width = 12; // UOM
        else if (colIdx === 2) worksheet.getColumn(i).width = 12; // Norm UOM
        else if (colIdx === 3) worksheet.getColumn(i).width = 12; // Unit Rate
        else worksheet.getColumn(i).width = 15; // Total
      }

      // Merge cells for Item Description header
      worksheet.mergeCells('A5:A6');

      // Merge supplier name cells (5 columns per supplier)
      suppliers.forEach((_, idx) => {
        const startCol = 2 + (idx * 5);
        const endCol = startCol + 4;
        worksheet.mergeCells(5, startCol, 5, endCol);
      });

      const supplierTotals: number[] = new Array(suppliers.length).fill(0);

      // Add data rows
      comparisonData.forEach((row) => {
        const rowData = [row.description || ''];

        suppliers.forEach((supplier, supplierIdx) => {
          const supplierData = row.suppliers?.[supplier.supplierName];

          if (supplierData) {
            const qty = supplierData.quantity !== null && supplierData.quantity !== undefined
              ? supplierData.quantity
              : 'N/A';
            const unit = supplierData.unit !== null && supplierData.unit !== undefined && supplierData.unit !== ''
              ? supplierData.unit
              : 'N/A';
            const normUnit = supplierData.normalisedUnit !== null && supplierData.normalisedUnit !== undefined && supplierData.normalisedUnit !== ''
              ? supplierData.normalisedUnit
              : 'N/A';

            // For lump sum detail items (0 or null prices), show "Included" instead of the price
            const unitPrice = supplierData.unitPrice !== null && supplierData.unitPrice !== undefined && !isNaN(supplierData.unitPrice) && supplierData.unitPrice !== 0
              ? supplierData.unitPrice
              : (supplierData.unitPrice === 0 ? 'Included' : 'Included');
            const total = supplierData.total !== null && supplierData.total !== undefined && !isNaN(supplierData.total) && supplierData.total !== 0
              ? supplierData.total
              : (supplierData.total === 0 ? 'Included' : 'Included');

            rowData.push(qty, unit, normUnit, unitPrice, total);

            // Only add to totals if it's a numeric value and not zero
            if (typeof supplierData.total === 'number' && !isNaN(supplierData.total) && supplierData.total !== 0) {
              supplierTotals[supplierIdx] += supplierData.total;
            }
          } else {
            rowData.push('N/A', 'N/A', 'N/A', 'N/A', 'N/A');
          }
        });

        worksheet.addRow(rowData);
      });

      // Add subtotals row (5 columns per supplier)
      const subtotalsRow = ['Subtotals:', ...suppliers.flatMap((_, idx) => ['', '', '', '', supplierTotals[idx]])];
      worksheet.addRow(subtotalsRow);

      // Style header rows (rows 1-3)
      worksheet.getRow(1).font = { bold: true, size: 14 };
      worksheet.getRow(1).alignment = { horizontal: 'left', vertical: 'middle' };

      // Style supplier name headers (row 5) and column headers (row 6)
      [5, 6].forEach(rowNum => {
        const row = worksheet.getRow(rowNum);
        row.font = { bold: true };
        row.alignment = { horizontal: 'center', vertical: 'middle' };

        const totalCols = 1 + (suppliers.length * 5);
        for (let colNum = 1; colNum <= totalCols; colNum++) {
          const cell = row.getCell(colNum);
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };

          // Apply colors to supplier columns (skip column A)
          if (colNum > 1) {
            const supplierIdx = Math.floor((colNum - 2) / 5);
            if (supplierIdx < supplierColors.length) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF' + supplierColors[supplierIdx] }
              };
            }
          }
        }
      });

      // Style data rows (starting from row 7)
      const totalCols = 1 + (suppliers.length * 5);
      for (let rowNum = 7; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);
        const isSubtotalRow = rowNum === worksheet.rowCount;

        for (let colNum = 1; colNum <= totalCols; colNum++) {
          const cell = row.getCell(colNum);

          // Item Description column
          if (colNum === 1) {
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
              left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
              bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
              right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            };
            if (isSubtotalRow) cell.font = { bold: true };
          } else {
            // Supplier columns (5 per supplier: Qty, UOM, Norm UOM, Unit Rate, Total)
            const supplierIdx = Math.floor((colNum - 2) / 5);
            const columnInSupplier = (colNum - 2) % 5; // 0=Qty, 1=UOM, 2=NormUOM, 3=UnitRate, 4=Total

            if (supplierIdx < supplierColors.length) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF' + supplierColors[supplierIdx] }
              };
              cell.alignment = { horizontal: 'right', vertical: 'middle' };
              cell.border = {
                top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
              };

              // Apply currency format only to Unit Rate and Total columns
              if (typeof cell.value === 'number' && (columnInSupplier === 3 || columnInSupplier === 4)) {
                cell.numFmt = '"$"#,##0.00';
              }

              if (isSubtotalRow) cell.font = { bold: true };
            }
          }
        }
      }

      // Write file
      const buffer = await workbook.xlsx.writeBuffer();
      const sanitizedProjectName = (currentProject?.name || 'Project').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Itemized_Comparison_${sanitizedProjectName}_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Download the file
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      setShowExportDropdown(false);
      onToast?.('Itemized comparison exported successfully', 'success');
    } catch (error) {
      console.error('Error exporting itemized comparison:', error);
      console.error('Error details:', error instanceof Error ? error.message : String(error));
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      onToast?.(`Failed to export: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
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
          // Get public URL for the logo (bucket is now public)
          const { data: urlData } = supabase.storage
            .from('organisation-logos')
            .getPublicUrl(orgData.logo_url);

          if (urlData?.publicUrl) {
            organisationLogoUrl = urlData.publicUrl;
            console.log('Organisation logo URL:', organisationLogoUrl);
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
        notes: [],
        quoteId: s.quoteId
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
        approvedQuoteId: currentProject.approved_quote_id,
        executiveSummary: `This report provides a comprehensive evaluation of ${suppliers.length} supplier quotes received for ${currentProject.name}. Our analysis employs a multi-criteria assessment framework evaluating pricing competitiveness, technical compliance, scope completeness, and risk factors. The recommended supplier demonstrates optimal value delivery across all evaluation dimensions.`,
        methodology: [
          'Quote Import & Validation',
          'Data Normalization',
          'Scope Gap Analysis',
          'Risk Assessment',
          'Multi-Criteria Scoring'
        ],
        additionalSections,
        scoringWeights: weights
      });

      const filename = `Award_Report_${currentProject.name.replace(/[^a-z0-9]/gi, '_')}`;

      await generateAndDownloadPdf({
        htmlContent,
        filename,
        projectName: currentProject.name,
        reportType: 'Award Recommendation Report'
      });

      onToast?.('PDF downloaded successfully!', 'success');
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
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-12 text-center">
          <Award className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-100 text-lg font-semibold mb-2">No Award Report Available</p>
          <p className="text-sm text-slate-400">Generate a report from the Reports Hub to view analysis.</p>
        </div>
      </div>
    );
  }

  const topSupplier = enhancedSuppliers[0];
  const bestValue = enhancedSuppliers.find(s => s.isBestValue);
  const lowestRisk = enhancedSuppliers.find(s => s.isLowestRisk);

  const getGateForSupplier = (supplierName: string): DecisionGateResult | null => {
    const view = intelligenceViews.find(v => v.supplierName === supplierName);
    return view?.gateResult ?? null;
  };

  const isSupplierGated = (supplierName: string): boolean => {
    const gate = getGateForSupplier(supplierName);
    return gate !== null && !gate.canBeBestTenderer;
  };

  const handleCompleteAndFinish = async () => {
    if (!approvalGateChecked.scopeGaps || !approvalGateChecked.commercialRisks) return;
    setCompletingWorkflow(true);
    try {
      if (currentReportId) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase
          .from('award_reports')
          .update({
            review_scope_gaps: true,
            review_commercial_risks: true,
            review_confirmed_at: new Date().toISOString(),
            review_confirmed_by: user?.id ?? null,
            status: 'completed',
          })
          .eq('id', currentReportId);
      }
      onNavigate?.('dashboard');
    } catch (err) {
      console.error('Failed to save review confirmation:', err);
      onNavigate?.('dashboard');
    } finally {
      setCompletingWorkflow(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="bg-slate-800/60 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-3">
              <button
                onClick={handleRecalculate}
                disabled={recalculating}
                className="flex items-center gap-2 px-3 py-2 border border-slate-600 bg-slate-800/60 text-slate-300 rounded-lg hover:bg-slate-700/50 disabled:opacity-50 transition-colors text-sm"
              >
                <RefreshCw size={16} className={recalculating ? 'animate-spin' : ''} />
                Recalculate
              </button>

              <button
                onClick={() => setShowRevisionModal(true)}
                className="flex items-center gap-2 px-4 py-2 border border-blue-600 bg-blue-900/30 text-blue-300 rounded-lg hover:bg-blue-900/50 transition-all text-sm font-semibold"
              >
                <Mail size={16} />
                Request Revisions
              </button>

              <button
                onClick={() => setShowApprovalModal(true)}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all text-sm font-bold"
              >
                <CheckCircle2 size={16} />
                {approvalData ? 'Change Approval' : 'Approve Award'}
              </button>

              <div className="relative" ref={exportDropdownRef}>
                <button
                  onClick={() => setShowExportDropdown(!showExportDropdown)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all text-sm font-medium"
                >
                  <Download size={16} />
                  Export Report
                  <ChevronDown size={14} className={`transition-transform ${showExportDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showExportDropdown && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-800 rounded-lg shadow-xl border border-slate-700 z-50">
                    <div className="py-1">
                      <button
                        onClick={() => {
                          handlePrintPDF();
                          setShowExportDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                      >
                        <Printer size={16} />
                        Export Award Report
                      </button>
                      <button
                        onClick={async () => {
                          setShowExportDropdown(false);
                          if (!currentProject) return;
                          try {
                            onToast?.('Building supplier comparison export...', 'success');
                            await exportSupplierComparison(projectId, currentProject.name, currentTrade || undefined);
                            onToast?.('Supplier comparison exported successfully', 'success');
                          } catch (error: any) {
                            console.error('Export supplier comparison error:', error);
                            onToast?.(error.message || 'Failed to export supplier comparison', 'error');
                          }
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                      >
                        <FileSpreadsheet size={16} />
                        Export Supplier Comparison
                      </button>
                      <button
                        onClick={() => {
                          exportItemizedComparisonToExcel();
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                      >
                        <FileSpreadsheet size={16} />
                        Export Excel Items
                      </button>
                      <button
                        onClick={async () => {
                          setShowExportDropdown(false);
                          if (!currentProject) return;
                          try {
                            await exportScheduleOfRates(projectId, currentProject.name, currentTrade);
                            onToast?.('Schedule of Rates exported successfully', 'success');
                          } catch (error) {
                            console.error('Export error:', error);
                            onToast?.('Failed to export Schedule of Rates', 'error');
                          }
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                      >
                        <FileSpreadsheet size={16} />
                        Export Schedule of Rates
                      </button>
                      <button
                        onClick={async () => {
                          setShowExportDropdown(false);
                          if (!currentProject) return;
                          try {
                            await exportScheduleComparison(projectId, currentProject.name, currentTrade);
                            onToast?.('Schedule Comparison exported successfully', 'success');
                          } catch (error) {
                            console.error('Export comparison error:', error);
                            onToast?.('Failed to export Schedule Comparison', 'error');
                          }
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                      >
                        <FileSpreadsheet size={16} />
                        Export Comparison
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 overflow-x-hidden">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-5xl font-bold text-white mb-3">Award Recommendation Report</h1>
          <p className="text-xl text-slate-300 mb-6">Project Analysis & Supplier Evaluation</p>

          {/* Logo Section */}
          {organisationLogoUrl && (
            <div className="flex items-center justify-center gap-4 mb-6">
              <img
                src={organisationLogoUrl}
                alt="Organisation Logo"
                className="max-w-[140px] max-h-[52px] object-contain"
                crossOrigin="anonymous"
              />
              <div className="h-12 w-px bg-slate-600"></div>
              <div className="text-3xl font-bold text-white">VerifyTrade</div>
            </div>
          )}

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

        {/* Gate override notices — shown when top-ranked supplier is commercially gated */}
        {intelligenceViews.length > 0 && isSupplierGated(topSupplier.supplierName) && (() => {
          const gate = getGateForSupplier(topSupplier.supplierName)!;
          return (
            <div className="rounded-xl border border-red-500/40 bg-red-900/20 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-red-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-300 mb-1">Commercial Gate — Best Tenderer Blocked</p>
                  <p className="text-sm text-red-200 mb-2">
                    <span className="font-semibold">{topSupplier.supplierName}</span> has the highest weighted score but cannot be labelled Best Tenderer due to commercial intelligence gate failures.
                  </p>
                  <div className="space-y-1">
                    {gate.gateReasons.filter(r => r.status === 'fail').map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-red-300">
                        <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                        <span>{r.message}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-red-400 mt-3 font-medium">
                    Status: <span className="uppercase tracking-wide">Not Commercially Suitable</span>
                    {gate.overrideRequired && ' — Manual override required to proceed'}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {intelligenceViews.length > 0 && !isSupplierGated(topSupplier.supplierName) && (() => {
          const gate = getGateForSupplier(topSupplier.supplierName);
          if (!gate || gate.gateStatus !== 'warn') return null;
          return (
            <div className="rounded-xl border border-amber-500/40 bg-amber-900/20 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-300 mb-1">Commercial Warning — {topSupplier.supplierName}</p>
                  <p className="text-xs text-amber-200">{gate.gateSummary}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Enhanced Recommendations */}
        <EnhancedRecommendationsCard
          bestValue={bestValue || null}
          lowestRisk={lowestRisk || null}
          balanced={topSupplier}
          highestPrice={Math.max(...enhancedSuppliers.map(s => s.totalPrice))}
          lowestPrice={Math.min(...enhancedSuppliers.map(s => s.totalPrice))}
        />

        {/* Commercial Intelligence Panel */}
        <CommercialIntelligencePanel
          projectId={projectId}
          tradeType={currentTrade ?? 'general'}
          onViewsChange={setIntelligenceViews}
        />

        {/* Methodology */}
        <MethodologyFlowchart />

        {/* Enhanced Supplier Table */}
        <EnhancedSupplierTable
          suppliers={enhancedSuppliers}
          onSupplierClick={(supplierName) => {
            const supplier = enhancedSuppliers.find(s => s.supplierName === supplierName);
            setSelectedSupplier(supplier || null);
          }}
        />

        {/* Weighted Scoring Breakdown */}
        <WeightedScoringBreakdown suppliers={enhancedSuppliers} weights={weights} />

        {/* Coverage Breakdown Charts */}
        {enhancedSuppliers.slice(0, 3).map((supplier) => (
          <CoverageBreakdownChart key={supplier.supplierName} supplier={supplier} />
        ))}

        {/* Equalisation Analysis */}
        {equalisationResult && equalisationResult.supplierTotals.length > 0 && (
          <div className="bg-slate-800/60 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Award className="text-blue-400" size={20} />
              Equalisation Analysis
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Quotes normalized to account for scope differences. Missing items filled using model rates for fair comparison.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Supplier</th>
                    <th className="text-right py-3 px-4 text-slate-300 font-semibold">Original Total</th>
                    <th className="text-right py-3 px-4 text-slate-300 font-semibold">Equalized Total</th>
                    <th className="text-right py-3 px-4 text-slate-300 font-semibold">Adjustment</th>
                    <th className="text-right py-3 px-4 text-slate-300 font-semibold">Impact</th>
                    <th className="text-center py-3 px-4 text-slate-300 font-semibold">Items Added</th>
                  </tr>
                </thead>
                <tbody>
                  {equalisationResult.supplierTotals
                    .sort((a, b) => a.equalisedTotal - b.equalisedTotal)
                    .map((supplier, index) => (
                      <tr key={supplier.supplierName} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {index === 0 && <Award className="text-yellow-400" size={16} />}
                            <span className="text-slate-200 font-medium">{supplier.supplierName}</span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-4 text-slate-300">
                          {formatCurrency(supplier.originalTotal)}
                        </td>
                        <td className="text-right py-3 px-4 text-white font-semibold">
                          {formatCurrency(supplier.equalisedTotal)}
                        </td>
                        <td className="text-right py-3 px-4">
                          <span className={supplier.adjustment >= 0 ? 'text-red-400' : 'text-green-400'}>
                            {supplier.adjustment >= 0 ? '+' : ''}{formatCurrency(supplier.adjustment)}
                          </span>
                        </td>
                        <td className="text-right py-3 px-4">
                          <span className={supplier.adjustmentPct >= 0 ? 'text-red-400' : 'text-green-400'}>
                            {supplier.adjustmentPct >= 0 ? '+' : ''}{supplier.adjustmentPct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="text-center py-3 px-4 text-slate-300">
                          {supplier.itemsAdded}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {equalisationResult.equalisationLog.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-slate-300 mb-3">Adjustment Details</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {equalisationResult.equalisationLog.map((log, index) => (
                    <div key={index} className="bg-slate-700/30 rounded p-3 text-xs">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-slate-200">{log.supplierName}</span>
                        <span className="text-slate-400">{formatCurrency(log.total)}</span>
                      </div>
                      <div className="text-slate-400">
                        {log.systemLabel} - {log.reason}
                      </div>
                      <div className="text-slate-500 mt-1">
                        Source: {log.source} | Rate: {formatCurrency(log.rateUsed)} | Qty: {log.quantity}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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
            loadProjectInfo(); // Refresh project data including approved_quote_id
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

      {/* Supplier Detail Modal */}
      <SupplierDetailModal
        supplier={selectedSupplier}
        onClose={() => setSelectedSupplier(null)}
      />

      {/* Approval Gate */}
      <div className="max-w-7xl mx-auto px-4 pb-4">
        <div className="bg-slate-800/70 border border-slate-600/60 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-orange-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Mandatory Review Confirmation</h3>
              <p className="text-xs text-slate-400">Both items must be acknowledged before completing the award workflow</p>
            </div>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => setApprovalGateChecked(prev => ({ ...prev, scopeGaps: !prev.scopeGaps }))}
              className="w-full flex items-start gap-3 p-4 rounded-lg border border-slate-600/50 hover:border-slate-500 bg-slate-700/30 hover:bg-slate-700/50 transition-all text-left"
            >
              {approvalGateChecked.scopeGaps ? (
                <CheckSquare className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              ) : (
                <Square className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-semibold ${approvalGateChecked.scopeGaps ? 'text-green-300' : 'text-slate-200'}`}>
                  I have reviewed the identified scope gaps
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  All coverage breakdowns and gap exposures have been reviewed for each supplier
                </p>
              </div>
            </button>
            <button
              onClick={() => setApprovalGateChecked(prev => ({ ...prev, commercialRisks: !prev.commercialRisks }))}
              className="w-full flex items-start gap-3 p-4 rounded-lg border border-slate-600/50 hover:border-slate-500 bg-slate-700/30 hover:bg-slate-700/50 transition-all text-left"
            >
              {approvalGateChecked.commercialRisks ? (
                <CheckSquare className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              ) : (
                <Square className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-semibold ${approvalGateChecked.commercialRisks ? 'text-green-300' : 'text-slate-200'}`}>
                  I accept the commercial risks and controls required
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  I understand the estimated add-on exposure and confirm appropriate controls will be implemented
                </p>
              </div>
            </button>
          </div>
          {(!approvalGateChecked.scopeGaps || !approvalGateChecked.commercialRisks) && (
            <p className="mt-3 text-xs text-slate-500 text-center">
              Check both items above to enable "Complete and Finish"
            </p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <WorkflowNav
        currentStep={6}
        totalSteps={7}
        onBack={onNavigateBack}
        onNext={handleCompleteAndFinish}
        backLabel="Back: Equalisation Analysis"
        nextLabel={completingWorkflow ? 'Saving...' : 'Complete and Finish'}
        disabledNext={!approvalGateChecked.scopeGaps || !approvalGateChecked.commercialRisks || completingWorkflow}
      />
    </div>
  );
}
