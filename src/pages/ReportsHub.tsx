import { useState, useEffect } from 'react';
import { Search, FileText, Calendar, Flame, Hash, TrendingUp, CheckCircle2, AlertCircle, Loader2, RefreshCw, Eye, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { DashboardMode } from '../App';

interface Project {
  id: string;
  name: string;
  client_reference: string;
  updated_at: string;
  has_report: boolean;
  report_id?: string;
  report_generated_at?: string;
  report_quotes_count?: number;
  report_coverage_percent?: number;
  workflow_complete?: boolean;
}

interface ReportsHubProps {
  projects: Project[];
  projectId?: string;
  onNavigate?: (path: 'award-report' | 'equalisation' | 'trade-analysis', reportId?: string) => void;
  dashboardMode?: DashboardMode;
  preselectedQuoteIds?: string[];
}

export default function ReportsHub({ projects, projectId, onNavigate, dashboardMode = 'original', preselectedQuoteIds = [] }: ReportsHubProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [generatingProjectId, setGeneratingProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectsData, setProjectsData] = useState<Project[]>(projects);

  useEffect(() => {
    setProjectsData(projects);
  }, [projects]);

  const reportReadyProjects = projectsData.filter(p => p.workflow_complete);

  const filteredProjects = reportReadyProjects.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.client_reference.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleViewReport = (project: Project) => {
    if (project.report_id) {
      onNavigate?.('award-report', project.report_id);
    }
  };

  const computeAwardReport = async (project: Project, force: boolean = false) => {
    setGeneratingProjectId(project.id);
    setError(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compute_award_report`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const payload: any = {
        projectId: project.id,
        force,
      };

      if (preselectedQuoteIds.length > 0) {
        console.log('📊 ReportsHub: Generating report with preselected quotes:', preselectedQuoteIds);
        payload.quoteIds = preselectedQuoteIds;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      if (!result || !result.reportId) {
        throw new Error('No report ID returned from server');
      }

      const { data: updatedReport } = await supabase
        .from('award_reports')
        .select('id, generated_at, result_json')
        .eq('id', result.reportId)
        .single();

      const quotesCount = updatedReport?.result_json?.awardSummary?.suppliers?.length || 0;
      const coveragePercent = updatedReport?.result_json?.awardSummary?.suppliers?.[0]?.coveragePercent || 0;

      setProjectsData(prev => prev.map(p =>
        p.id === project.id
          ? {
              ...p,
              has_report: true,
              report_id: result.reportId,
              report_generated_at: updatedReport?.generated_at,
              report_quotes_count: quotesCount,
              report_coverage_percent: Math.round(coveragePercent),
            }
          : p
      ));

      await generateAndDownloadReport(result.reportId, project.name);

      onNavigate?.('award-report', result.reportId);
    } catch (error: any) {
      console.error('Error computing award report:', error);
      setError(error.message || 'Failed to compute award report');
    } finally {
      setGeneratingProjectId(null);
    }
  };

  const handleGenerateReport = (project: Project) => {
    computeAwardReport(project, false);
  };

  const handleRegenerateReport = (project: Project) => {
    computeAwardReport(project, true);
  };

  const generateAndDownloadReport = async (reportId: string, projectName: string) => {
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-14 h-14 bg-gradient-to-br from-orange-600 to-orange-700 rounded-xl flex items-center justify-center shadow-lg">
              <Flame className="w-8 h-8 text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-4xl font-bold text-white">Reports Hub</h1>
              <p className="text-lg text-slate-400">Manage and generate award reports</p>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search projects by name or client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-slate-800/60 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-lg"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-600/50 rounded-xl p-4 mb-8 max-w-2xl mx-auto">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          </div>
        )}

        {filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 bg-slate-800/60 rounded-xl flex items-center justify-center mb-6">
              <BarChart3 className="w-10 h-10 text-slate-600" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">No Report-Ready Projects Yet</h3>
            <p className="text-slate-400 text-center max-w-md mb-6">
              Complete the workflow steps to generate reports: Import Quotes → Review & Clean → Scope Matrix
            </p>
            <button
              onClick={() => window.history.back()}
              className="px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all font-semibold shadow-lg"
            >
              Go to Projects
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => {
              const isGenerating = generatingProjectId === project.id;

              return (
                <div
                  key={project.id}
                  className="bg-slate-800/60 rounded-xl shadow-xl border border-slate-700 overflow-hidden hover:border-slate-600 transition-all"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-white mb-1 truncate">
                          {project.name}
                        </h3>
                        <p className="text-sm text-slate-400 truncate">
                          {project.client_reference || 'No client reference'}
                        </p>
                      </div>
                      {project.has_report ? (
                        <div className="flex-shrink-0 w-10 h-10 bg-green-600/20 rounded-lg flex items-center justify-center border border-green-600/50 ml-3">
                          <CheckCircle2 className="w-5 h-5 text-green-400" />
                        </div>
                      ) : (
                        <div className="flex-shrink-0 w-10 h-10 bg-amber-600/20 rounded-lg flex items-center justify-center border border-amber-600/50 ml-3">
                          <AlertCircle className="w-5 h-5 text-amber-400" />
                        </div>
                      )}
                    </div>

                    {project.has_report && project.report_generated_at && (
                      <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
                        <Calendar className="w-4 h-4" />
                        <span>Generated {formatDate(project.report_generated_at)}</span>
                      </div>
                    )}

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg border border-slate-600/50">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-300">Quotes Included</span>
                        </div>
                        <span className="text-lg font-bold text-white">
                          {project.report_quotes_count || 0}
                        </span>
                      </div>

                      <div className="p-3 bg-slate-700/30 rounded-lg border border-slate-600/50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-slate-400" />
                            <span className="text-sm text-slate-300">Avg Coverage</span>
                          </div>
                          <span className="text-lg font-bold text-orange-500">
                            {project.report_coverage_percent ? `${project.report_coverage_percent}%` : 'N/A'}
                          </span>
                        </div>
                        {project.report_coverage_percent !== undefined && (
                          <div className="w-full bg-slate-600 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-orange-600 to-orange-500 h-2 rounded-full transition-all"
                              style={{ width: `${project.report_coverage_percent}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {project.has_report && (
                      <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-3 mb-4">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-blue-300">
                            This report is cached. Click Regenerate to see recent changes.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {project.has_report ? (
                        <>
                          <button
                            onClick={() => handleViewReport(project)}
                            disabled={isGenerating}
                            className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold shadow-lg flex items-center justify-center gap-2"
                          >
                            <Eye className="w-4 h-4" />
                            View Report
                          </button>
                          <button
                            onClick={() => handleRegenerateReport(project)}
                            disabled={isGenerating}
                            className="px-4 py-3 bg-slate-700 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold flex items-center justify-center"
                          >
                            {isGenerating ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleGenerateReport(project)}
                          disabled={isGenerating}
                          className="w-full px-4 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold shadow-lg flex items-center justify-center gap-2"
                        >
                          {isGenerating ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <FileText className="w-4 h-4" />
                              Generate Report
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
