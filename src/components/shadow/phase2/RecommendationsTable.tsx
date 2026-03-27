import { useEffect, useState } from 'react';
import { Lightbulb, RefreshCw, Loader2, CheckCircle, Clock, ArrowRight, TrendingUp, Zap } from 'lucide-react';
import {
  getRecommendations,
  generateRecommendations,
  updateRecommendationStatus,
  RECOMMENDATION_TYPE_LABELS,
  COMPLEXITY_LABELS,
  STATUS_LABELS,
  type ImprovementRecommendation,
  type RecommendationStatus,
  type RecommendationType,
  type ImplementationComplexity,
} from '../../../lib/shadow/phase2/recommendationEngine';

function statusBadgeClass(status: RecommendationStatus): string {
  if (status === 'open') return 'bg-amber-900/40 text-amber-300 border-amber-700';
  if (status === 'accepted') return 'bg-blue-900/40 text-blue-300 border-blue-700';
  if (status === 'implemented') return 'bg-teal-900/40 text-teal-300 border-teal-700';
  if (status === 'deferred') return 'bg-gray-800 text-gray-400 border-gray-700';
  if (status === 'rejected') return 'bg-red-900/40 text-red-400 border-red-800';
  return 'bg-gray-800 text-gray-400 border-gray-700';
}

function typeBadgeClass(type: RecommendationType): string {
  if (type === 'parser_rule_candidate') return 'bg-amber-900/30 text-amber-400 border-amber-800';
  if (type === 'anchor_pattern_candidate') return 'bg-orange-900/30 text-orange-400 border-orange-800';
  if (type === 'supplier_template_rule') return 'bg-blue-900/30 text-blue-400 border-blue-800';
  if (type === 'confidence_threshold_adjustment') return 'bg-teal-900/30 text-teal-400 border-teal-800';
  if (type === 'review_workflow_improvement') return 'bg-gray-800 text-gray-400 border-gray-700';
  return 'bg-gray-800 text-gray-400 border-gray-700';
}

function complexityColor(c: ImplementationComplexity): string {
  if (c === 'low') return 'text-teal-400';
  if (c === 'medium') return 'text-amber-400';
  return 'text-red-400';
}

function impactColor(score: number): string {
  if (score >= 70) return 'text-red-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-blue-400';
}

function impactBarColor(score: number): string {
  if (score >= 70) return 'bg-red-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-blue-500';
}

interface Props {
  moduleKey?: string;
  showGenerateButton?: boolean;
}

