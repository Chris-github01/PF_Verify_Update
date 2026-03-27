import { useEffect, useState } from 'react';
import {
  CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw,
  ShieldCheck, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp,
  BarChart2, FileText,
} from 'lucide-react';
import ShadowLayout from '../../../components/shadow/ShadowLayout';
import {
  getPromotionDecisions, applyAdminOverride,
  generatePromotionDecision,
  type PromotionDecisionRecord, type RegressionFlag,
} from '../../../lib/shadow/phase4/promotionDecisionEngine';
import { getShadowVersions, type ShadowVersion } from '../../../lib/shadow/phase4/shadowVersioningService';

function DecisionBadge({ decision }: { decision: PromotionDecisionRecord['decision'] }) {
  const map = {
    approve_candidate: { label: 'Approve Candidate', cls: 'bg-green-900/50 text-green-300 border-green-700', icon: CheckCircle },
    reject: { label: 'Rejected', cls: 'bg-red-900/50 text-red-300 border-red-700', icon: XCircle },
    needs_review: { label: 'Needs Review', cls: 'bg-amber-900/50 text-amber-300 border-amber-700', icon: Clock },
  };
  const { label, cls, icon: Icon } = map[decision] ?? map.needs_review;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${cls}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: RegressionFlag['severity'] }) {
  const map = {
    critical: 'bg-red-900/40 text-red-300',
    high: 'bg-orange-900/40 text-orange-300',
    medium: 'bg-amber-900/40 text-amber-300',
  };
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${map[severity]}`}>{severity}</span>;
}

function ScoreBar({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-semibold">{value}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DecisionCard({ record, onOverride }: {
  record: PromotionDecisionRecord;
  onOverride: (id: string, override: 'approve' | 'reject') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overriding, setOverriding] = useState(false);

  async function handleOverride(o: 'approve' | 'reject') {
    if (!confirm(`Apply admin override: ${o}?`)) return;
    setOverriding(true);
    await onOverride(record.id, o);
    setOverriding(false);
  }

  const hasOverride = record.admin_override_decision !== null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-800/30"
        onClick={() => setExpanded((x) => !x)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <DecisionBadge decision={record.decision} />
          <span className="text-sm text-gray-200 font-mono truncate">{record.version_id.slice(0, 8)}…</span>
          <span className="text-xs text-gray-600">{record.module_key}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-lg font-bold text-white">{record.decision_score}</div>
            <div className="text-xs text-gray-600">score</div>
          </div>
          {hasOverride && (
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
              record.admin_override_decision === 'approve' ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'
            }`}>
              Override: {record.admin_override_decision}
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-800 px-5 py-5 space-y-5">
          <p className="text-sm text-gray-300 bg-gray-800/50 rounded-lg p-3 border-l-2 border-amber-500/50">
            {record.reasoning_text}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ScoreBar label="Financial Accuracy" value={record.financial_accuracy_score} color="bg-blue-500" />
            <ScoreBar label="Failure Reduction" value={record.failure_reduction_score} color="bg-green-500" />
            <ScoreBar label="Line Accuracy" value={record.line_accuracy_score} color="bg-amber-500" />
            <ScoreBar label="Consistency" value={record.consistency_score} color="bg-teal-500" />
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-gray-500 text-xs">Risk Score</div>
              <div className={`text-lg font-bold mt-0.5 ${record.risk_score >= 70 ? 'text-red-400' : record.risk_score >= 40 ? 'text-amber-400' : 'text-green-400'}`}>
                {record.risk_score}
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-gray-500 text-xs">Benchmark Score</div>
              <div className="text-lg font-bold text-white mt-0.5">{record.benchmark_score}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-gray-500 text-xs">Run Count</div>
              <div className="text-lg font-bold text-white mt-0.5">{record.run_count}</div>
            </div>
          </div>

          {record.regression_flags_json.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Regression Flags ({record.regression_flags_json.length})</p>
              <div className="space-y-2">
                {record.regression_flags_json.map((flag, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-800/40 rounded-lg p-3">
                    <SeverityBadge severity={flag.severity} />
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-gray-300">{flag.type}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{flag.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasOverride && (
            <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
              <span className="text-xs text-gray-500">Admin override:</span>
              <button
                onClick={() => handleOverride('approve')}
                disabled={overriding}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-900/40 hover:bg-green-900/70 text-green-300 text-xs font-medium rounded-lg border border-green-800 transition-colors disabled:opacity-40"
              >
                <ThumbsUp className="w-3 h-3" /> Approve
              </button>
              <button
                onClick={() => handleOverride('reject')}
                disabled={overriding}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/40 hover:bg-red-900/70 text-red-300 text-xs font-medium rounded-lg border border-red-800 transition-colors disabled:opacity-40"
              >
                <ThumbsDown className="w-3 h-3" /> Reject
              </button>
            </div>
          )}

          {hasOverride && (
            <div className="pt-2 border-t border-gray-800 text-xs text-gray-500">
              Reviewed by {record.reviewed_by?.slice(0, 8) ?? 'admin'} on{' '}
              {record.reviewed_at ? new Date(record.reviewed_at).toLocaleString() : '—'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface GenerateDecisionModalProps {
  versions: ShadowVersion[];
  onClose: () => void;
  onGenerated: () => void;
}

function GenerateDecisionModal({ versions, onClose, onGenerated }: GenerateDecisionModalProps) {
  const [versionId, setVersionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligibleVersions = versions.filter((v) => v.status === 'testing' || v.status === 'draft');

  async function handleGenerate() {
    if (!versionId) { setError('Select a version.'); return; }
    setLoading(true);
    setError(null);
    try {
      await generatePromotionDecision(versionId);
      onGenerated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate decision');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <h2 className="text-lg font-semibold text-white">Generate Promotion Decision</h2>
        <p className="text-xs text-gray-400">
          Evaluates a version against its linked benchmark runs and produces an automated recommendation.
          Human review and override remains available.
        </p>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Select Version</label>
          <select
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            <option value="">— choose a version —</option>
            {eligibleVersions.map((v) => (
              <option key={v.id} value={v.id}>{v.version_name} ({v.module_key})</option>
            ))}
          </select>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {loading ? 'Evaluating…' : 'Run Evaluation'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShadowPromotionDecisionsPage() {
  const [decisions, setDecisions] = useState<PromotionDecisionRecord[]>([]);
  const [versions, setVersions] = useState<ShadowVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);

  async function load() {
    setLoading(true);
    const [d, v] = await Promise.all([getPromotionDecisions(), getShadowVersions()]);
    setDecisions(d);
    setVersions(v);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleOverride(id: string, override: 'approve' | 'reject') {
    await applyAdminOverride(id, override);
    await load();
  }

  const approvals = decisions.filter((d) => d.decision === 'approve_candidate').length;
  const rejections = decisions.filter((d) => d.decision === 'reject').length;
  const reviews = decisions.filter((d) => d.decision === 'needs_review').length;

  return (
    <ShadowLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-amber-400" />
            <div>
              <h1 className="text-xl font-bold text-white">Promotion Decisions</h1>
              <p className="text-xs text-gray-500 mt-0.5">Data-driven evaluation of shadow version readiness</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowGenerate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg"
            >
              <BarChart2 className="w-4 h-4" /> Evaluate Version
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Approved', value: approvals, color: 'text-green-400' },
            { label: 'Needs Review', value: reviews, color: 'text-amber-400' },
            { label: 'Rejected', value: rejections, color: 'text-red-400' },
          ].map((s) => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-amber-900/20 border border-amber-800/50 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80">
            All evaluations are advisory. Admin override is required before any version transitions to a rollout plan.
            No changes to the live parser occur automatically.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-600">Loading decisions…</div>
        ) : decisions.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-800 rounded-2xl">
            <FileText className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No promotion decisions yet.</p>
            <button
              onClick={() => setShowGenerate(true)}
              className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg"
            >
              Evaluate a Version
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {decisions.map((d) => (
              <DecisionCard key={d.id} record={d} onOverride={handleOverride} />
            ))}
          </div>
        )}
      </div>

      {showGenerate && (
        <GenerateDecisionModal
          versions={versions}
          onClose={() => setShowGenerate(false)}
          onGenerated={load}
        />
      )}
    </ShadowLayout>
  );
}
