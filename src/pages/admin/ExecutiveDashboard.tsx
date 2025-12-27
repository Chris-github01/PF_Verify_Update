import { useState, useEffect } from 'react';
import { ArrowLeft, Download, TrendingUp, TrendingDown, FileText, AlertTriangle, CheckCircle, Clock, DollarSign, BarChart3, Filter, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { calculateAuditKPIs, AuditKPIs } from '../../lib/audit/auditCalculations';
import { generateMonthlyReportHTML, downloadMonthlyReport, MonthlyReportOptions } from '../../lib/reports/executiveMonthlyReport';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { direction: 'up' | 'down'; value: string };
  color?: string;
}

function KPICard({ title, value, subtitle, icon, trend, color = 'blue' }: KPICardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-50 text-slate-600',
  };

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-6">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-3 rounded-lg ${colorClasses[color as keyof typeof colorClasses] || colorClasses.blue}`}>
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-sm font-medium ${trend.direction === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {trend.direction === 'up' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {trend.value}
          </div>
        )}
      </div>
      <h3 className="text-sm font-medium text-gray-400 mb-1">{title}</h3>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-6 animate-pulse">
            <div className="w-12 h-12 bg-slate-700/50 rounded-lg mb-3" />
            <div className="h-4 bg-slate-700/50 rounded w-2/3 mb-2" />
            <div className="h-8 bg-slate-700/50 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ExecutiveDashboard() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<AuditKPIs | null>(null);
  const [organisations, setOrganisations] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  // Filters
  const [selectedOrg, setSelectedOrg] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<string>('passivefire');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [showFilters, setShowFilters] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  useEffect(() => {
    loadData();
    loadFilterOptions();
  }, []);

  useEffect(() => {
    if (!loading) {
      loadData();
    }
  }, [selectedOrg, selectedProject, selectedModule, dateRange]);

  const loadFilterOptions = async () => {
    const [orgsRes, projectsRes] = await Promise.all([
      supabase.from('organisations').select('id, name').order('name'),
      supabase.from('projects').select('id, name, organisation_id').order('name'),
    ]);

    setOrganisations(orgsRes.data || []);
    setProjects(projectsRes.data || []);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (selectedOrg) filters.organisationId = selectedOrg;
      if (selectedProject) filters.projectId = selectedProject;
      if (selectedModule) filters.module = selectedModule;
      if (dateRange.start) filters.startDate = dateRange.start + 'T00:00:00Z';
      if (dateRange.end) filters.endDate = dateRange.end + 'T23:59:59Z';

      console.log('📊 Loading Executive Dashboard data with filters:', filters);
      const data = await calculateAuditKPIs(filters);
      console.log('📊 Executive Dashboard data received:', data);
      setKpis(data);
      setLastUpdated(new Date().toLocaleString());
    } catch (error) {
      console.error('❌ Failed to load KPIs:', error);
      // Set kpis to null on error to show the "No Data Available" message
      setKpis(null);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-NZ').format(value);
  };

  const filteredProjects = selectedOrg
    ? projects.filter(p => p.organisation_id === selectedOrg)
    : projects;

  const handleGenerateReport = () => {
    if (!kpis) {
      alert('No data available to generate report. Please wait for data to load.');
      return;
    }

    const selectedOrgData = organisations.find(o => o.id === selectedOrg);
    const selectedProjectData = filteredProjects.find(p => p.id === selectedProject);

    const reportOptions: MonthlyReportOptions = {
      organisationName: selectedOrgData?.name,
      projectName: selectedProjectData?.name,
      module: selectedModule || undefined,
      startDate: dateRange.start,
      endDate: dateRange.end,
    };

    const html = generateMonthlyReportHTML(kpis, reportOptions);

    const filename = `VerifyPlus_Monthly_Report_${dateRange.start}_to_${dateRange.end}.html`;
    downloadMonthlyReport(html, filename);
  };

  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => (window.location.href = '/admin')}
              className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"
            >
              <ArrowLeft size={16} />
              Back to admin
            </button>
          </div>
          <h1 className="text-2xl font-bold text-white">Executive Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">
            Comprehensive audit and reporting intelligence
            {lastUpdated && ` • Last updated: ${lastUpdated}`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-600 text-sm font-medium text-white hover:bg-slate-700/50 transition"
          >
            <Filter size={16} />
            Filters
          </button>
          <button
            onClick={handleGenerateReport}
            disabled={!kpis || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            Generate Monthly Report
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-6 mb-6">
          <h3 className="text-sm font-semibold text-white mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Organisation
              </label>
              <select
                value={selectedOrg}
                onChange={(e) => {
                  setSelectedOrg(e.target.value);
                  setSelectedProject('');
                }}
                className="w-full rounded-lg bg-slate-800/50 border border-slate-600 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">All Organisations</option>
                {organisations.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Project
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full rounded-lg bg-slate-800/50 border border-slate-600 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                disabled={!selectedOrg}
              >
                <option value="">All Projects</option>
                {filteredProjects.map(project => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Module
              </label>
              <select
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value)}
                className="w-full rounded-lg bg-slate-800/50 border border-slate-600 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">All Modules</option>
                <option value="passivefire">Passive Fire</option>
                <option value="mechanical">Mechanical (Future)</option>
                <option value="electrical">Electrical (Future)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Date Range
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  className="w-full rounded-lg bg-slate-800/50 border border-slate-600 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  className="w-full rounded-lg bg-slate-800/50 border border-slate-600 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : (kpis && kpis.totalQuotes >= 0) ? (
        <div className="space-y-6">
          {/* Primary KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KPICard
              title="Total Quotes"
              value={formatNumber(kpis.totalQuotes)}
              subtitle={`${kpis.quotesSuccessfullyParsed} parsed successfully`}
              icon={<FileText size={24} />}
              color="blue"
            />

            <KPICard
              title="Parse Success Rate"
              value={`${kpis.parseSuccessRate.toFixed(1)}%`}
              subtitle={`${formatNumber(kpis.totalLineItems)} line items`}
              icon={<CheckCircle size={24} />}
              color="emerald"
            />

            <KPICard
              title="Audits Completed"
              value={formatNumber(kpis.totalAuditsCompleted)}
              subtitle={kpis.totalAuditsCompleted > 0 ? `Avg ${Math.round(kpis.avgTimeToAudit / 60)}m per audit` : 'No audits yet'}
              icon={<BarChart3 size={24} />}
              color="amber"
            />

            <KPICard
              title="Avg Confidence"
              value={kpis.avgParseConfidence > 0 ? `${kpis.avgParseConfidence.toFixed(1)}%` : 'N/A'}
              subtitle="Extraction accuracy"
              icon={<AlertTriangle size={24} />}
              color="slate"
            />
          </div>

          {/* Time & Cost Savings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <Clock size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-400">Time Savings</h3>
                  <p className="text-2xl font-bold text-white">
                    {formatNumber(Math.round(kpis.timeSavings.hoursSaved))} hours
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-400">
                Labour value: <span className="font-semibold text-emerald-400">{formatCurrency(kpis.timeSavings.labourSavingsNZD)}</span>
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Based on configurable manual review time estimates
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
                  <DollarSign size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-400">Estimated Cost Avoided</h3>
                  <p className="text-2xl font-bold text-white">
                    {formatCurrency(kpis.costSavings.expected)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Conservative:</span>
                  <span className="ml-2 font-semibold text-white">{formatCurrency(kpis.costSavings.conservative)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Aggressive:</span>
                  <span className="ml-2 font-semibold text-white">{formatCurrency(kpis.costSavings.aggressive)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Risk avoidance based on completed audits
              </p>
            </div>
          </div>

          {/* Risk Distribution */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Risk Score Distribution</h3>
            {kpis.totalAuditsCompleted > 0 ? (
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="w-full h-32 bg-emerald-500/20 rounded-lg flex items-end justify-center pb-2 mb-2">
                    <div
                      className="w-16 bg-emerald-500 rounded-t transition-all"
                      style={{ height: `${Math.max((kpis.riskDistribution.low / kpis.totalAuditsCompleted) * 100, 5)}%` }}
                    />
                  </div>
                  <p className="text-2xl font-bold text-white">{kpis.riskDistribution.low}</p>
                  <p className="text-sm text-gray-400">Low Risk (&lt;40)</p>
                </div>

                <div className="text-center">
                  <div className="w-full h-32 bg-amber-500/20 rounded-lg flex items-end justify-center pb-2 mb-2">
                    <div
                      className="w-16 bg-amber-500 rounded-t transition-all"
                      style={{ height: `${Math.max((kpis.riskDistribution.medium / kpis.totalAuditsCompleted) * 100, 5)}%` }}
                    />
                  </div>
                  <p className="text-2xl font-bold text-white">{kpis.riskDistribution.medium}</p>
                  <p className="text-sm text-gray-400">Medium (40-70)</p>
                </div>

                <div className="text-center">
                  <div className="w-full h-32 bg-orange-500/20 rounded-lg flex items-end justify-center pb-2 mb-2">
                    <div
                      className="w-16 bg-orange-500 rounded-t transition-all"
                      style={{ height: `${Math.max((kpis.riskDistribution.high / kpis.totalAuditsCompleted) * 100, 5)}%` }}
                    />
                  </div>
                  <p className="text-2xl font-bold text-white">{kpis.riskDistribution.high}</p>
                  <p className="text-sm text-gray-400">High (70-90)</p>
                </div>

                <div className="text-center">
                  <div className="w-full h-32 bg-rose-500/20 rounded-lg flex items-end justify-center pb-2 mb-2">
                    <div
                      className="w-16 bg-rose-500 rounded-t transition-all"
                      style={{ height: `${Math.max((kpis.riskDistribution.critical / kpis.totalAuditsCompleted) * 100, 5)}%` }}
                    />
                  </div>
                  <p className="text-2xl font-bold text-white">{kpis.riskDistribution.critical}</p>
                  <p className="text-sm text-gray-400">Critical (≥90)</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertTriangle size={48} className="mx-auto text-gray-400 mb-3" />
                <p className="text-sm text-gray-400">No audit risk data available yet</p>
                <p className="text-xs text-gray-400 mt-1">Complete audits to see risk distribution</p>
              </div>
            )}
          </div>

          {/* Top Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Top Gap Types</h3>
              {kpis.topGapTypes.length > 0 ? (
                <div className="space-y-3">
                  {kpis.topGapTypes.slice(0, 5).map((gap, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-sm text-gray-300 capitalize">{gap.type.replace('_', ' ')}</span>
                      <span className="text-sm font-semibold text-white">{gap.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No gap data available</p>
              )}
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Top Manufacturers</h3>
              {kpis.topManufacturers.length > 0 ? (
                <div className="space-y-3">
                  {kpis.topManufacturers.slice(0, 5).map((mfg, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">{mfg.manufacturer}</span>
                      <span className="text-sm font-semibold text-white">{mfg.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No manufacturer data available</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-12 text-center">
          <AlertTriangle size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Data Available</h3>
          <p className="text-sm text-gray-400">
            Try adjusting your filters or date range to see audit intelligence.
          </p>
        </div>
      )}
    </div>
  );
}