export default function RecommendationsTable({ moduleKey, showGenerateButton = true }: Props) {
  const [recs, setRecs] = useState<ImprovementRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<RecommendationStatus | undefined>('open');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [moduleKey, filterStatus]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getRecommendations(moduleKey, filterStatus, 100);
      setRecs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!moduleKey) return;
    setGenerating(true);
    setError(null);
    try {
      await generateRecommendations(moduleKey);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate recommendations');
    } finally {
      setGenerating(false);
    }
  }

  async function handleStatusChange(id: string, status: RecommendationStatus) {
    setUpdatingId(id);
    try {
      await updateRecommendationStatus(id, status);
      await load();
    } catch {
      // silent
    } finally {
      setUpdatingId(null);
    }
  }

  const countByStatus = (status: RecommendationStatus) =>
    recs.filter((r) => r.status === status).length;

  const allRecs = recs;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">Improvement Recommendations</span>
          <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">{allRecs.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {showGenerateButton && moduleKey && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-lg hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Generate
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Status filters */}
      <div className="flex gap-1">
        <button
          onClick={() => setFilterStatus(undefined)}
          className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${!filterStatus ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}
        >
          All
        </button>
        {(Object.keys(STATUS_LABELS) as RecommendationStatus[]).map((key) => (
          <button
            key={key}
            onClick={() => setFilterStatus(filterStatus === key ? undefined : key)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${filterStatus === key ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}
          >
            {STATUS_LABELS[key]}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>
      )}

      {loading && allRecs.length === 0 ? (
        <div className="py-10 text-center">
          <Loader2 className="w-5 h-5 text-gray-600 animate-spin mx-auto mb-2" />
          <div className="text-sm text-gray-600">Loading recommendations...</div>
        </div>
      ) : allRecs.length === 0 ? (
        <div className="py-10 text-center bg-gray-900/50 rounded-xl border border-dashed border-gray-800">
          <Lightbulb className="w-6 h-6 text-gray-700 mx-auto mb-2" />
          <div className="text-sm text-gray-500">No recommendations in this state.</div>
          {showGenerateButton && moduleKey && (
            <div className="text-xs text-gray-600 mt-1">Generate from shadow run evidence to populate recommendations.</div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {allRecs.map((rec) => {
            const expanded = expandedId === rec.id;
            return (
              <div key={rec.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : rec.id)}
                  className="w-full flex items-start gap-4 px-4 py-4 text-left hover:bg-gray-800/50 transition-colors"
                >
                  {/* Impact score */}
                  <div className="shrink-0 text-center w-12">
                    <div className={`text-xl font-bold ${impactColor(rec.expected_impact_score)}`}>
                      {rec.expected_impact_score}
                    </div>
                    <div className="text-[9px] text-gray-600 uppercase tracking-wide">impact</div>
                    <div className="mt-1 h-1 bg-gray-800 rounded-full overflow-hidden w-12">
                      <div
                        className={`h-full rounded-full ${impactBarColor(rec.expected_impact_score)}`}
                        style={{ width: `${rec.expected_impact_score}%` }}
                      />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white">{rec.title}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide ${typeBadgeClass(rec.recommendation_type as RecommendationType)}`}>
                        {RECOMMENDATION_TYPE_LABELS[rec.recommendation_type as RecommendationType] ?? rec.recommendation_type}
                      </span>
                      <span className={`text-[10px] ${complexityColor(rec.implementation_complexity as ImplementationComplexity)}`}>
                        {COMPLEXITY_LABELS[rec.implementation_complexity as ImplementationComplexity]} complexity
                      </span>
                      <span className="text-[10px] text-gray-600">
                        {rec.evidence_count} evidence runs
                      </span>
                    </div>
                  </div>

                  {/* Status + arrow */}
                  <div className="shrink-0 flex items-center gap-2">
                    <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide ${statusBadgeClass(rec.status as RecommendationStatus)}`}>
                      {STATUS_LABELS[rec.status as RecommendationStatus] ?? rec.status}
                    </span>
                    <ArrowRight className={`w-4 h-4 text-gray-600 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {expanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-800 pt-4">
                    {/* Recommendation text */}
                    <div>
                      <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1.5">Recommendation</div>
                      <div className="text-sm text-gray-300 leading-relaxed">{rec.recommendation_text}</div>
                    </div>

                    {/* Meta */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {rec.target_failure_code && (
                        <div>
                          <span className="text-gray-600">Target Failure: </span>
                          <span className="text-gray-300 font-mono">{rec.target_failure_code}</span>
                        </div>
                      )}
                      {rec.target_supplier_family && (
                        <div>
                          <span className="text-gray-600">Supplier Family: </span>
                          <span className="text-gray-300 font-mono truncate">{rec.target_supplier_family}</span>
                        </div>
                      )}
                    </div>

                    {/* Supporting runs */}
                    {rec.supporting_run_ids_json.length > 0 && (
                      <div>
                        <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1.5">Supporting Runs ({rec.supporting_run_ids_json.length})</div>
                        <div className="flex flex-wrap gap-1">
                          {rec.supporting_run_ids_json.slice(0, 10).map((id) => (
                            <span key={id} className="text-[11px] bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-500 font-mono">
                              {id.slice(0, 8)}…
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    {rec.status === 'open' && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleStatusChange(rec.id, 'accepted')}
                          disabled={updatingId === rec.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-500/15 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle className="w-3 h-3" />
                          Accept
                        </button>
                        <button
                          onClick={() => handleStatusChange(rec.id, 'deferred')}
                          disabled={updatingId === rec.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                        >
                          <Clock className="w-3 h-3" />
                          Defer
                        </button>
                        <button
                          onClick={() => handleStatusChange(rec.id, 'rejected')}
                          disabled={updatingId === rec.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500/70 border border-red-800/40 rounded-lg hover:bg-red-900/20 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {rec.status === 'accepted' && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleStatusChange(rec.id, 'implemented')}
                          disabled={updatingId === rec.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-teal-500/15 border border-teal-500/30 text-teal-300 rounded-lg hover:bg-teal-500/20 transition-colors disabled:opacity-50"
                        >
                          <TrendingUp className="w-3 h-3" />
                          Mark Implemented
                        </button>
                      </div>
                    )}
                    {updatingId === rec.id && <Loader2 className="w-3.5 h-3.5 text-gray-600 animate-spin" />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
