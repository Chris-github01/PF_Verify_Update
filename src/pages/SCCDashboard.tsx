import { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  TrendingUp,
  DollarSign,
  AlertTriangle,
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
  Zap,
  ShieldAlert,
  Receipt,
  Rocket,
  PlayCircle,
  Send,
  ThumbsUp,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrganisation } from '../lib/organisationContext';
import { useTrade } from '../lib/tradeContext';
import PageHeader from '../components/PageHeader';
import EarlyWarningPanel, { type EarlyWarningReport } from '../components/scc/EarlyWarningPanel';
import PaymentClaimsList from './scc/PaymentClaimsList';

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

const CONTRACT_STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  setup:    { label: 'Setup',     color: 'text-yellow-300', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30' },
  active:   { label: 'Active',    color: 'text-green-300',  bg: 'bg-green-500/20',  border: 'border-green-500/30'  },
  complete: { label: 'Complete',  color: 'text-blue-300',   bg: 'bg-blue-500/20',   border: 'border-blue-500/30'   },
  disputed: { label: 'Disputed',  color: 'text-red-300',    bg: 'bg-red-500/20',    border: 'border-red-500/30'    },
};

const CLAIM_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft:            { label: 'Draft',               color: 'text-gray-300',   bg: 'bg-gray-500/20'   },
  submitted:        { label: 'Submitted',           color: 'text-blue-300',   bg: 'bg-blue-500/20'   },
  under_review:     { label: 'Under Review',        color: 'text-yellow-300', bg: 'bg-yellow-500/20' },
  overrun_flagged:  { label: 'Overrun Flagged',     color: 'text-orange-300', bg: 'bg-orange-500/20' },
  commercial_hold:  { label: 'Commercial Hold',     color: 'text-red-300',    bg: 'bg-red-500/20'    },
  approved:         { label: 'Approved',            color: 'text-green-300',  bg: 'bg-green-500/20'  },
  partial:          { label: 'Partially Approved',  color: 'text-orange-300', bg: 'bg-orange-500/20' },
  rejected:         { label: 'Rejected',            color: 'text-red-300',    bg: 'bg-red-500/20'    },
};

