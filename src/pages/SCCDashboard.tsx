import { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  TrendingUp,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
  ChevronRight,
  Lock,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Layers,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrganisation } from '../lib/organisationContext';
import PageHeader from '../components/PageHeader';

interface SCCContract {
  id: string;
  contract_number: string;
  contract_name: string;
  subcontractor_name: string;
  subcontractor_company: string;
  contract_value: number;
  status: 'setup' | 'active' | 'complete' | 'disputed';
  snapshot_locked: boolean;
  retention_percentage: number;
  payment_terms_days: number;
  contract_start_date: string | null;
  contract_end_date: string | null;
  created_at: string;
}

interface SCCClaimPeriod {
  id: string;
  contract_id: string;
  period_name: string;
  status: string;
  total_claimed_this_period: number;
  total_claimed_cumulative: number;
  net_payable_this_period: number;
  approved_amount: number | null;
  claim_date: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  setup: { label: 'Setup', color: 'text-yellow-300', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30' },
  active: { label: 'Active', color: 'text-green-300', bg: 'bg-green-500/20', border: 'border-green-500/30' },
  complete: { label: 'Complete', color: 'text-blue-300', bg: 'bg-blue-500/20', border: 'border-blue-500/30' },
  disputed: { label: 'Disputed', color: 'text-red-300', bg: 'bg-red-500/20', border: 'border-red-500/30' },
};

const CLAIM_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-gray-300', bg: 'bg-gray-500/20' },
  submitted: { label: 'Submitted', color: 'text-blue-300', bg: 'bg-blue-500/20' },
  under_review: { label: 'Under Review', color: 'text-yellow-300', bg: 'bg-yellow-500/20' },
  approved: { label: 'Approved', color: 'text-green-300', bg: 'bg-green-500/20' },
  partial: { label: 'Partially Approved', color: 'text-orange-300', bg: 'bg-orange-500/20' },
  rejected: { label: 'Rejected', color: 'text-red-300', bg: 'bg-red-500/20' },
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SCCDashboard() {
  const { currentOrganisation } = useOrganisation();
  const [contracts, setContracts] = useState<SCCContract[]>([]);
  const [recentClaims, setRecentClaims] = useState<SCCClaimPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'overview' | 'contracts' | 'claims' | 'variations'>('overview');

  useEffect(() => {
    if (currentOrganisation?.id) {
      loadData();
    }
  }, [currentOrganisation?.id]);

  const loadData = async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    try {
      const [contractsRes, claimsRes] = await Promise.all([
        supabase
          .from('scc_contracts')
          .select('*')
          .eq('organisation_id', currentOrganisation.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('scc_claim_periods')
          .select('*')
          .eq('organisation_id', currentOrganisation.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      setContracts(contractsRes.data || []);
      setRecentClaims(claimsRes.data || []);
    } catch (err) {
      console.error('Failed to load SCC data:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalContractValue = contracts.reduce((s, c) => s + (c.contract_value || 0), 0);
  const activeContracts = contracts.filter(c => c.status === 'active').length;
  const totalClaimed = recentClaims.reduce((s, c) => s + (c.total_claimed_cumulative || 0), 0);
  const pendingApproval = recentClaims.filter(c => ['submitted', 'under_review'].includes(c.status)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Subcontract Commercial Control"
          subtitle="SCC — Contract-aligned claim building, variation control, and payment reconciliation"
        />
        <button
          onClick={loadData}
          className="p-2 text-gray-400 hover:text-white hover:bg-slate-700/50 rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Module Banner */}
      <div className="bg-gradient-to-r from-cyan-900/40 to-slate-800/60 border border-cyan-500/20 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Layers size={24} className="text-cyan-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-white text-lg mb-1">SCC: Subcontract Commercial Control</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Turn your approved quote into a live subcontract ledger. Build defensible progress claims,
              manage variations (add/omit), and reconcile every payment back to the executed subcontract — locked to the contract snapshot.
            </p>
            <div className="flex flex-wrap gap-3 mt-3">
              {['Contract Snapshot', 'Progress Claims', 'Variation Register', 'Payment Reconciliation', 'Claim Pack Export'].map(f => (
                <span key={f} className="px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs rounded">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center">
              <FileText size={16} className="text-cyan-400" />
            </div>
            <span className="text-sm text-gray-400">Total Contracts</span>
          </div>
          <div className="text-2xl font-bold text-white">{contracts.length}</div>
          <div className="text-xs text-green-400 mt-1">{activeContracts} active</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
              <DollarSign size={16} className="text-green-400" />
            </div>
            <span className="text-sm text-gray-400">Contract Value</span>
          </div>
          <div className="text-2xl font-bold text-white">{formatCurrency(totalContractValue)}</div>
          <div className="text-xs text-gray-500 mt-1">across all contracts</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <TrendingUp size={16} className="text-blue-400" />
            </div>
            <span className="text-sm text-gray-400">Total Claimed</span>
          </div>
          <div className="text-2xl font-bold text-white">{formatCurrency(totalClaimed)}</div>
          <div className="text-xs text-gray-500 mt-1">cumulative to date</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center">
              <Clock size={16} className="text-yellow-400" />
            </div>
            <span className="text-sm text-gray-400">Pending Approval</span>
          </div>
          <div className="text-2xl font-bold text-white">{pendingApproval}</div>
          <div className="text-xs text-gray-500 mt-1">claims awaiting response</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-lg p-1">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'contracts', label: 'Contracts', icon: FileText },
          { id: 'claims', label: 'Claims', icon: TrendingUp },
          { id: 'variations', label: 'Variations', icon: RefreshCw },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id as typeof activeView)}
            className={`flex items-center gap-2 flex-1 px-4 py-2 rounded text-sm font-medium transition-all ${
              activeView === tab.id
                ? 'bg-cyan-500 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <tab.icon size={15} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={24} className="animate-spin text-cyan-400" />
        </div>
      ) : (
        <>
          {/* Overview */}
          {activeView === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Active Contracts */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
                  <h3 className="font-semibold text-white">Active Contracts</h3>
                  <button
                    onClick={() => setActiveView('contracts')}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                  >
                    View all <ChevronRight size={14} />
                  </button>
                </div>
                {contracts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                    <FileText size={40} className="text-gray-600 mb-3" />
                    <p className="text-gray-400 font-medium">No contracts yet</p>
                    <p className="text-gray-500 text-sm mt-1">Set up your first subcontract to get started</p>
                    <button className="mt-4 flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 transition-colors">
                      <Plus size={16} />
                      New Contract
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-700/30">
                    {contracts.slice(0, 5).map(contract => {
                      const cfg = STATUS_CONFIG[contract.status] || STATUS_CONFIG.setup;
                      return (
                        <div key={contract.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-700/20 transition-colors cursor-pointer">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-medium text-white truncate">{contract.contract_name || contract.contract_number}</span>
                              {contract.snapshot_locked && (
                                <Lock size={12} className="text-gray-500 flex-shrink-0" title="Snapshot locked" />
                              )}
                            </div>
                            <div className="text-xs text-gray-400">{contract.subcontractor_company || contract.subcontractor_name}</div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-semibold text-white">{formatCurrency(contract.contract_value)}</div>
                            <span className={`text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                              {cfg.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent Claims */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
                  <h3 className="font-semibold text-white">Recent Claims</h3>
                  <button
                    onClick={() => setActiveView('claims')}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                  >
                    View all <ChevronRight size={14} />
                  </button>
                </div>
                {recentClaims.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                    <TrendingUp size={40} className="text-gray-600 mb-3" />
                    <p className="text-gray-400 font-medium">No claims yet</p>
                    <p className="text-gray-500 text-sm mt-1">Create a contract first, then raise your first progress claim</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-700/30">
                    {recentClaims.slice(0, 5).map(claim => {
                      const cfg = CLAIM_STATUS_CONFIG[claim.status] || CLAIM_STATUS_CONFIG.draft;
                      return (
                        <div key={claim.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-700/20 transition-colors cursor-pointer">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-white text-sm truncate">{claim.period_name}</div>
                            <div className="text-xs text-gray-400">{formatDate(claim.claim_date)}</div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-semibold text-white">{formatCurrency(claim.net_payable_this_period)}</div>
                            <span className={`text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Workflow Guide */}
              <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <h3 className="font-semibold text-white mb-4">SCC Workflow — Award to Payment</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { step: '01', title: 'Contract Setup', desc: 'Import approved quote, lock the contract snapshot as your baseline truth', icon: Lock, color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
                    { step: '02', title: 'Base Tracker', desc: 'All scope lines auto-created from the locked quote schedule with claim rules', icon: Layers, color: 'text-blue-400', bg: 'bg-blue-500/20' },
                    { step: '03', title: 'Progress Claims', desc: 'Build claim period by period — % complete, qty installed, evidence attached', icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/20' },
                    { step: '04', title: 'Reconciliation', desc: 'Track MC responses, approved vs disputed amounts, carry forward adjustments', icon: CheckCircle, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
                  ].map(item => (
                    <div key={item.step} className="relative">
                      <div className={`w-10 h-10 ${item.bg} rounded-xl flex items-center justify-center mb-3`}>
                        <item.icon size={20} className={item.color} />
                      </div>
                      <div className="absolute top-3 left-10 w-4 h-px bg-slate-600 hidden md:block" />
                      <p className="text-xs text-gray-500 font-mono mb-1">STEP {item.step}</p>
                      <p className="font-semibold text-white text-sm mb-1">{item.title}</p>
                      <p className="text-xs text-gray-400 leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Contracts View */}
          {activeView === 'contracts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">{contracts.length} Contract{contracts.length !== 1 ? 's' : ''}</h3>
                <button className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 transition-colors">
                  <Plus size={16} />
                  New Contract
                </button>
              </div>

              {contracts.length === 0 ? (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl flex flex-col items-center justify-center py-20 text-center">
                  <FileText size={48} className="text-gray-600 mb-4" />
                  <p className="text-white font-semibold text-lg mb-2">No contracts set up yet</p>
                  <p className="text-gray-400 text-sm max-w-sm">
                    Create your first SCC contract by importing your approved quote and subcontract agreement.
                    The system will lock a contract snapshot as your commercial baseline.
                  </p>
                  <button className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors">
                    <Plus size={18} />
                    Set Up First Contract
                  </button>
                </div>
              ) : (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="text-left px-5 py-3 text-gray-400 font-medium">Contract</th>
                        <th className="text-left px-5 py-3 text-gray-400 font-medium">Subcontractor</th>
                        <th className="text-right px-5 py-3 text-gray-400 font-medium">Value</th>
                        <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                        <th className="text-left px-5 py-3 text-gray-400 font-medium">Snapshot</th>
                        <th className="text-left px-5 py-3 text-gray-400 font-medium">Start</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {contracts.map(contract => {
                        const cfg = STATUS_CONFIG[contract.status] || STATUS_CONFIG.setup;
                        return (
                          <tr key={contract.id} className="hover:bg-slate-700/20 transition-colors cursor-pointer">
                            <td className="px-5 py-4">
                              <div className="font-medium text-white">{contract.contract_name || contract.contract_number}</div>
                              <div className="text-xs text-gray-500">{contract.contract_number}</div>
                            </td>
                            <td className="px-5 py-4 text-gray-300">{contract.subcontractor_company || contract.subcontractor_name}</td>
                            <td className="px-5 py-4 text-right font-semibold text-white">{formatCurrency(contract.contract_value)}</td>
                            <td className="px-5 py-4">
                              <span className={`text-xs px-2 py-1 rounded ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              {contract.snapshot_locked ? (
                                <div className="flex items-center gap-1.5 text-green-400 text-xs">
                                  <Lock size={12} />
                                  Locked
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-yellow-400 text-xs">
                                  <AlertCircle size={12} />
                                  Unlocked
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-4 text-gray-400 text-xs">{formatDate(contract.contract_start_date)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Claims View */}
          {activeView === 'claims' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">{recentClaims.length} Progress Claim{recentClaims.length !== 1 ? 's' : ''}</h3>
                <button className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 transition-colors disabled:bg-slate-700 disabled:cursor-not-allowed" disabled={contracts.length === 0}>
                  <Plus size={16} />
                  New Claim Period
                </button>
              </div>

              {recentClaims.length === 0 ? (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl flex flex-col items-center justify-center py-20 text-center">
                  <TrendingUp size={48} className="text-gray-600 mb-4" />
                  <p className="text-white font-semibold text-lg mb-2">No progress claims yet</p>
                  <p className="text-gray-400 text-sm max-w-sm">
                    Set up a contract first, then create your first claim period. The system will show you all claimable lines from your locked baseline.
                  </p>
                </div>
              ) : (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="text-left px-5 py-3 text-gray-400 font-medium">Period</th>
                        <th className="text-left px-5 py-3 text-gray-400 font-medium">Claim Date</th>
                        <th className="text-right px-5 py-3 text-gray-400 font-medium">This Claim</th>
                        <th className="text-right px-5 py-3 text-gray-400 font-medium">Net Payable</th>
                        <th className="text-right px-5 py-3 text-gray-400 font-medium">Approved</th>
                        <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {recentClaims.map(claim => {
                        const cfg = CLAIM_STATUS_CONFIG[claim.status] || CLAIM_STATUS_CONFIG.draft;
                        const variance = claim.approved_amount !== null ? claim.approved_amount - claim.net_payable_this_period : null;
                        return (
                          <tr key={claim.id} className="hover:bg-slate-700/20 transition-colors cursor-pointer">
                            <td className="px-5 py-4 font-medium text-white">{claim.period_name}</td>
                            <td className="px-5 py-4 text-gray-400 text-xs">{formatDate(claim.claim_date)}</td>
                            <td className="px-5 py-4 text-right text-gray-300">{formatCurrency(claim.total_claimed_this_period)}</td>
                            <td className="px-5 py-4 text-right font-semibold text-white">{formatCurrency(claim.net_payable_this_period)}</td>
                            <td className="px-5 py-4 text-right">
                              {claim.approved_amount !== null ? (
                                <div className="flex items-center justify-end gap-1">
                                  <span className="font-semibold text-white">{formatCurrency(claim.approved_amount)}</span>
                                  {variance !== null && variance < 0 && (
                                    <ArrowDownRight size={14} className="text-red-400" />
                                  )}
                                  {variance !== null && variance >= 0 && (
                                    <ArrowUpRight size={14} className="text-green-400" />
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-500">—</span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <span className={`text-xs px-2 py-1 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Variations View */}
          {activeView === 'variations' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Variation Register</h3>
                <button className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 transition-colors disabled:bg-slate-700 disabled:cursor-not-allowed" disabled={contracts.length === 0}>
                  <Plus size={16} />
                  New Variation
                </button>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl flex flex-col items-center justify-center py-20 text-center">
                <RefreshCw size={48} className="text-gray-600 mb-4" />
                <p className="text-white font-semibold text-lg mb-2">Variation Register</p>
                <p className="text-gray-400 text-sm max-w-sm">
                  Track all variation orders — additions, omissions, and adjustments. Each VO is priced from your contract rate library and linked to a claim period.
                </p>
                <div className="mt-6 grid grid-cols-3 gap-4 text-left max-w-lg">
                  {[
                    { label: 'Addition', desc: 'New scope instructed', color: 'text-green-400', bg: 'bg-green-500/20' },
                    { label: 'Omission', desc: 'Removed scope', color: 'text-red-400', bg: 'bg-red-500/20' },
                    { label: 'Adjustment', desc: 'Quantity / rate change', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
                  ].map(vt => (
                    <div key={vt.label} className={`${vt.bg} border border-white/10 rounded-lg p-3`}>
                      <p className={`font-semibold ${vt.color} text-sm`}>{vt.label}</p>
                      <p className="text-gray-400 text-xs mt-1">{vt.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
