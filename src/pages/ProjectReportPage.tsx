import { useState, useEffect } from 'react';
import { FileText, ExternalLink, Loader2 } from 'lucide-react';
import AwardReport from './AwardReport';
import { supabase } from '../lib/supabase';

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
  const [hasReport, setHasReport] = useState<boolean | null>(null);
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
      } else {
        setHasReport(!!data);
      }
    } catch (err) {
      console.error('Failed to check report:', err);
      setHasReport(false);
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

      // Generate and download the report HTML
      if (result.reportId) {
        await generateAndDownloadReport(result.reportId);
      }

      onToast?.('Report generated and downloaded successfully!', 'success');

      // Force hasReport to true and refresh
      setHasReport(true);
    } catch (error: any) {
      console.error('Error generating report:', error);
      onToast?.(error.message || 'Failed to generate report', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const generateAndDownloadReport = async (reportId: string) => {
    try {
      const { data: reportData, error } = await supabase
        .from('award_reports')
        .select('result_json, generated_at')
        .eq('id', reportId)
        .single();

      if (error || !reportData) {
        console.error('Error loading report:', error);
        return;
      }

      const result = reportData.result_json;
      const awardSummary = result.awardSummary;

      const content = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Award Report - ${projectName}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; color: #333; }
            h1 { color: #1e40af; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; margin-bottom: 30px; }
            h2 { color: #1e40af; margin-top: 30px; margin-bottom: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
            h3 { color: #374151; margin-top: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { padding: 12px; text-align: left; border: 1px solid #d1d5db; }
            th { background-color: #3b82f6; color: white; font-weight: 600; }
            tr:nth-child(even) { background-color: #f9fafb; }
            .meta { color: #6b7280; font-size: 14px; margin-bottom: 30px; }
            .supplier-section { margin: 30px 0; padding: 20px; background: #f9fafb; border-radius: 8px; }
            .recommendation { background: #dbeafe; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1>Award Recommendation Report</h1>
          <div class="meta">
            <p><strong>Project:</strong> ${projectName}</p>
            <p><strong>Generated:</strong> ${new Date(reportData.generated_at).toLocaleString()}</p>
            <p><strong>Equalisation Mode:</strong> ${awardSummary.equalisationMode}</p>
          </div>

          <h2>Supplier Rankings</h2>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Supplier</th>
                <th>Adjusted Total</th>
                <th>Risk Score</th>
                <th>Coverage %</th>
                <th>Items Quoted</th>
              </tr>
            </thead>
            <tbody>
              ${awardSummary.suppliers.map((s: any, idx: number) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${s.supplierName}</td>
                  <td>$${s.adjustedTotal.toLocaleString()}</td>
                  <td>${s.riskScore}</td>
                  <td>${Math.round(s.coveragePercent)}%</td>
                  <td>${s.itemsQuoted}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>Recommendations</h2>
          ${awardSummary.recommendations.map((rec: any) => `
            <div class="recommendation">
              <h3>${rec.type.replace('_', ' ')}</h3>
              <p><strong>Supplier:</strong> ${rec.supplier.supplierName}</p>
              <p><strong>Reason:</strong> ${rec.reason}</p>
            </div>
          `).join('')}
        </body>
        </html>
      `;

      const blob = new Blob([content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Award_Report_${projectName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Error generating report download:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading report...</p>
        </div>
      </div>
    );
  }

  if (hasReport === false) {
    return (
      <div className="p-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500 mb-1">
                Projects &gt; {projectName} &gt; Report
              </div>
              <h1 className="text-3xl font-bold text-gray-900">{projectName} – Report</h1>
              <p className="text-gray-600 mt-1">Award Recommendation & Itemised Comparison</p>
            </div>
            <button
              onClick={onNavigateToHub}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ExternalLink size={16} />
              View all project reports
            </button>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No Report Generated Yet
            </h2>
            <p className="text-gray-600 mb-6">
              To generate an award recommendation report, complete the workflow steps and click the button below.
            </p>
            <div className="space-y-3 text-left max-w-md mx-auto">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <div className="font-medium text-gray-900">Import Quotes</div>
                  <div className="text-sm text-gray-600">Upload supplier quotes for analysis</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <div className="font-medium text-gray-900">Review & Clean</div>
                  <div className="text-sm text-gray-600">Normalize and validate quote data</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <div className="font-medium text-gray-900">Scope Matrix</div>
                  <div className="text-sm text-gray-600">Compare suppliers and generate report</div>
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
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500 mb-1">
              Projects &gt; {projectName} &gt; Report
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{projectName} – Report</h1>
            <p className="text-sm text-gray-600 mt-1">
              Award Recommendation & Itemised Comparison generated by PassiveFire Verify+
            </p>
          </div>
          <button
            onClick={onNavigateToHub}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <ExternalLink size={16} />
            View all project reports
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <AwardReport
          projectId={projectId}
          onToast={onToast}
          onNavigate={(page) => {
            console.log('Navigate to:', page);
          }}
        />
      </div>
    </div>
  );
}
