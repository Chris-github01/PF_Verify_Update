import { useState } from 'react';
import {
  AlertTriangle,
  Lock,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  ArrowRight,
  Zap,
  ShieldAlert,
  RotateCcw,
  MinusCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

export interface EarlyWarningReport {
  id: string;
  report_number: string;
  organisation_id: string;
  contract_id: string;
  claim_period_id: string | null;
  claim_line_id: string | null;
  trade_type: string | null;
  affected_trade: string | null;
  line_reference: string | null;
  line_description: string;
  contract_qty: number | null;
  claimed_qty: number | null;
  contract_amount: number;
  claimed_amount: number;
  overrun_amount: number;
  status: 'open' | 'responded' | 'resolved' | 'dismissed';
  resolution_pathway: string | null;
  response_notes: string | null;
  response_due_date: string | null;
  responded_at: string | null;
  resolved_at: string | null;
  repeat_count: number;
  systemic_alert: boolean;
  created_at: string;
}

interface EarlyWarningPanelProps {
  reports: EarlyWarningReport[];
  onReportUpdate: () => void;
}

const STATUS_CONFIG = {
  open: { label: 'Open — Action Required', color: 'text-red-300', bg: 'bg-red-500/15', border: 'border-red-500/30', icon: AlertTriangle },
  responded: { label: 'Responded', color: 'text-yellow-300', bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', icon: Clock },
  resolved: { label: 'Resolved', color: 'text-green-300', bg: 'bg-green-500/15', border: 'border-green-500/30', icon: CheckCircle },
  dismissed: { label: 'Dismissed', color: 'text-gray-400', bg: 'bg-gray-500/15', border: 'border-gray-500/30', icon: MinusCircle },
};

const PATHWAY_OPTIONS = [
  { value: 'approved_variation', label: 'Option A — Approved Variation', desc: 'Raise a VO for the overrun quantity at contracted rates', icon: CheckCircle, color: 'text-green-400' },
  { value: 'omit_from_claim', label: 'Option B — Omit from Claim', desc: 'Remove the overrun from this claim period', icon: MinusCircle, color: 'text-yellow-400' },
  { value: 'recover_from_trade', label: 'Option C — Recover from Trade', desc: 'Cost to be recovered from the responsible trade/party', icon: RotateCcw, color: 'text-orange-400' },
  { value: 'dispute', label: 'Option D — Dispute', desc: 'Formal dispute — refer to contract dispute resolution', icon: XCircle, color: 'text-red-400' },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

function EarlyWarningCard({ report, onUpdate }: { report: EarlyWarningReport; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(report.status === 'open');
  const [resolving, setResolving] = useState(false);
  const [selectedPathway, setSelectedPathway] = useState(report.resolution_pathway || '');
  const [responseNotes, setResponseNotes] = useState(report.response_notes || '');
  const [saving, setSaving] = useState(false);

  const cfg = STATUS_CONFIG[report.status];
  const StatusIcon = cfg.icon;
  const overrunPct = report.contract_amount > 0
    ? ((report.overrun_amount / report.contract_amount) * 100).toFixed(1)
    : '—';

  const handleResolve = async () => {
    if (!selectedPathway) return;
    setSaving(true);
    try {
      await supabase
        .from('scc_early_warning_reports')
        .update({
          status: 'resolved',
          resolution_pathway: selectedPathway,
          response_notes: responseNotes,
          responded_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', report.id);

      if (report.claim_line_id) {
        await supabase
          .from('scc_claim_lines')
          .update({ certification_status: selectedPathway === 'approved_variation' ? 'certified' : 'rejected' })
          .eq('id', report.claim_line_id);
      }

      onUpdate();
    } finally {
      setSaving(false);
      setResolving(false);
    }
  };

  const handleMarkResponded = async () => {
    setSaving(true);
    try {
      await supabase
        .from('scc_early_warning_reports')
        .update({
          status: 'responded',
          response_notes: responseNotes,
          responded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', report.id);
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-4 px-5 py-4 text-left"
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
          report.status === 'open' ? 'bg-red-500/20' :
          report.status === 'responded' ? 'bg-yellow-500/20' :
          report.status === 'resolved' ? 'bg-green-500/20' : 'bg-gray-500/20'
        }`}>
          <StatusIcon size={18} className={cfg.color} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-white text-sm">{report.report_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
              {cfg.label}
            </span>
            {report.systemic_alert && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 flex items-center gap-1">
                <Zap size={10} />
                Systemic Drift ({report.repeat_count}x)
              </span>
            )}
            {report.status === 'open' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/40 text-red-300 border border-red-500/30 flex items-center gap-1 ml-auto">
                <Lock size={10} />
                Commercial Hold
              </span>
            )}
          </div>
          <p className="text-sm text-gray-300 truncate">{report.line_description}</p>
          {report.line_reference && (
            <p className="text-xs text-gray-500 mt-0.5">{report.line_reference}</p>
          )}
        </div>

        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <span className="text-sm font-bold text-red-400">+{formatCurrency(report.overrun_amount)}</span>
          <span className="text-xs text-gray-500">{overrunPct}% overrun</span>
          {expanded ? <ChevronUp size={16} className="text-gray-500 mt-1" /> : <ChevronDown size={16} className="text-gray-500 mt-1" />}
        </div>
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t border-white/10 px-5 pb-5 pt-4 space-y-5">

          {/* Report Header Block */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert size={16} className="text-red-400" />
              <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Early Warning Notice — Quantity Overrun</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {report.trade_type && (
                <>
                  <span className="text-gray-500">Trade</span>
                  <span className="text-gray-200">{report.trade_type}</span>
                </>
              )}
              {report.affected_trade && (
                <>
                  <span className="text-gray-500">Affected Trade</span>
                  <span className="text-gray-200">{report.affected_trade}</span>
                </>
              )}
              <span className="text-gray-500">Issued</span>
              <span className="text-gray-200">{formatDate(report.created_at)}</span>
              {report.response_due_date && (
                <>
                  <span className="text-gray-500">Response Due</span>
                  <span className={`font-medium ${new Date(report.response_due_date) < new Date() ? 'text-red-400' : 'text-gray-200'}`}>
                    {formatDate(report.response_due_date)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Contract Line Item */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">1. Contract Line Item</p>
            <div className="bg-slate-900/40 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">Ref</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">Description</th>
                    <th className="text-right px-3 py-2 text-gray-500 font-medium">Contract Qty</th>
                    <th className="text-right px-3 py-2 text-gray-500 font-medium">Claimed Qty</th>
                    <th className="text-right px-3 py-2 text-gray-500 font-medium">Overrun</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-red-500/5">
                    <td className="px-3 py-2 text-gray-400 font-mono">{report.line_reference || '—'}</td>
                    <td className="px-3 py-2 text-white">{report.line_description}</td>
                    <td className="px-3 py-2 text-right text-gray-300">{report.contract_qty ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-red-300 font-semibold">{report.claimed_qty ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-red-400 font-bold">
                      +{report.contract_qty && report.claimed_qty ? (report.claimed_qty - report.contract_qty).toFixed(2) : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="bg-slate-800/60 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Contract Amount</p>
                <p className="text-sm font-semibold text-white">{formatCurrency(report.contract_amount)}</p>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Claimed Amount</p>
                <p className="text-sm font-semibold text-red-300">{formatCurrency(report.claimed_amount)}</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
                <p className="text-xs text-red-400 mb-1">Overrun</p>
                <p className="text-sm font-bold text-red-400">+{formatCurrency(report.overrun_amount)}</p>
              </div>
            </div>
          </div>

          {/* Commercial Position */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">2. Commercial Position</p>
            <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-4 space-y-2 text-xs text-red-200">
              <p>This claim exceeds the contracted baseline quantity. Under system governance rules:</p>
              <ul className="space-y-1 ml-3">
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">•</span>No Base Tracker line = No progress assessment</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">•</span>No approved VO reference = No payment beyond baseline</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">•</span>Variations must be approved prior to certification</li>
              </ul>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-red-500/20">
                <Lock size={13} className="text-red-400 flex-shrink-0" />
                <span className="font-semibold text-red-300">This item is on Commercial Hold — not certified for payment</span>
              </div>
            </div>
          </div>

          {/* Request for Clarification */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">3. Request for Clarification</p>
            <div className="bg-slate-900/40 rounded-lg p-4 text-xs text-gray-300">
              <p className="mb-2">The responsible trade is requested to confirm whether this overrun resulted from:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  'Design change', 'Omission in tender', 'Site instruction',
                  'Coordination clash', 'Installation error', 'Additional service added'
                ].map(reason => (
                  <div key={reason} className="flex items-center gap-2 text-gray-400">
                    <div className="w-3 h-3 rounded border border-slate-600 flex-shrink-0" />
                    {reason}
                  </div>
                ))}
              </div>
              {report.response_due_date && (
                <p className="mt-3 text-yellow-400 font-medium">Response required by: {formatDate(report.response_due_date)}</p>
              )}
            </div>
          </div>

          {/* Risk Assessment */}
          {report.systemic_alert && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">4. Systemic Risk Alert</p>
              <div className="bg-orange-900/20 border border-orange-500/20 rounded-lg p-4 text-xs text-orange-200">
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={14} className="text-orange-400" />
                  <span className="font-semibold text-orange-300">This line has overrun {report.repeat_count} times — Systemic Scope Drift Detected</span>
                </div>
                <p>This is not an isolated occurrence. This may indicate a tender error, coordination failure, or systematic under-quoting. Consider triggering a full penetration audit or services remeasure.</p>
              </div>
            </div>
          )}

          {/* Resolution Pathway — only show for open/responded */}
          {(report.status === 'open' || report.status === 'responded') && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {report.status === 'open' ? '5. Commercial Pathway — Select to Resolve' : '5. Resolution Pathway'}
              </p>
              <div className="space-y-2">
                {PATHWAY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setSelectedPathway(opt.value); setResolving(true); }}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                      selectedPathway === opt.value
                        ? 'border-cyan-500/50 bg-cyan-500/10'
                        : 'border-slate-700/50 hover:border-slate-600'
                    }`}
                  >
                    <opt.icon size={16} className={`${opt.color} flex-shrink-0 mt-0.5`} />
                    <div>
                      <p className="text-xs font-semibold text-white">{opt.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                    </div>
                    {selectedPathway === opt.value && <CheckCircle size={14} className="text-cyan-400 ml-auto flex-shrink-0 mt-0.5" />}
                  </button>
                ))}
              </div>

              {resolving && selectedPathway && (
                <div className="mt-3 space-y-3">
                  <textarea
                    value={responseNotes}
                    onChange={e => setResponseNotes(e.target.value)}
                    placeholder="Add resolution notes, RFI reference, or clarification details..."
                    rows={3}
                    className="w-full bg-slate-800/50 border border-slate-600 text-white placeholder-gray-500 text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleMarkResponded}
                      disabled={saving}
                      className="flex-1 py-2 text-xs font-medium bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 rounded-lg hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
                    >
                      Mark as Responded
                    </button>
                    <button
                      onClick={handleResolve}
                      disabled={saving || !selectedPathway}
                      className="flex-1 py-2 text-xs font-medium bg-green-500/20 border border-green-500/30 text-green-300 rounded-lg hover:bg-green-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <CheckCircle size={13} />
                      Resolve & {selectedPathway === 'approved_variation' ? 'Certify' : 'Close'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resolution Summary — for resolved */}
          {report.status === 'resolved' && report.resolution_pathway && (
            <div className="bg-green-900/20 border border-green-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={14} className="text-green-400" />
                <span className="text-xs font-semibold text-green-300">Resolved — {formatDate(report.resolved_at)}</span>
              </div>
              <p className="text-xs text-green-200">
                {PATHWAY_OPTIONS.find(p => p.value === report.resolution_pathway)?.label}
              </p>
              {report.response_notes && (
                <p className="text-xs text-gray-400 mt-2 italic">"{report.response_notes}"</p>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default function EarlyWarningPanel({ reports, onReportUpdate }: EarlyWarningPanelProps) {
  const openCount = reports.filter(r => r.status === 'open').length;
  const respondedCount = reports.filter(r => r.status === 'responded').length;
  const resolvedCount = reports.filter(r => r.status === 'resolved').length;
  const totalOverrun = reports.filter(r => r.status !== 'dismissed').reduce((s, r) => s + r.overrun_amount, 0);
  const systemicCount = reports.filter(r => r.systemic_alert).length;

  const [filter, setFilter] = useState<'all' | 'open' | 'responded' | 'resolved'>('all');

  const filtered = filter === 'all' ? reports : reports.filter(r => r.status === filter);

  return (
    <div className="space-y-5">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => setFilter(filter === 'open' ? 'all' : 'open')}
          className={`rounded-xl border p-4 text-left transition-all ${
            filter === 'open'
              ? 'border-red-500/50 bg-red-500/10'
              : 'border-red-500/20 bg-red-500/5 hover:border-red-500/40'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-400" />
            <span className="text-xs text-red-400 font-medium">Action Required</span>
          </div>
          <div className="text-2xl font-bold text-red-300">{openCount}</div>
          <div className="text-xs text-red-400/70 mt-1">open warnings</div>
        </button>

        <button
          onClick={() => setFilter(filter === 'responded' ? 'all' : 'responded')}
          className={`rounded-xl border p-4 text-left transition-all ${
            filter === 'responded'
              ? 'border-yellow-500/50 bg-yellow-500/10'
              : 'border-yellow-500/20 bg-yellow-500/5 hover:border-yellow-500/40'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-yellow-400" />
            <span className="text-xs text-yellow-400 font-medium">Under Review</span>
          </div>
          <div className="text-2xl font-bold text-yellow-300">{respondedCount}</div>
          <div className="text-xs text-yellow-400/70 mt-1">awaiting resolution</div>
        </button>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={16} className="text-gray-400" />
            <span className="text-xs text-gray-400 font-medium">Total Overrun Value</span>
          </div>
          <div className="text-xl font-bold text-white">
            {new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 0 }).format(totalOverrun)}
          </div>
          <div className="text-xs text-gray-500 mt-1">unresolved exposure</div>
        </div>

        <div className={`rounded-xl border p-4 ${systemicCount > 0 ? 'border-orange-500/30 bg-orange-500/5' : 'border-slate-700/50 bg-slate-800/50'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Zap size={16} className={systemicCount > 0 ? 'text-orange-400' : 'text-gray-500'} />
            <span className={`text-xs font-medium ${systemicCount > 0 ? 'text-orange-400' : 'text-gray-500'}`}>Systemic Alerts</span>
          </div>
          <div className={`text-2xl font-bold ${systemicCount > 0 ? 'text-orange-300' : 'text-gray-500'}`}>{systemicCount}</div>
          <div className={`text-xs mt-1 ${systemicCount > 0 ? 'text-orange-400/70' : 'text-gray-600'}`}>repeat offenders</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 mr-1">Filter:</span>
        {(['all', 'open', 'responded', 'resolved'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
              filter === f
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-800/50 text-gray-400 hover:text-white border border-slate-700/50'
            }`}
          >
            {f === 'all' ? `All (${reports.length})` : f === 'open' ? `Open (${openCount})` : f === 'responded' ? `Responded (${respondedCount})` : `Resolved (${resolvedCount})`}
          </button>
        ))}
      </div>

      {/* Reports List */}
      {filtered.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle size={40} className="text-green-500/40 mb-3" />
          <p className="text-white font-semibold">No early warning reports</p>
          <p className="text-gray-500 text-sm mt-1">
            {filter === 'all'
              ? 'All claim lines are within contracted baseline amounts'
              : `No ${filter} reports to display`}
          </p>
          {filter !== 'all' && (
            <button onClick={() => setFilter('all')} className="mt-3 flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
              <ArrowRight size={13} />
              View all reports
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(report => (
            <EarlyWarningCard key={report.id} report={report} onUpdate={onReportUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
