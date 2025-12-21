import { useState, useEffect } from 'react';
import { FileText, ExternalLink, Loader2 } from 'lucide-react';
import AwardReportEnhanced from './AwardReportEnhanced';
import { supabase } from '../lib/supabase';
import { generateModernPdfHtml, downloadPdfHtml } from '../lib/reports/modernPdfTemplate';
import { useOrganisation } from '../lib/organisationContext';

interface ProjectReportPageProps {
  projectId: string;
  projectName: string;
  onNavigateToHub: () => void;
  onToast?: (message: string, type: 'success' | 'error') => void;
}

export default function ProjectReportPage({
  projectId,
  projectName,
  onNavigateToHub,
  onToast
}: ProjectReportPageProps) {
  const { currentOrganisation } = useOrganisation();
  const [hasReport, setHasReport] = useState<boolean | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    checkForReport();
  }, [projectId]);

  const checkForReport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('award_reports')
        .select('id')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error checking for report:', error);
        setHasReport(false);
        setReportId(null);
      } else {
        setHasReport(!!data);
        setReportId(data?.id || null);
      }
    } catch (err) {
      console.error('Failed to check report:', err);
      setHasReport(false);
      setReportId(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    setGenerating(true);
    try {
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
        throw new Error(errorData.message || 'Failed to generate report');
      }

      const result = await response.json();
      console.log('✅ Report generation response:', result);

      // Generate and download the report HTML
      if (result.reportId) {
        console.log('📝 Setting reportId:', result.reportId);
        // Store the report ID first, THEN show the report
        setReportId(result.reportId);

        // Small delay to ensure state is updated before rendering AwardReport
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('📥 Downloading report HTML...');
        await generateAndDownloadReport(result.reportId);
        console.log('✅ Report ready, showing AwardReport component');
        setHasReport(true);
        onToast?.('Report generated and downloaded successfully!', 'success');
      } else {
        throw new Error('No report ID returned from generation');
      }
    } catch (error: any) {
      console.error('Error generating report:', error);
      onToast?.(error.message || 'Failed to generate report', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const generateAndDownloadReport = async (reportId: string) => {
    try {
      console.log('🔄 generateAndDownloadReport starting for reportId:', reportId);
      // Retry logic in case there's a brief delay before report is queryable
      let reportData = null;
      let error = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts && !reportData) {
        console.log(`🔄 Attempt ${attempts + 1}/${maxAttempts} to fetch report...`);
        const result = await supabase
          .from('award_reports')
          .select('result_json, generated_at')
          .eq('id', reportId)
          .single();

        reportData = result.data;
        error = result.error;

        console.log(`📊 Attempt ${attempts + 1} result:`, { hasData: !!reportData, error });

        if (!reportData && attempts < maxAttempts - 1) {
          console.log('⏳ Waiting 500ms before retry...');
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        } else {
          break;
        }
      }

      if (error || !reportData) {
        console.error('❌ Error loading report for download after retries:', error);
        throw new Error(`Failed to load report data for download. Error: ${error?.message || 'Report not found'}. The report was created but cannot be accessed yet.`);
      }

      const result = reportData.result_json;
      const awardSummary = result.awardSummary;

      // Get project data for client name and approved quote
      const { data: projectData } = await supabase
        .from('projects')
        .select('client, approved_quote_id')
        .eq('id', projectId)
        .maybeSingle();

      // Transform data for modern PDF template
      const suppliers = awardSummary.suppliers.map((s: any, idx: number) => ({
        rank: idx + 1,
        supplierName: s.supplierName,
        adjustedTotal: s.adjustedTotal,
        riskScore: s.riskScore,
        coveragePercent: s.coveragePercent,
        itemsQuoted: s.itemsQuoted,
        totalItems: s.totalItems || s.itemsQuoted,
        notes: s.notes || []
      }));

      // Transform recommendations for display cards
      const recommendations = awardSummary.recommendations.slice(0, 3).map((rec: any) => {
        const supplier = awardSummary.suppliers.find((s: any) => s.supplierName === rec.supplier.supplierName);
        return {
          type: rec.type,
          supplierName: rec.supplier.supplierName,
          price: supplier?.adjustedTotal || 0,
          coverage: supplier?.coveragePercent || 0,
          riskScore: supplier?.riskScore || 0,
          score: supplier?.score || 8.5
        };
      });

      // Generate modern PDF HTML
      const htmlContent = generateModernPdfHtml({
        projectName,
        clientName: projectData?.client || undefined,
        generatedAt: reportData.generated_at,
        recommendations,
        suppliers,
        approvedQuoteId: projectData?.approved_quote_id,
        executiveSummary: `This report provides a comprehensive evaluation of ${suppliers.length} supplier quotes received for ${projectName}. Our analysis employs a multi-criteria assessment framework evaluating pricing competitiveness, technical compliance, scope completeness, and risk factors. The recommended supplier demonstrates optimal value delivery across all evaluation dimensions.`,
        methodology: [
          'Quote Import & Validation',
          'Data Normalization',
          'Scope Gap Analysis',
          'Risk Assessment',
          'Multi-Criteria Scoring'
        ]
      });

      // Download the HTML file
      const filename = `Award_Report_${projectName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.html`;
      downloadPdfHtml(htmlContent, filename);

      console.log('✅ Modern PDF report downloaded successfully');
    } catch (error) {
      console.error('Error generating report download:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-300">Loading report...</p>
        </div>
      </div>
    );
  }

  if (hasReport === false) {
    return (
      <div className="p-8 bg-slate-900 min-h-screen">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-400 mb-1">
                Projects &gt; {projectName} &gt; Report
              </div>
              <h1 className="text-3xl font-bold text-white">{projectName} – Report</h1>
              <p className="text-slate-300 mt-1">Award Recommendation & Itemised Comparison</p>
            </div>
            <button
              onClick={onNavigateToHub}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
            >
              <ExternalLink size={16} />
              View all project reports
            </button>
          </div>

          <div className="bg-slate-800 rounded-lg border border-slate-700 p-12 text-center">
            <FileText className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">
              No Report Generated Yet
            </h2>
            <p className="text-slate-300 mb-6">
              To generate an award recommendation report, complete the workflow steps and click the button below.
            </p>
            <div className="space-y-3 text-left max-w-md mx-auto">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-orange-600/20 text-orange-400 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <div className="font-medium text-white">Import Quotes</div>
                  <div className="text-sm text-slate-400">Upload supplier quotes for analysis</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-orange-600/20 text-orange-400 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <div className="font-medium text-white">Review & Clean</div>
                  <div className="text-sm text-slate-400">Normalize and validate quote data</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-orange-600/20 text-orange-400 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <div className="font-medium text-white">Scope Matrix</div>
                  <div className="text-sm text-slate-400">Compare suppliers and generate report</div>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <button
                onClick={handleGenerateReport}
                disabled={generating}
                className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium inline-flex items-center gap-2"
              >
                {generating && <Loader2 className="w-4 h-4 animate-spin" />}
                {generating ? 'Generating Report...' : 'Generate Award Report'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-400 mb-1">
              Projects &gt; {projectName} &gt; Report
            </div>
            <h1 className="text-2xl font-bold text-white">{projectName} – Report</h1>
            <p className="text-sm text-slate-300 mt-1">
              Award Recommendation & Itemised Comparison generated by VerifyTrade
            </p>
          </div>
          <button
            onClick={onNavigateToHub}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
          >
            <ExternalLink size={16} />
            View all project reports
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <AwardReportEnhanced
          key={reportId || 'no-report'}
          projectId={projectId}
          reportId={reportId || undefined}
          organisationId={currentOrganisation?.id || ''}
          onToast={onToast}
          onNavigate={(page) => {
            console.log('Navigate to:', page);
          }}
        />
      </div>
    </div>
  );
}
