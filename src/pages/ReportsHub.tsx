import { useState, useEffect } from 'react';
import { Search, FileText, Calendar, User, Building2, Hash, TrendingUp, CheckCircle2, AlertCircle, Loader2, RefreshCw, Printer, Table as TableIcon } from 'lucide-react';
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
}

export default function ReportsHub({ projects, projectId, onNavigate, dashboardMode = 'original' }: ReportsHubProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId && projects.length > 0 && !selectedProject) {
      const currentProject = projects.find(p => p.id === projectId && p.has_report);
      if (currentProject) {
        setSelectedProject(currentProject);
      }
    }
  }, [projectId, projects]);

  const reportReadyProjects = projects.filter(p => p.workflow_complete);

  const filteredProjects = reportReadyProjects.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.client_reference.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const projectsNeedingReport = filteredProjects.filter(p => !p.has_report);
  const projectsWithReport = filteredProjects.filter(p => p.has_report);

  const handleViewReport = () => {
    if (selectedProject?.report_id) {
      onNavigate?.('award-report', selectedProject.report_id);
    }
  };

  const computeAwardReport = async (force: boolean = false) => {
    if (!selectedProject) return;

    setGenerating(true);
    setError(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compute_award_report`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: selectedProject.id,
          force,
        }),
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

      setSelectedProject({
        ...selectedProject,
        has_report: true,
        report_id: result.reportId,
        report_generated_at: updatedReport?.generated_at,
        report_quotes_count: quotesCount,
        report_coverage_percent: Math.round(coveragePercent),
      });

      onNavigate?.('award-report', result.reportId);
    } catch (error: any) {
      console.error('Error computing award report:', error);
      setError(error.message || 'Failed to compute award report');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateReport = () => {
    computeAwardReport(false);
  };

  const handleRegenerateReport = () => {
    computeAwardReport(true);
  };

  const refreshProjectMetadata = async () => {
    if (!selectedProject?.report_id) return;

    try {
      const { data: updatedReport } = await supabase
        .from('award_reports')
        .select('id, generated_at, result_json')
        .eq('id', selectedProject.report_id)
        .single();

      if (updatedReport) {
        const quotesCount = updatedReport.result_json?.awardSummary?.suppliers?.length || 0;
        const coveragePercent = updatedReport.result_json?.awardSummary?.suppliers?.[0]?.coveragePercent || 0;

        setSelectedProject({
          ...selectedProject,
          report_generated_at: updatedReport.generated_at,
          report_quotes_count: quotesCount,
          report_coverage_percent: Math.round(coveragePercent),
        });
      }
    } catch (error) {
      console.error('Error refreshing project metadata:', error);
    }
  };

  useEffect(() => {
    if (selectedProject?.has_report && selectedProject.report_id) {
      refreshProjectMetadata();
    }
  }, [selectedProject?.id]);

  const handleExportPDF = async () => {
    if (!selectedProject?.report_id) return;

    try {
      const { data: reportData, error } = await supabase
        .from('award_reports')
        .select('result_json, generated_at')
        .eq('id', selectedProject.report_id)
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
          <title>Award Report - ${selectedProject.name}</title>
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
            <p><strong>Project:</strong> ${selectedProject.name}</p>
            <p><strong>Client:</strong> ${selectedProject.client_reference}</p>
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
      const printWindow = window.open(url, '_blank', 'width=1024,height=768');

      if (printWindow) {
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
            setTimeout(() => {
              URL.revokeObjectURL(url);
            }, 1000);
          }, 500);
        };
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `Award_Report_${selectedProject.name.replace(/[^a-z0-9]/gi, '_')}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
    }
  };

  const handleExportExcel = () => {
    if (selectedProject) {
      onNavigate?.('award-report');
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
    <div className="h-full flex flex-col bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)]">
      {/* Header */}
      <div className="bg-slate-800/60 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Reports Hub</h1>
            <p className="text-sm text-gray-500">Manage and generate award reports</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Project List */}
        <div className="w-96 bg-slate-800/60 border-r border-slate-700 flex flex-col">
          {/* Search */}
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Project List */}
          <div className="flex-1 overflow-y-auto">
            {/* Needs Report Section */}
            {projectsNeedingReport.length > 0 && (
              <div className="mb-6">
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-900">
                      Needs Report ({projectsNeedingReport.length})
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {projectsNeedingReport.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProject(project)}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-700/50 transition-colors ${
                        selectedProject?.id === project.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                      }`}
                    >
                      <div className="font-medium text-gray-900 mb-1">{project.name}</div>
                      <div className="text-xs text-gray-500 mb-1">{project.client_reference}</div>
                      <div className="text-xs text-gray-400">
                        Updated {formatDate(project.updated_at)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* With Report Section */}
            {projectsWithReport.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-green-50 border-b border-green-100">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-900">
                      With Report ({projectsWithReport.length})
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {projectsWithReport.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProject(project)}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-700/50 transition-colors ${
                        selectedProject?.id === project.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                      }`}
                    >
                      <div className="font-medium text-gray-900 mb-1">{project.name}</div>
                      <div className="text-xs text-gray-500 mb-1">{project.client_reference}</div>
                      <div className="text-xs text-gray-400">
                        Updated {formatDate(project.updated_at)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {reportReadyProjects.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 px-6 text-center">
                <AlertCircle className="w-12 h-12 mb-3 text-amber-400" />
                <p className="text-sm font-medium text-gray-900 mb-2">No Report-Ready Projects</p>
                <p className="text-xs text-gray-500 max-w-xs">
                  Projects must complete all workflow steps (Import Quotes → Review & Clean → Scope Matrix) before they appear here.
                </p>
              </div>
            )}

            {reportReadyProjects.length > 0 && filteredProjects.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <Search className="w-12 h-12 mb-3" />
                <p className="text-sm">No projects match your search</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Project Details */}
        <div className="flex-1 overflow-y-auto">
          {selectedProject ? (
            <div className="p-8">
              {/* Project Header */}
              <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6 mb-6">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  {selectedProject.name}
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 text-gray-600">
                    <Building2 className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Client</div>
                      <div className="font-medium">{selectedProject.client_reference || 'Not specified'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-gray-600">
                    <Hash className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Reference</div>
                      <div className="font-medium">{selectedProject.client_reference || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Report Actions */}
              {selectedProject.has_report ? (
                <>
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                      <div className="flex items-center gap-2 text-red-800">
                        <AlertCircle className="w-5 h-5" />
                        <span className="font-medium">{error}</span>
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6 mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Actions</h3>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-blue-800">
                          This report is cached. Changes to quotes will show after you click Regenerate.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={handleViewReport}
                        disabled={generating}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        View Report
                      </button>
                      <button
                        onClick={handleRegenerateReport}
                        disabled={generating}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        {generating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Regenerating...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            Regenerate
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleExportPDF}
                        disabled={generating}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        <Printer className="w-4 h-4" />
                        Export PDF
                      </button>
                      <button
                        onClick={handleExportExcel}
                        disabled={generating}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        <TableIcon className="w-4 h-4" />
                        Export Excel
                      </button>
                    </div>
                  </div>

                  {/* Report Metadata */}
                  <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Details</h3>
                    <div className="grid grid-cols-3 gap-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Calendar className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 uppercase">Generated</div>
                          <div className="font-medium text-gray-900">
                            {selectedProject.report_generated_at
                              ? formatDate(selectedProject.report_generated_at)
                              : 'N/A'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 uppercase">Quotes Included</div>
                          <div className="font-medium text-gray-900">
                            {selectedProject.report_quotes_count || 0}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                          <TrendingUp className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 uppercase">Coverage</div>
                          <div className="font-medium text-gray-900">
                            {selectedProject.report_coverage_percent
                              ? `${selectedProject.report_coverage_percent}%`
                              : 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                      <div className="flex items-center gap-2 text-red-800">
                        <AlertCircle className="w-5 h-5" />
                        <span className="font-medium">{error}</span>
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-12 text-center">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="w-8 h-8 text-amber-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No Report Available</h3>
                    <p className="text-gray-500 mb-6">
                      Generate an award report to compare quotes and make award decisions.
                    </p>
                    <button
                      onClick={handleGenerateReport}
                      disabled={generating}
                      className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium inline-flex items-center gap-2"
                    >
                      {generating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Generating Report...
                        </>
                      ) : (
                        <>
                          <FileText className="w-5 h-5" />
                          Generate Award Report
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-400">
                <User className="w-16 h-16 mx-auto mb-4" />
                <p className="text-lg">Select a project to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
