import { useState, useEffect } from 'react';
import {
  LayoutDashboard, FolderOpen, TrendingUp, DollarSign,
  AlertTriangle, CheckCircle, Clock, Plus, ArrowRight,
  FileSpreadsheet, RefreshCw, Shield
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import type { BTProject, BTClaimPeriod, BTBaselineHeader } from '../../types/baselineTracker.types';

interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  totalContractValue: number;
  totalClaimedToDate: number;
  openClaimPeriods: number;
  pendingVariations: number;
}

interface RecentProject {
  project: BTProject;
  header: BTBaselineHeader | null;
  latestClaim: BTClaimPeriod | null;
}

interface BTDashboardProps {
  onNavigate: (view: string, projectId?: string) => void;
}

const statusColors: Record<string, string> = {
  draft: 'bg-slate-800 text-slate-300 border border-slate-600',
  active: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700',
  claim_in_progress: 'bg-blue-900/50 text-blue-300 border border-blue-700',
  submitted: 'bg-amber-900/50 text-amber-300 border border-amber-700',
  closed: 'bg-slate-700 text-slate-400',
  archived: 'bg-slate-800 text-slate-500',
};

const claimStatusColors: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-300',
  under_review: 'bg-amber-900/50 text-amber-300',
  ready_to_submit: 'bg-blue-900/50 text-blue-300',
  submitted: 'bg-cyan-900/50 text-cyan-300',
  certified: 'bg-emerald-900/50 text-emerald-300',
  part_paid: 'bg-teal-900/50 text-teal-300',
  paid: 'bg-green-900/50 text-green-300',
  disputed: 'bg-red-900/50 text-red-300',
};

