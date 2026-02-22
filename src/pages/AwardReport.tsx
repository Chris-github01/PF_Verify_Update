import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Download, MoreHorizontal, RefreshCw, ChevronDown, Award, Shield, TrendingUp, BarChart3, Printer, FileSpreadsheet, Trash2, Edit3, AlertCircle, CheckCircle, Scale, DollarSign, Activity, CheckSquare, Square, ArrowRight, ChevronRight, Target, FileText, AlertOctagon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTrade } from '../lib/tradeContext';
import type { ComparisonRow } from '../types/comparison.types';
import type { EqualisationMode } from '../types/equalisation.types';
import type { AwardSummary } from '../types/award.types';
import * as XLSX from 'xlsx';
import type { DashboardMode } from '../App';
import { generateModernPdfHtml, generatePdfWithPrint } from '../lib/reports/modernPdfTemplate';
import ApprovalModal from '../components/ApprovalModal';
import type { EnhancedSupplierMetrics } from '../lib/reports/awardReportEnhancements';

interface Project {
  id: string;
  name: string;
  client: string | null;
  approved_quote_id: string | null;
  organisation_id: string;
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
  const { currentTrade } = useTrade();

  console.log('🎯 AwardReport render:', { currentTrade, projectId, reportId, dashboardMode });

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
  const [loadedReportTrade, setLoadedReportTrade] = useState<string | null>(null);
  const [showItemizedDetails, setShowItemizedDetails] = useState(false);
  const [quotesMap, setQuotesMap] = useState<Map<string, string>>(new Map());
  const [showMethodology, setShowMethodology] = useState(false);
  const [actionChecklist, setActionChecklist] = useState<Record<string, boolean>>({});
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedSupplierForApproval, setSelectedSupplierForApproval] = useState<string | null>(null);
  const [organisationLogoUrl, setOrganisationLogoUrl] = useState<string | null>(null);
  const [approvalData, setApprovalData] = useState<{
    id: string;
    ai_recommended_supplier: string;
    final_approved_supplier: string;
    is_override: boolean;
    override_reason_category: string | null;
    override_reason_detail: string | null;
    approved_at: string;
    approved_by_email: string;
  } | null>(null);

  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const moreDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log('🔄 AwardReport useEffect triggered:', { reportId, projectId, currentTrade });

    // Clear ALL state when trade or report changes
    console.log('🧹 Clearing all report state...');
    setComparisonData([]);
    setAwardSummary(null);
    setAiAnalysis(null);
    setCurrentReportId(null);
    setReportTimestamp('');
    setApprovalData(null);
    setQuotesMap(new Map());
    setLoadedReportTrade(null);

    // CRITICAL: Pre-validate reportId against trade BEFORE loading anything
    const validateAndLoad = async () => {
      if (reportId) {
        console.log('🔒 PRE-VALIDATING reportId against current trade:', { reportId, currentTrade });

        // Quick check: Does this reportId belong to the current trade?
        const { data: tradeCheck, error: tradeError } = await supabase
          .from('award_reports')
          .select('trade, id')
          .eq('id', reportId)
          .maybeSingle();

        if (tradeError) {
          console.error('❌ Error checking report trade:', tradeError);
          setLoading(false);
          return;
        }

        if (!tradeCheck) {
          console.error('❌ Report not found:', reportId);
          setLoading(false);
          return;
        }

        const reportTrade = tradeCheck.trade || 'passive_fire';
        if (reportTrade !== currentTrade) {
          console.error('🚫🚫🚫 HARD BLOCK: ReportId belongs to different trade!');
          console.error('Report trade:', reportTrade, '| Current trade:', currentTrade);
          console.error('REFUSING TO LOAD - Staying in empty state');
          setLoading(false);
          return; // Do not proceed
        }

        console.log('✅ Trade validation passed, proceeding to load report');
        loadSavedReport(reportId);
      } else {
        console.log('📂 Loading latest report for trade:', currentTrade);
        loadLatestReport();
      }
    };

    loadProjectInfo();
    validateAndLoad();
  }, [reportId, projectId, currentTrade]);

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
        .select('id, name, client, approved_quote_id, organisation_id')
        .eq('id', projectId)
        .maybeSingle();

      if (data) {
        setCurrentProject(data);

        // Fetch organization logo if available
        if (data.organisation_id) {
          const { data: orgData } = await supabase
            .from('organisations')
            .select('logo_url')
            .eq('id', data.organisation_id)
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
          approved_by_email: userData?.email || 'Unknown'
        });
      }
    } catch (error) {
      console.error('Error loading approval data:', error);
    }
  };

  const loadLatestReport = async () => {
    try {
      setLoading(true);
      console.log('🔍 Loading latest report for project:', projectId, 'trade:', currentTrade);

      const { data: reportData, error: reportError } = await supabase
        .from('award_reports')
        .select('*')
        .eq('project_id', projectId)
        .eq('trade', currentTrade)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('📊 Latest report result:', { found: !!reportData, reportTrade: reportData?.trade, error: reportError });

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
      setLoadedReportTrade(reportData.trade || 'passive_fire');

      // Load approval data for this report
      await loadApprovalData(reportData.id);

      const { data: quotesData } = await supabase
        .from('quotes')
        .select('id, supplier_name')
        .eq('project_id', reportData.project_id)
        .eq('trade', currentTrade);

      if (quotesData) {
        const map = new Map<string, string>();
        quotesData.forEach(q => map.set(q.supplier_name, q.id));
        setQuotesMap(map);
      }
    } catch (error: any) {
      console.error('❌ Error in loadLatestReport:', error);

      // CRITICAL: Clear ALL state on ANY error to prevent stale data display
      console.log('🧹 Clearing all state due to error...');
      setComparisonData([]);
      setAwardSummary(null);
      setAiAnalysis(null);
      setCurrentReportId(null);
      setReportTimestamp('');
      setLoadedReportTrade(null);
      setApprovalData(null);
      setQuotesMap(new Map());

      onToast?.(error.message || 'Failed to load report', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadSavedReport = async (reportId: string) => {
    try {
      setLoading(true);
      console.log('🔍 Loading saved report:', reportId, 'for trade:', currentTrade);

      const { data: reportData, error: reportError } = await supabase
        .from('award_reports')
        .select('*')
        .eq('id', reportId)
        .maybeSingle();

      console.log('📊 Report query result:', { reportData, reportError, reportTrade: reportData?.trade });

      if (reportError) {
        console.error('❌ Report query error:', reportError);
        throw new Error(`Report query failed: ${reportError.message || JSON.stringify(reportError)}`);
      }

      if (!reportData) {
        console.error('❌ No report data returned for ID:', reportId);
        throw new Error(`Report not found with ID: ${reportId}. It may have been deleted or you may not have permission to view it.`);
      }

      // Check if report matches current trade - CRITICAL CHECK
      const reportTrade = reportData.trade || 'passive_fire';
      if (reportTrade !== currentTrade) {
        console.error('🚫🚫🚫 CRITICAL: TRADE MISMATCH DETECTED 🚫🚫🚫');
        console.error('Report trade:', reportTrade, '| Current trade:', currentTrade);
        console.error('CLEARING ALL STATE AND BLOCKING RENDER');

        // IMMEDIATELY clear ALL state before throwing
        setComparisonData([]);
        setAwardSummary(null);
        setAiAnalysis(null);
        setCurrentReportId(null);
        setReportTimestamp('');
        setLoadedReportTrade(null);
        setApprovalData(null);
        setQuotesMap(new Map());

        throw new Error(`This report is for ${reportTrade === 'passive_fire' ? 'Passive Fire' : 'Electrical'} trade, but you're viewing ${currentTrade === 'passive_fire' ? 'Passive Fire' : 'Electrical'}. Switch trades to view this report.`);
      }

      console.log('✅ Trade validation passed, loading report data...');

      if (reportData.result_json) {
        setComparisonData(reportData.result_json.comparisonData || []);
        setAwardSummary(reportData.result_json.awardSummary || null);
        setAiAnalysis(reportData.result_json.aiAnalysis || null);
      }

      setCurrentReportId(reportData.id);
      setReportTimestamp(reportData.created_at);
      setLoadedReportTrade(reportData.trade || 'passive_fire');

      // Load approval data for this report
      await loadApprovalData(reportData.id);

      const { data: quotesData } = await supabase
        .from('quotes')
        .select('id, supplier_name')
        .eq('project_id', reportData.project_id)
        .eq('trade', currentTrade);

      if (quotesData) {
        const map = new Map<string, string>();
        quotesData.forEach(q => map.set(q.supplier_name, q.id));
        setQuotesMap(map);
      }
    } catch (error: any) {
      console.error('❌ Error in loadSavedReport:', error);

      // CRITICAL: Clear ALL state on ANY error to prevent stale data display
      console.log('🧹 Clearing all state due to error...');
      setComparisonData([]);
      setAwardSummary(null);
      setAiAnalysis(null);
      setCurrentReportId(null);
      setReportTimestamp('');
      setLoadedReportTrade(null);
      setApprovalData(null);
      setQuotesMap(new Map());

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
          trade: currentTrade,
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
      const wb = XLSX.utils.book_new();
      const suppliers = awardSummary.suppliers;
      const startCol = 3;

      const supplierColors = [
        'E8F5E9', 'FFF3E0', 'E3F2FD', 'FCE4EC', 'F3E5F5',
        'FFF9C4', 'E0F2F1', 'FFEBEE', 'F1F8E9', 'FBE9E7',
        'E8EAF6', 'F3E5F5', 'E0F7FA', 'FFF8E1', 'EFEBE9'
      ];

      const headerData: any[][] = [];
      headerData.push(['Itemized Comparison - QS Standard']);
      headerData.push([`Project: ${currentProject?.name || projectId}`]);
      headerData.push([`Generated: ${new Date().toLocaleString()}`]);
      headerData.push([]);

      const headerRow = ['Item Description', 'Qty', 'UOM'];
      suppliers.forEach(supplier => {
        headerRow.push(supplier.supplierName, '', '', '', '', '', '');
      });
      headerData.push(headerRow);

      const subHeaderRow = ['', '', ''];
      suppliers.forEach(() => {
        subHeaderRow.push('SERVICE TYPE', 'TYPE', 'Qty', 'UOM', 'Norm UOM', 'Unit Rate', 'Total');
      });
      headerData.push(subHeaderRow);

      const dataRows: any[][] = [];
      const supplierTotals: number[] = new Array(suppliers.length).fill(0);

      comparisonData.forEach((row) => {
        const dataRow = [row.description || '', row.quantity || 0, row.unit || ''];

        // Extract service type and type from the row (same for all suppliers)
        const rowData = row as any;
        const serviceType = rowData.service || rowData.systemLabel || '';
        const type = rowData.category || rowData.subclass || '';

        suppliers.forEach((supplier, supplierIdx) => {
          const supplierData = row.suppliers?.[supplier.supplierName];

          if (supplierData && supplierData.unitPrice !== null && !isNaN(supplierData.unitPrice)) {
            dataRow.push(
              serviceType || 'N/A',
              type || 'N/A',
              supplierData.quantity ?? 'N/A',
              supplierData.unit || 'N/A',
              supplierData.normalisedUnit || 'N/A',
              supplierData.unitPrice,
              supplierData.total
            );
            supplierTotals[supplierIdx] += supplierData.total || 0;
          } else {
            dataRow.push(serviceType || 'N/A', type || 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A');
          }
        });

        dataRows.push(dataRow);
      });

      const subtotalsRow = ['Subtotals:', '', ''];
      suppliers.forEach((_, idx) => {
        subtotalsRow.push('', '', '', '', '', '', supplierTotals[idx]);
      });
      dataRows.push(subtotalsRow);

      const allData = [...headerData, ...dataRows];
      const ws = XLSX.utils.aoa_to_sheet(allData);

      const colWidths = [{ wch: 50 }, { wch: 8 }, { wch: 10 }];
      suppliers.forEach(() => {
        colWidths.push({ wch: 15 }, { wch: 15 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 15 });
      });
      ws['!cols'] = colWidths;

      ws['!merges'] = [
        { s: { r: 4, c: 0 }, e: { r: 5, c: 0 } },
        { s: { r: 4, c: 1 }, e: { r: 5, c: 1 } },
        { s: { r: 4, c: 2 }, e: { r: 5, c: 2 } }
      ];

      suppliers.forEach((_, idx) => {
        const startSupplierCol = startCol + (idx * 7);
        ws['!merges'].push({
          s: { r: 4, c: startSupplierCol },
          e: { r: 4, c: startSupplierCol + 6 }
        });
      });

      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

      for (let R = 0; R <= range.e.r; R++) {
        for (let C = 0; C <= range.e.c; C++) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' };
          if (!ws[cellAddress].s) ws[cellAddress].s = {};

          if (R === 0) {
            ws[cellAddress].s = {
              font: { bold: true, sz: 14 },
              alignment: { horizontal: 'left', vertical: 'center' }
            };
          }

          if (R === 4 || R === 5) {
            ws[cellAddress].s = {
              font: { bold: true },
              alignment: { horizontal: 'center', vertical: 'center' },
              border: {
                top: { style: 'thin', color: { rgb: '000000' } },
                bottom: { style: 'thin', color: { rgb: '000000' } },
                left: { style: 'thin', color: { rgb: '000000' } },
                right: { style: 'thin', color: { rgb: '000000' } }
              }
            };

            if (C >= startCol) {
              const supplierIdx = Math.floor((C - startCol) / 7);
              if (supplierIdx < supplierColors.length) {
                ws[cellAddress].s.fill = { fgColor: { rgb: supplierColors[supplierIdx] } };
              }
            }
          }

          if (R > 5) {
            if (C >= startCol) {
              const supplierIdx = Math.floor((C - startCol) / 7);
              if (supplierIdx < supplierColors.length) {
                ws[cellAddress].s = {
                  fill: { fgColor: { rgb: supplierColors[supplierIdx] } },
                  alignment: { horizontal: 'right', vertical: 'center' },
                  border: {
                    top: { style: 'thin', color: { rgb: 'CCCCCC' } },
                    bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
                    left: { style: 'thin', color: { rgb: 'CCCCCC' } },
                    right: { style: 'thin', color: { rgb: 'CCCCCC' } }
                  }
                };

                if (typeof ws[cellAddress].v === 'number') {
                  ws[cellAddress].z = '"$"#,##0.00';
                }
              }
            }

            if (R === range.e.r) {
              ws[cellAddress].s = {
                ...ws[cellAddress].s,
                font: { bold: true }
              };
            }
          }
        }
      }

      XLSX.utils.book_append_sheet(wb, ws, 'Itemized Comparison');

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

  const handlePrint = async () => {
    setShowExportDropdown(false);

    if (!awardSummary || !currentProject) {
      onToast?.('Report data not available', 'error');
      return;
    }

    try {
      // Fetch organization logo if available
      let organisationLogoUrl: string | undefined = undefined;
      if (currentProject.organisation_id) {
        const { data: orgData } = await supabase
          .from('organisations')
          .select('logo_url')
          .eq('id', currentProject.organisation_id)
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

      const suppliersWithScores = awardSummary.suppliers.map(s => {
        const weightedScore = s.weightedTotal ?? (() => {
          const weights = awardSummary.scoringWeights || { price: 45, compliance: 20, coverage: 25, risk: 10 };
          const maxTotal = Math.max(...awardSummary.suppliers.map(sup => sup.adjustedTotal));
          const minTotal = Math.min(...awardSummary.suppliers.map(sup => sup.adjustedTotal));
          const priceRange = maxTotal - minTotal;
          const priceScore = priceRange > 0 ? ((maxTotal - s.adjustedTotal) / priceRange) * 10 : 10;
          const coverageScore = (s.coveragePercent / 100) * 10;
          const maxRisk = Math.max(...awardSummary.suppliers.map(sup => sup.riskScore));
          const riskScore = maxRisk > 0 ? 10 - (s.riskScore / maxRisk) * 10 : 10;
          const complianceScore = maxRisk > 0 ? 10 - (s.riskScore / maxRisk) * 5 : 10;
          return ((priceScore * (weights.price / 100)) + (complianceScore * (weights.compliance / 100)) + (coverageScore * (weights.coverage / 100)) + (riskScore * (weights.risk / 100))) * 10;
        })();
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
        notes: s.notes && s.notes.length > 0 ? s.notes : undefined,
        quoteId: s.quoteId
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
        // Use highest weighted score for balanced choice
        const balanced = [...sortedSuppliers].sort((a, b) => b.weightedScore - a.weightedScore)[0];

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
        approvedQuoteId: currentProject.approved_quote_id,
        scoringWeights: awardSummary.scoringWeights,
        executiveSummary: `Award recommendation analysis for ${currentProject.name}. Total systems analyzed: ${awardSummary.totalSystems}.`,
        methodology: [
          'Quote Import & Validation',
          'Data Normalization',
          'Scope Gap Analysis',
          'Risk Assessment',
          'Multi-Criteria Scoring'
        ],
        additionalSections: approvalData ? [{
          title: `Approval Decision${approvalData.is_override ? '<span style="display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-left: 8px;">OVERRIDE</span>' : ''}`,
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
        }] : [],
        organisationLogoUrl
      });

      const filename = `Award_Report_${currentProject.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}`;
      generatePdfWithPrint(htmlContent, filename);

      onToast?.('Print window opened! In the print dialog, select "Save as PDF" or "Microsoft Print to PDF" as your destination.', 'success');
    } catch (error) {
      console.error('Error generating PDF:', error);
      onToast?.('Failed to generate PDF report', 'error');
    }
  };

  const handleApproveQuote = (supplierName: string) => {
    setSelectedSupplierForApproval(supplierName);
    setShowApprovalModal(true);
  };

  const handleApprovalComplete = async () => {
    setShowApprovalModal(false);
    setSelectedSupplierForApproval(null);

    // Reload the project info to get updated approval status
    await loadProjectInfo();

    // Optionally reload the report
    if (currentReportId) {
      await loadSavedReport(currentReportId);
    }

    onToast?.('Award approved successfully', 'success');
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
      maximumFractionDigits: 2,
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

  // CRITICAL RENDER-LEVEL CHECK: Block display if data trade doesn't match current trade
  const hasData = comparisonData.length > 0 || awardSummary !== null;
  const tradeMismatch = hasData && loadedReportTrade && loadedReportTrade !== currentTrade;

  console.log('🎨 RENDER CHECK:', {
    hasData,
    loadedReportTrade,
    currentTrade,
    tradeMismatch,
    comparisonDataLength: comparisonData.length
  });

  if (tradeMismatch) {
    console.error('🚫🚫🚫 RENDER BLOCKED: Trade mismatch detected!');
    console.error('Loaded trade:', loadedReportTrade, '| Current trade:', currentTrade);
    console.error('Forcing empty state display');
  }

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
        {loading ? (
          <div className="flex items-center justify-center min-h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
              <p className="text-slate-400">Loading report...</p>
            </div>
          </div>
        ) : tradeMismatch ? (
          <div className="flex items-center justify-center min-h-96">
            <div className="text-center max-w-md">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-red-400 mb-2">🚫 Trade Mismatch Detected</h3>
              <p className="text-slate-400 mb-4">
                This report belongs to <span className="font-bold text-orange-400">{loadedReportTrade === 'passive_fire' ? 'Passive Fire' : 'Electrical'}</span> trade,
                but you're viewing <span className="font-bold text-orange-400">{currentTrade === 'passive_fire' ? 'Passive Fire' : 'Electrical'}</span> trade.
              </p>
              <p className="text-slate-300 font-semibold mb-6">
                Data from different trades is isolated and cannot be displayed cross-trade.
              </p>
              <button
                onClick={() => onNavigate?.('reports')}
                className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-bold shadow-lg"
              >
                Back to Reports Hub
              </button>
            </div>
          </div>
        ) : !comparisonData || comparisonData.length === 0 ? (
          <div className="flex items-center justify-center min-h-96">
            <div className="text-center max-w-md">
              <AlertCircle className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-slate-100 mb-2">No Report Found</h3>
              <p className="text-slate-400 mb-6">
                {currentTrade === 'electrical'
                  ? 'No award report exists for the Electrical trade yet. Import quotes and generate a report first.'
                  : 'No award report found for this project. Import quotes and generate a report first.'}
              </p>
              <button
                onClick={() => onNavigate?.('importquotes')}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
              >
                Import Quotes
              </button>
            </div>
          </div>
        ) : (
          <>
        <div className="text-center mb-12">
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

        {/* Approval Status Banner */}
        {!approvalData && (
          <div className="mb-8 bg-gradient-to-r from-blue-900/30 to-blue-800/20 border-2 border-blue-600/40 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-bold text-white mb-2">Approval Required</h4>
                <p className="text-slate-300 mb-3">
                  Review the AI recommendations below and select a supplier to proceed with the approval process.
                </p>
                <div className="flex items-center gap-2 text-sm text-blue-300">
                  <CheckCircle className="w-4 h-4" />
                  <span>Look for "Proceed to Approval" buttons in the recommendation cards or supplier table below</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {approvalData && (
          <div className="mb-8 bg-gradient-to-r from-green-900/30 to-green-800/20 border-2 border-green-600/40 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-bold text-white mb-2">Award Approved</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">Approved Supplier:</span>
                    <span className="ml-2 text-white font-bold">{approvalData.final_approved_supplier}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Approved By:</span>
                    <span className="ml-2 text-white font-bold">{approvalData.approved_by_email}</span>
                  </div>
                </div>
                {approvalData.is_override && (
                  <div className="mt-3 pt-3 border-t border-yellow-700/50">
                    <span className="inline-flex items-center gap-2 text-xs font-bold text-yellow-400 bg-yellow-900/30 px-3 py-1 rounded">
                      <AlertOctagon className="w-3 h-3" />
                      OVERRIDE DECISION
                    </span>
                    <p className="text-sm text-slate-300 mt-2">{approvalData.override_reason_detail}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
          </>
        )}
      </div>

      {/* Approval Modal */}
      {showApprovalModal && currentReportId && awardSummary && currentProject && selectedSupplierForApproval && (
        <ApprovalModal
          isOpen={showApprovalModal}
          onClose={() => {
            setShowApprovalModal(false);
            setSelectedSupplierForApproval(null);
          }}
          reportId={currentReportId}
          projectId={projectId}
          organisationId={currentProject.organisation_id}
          aiRecommendedSupplier={{
            supplierName: selectedSupplierForApproval,
            adjustedTotal: awardSummary.suppliers.find(s => s.supplierName === selectedSupplierForApproval)?.adjustedTotal || 0,
            itemsQuoted: awardSummary.suppliers.find(s => s.supplierName === selectedSupplierForApproval)?.itemsQuoted || 0,
            totalItems: awardSummary.suppliers.find(s => s.supplierName === selectedSupplierForApproval)?.totalItems || 0,
            coveragePercent: awardSummary.suppliers.find(s => s.supplierName === selectedSupplierForApproval)?.coveragePercent || 0,
            systemsCovered: awardSummary.suppliers.find(s => s.supplierName === selectedSupplierForApproval)?.systemsCovered || 0,
            riskScore: awardSummary.suppliers.find(s => s.supplierName === selectedSupplierForApproval)?.riskScore || 0,
            priceScore: 0,
            complianceScore: 0,
            coverageScore: 0,
            riskMitigationScore: 0,
            weightedTotal: 0,
          } as EnhancedSupplierMetrics}
          allSuppliers={awardSummary.suppliers.map(s => ({
            supplierName: s.supplierName,
            adjustedTotal: s.adjustedTotal,
            itemsQuoted: s.itemsQuoted,
            totalItems: s.totalItems,
            coveragePercent: s.coveragePercent,
            systemsCovered: s.systemsCovered,
            riskScore: s.riskScore,
            priceScore: 0,
            complianceScore: 0,
            coverageScore: 0,
            riskMitigationScore: 0,
            weightedTotal: 0,
          } as EnhancedSupplierMetrics))}
          onApprovalComplete={handleApprovalComplete}
          onToast={onToast}
        />
      )}
    </div>
  );
}