type ActiveView = 'overview' | 'contracts' | 'claims' | 'payment_claims' | 'variations' | 'early_warning';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency', currency: 'NZD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SCCDashboard({ onNavigate }: { onNavigate?: (tab: string) => void } = {}) {
  const { currentOrganisation } = useOrganisation();
  const { currentTrade } = useTrade();
  const [contracts, setContracts] = useState<SCCContract[]>([]);
  const [recentClaims, setRecentClaims] = useState<SCCClaimPeriod[]>([]);
  const [earlyWarnings, setEarlyWarnings] = useState<EarlyWarningReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<ActiveView>('overview');

  useEffect(() => {
    if (currentOrganisation?.id) loadData();
  }, [currentOrganisation?.id, currentTrade]);

  const loadData = async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    try {
      const [contractsRes, claimsRes, ewRes] = await Promise.all([
        supabase
          .from('scc_contracts')
          .select('*')
          .eq('organisation_id', currentOrganisation.id)
          .eq('trade', currentTrade)
          .order('created_at', { ascending: false }),
        supabase
          .from('scc_claim_periods')
          .select('*')
          .eq('organisation_id', currentOrganisation.id)
          .eq('trade', currentTrade)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('scc_early_warning_reports')
          .select('*')
          .eq('organisation_id', currentOrganisation.id)
          .eq('trade_type', currentTrade)
          .order('created_at', { ascending: false }),
      ]);

      setContracts(contractsRes.data || []);
      setRecentClaims(claimsRes.data || []);
      setEarlyWarnings(ewRes.data || []);
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
  const openWarnings = earlyWarnings.filter(w => w.status === 'open').length;
  const commercialHold = recentClaims.filter(c => c.status === 'commercial_hold').length;
  const totalOverrunExposure = earlyWarnings
    .filter(w => w.status !== 'dismissed' && w.status !== 'resolved')
    .reduce((s, w) => s + w.overrun_amount, 0);

  const tabs = [
    { id: 'overview' as ActiveView,        label: 'Overview',        icon: BarChart3 },
    { id: 'contracts' as ActiveView,        label: 'Contracts',       icon: FileText },
    { id: 'claims' as ActiveView,           label: 'Claims',          icon: TrendingUp },
    { id: 'payment_claims' as ActiveView,   label: 'Payment Claims',  icon: Receipt },
    { id: 'variations' as ActiveView,       label: 'Variations',      icon: RefreshCw },
    { id: 'early_warning' as ActiveView,    label: 'Early Warnings',  icon: AlertTriangle, badge: openWarnings > 0 ? openWarnings : undefined },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Subcontract Commercial Control"
          subtitle="SCC — Contract-aligned claim building, overrun governance, and payment reconciliation"
        />
        <button
          onClick={loadData}
          className="p-2 text-gray-400 hover:text-white hover:bg-slate-700/50 rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Commercial Hold Banner — shown when active */}
      {(openWarnings > 0 || commercialHold > 0) && (
        <div
          className="flex items-start gap-4 bg-red-900/25 border border-red-500/30 rounded-xl px-5 py-4 cursor-pointer hover:bg-red-900/35 transition-colors"
          onClick={() => setActiveView('early_warning')}
        >
          <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <ShieldAlert size={20} className="text-red-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-red-300">Commercial Early Warning — Action Required</span>
              <span className="px-2 py-0.5 bg-red-500/30 text-red-200 text-xs rounded-full font-bold">{openWarnings}</span>
            </div>
            <p className="text-sm text-red-400/80">
              {openWarnings} claim line{openWarnings !== 1 ? 's' : ''} exceed contracted baseline amounts without an approved variation.
              {totalOverrunExposure > 0 && ` Total unresolved overrun exposure: ${formatCurrency(totalOverrunExposure)}.`}
              {' '}Certification is blocked until resolved.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-red-300 text-sm font-medium flex-shrink-0">
            Review <ChevronRight size={16} />
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => setActiveView('contracts')}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-left hover:bg-slate-700/50 hover:border-cyan-500/40 transition-all group"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/30 transition-colors">
              <FileText size={16} className="text-cyan-400" />
            </div>
            <span className="text-sm text-gray-400">Total Contracts</span>
          </div>
          <div className="text-2xl font-bold text-white">{contracts.length}</div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-green-400">{activeContracts} active</span>
            <span className="text-xs text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">View <ChevronRight size={11} /></span>
          </div>
        </button>

        <button
          onClick={() => setActiveView('contracts')}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-left hover:bg-slate-700/50 hover:border-green-500/40 transition-all group"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center group-hover:bg-green-500/30 transition-colors">
              <DollarSign size={16} className="text-green-400" />
            </div>
            <span className="text-sm text-gray-400">Contract Value</span>
          </div>
          <div className="text-2xl font-bold text-white">{formatCurrency(totalContractValue)}</div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-500">across all contracts</span>
            <span className="text-xs text-green-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">View <ChevronRight size={11} /></span>
          </div>
        </button>

        <button
          onClick={() => setActiveView('claims')}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-left hover:bg-slate-700/50 hover:border-blue-500/40 transition-all group"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
              <TrendingUp size={16} className="text-blue-400" />
            </div>
            <span className="text-sm text-gray-400">Total Claimed</span>
          </div>
          <div className="text-2xl font-bold text-white">{formatCurrency(totalClaimed)}</div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-500">cumulative to date</span>
            <span className="text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">View claims <ChevronRight size={11} /></span>
          </div>
        </button>

        <button
          onClick={() => openWarnings > 0 ? setActiveView('early_warning') : setActiveView('claims')}
          className={`rounded-xl p-4 text-left transition-all group ${
            openWarnings > 0
              ? 'bg-red-500/10 border border-red-500/30 hover:bg-red-500/15 hover:border-red-500/50'
              : 'bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 hover:border-yellow-500/40'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${openWarnings > 0 ? 'bg-red-500/20 group-hover:bg-red-500/30' : 'bg-yellow-500/20 group-hover:bg-yellow-500/30'}`}>
              {openWarnings > 0
                ? <AlertTriangle size={16} className="text-red-400" />
                : <Clock size={16} className="text-yellow-400" />}
            </div>
            <span className="text-sm text-gray-400">{openWarnings > 0 ? 'Early Warnings' : 'Pending Approval'}</span>
          </div>
          <div className={`text-2xl font-bold ${openWarnings > 0 ? 'text-red-300' : 'text-white'}`}>
            {openWarnings > 0 ? openWarnings : pendingApproval}
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className={`text-xs ${openWarnings > 0 ? 'text-red-400/70' : 'text-gray-500'}`}>
              {openWarnings > 0 ? 'action required' : 'claims awaiting response'}
            </span>
            <span className={`text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 ${openWarnings > 0 ? 'text-red-400' : 'text-yellow-400'}`}>
              {openWarnings > 0 ? 'Review' : 'View'} <ChevronRight size={11} />
            </span>
          </div>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-lg p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`relative flex items-center gap-2 flex-1 px-3 py-2 rounded text-sm font-medium transition-all ${
              activeView === tab.id
                ? tab.id === 'early_warning' && openWarnings > 0
                  ? 'bg-red-500 text-white shadow'
                  : 'bg-cyan-500 text-white shadow'
                : tab.id === 'early_warning' && openWarnings > 0
                  ? 'text-red-400 hover:text-red-300'
                  : 'text-gray-400 hover:text-white'
            }`}
          >
            <tab.icon size={15} />
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.badge !== undefined && (
              <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full font-bold ${
                activeView === tab.id ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
              }`}>
                {tab.badge}
              </span>
            )}
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
            <div className="space-y-6">
            {/* ── Smart "What's Next" Guidance Panel ── */}
            {(() => {
              const lockedContracts = contracts.filter(c => c.snapshot_locked);
              const unlockedContracts = contracts.filter(c => !c.snapshot_locked);
              const draftClaims = recentClaims.filter(c => c.status === 'draft');
              const submittedClaims = recentClaims.filter(c => ['submitted', 'under_review'].includes(c.status));

              type GuidanceState = 'no_contract' | 'need_lock' | 'need_claim' | 'claim_in_draft' | 'all_good';
              let state: GuidanceState = 'all_good';
              if (contracts.length === 0) state = 'no_contract';
              else if (unlockedContracts.length > 0 && lockedContracts.length === 0) state = 'need_lock';
              else if (lockedContracts.length > 0 && recentClaims.length === 0) state = 'need_claim';
              else if (draftClaims.length > 0) state = 'claim_in_draft';

              const config = {
                no_contract: {
                  icon: Rocket,
                  badge: 'Start Here',
                  badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
                  borderColor: 'border-cyan-500/30',
                  bg: 'bg-cyan-500/5',
                  title: 'Step 1 — Import your awarded quote',
                  body: 'To get started, upload the PDF or Excel quote you received from your subcontractor. The AI will read through it and pull out all the line items automatically — no manual typing needed.',
                  tip: 'Tip: You can upload a PDF, Excel spreadsheet, or CSV file. Most supplier quotes work straight away.',
                  action: 'Import Your First Quote',
                  onClick: () => onNavigate?.('scc-quote-import'),
                },
                need_lock: {
                  icon: Lock,
                  badge: 'Action Needed',
                  badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
                  borderColor: 'border-amber-500/30',
                  bg: 'bg-amber-500/5',
                  title: 'Step 2 — Lock your contract snapshot',
                  body: `Your contract "${unlockedContracts[0]?.contract_name || 'contract'}" is set up but not yet locked. Locking confirms your awarded scope and price — this becomes the official record that all future claims are measured against. You can't create a claim until this is done.`,
                  tip: 'Tip: Locking is permanent, so make sure the scope lines and value look correct first.',
                  action: 'Go to Contract Setup',
                  onClick: () => onNavigate?.('scc-quote-import'),
                },
                need_claim: {
                  icon: PlayCircle,
                  badge: "You're Ready to Claim",
                  badgeColor: 'bg-green-500/20 text-green-300 border-green-500/30',
                  borderColor: 'border-green-500/30',
                  bg: 'bg-green-500/5',
                  title: 'Step 3 — Create your first progress claim',
                  body: `Your contract is locked and ready. Now you can start claiming! Create "PC1" for the first period you've worked. Enter the percentage of each scope item you've completed and the system calculates everything else.`,
                  tip: 'Tip: Most contracts claim monthly. Enter the % done for each line — e.g. "Sprinkler heads: 40% complete."',
                  action: 'Create PC1',
                  onClick: () => onNavigate?.('scc-claims'),
                },
                claim_in_draft: {
                  icon: Send,
                  badge: 'Draft Ready to Submit',
                  badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
                  borderColor: 'border-blue-500/30',
                  bg: 'bg-blue-500/5',
                  title: `Submit your pending claim — ${draftClaims[0]?.period_name || 'draft'}`,
                  body: `You have a draft claim ready to go. Once you've entered the % complete or quantities for each line, click "Submit Claim" to formally lodge it. This creates a locked record that the head contractor will certify against.`,
                  tip: 'Tip: Double-check your quantities before submitting — once submitted, you need to raise a variation to make changes.',
                  action: 'Go to Progress Claims',
                  onClick: () => onNavigate?.('scc-claims'),
                },
                all_good: {
                  icon: ThumbsUp,
                  badge: "You're on Track",
                  badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                  borderColor: 'border-emerald-500/30',
                  bg: 'bg-emerald-500/5',
                  title: submittedClaims.length > 0 ? `${submittedClaims.length} claim${submittedClaims.length > 1 ? 's' : ''} awaiting certification` : 'Contract is up to date',
                  body: submittedClaims.length > 0
                    ? 'Your claims are submitted and waiting for the head contractor to certify them. Once certified, mark them as paid to keep your records current.'
                    : 'No immediate action required. Create a new claim period when you are ready to claim for the next period of work.',
                  tip: 'Tip: Keep your retention tracking up to date so you know how much money is being held back.',
                  action: submittedClaims.length > 0 ? 'View Submitted Claims' : 'View Claims',
                  onClick: () => onNavigate?.('scc-claims'),
                },
              }[state];

              const Icon = config.icon;
              return (
                <div className={`rounded-2xl border ${config.borderColor} ${config.bg} p-5`}>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-800/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon size={18} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${config.badgeColor}`}>
                          {config.badge}
                        </span>
                        <h3 className="text-white font-semibold text-sm">{config.title}</h3>
                      </div>
                      <p className="text-gray-300 text-sm leading-relaxed mb-2">{config.body}</p>
                      <p className="text-gray-500 text-xs">{config.tip}</p>
                    </div>
                    <button
                      onClick={config.onClick}
                      className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-xl transition-colors flex-shrink-0 border border-white/10"
                    >
                      {config.action} <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Active Contracts */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
                  <h3 className="font-semibold text-white">Active Contracts</h3>
                  <button onClick={() => setActiveView('contracts')} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                    View all <ChevronRight size={14} />
                  </button>
                </div>
                {contracts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                    <FileText size={40} className="text-gray-600 mb-3" />
                    <p className="text-gray-400 font-medium">No contracts yet</p>
                    <p className="text-gray-500 text-sm mt-1">Set up your first subcontract to get started</p>
                    <button
                      onClick={() => onNavigate?.('scc-quote-import')}
                      className="mt-4 flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 transition-colors">
                      <Plus size={16} />
                      Import Quote
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-700/30">
                    {contracts.slice(0, 5).map(contract => {
                      const cfg = CONTRACT_STATUS[contract.status] || CONTRACT_STATUS.setup;
                      const needsLock = !contract.snapshot_locked;
                      return (
                        <div
                          key={contract.id}
                          onClick={() => setActiveView('contracts')}
                          className="flex items-center gap-4 px-5 py-4 hover:bg-slate-700/30 transition-colors cursor-pointer group"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-medium text-white truncate group-hover:text-cyan-300 transition-colors">{contract.contract_name || contract.contract_number}</span>
                              {contract.snapshot_locked && <Lock size={12} className="text-gray-500 flex-shrink-0" />}
                            </div>
                            <div className="text-xs text-gray-400">{contract.subcontractor_company || contract.subcontractor_name}</div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {needsLock && (
                              <button
                                onClick={e => { e.stopPropagation(); onNavigate?.('scc-quote-import'); }}
                                className="hidden group-hover:flex items-center gap-1 text-xs text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-lg hover:bg-amber-500/25 transition-colors"
                              >
                                <Lock size={11} /> Lock snapshot
                              </button>
                            )}
                            {!needsLock && (
                              <button
                                onClick={e => { e.stopPropagation(); onNavigate?.('scc-claims'); }}
                                className="hidden group-hover:flex items-center gap-1 text-xs text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-1 rounded-lg hover:bg-cyan-500/25 transition-colors"
                              >
                                <Plus size={11} /> New claim
                              </button>
                            )}
                            <div className="text-right">
                              <div className="text-sm font-semibold text-white">{formatCurrency(contract.contract_value)}</div>
                              <span className={`text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.color} ${cfg.border} border`}>{cfg.label}</span>
                            </div>
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
                  <button onClick={() => setActiveView('claims')} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
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
                      const cfg = CLAIM_STATUS[claim.status] || CLAIM_STATUS.draft;
                      const isHeld = claim.status === 'commercial_hold';
                      const isDraft = claim.status === 'draft';
                      const isWarning = claim.status === 'overrun_flagged';
                      return (
                        <div
                          key={claim.id}
                          onClick={() => setActiveView('claims')}
                          className={`flex items-center gap-4 px-5 py-4 transition-colors cursor-pointer group ${isHeld ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-slate-700/30'}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`font-medium text-sm truncate transition-colors ${isHeld ? 'text-red-300' : 'text-white group-hover:text-cyan-300'}`}>{claim.period_name}</span>
                              {isHeld && <Lock size={11} className="text-red-400 flex-shrink-0" />}
                            </div>
                            <div className="text-xs text-gray-400">{formatDate(claim.claim_date)}</div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {isDraft && (
                              <button
                                onClick={e => { e.stopPropagation(); onNavigate?.('scc-claims'); }}
                                className="hidden group-hover:flex items-center gap-1 text-xs text-blue-300 bg-blue-500/15 border border-blue-500/30 px-2.5 py-1 rounded-lg hover:bg-blue-500/25 transition-colors"
                              >
                                <Send size={11} /> Submit
                              </button>
                            )}
                            {isHeld && (
                              <button
                                onClick={e => { e.stopPropagation(); setActiveView('early_warning'); }}
                                className="hidden group-hover:flex items-center gap-1 text-xs text-red-300 bg-red-500/15 border border-red-500/30 px-2.5 py-1 rounded-lg hover:bg-red-500/25 transition-colors"
                              >
                                <ShieldAlert size={11} /> Resolve hold
                              </button>
                            )}
                            {isWarning && (
                              <button
                                onClick={e => { e.stopPropagation(); setActiveView('early_warning'); }}
                                className="hidden group-hover:flex items-center gap-1 text-xs text-orange-300 bg-orange-500/15 border border-orange-500/30 px-2.5 py-1 rounded-lg hover:bg-orange-500/25 transition-colors"
                              >
                                <AlertTriangle size={11} /> Review warning
                              </button>
                            )}
                            <div className="text-right">
                              <div className="text-sm font-semibold text-white">{formatCurrency(claim.net_payable_this_period)}</div>
                              <span className={`text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Commercial Governance Summary */}
              {earlyWarnings.length > 0 && (
                <div
                  className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 cursor-pointer hover:bg-slate-800/70 transition-colors"
                  onClick={() => setActiveView('early_warning')}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white">Commercial Governance — Overrun Summary</h3>
                    <button className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                      Manage <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    {[
                      { label: 'Open Warnings', value: openWarnings, color: 'text-red-300', sub: 'action required' },
                      { label: 'On Hold', value: commercialHold, color: 'text-orange-300', sub: 'not certified' },
                      { label: 'Overrun Exposure', value: formatCurrency(totalOverrunExposure), color: 'text-red-300', sub: 'unresolved' },
                      { label: 'Systemic Alerts', value: earlyWarnings.filter(w => w.systemic_alert).length, color: 'text-orange-300', sub: 'repeat offenders' },
                    ].map(stat => (
                      <div key={stat.label} className="bg-slate-900/40 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
                        <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{stat.sub}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Workflow Guide — clickable tiles */}
              <div className={`${earlyWarnings.length > 0 ? '' : 'lg:col-span-2'} bg-slate-800/50 border border-slate-700/50 rounded-xl p-5`}>
                <h3 className="font-semibold text-white mb-1">How the SCC workflow works</h3>
                <p className="text-xs text-gray-500 mb-4">Click any step to jump straight there.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    {
                      step: '01',
                      title: 'Import Quote',
                      plain: 'Upload your subcontractor\'s quote. AI reads the line items for you.',
                      icon: Lock,
                      color: 'text-cyan-400',
                      bg: 'bg-cyan-500/20',
                      hoverBorder: 'hover:border-cyan-500/50',
                      navigate: () => onNavigate?.('scc-quote-import'),
                    },
                    {
                      step: '02',
                      title: 'Lock Contract',
                      plain: 'Confirm the scope and value. This becomes the official baseline.',
                      icon: Layers,
                      color: 'text-blue-400',
                      bg: 'bg-blue-500/20',
                      hoverBorder: 'hover:border-blue-500/50',
                      navigate: () => onNavigate?.('scc-quote-import'),
                    },
                    {
                      step: '03',
                      title: 'Claim Each Month',
                      plain: 'Enter % complete per line. System calculates what you\'re owed.',
                      icon: TrendingUp,
                      color: 'text-green-400',
                      bg: 'bg-green-500/20',
                      hoverBorder: 'hover:border-green-500/50',
                      navigate: () => onNavigate?.('scc-claims'),
                    },
                    {
                      step: '04',
                      title: 'Watch for Warnings',
                      plain: 'If you claim more than the contract allows, the system alerts you.',
                      icon: ShieldAlert,
                      color: 'text-red-400',
                      bg: 'bg-red-500/20',
                      hoverBorder: 'hover:border-red-500/50',
                      navigate: () => setActiveView('early_warning'),
                    },
                  ].map(item => (
                    <button
                      key={item.step}
                      onClick={item.navigate}
                      className={`text-left p-4 rounded-xl border border-slate-700/50 bg-slate-900/30 ${item.hoverBorder} hover:bg-slate-800/50 transition-all group`}
                    >
                      <div className={`w-9 h-9 ${item.bg} rounded-xl flex items-center justify-center mb-3`}>
                        <item.icon size={18} className={item.color} />
                      </div>
                      <p className="text-xs text-gray-500 font-mono mb-1">STEP {item.step}</p>
                      <p className="font-semibold text-white text-sm mb-1.5">{item.title}</p>
                      <p className="text-xs text-gray-400 leading-relaxed">{item.plain}</p>
                      <p className={`text-xs ${item.color} mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1`}>
                        Go here <ChevronRight size={11} />
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            </div>
          )}

          {/* Contracts View */}
          {activeView === 'contracts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">{contracts.length} Contract{contracts.length !== 1 ? 's' : ''}</h3>
                <button
                  onClick={() => onNavigate?.('scc-quote-import')}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 transition-colors">
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
                    The system locks a contract snapshot as your commercial baseline.
                  </p>
                  <button
                    onClick={() => onNavigate?.('scc-quote-import')}
                    className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors">
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
                        const cfg = CONTRACT_STATUS[contract.status] || CONTRACT_STATUS.setup;
                        const needsLock = !contract.snapshot_locked;
                        return (
                          <tr
                            key={contract.id}
                            className="hover:bg-slate-700/20 transition-colors cursor-pointer group"
                            onClick={() => needsLock ? onNavigate?.('scc-quote-import') : onNavigate?.('scc-claims')}
                          >
                            <td className="px-5 py-4">
                              <div className="font-medium text-white group-hover:text-cyan-300 transition-colors">{contract.contract_name || contract.contract_number}</div>
                              <div className="text-xs text-gray-500">{contract.contract_number}</div>
                            </td>
                            <td className="px-5 py-4 text-gray-300">{contract.subcontractor_company || contract.subcontractor_name}</td>
                            <td className="px-5 py-4 text-right font-semibold text-white">{formatCurrency(contract.contract_value)}</td>
                            <td className="px-5 py-4">
                              <span className={`text-xs px-2 py-1 rounded ${cfg.bg} ${cfg.color} ${cfg.border} border`}>{cfg.label}</span>
                            </td>
                            <td className="px-5 py-4">
                              {contract.snapshot_locked ? (
                                <div className="flex items-center gap-1.5 text-green-400 text-xs"><Lock size={12} />Locked</div>
                              ) : (
                                <button
                                  onClick={e => { e.stopPropagation(); onNavigate?.('scc-quote-import'); }}
                                  className="flex items-center gap-1.5 text-amber-400 text-xs hover:text-amber-300 transition-colors"
                                >
                                  <AlertCircle size={12} />Unlock — lock now
                                </button>
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
                <div>
                  <h3 className="font-semibold text-white">{recentClaims.length} Progress Claim{recentClaims.length !== 1 ? 's' : ''}</h3>
                  {commercialHold > 0 && (
                    <p className="text-xs text-red-400 mt-0.5 flex items-center gap-1">
                      <Lock size={11} />
                      {commercialHold} on Commercial Hold — certification blocked
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onNavigate?.('scc-claims')}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 transition-colors disabled:bg-slate-700 disabled:cursor-not-allowed"
                  disabled={contracts.length === 0}
                >
                  <Plus size={16} />
                  New Claim Period
                </button>
              </div>
              {recentClaims.length === 0 ? (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl flex flex-col items-center justify-center py-20 text-center">
                  <TrendingUp size={48} className="text-gray-600 mb-4" />
                  <p className="text-white font-semibold text-lg mb-2">No progress claims yet</p>
                  <p className="text-gray-400 text-sm max-w-sm">
                    Set up a contract first, then create your first claim period.
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
                        const cfg = CLAIM_STATUS[claim.status] || CLAIM_STATUS.draft;
                        const variance = claim.approved_amount !== null ? claim.approved_amount - claim.net_payable_this_period : null;
                        const isHeld = claim.status === 'commercial_hold';
                        const isDraft = claim.status === 'draft';
                        const isWarning = claim.status === 'overrun_flagged';
                        return (
                          <tr
                            key={claim.id}
                            onClick={() => onNavigate?.('scc-claims')}
                            className={`transition-colors cursor-pointer group ${isHeld ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-slate-700/20'}`}
                          >
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium transition-colors ${isHeld ? 'text-red-300' : 'text-white group-hover:text-cyan-300'}`}>{claim.period_name}</span>
                                {isHeld && <Lock size={12} className="text-red-400" />}
                              </div>
                            </td>
                            <td className="px-5 py-4 text-gray-400 text-xs">{formatDate(claim.claim_date)}</td>
                            <td className="px-5 py-4 text-right text-gray-300">{formatCurrency(claim.total_claimed_this_period)}</td>
                            <td className="px-5 py-4 text-right font-semibold text-white">{formatCurrency(claim.net_payable_this_period)}</td>
                            <td className="px-5 py-4 text-right">
                              {claim.approved_amount !== null ? (
                                <div className="flex items-center justify-end gap-1">
                                  <span className="font-semibold text-white">{formatCurrency(claim.approved_amount)}</span>
                                  {variance !== null && (variance < 0 ? <ArrowDownRight size={14} className="text-red-400" /> : <ArrowUpRight size={14} className="text-green-400" />)}
                                </div>
                              ) : <span className="text-gray-500">—</span>}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-1 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                                {isDraft && (
                                  <button
                                    onClick={e => { e.stopPropagation(); onNavigate?.('scc-claims'); }}
                                    className="hidden group-hover:flex items-center gap-1 text-xs text-blue-300 bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 rounded hover:bg-blue-500/25 transition-colors"
                                  >
                                    <Send size={10} /> Submit
                                  </button>
                                )}
                                {(isHeld || isWarning) && (
                                  <button
                                    onClick={e => { e.stopPropagation(); setActiveView('early_warning'); }}
                                    className="hidden group-hover:flex items-center gap-1 text-xs text-red-300 bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded hover:bg-red-500/25 transition-colors"
                                  >
                                    <ShieldAlert size={10} /> Resolve
                                  </button>
                                )}
                              </div>
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

          {/* Payment Claims View */}
          {activeView === 'payment_claims' && (
            <PaymentClaimsList />
          )}

          {/* Variations View */}
          {activeView === 'variations' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Variation Register</h3>
                <button
                  onClick={() => onNavigate?.('scc-variations')}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 transition-colors disabled:bg-slate-700 disabled:cursor-not-allowed"
                  disabled={contracts.length === 0}
                >
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
                    { label: 'Addition',   desc: 'New scope instructed',    color: 'text-green-400',  bg: 'bg-green-500/20'  },
                    { label: 'Omission',   desc: 'Removed scope',           color: 'text-red-400',    bg: 'bg-red-500/20'    },
                    { label: 'Adjustment', desc: 'Quantity / rate change',  color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
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

          {/* Early Warning View */}
          {activeView === 'early_warning' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <ShieldAlert size={18} className="text-red-400" />
                    Commercial Early Warning System
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Overrun governance — claim lines exceeding contracted baseline trigger automatic commercial holds
                  </p>
                </div>
                {openWarnings > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/15 border border-red-500/30 rounded-lg">
                    <Zap size={14} className="text-red-400" />
                    <span className="text-red-300 text-sm font-semibold">{openWarnings} require action</span>
                  </div>
                )}
              </div>
              <EarlyWarningPanel reports={earlyWarnings} onReportUpdate={loadData} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
