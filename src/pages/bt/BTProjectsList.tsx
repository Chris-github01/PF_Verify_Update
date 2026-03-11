import { useState, useEffect } from 'react';
import {
  Plus, Search, FolderOpen, ArrowRight, Filter,
  TrendingUp, DollarSign, CheckCircle, Clock, AlertTriangle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import type { BTProject, BTBaselineHeader, BTClaimPeriod } from '../../types/baselineTracker.types';

interface ProjectRow {
  project: BTProject;
  header: BTBaselineHeader | null;
  latestClaim: BTClaimPeriod | null;
  claimedToDate: number;
}

interface BTProjectsListProps {
  onNavigate: (view: string, projectId?: string) => void;
  projectId?: string;
  projectName?: string;
  projectClient?: string;
  projectReference?: string;
}

const STATUS_FILTERS = ['all', 'draft', 'active', 'claim_in_progress', 'submitted', 'closed', 'archived'];

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  claim_in_progress: 'Claim in Progress',
  submitted: 'Submitted',
  closed: 'Closed',
  archived: 'Archived',
};

const statusChip: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-300',
  active: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700',
  claim_in_progress: 'bg-blue-900/50 text-blue-300 border border-blue-700',
  submitted: 'bg-amber-900/50 text-amber-300 border border-amber-700',
  closed: 'bg-slate-700 text-slate-400',
  archived: 'bg-slate-800 text-slate-500',
};

const claimChip: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-300',
  under_review: 'bg-amber-900/50 text-amber-300',
  ready_to_submit: 'bg-blue-900/50 text-blue-300',
  submitted: 'bg-cyan-900/50 text-cyan-300',
  certified: 'bg-emerald-900/50 text-emerald-300',
  part_paid: 'bg-teal-900/50 text-teal-300',
  paid: 'bg-green-900/50 text-green-300',
  disputed: 'bg-red-900/50 text-red-300',
};

export default function BTProjectsList({ onNavigate, projectId: mainProjectId, projectName, projectClient, projectReference }: BTProjectsListProps) {
  const { currentOrganisation } = useOrganisation();
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (currentOrganisation) loadProjects();
  }, [currentOrganisation?.id, mainProjectId]);

  const loadProjects = async () => {
    if (!currentOrganisation) return;
    setLoading(true);
    try {
      let query = supabase
        .from('bt_projects')
        .select('*')
        .eq('organisation_id', currentOrganisation.id)
        .order('updated_at', { ascending: false });

      if (mainProjectId) {
        query = query.eq('main_project_id', mainProjectId);
      }

      const { data: projects } = await query;

      if (!projects) { setRows([]); return; }

      const enriched: ProjectRow[] = await Promise.all(
        projects.map(async (project) => {
          const [headerRes, claimRes] = await Promise.all([
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

          const latestClaim = claimRes.data;
          const claimedToDate = latestClaim
            ? latestClaim.previous_claimed_total + latestClaim.current_claim_subtotal
            : 0;

          return { project, header: headerRes.data || null, latestClaim: latestClaim || null, claimedToDate };
        })
      );

      setRows(enriched);
    } finally {
      setLoading(false);
    }
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.project.project_name.toLowerCase().includes(search.toLowerCase()) ||
      r.project.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.project.contract_reference?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Projects</h1>
          {projectName ? (
            <p className="text-sm text-cyan-400 mt-1 font-medium">
              {projectName}
              {projectClient && <span className="text-slate-400 font-normal"> &mdash; {projectClient}</span>}
              {projectReference && <span className="text-slate-500 font-normal text-xs ml-2">({projectReference})</span>}
            </p>
          ) : (
            <p className="text-sm text-slate-400 mt-1">All baseline tracker projects</p>
          )}
        </div>
        <button
          onClick={() => onNavigate('bt-project-new')}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Project
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-600"
          />
        </div>

        <div className="flex items-center gap-1">
          <Filter size={13} className="text-slate-500" />
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-cyan-700 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {s === 'all' ? 'All' : statusLabel[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-cyan-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 py-16 text-center">
          <FolderOpen size={28} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium">No projects found</p>
          <p className="text-slate-500 text-sm mt-1">
            {search || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first project to get started'}
          </p>
          {!search && statusFilter === 'all' && (
            <button
              onClick={() => onNavigate('bt-project-new')}
              className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-medium inline-flex items-center gap-2"
            >
              <Plus size={14} /> Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-700/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/50 border-b border-slate-700/60">
                {['Project', 'Client', 'Contract Ref', 'Status', 'Baseline', 'Latest Claim', 'Contract Value', 'Claimed to Date', 'Remaining', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ project, header, latestClaim, claimedToDate }) => {
                const contractValue = header?.contract_value_excl_gst || 0;
                const remaining = contractValue - claimedToDate;
                return (
                  <tr
                    key={project.id}
                    className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors cursor-pointer"
                    onClick={() => onNavigate('bt-project-detail', project.id)}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-slate-200">{project.project_name}</p>
                        {project.project_code && <p className="text-xs text-slate-500">{project.project_code}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{project.client_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{project.contract_reference || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusChip[project.status]}`}>
                        {statusLabel[project.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {header ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          header.baseline_status === 'locked' ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700' : 'bg-slate-700 text-slate-300'
                        }`}>
                          {header.baseline_status}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {latestClaim ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-slate-300 font-medium">PC{latestClaim.claim_no}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${claimChip[latestClaim.status]}`}>
                            {latestClaim.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs font-medium">{contractValue > 0 ? fmt(contractValue) : '—'}</td>
                    <td className="px-4 py-3 text-cyan-400 text-xs font-medium">{claimedToDate > 0 ? fmt(claimedToDate) : '—'}</td>
                    <td className="px-4 py-3">
                      {contractValue > 0 ? (
                        <span className={`text-xs font-medium ${remaining >= 0 ? 'text-slate-300' : 'text-red-400'}`}>
                          {fmt(remaining)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); onNavigate('bt-project-detail', project.id); }}
                        className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                      >
                        Open <ArrowRight size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