export default function BTDashboard({ onNavigate }: BTDashboardProps) {
  const { currentOrganisation } = useOrganisation();
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    activeProjects: 0,
    totalContractValue: 0,
    totalClaimedToDate: 0,
    openClaimPeriods: 0,
    pendingVariations: 0,
  });
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentOrganisation) loadData();
  }, [currentOrganisation?.id]);

  const loadData = async () => {
    if (!currentOrganisation) return;
    setLoading(true);
    try {
      const [projectsRes, claimsRes, variationsRes, activityRes] = await Promise.all([
        supabase
          .from('bt_projects')
          .select('*')
          .eq('organisation_id', currentOrganisation.id)
          .order('updated_at', { ascending: false }),
        supabase
          .from('bt_claim_periods')
          .select('*')
          .eq('organisation_id', currentOrganisation.id)
          .in('status', ['draft', 'under_review', 'ready_to_submit', 'submitted']),
        supabase
          .from('bt_variations')
          .select('id')
          .eq('organisation_id', currentOrganisation.id)
          .in('status', ['draft', 'submitted', 'under_review']),
        supabase
          .from('bt_activity_logs')
          .select('*')
          .eq('organisation_id', currentOrganisation.id)
          .order('action_at', { ascending: false })
          .limit(8),
      ]);

      const projects = projectsRes.data || [];
      const claims = claimsRes.data || [];

      const activeProjects = projects.filter((p) => ['active', 'claim_in_progress'].includes(p.status));
      let totalContractValue = 0;
      let totalClaimedToDate = 0;

      const projectsWithData: RecentProject[] = [];

      for (const project of projects.slice(0, 6)) {
        const [headerRes, latestClaimRes] = await Promise.all([
          supabase
            .from('bt_baseline_headers')
            .select('*')
            .eq('project_id', project.id)
            .order('baseline_version', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('bt_claim_periods')
            .select('*')
            .eq('project_id', project.id)
            .order('claim_no', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        const header = headerRes.data;
        if (header) {
          totalContractValue += header.contract_value_excl_gst;
          if (latestClaimRes.data) {
            totalClaimedToDate += latestClaimRes.data.previous_claimed_total + latestClaimRes.data.current_claim_subtotal;
          }
        }

        projectsWithData.push({
          project,
          header: header || null,
          latestClaim: latestClaimRes.data || null,
        });
      }

      setStats({
        totalProjects: projects.length,
        activeProjects: activeProjects.length,
        totalContractValue,
        totalClaimedToDate,
        openClaimPeriods: claims.length,
        pendingVariations: variationsRes.data?.length || 0,
      });

      setRecentProjects(projectsWithData);
      setRecentActivity(activityRes.data || []);
    } catch (err) {
      console.error('BTDashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Baseline Tracker</h1>
          <p className="text-sm text-slate-400 mt-1">Supplier baseline, progress and payment claim management</p>
        </div>
        <button
          onClick={() => onNavigate('bt-project-new')}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Project
        </button>
      </div>

      {/* Governance Rules Banner */}
      <div className="rounded-xl border border-red-800/60 bg-red-950/30 px-5 py-4">
        <div className="flex items-start gap-3">
          <Shield size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-300 mb-1">System Governance Rules</p>
            <ul className="text-xs text-red-400/80 space-y-0.5 list-disc list-inside">
              <li>No Baseline = No progress claim assessment</li>
              <li>No VO reference = No extra payment beyond baseline</li>
              <li>All Baseline exports are logged and immutable</li>
              <li>Variations must be approved before inclusion in certified claims</li>
            </ul>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total Projects', value: stats.totalProjects, icon: FolderOpen, color: 'text-slate-300', bg: 'bg-slate-800/60' },
          { label: 'Active Projects', value: stats.activeProjects, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-900/20' },
          { label: 'Contract Value', value: fmt(stats.totalContractValue), icon: DollarSign, color: 'text-blue-400', bg: 'bg-blue-900/20' },
          { label: 'Claimed to Date', value: fmt(stats.totalClaimedToDate), icon: TrendingUp, color: 'text-cyan-400', bg: 'bg-cyan-900/20' },
          { label: 'Open Claims', value: stats.openClaimPeriods, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-900/20' },
          { label: 'Pending VOs', value: stats.pendingVariations, icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-900/20' },
        ].map((card) => (
          <div key={card.label} className={`${card.bg} rounded-xl p-4 border border-slate-700/50`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">{card.label}</span>
              <card.icon size={15} className={card.color} />
            </div>
            <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Recent Projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-200">Recent Projects</h2>
          <button
            onClick={() => onNavigate('bt-projects')}
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
          >
            View all <ArrowRight size={13} />
          </button>
        </div>

        {recentProjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center">
            <FolderOpen size={28} className="mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400 text-sm font-medium">No projects yet</p>
            <p className="text-slate-500 text-xs mt-1">Create your first project to start tracking</p>
            <button
              onClick={() => onNavigate('bt-project-new')}
              className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-medium inline-flex items-center gap-2"
            >
              <Plus size={14} /> Create Project
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-700/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/60 bg-slate-800/50">
                  {['Project', 'Client', 'Contract Ref', 'Baseline Status', 'Latest Claim', 'Contract Value', 'Claimed to Date', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentProjects.map(({ project, header, latestClaim }) => (
                  <tr
                    key={project.id}
                    className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-200 text-sm">{project.project_name}</p>
                        {project.project_code && <p className="text-xs text-slate-500">{project.project_code}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{project.client_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{project.contract_reference || '—'}</td>
                    <td className="px-4 py-3">
                      {header ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          header.baseline_status === 'locked'
                            ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
                            : header.baseline_status === 'confirmed'
                            ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                            : 'bg-slate-700 text-slate-300'
                        }`}>
                          {header.baseline_status.replace(/_/g, ' ')}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">No baseline</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {latestClaim ? (
                        <div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${claimStatusColors[latestClaim.status]}`}>
                            PC{latestClaim.claim_no}
                          </span>
                          <span className="text-xs text-slate-500 ml-1">{latestClaim.status.replace(/_/g, ' ')}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs font-medium">
                      {header ? fmt(header.contract_value_excl_gst) : '—'}
                    </td>
                    <td className="px-4 py-3 text-cyan-400 text-xs font-medium">
                      {latestClaim ? fmt(latestClaim.previous_claimed_total + latestClaim.current_claim_subtotal) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onNavigate('bt-project-detail', project.id)}
                        className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                      >
                        Open <ArrowRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity Feed + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity */}
        <div className="lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-200 mb-4">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 py-8 text-center">
              <p className="text-slate-500 text-sm">No activity recorded yet</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-700/60 divide-y divide-slate-800/60 overflow-hidden">
              {recentActivity.map((log) => (
                <div key={log.id} className="px-4 py-3 flex items-start gap-3 hover:bg-slate-800/20">
                  <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                    <RefreshCw size={13} className="text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-300">{log.action_label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(log.action_at).toLocaleString('en-NZ', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-base font-semibold text-slate-200 mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { label: 'New Project', icon: Plus, action: 'bt-project-new', color: 'text-cyan-400' },
              { label: 'All Projects', icon: FolderOpen, action: 'bt-projects', color: 'text-blue-400' },
              { label: 'Progress Claims', icon: TrendingUp, action: 'bt-projects', color: 'text-emerald-400' },
              { label: 'Variation Register', icon: AlertTriangle, action: 'bt-projects', color: 'text-amber-400' },
              { label: 'Excel Exports', icon: FileSpreadsheet, action: 'bt-projects', color: 'text-orange-400' },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => onNavigate(item.action)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 hover:bg-slate-800 transition-all text-left"
              >
                <item.icon size={15} className={item.color} />
                <span className="text-sm text-slate-300">{item.label}</span>
                <ArrowRight size={13} className="ml-auto text-slate-600" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Workflow Guide */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wide">How Baseline Tracker Works</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { step: '1', label: 'Create Project', desc: 'Set up project details and contract reference', icon: FolderOpen },
            { step: '2', label: 'Build Baseline', desc: 'Add line items, lock baseline for commercial control', icon: Shield },
            { step: '3', label: 'Track Progress', desc: 'Record quantities complete per period with evidence', icon: TrendingUp },
            { step: '4', label: 'Submit Claims', desc: 'Generate payment claims and export to Excel', icon: FileSpreadsheet },
          ].map((item) => (
            <div key={item.step} className="flex flex-col gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-900/50 border border-cyan-700/50 flex items-center justify-center">
                <item.icon size={15} className="text-cyan-400" />
              </div>
              <p className="text-xs font-semibold text-slate-300">Step {item.step}: {item.label}</p>
              <p className="text-xs text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
