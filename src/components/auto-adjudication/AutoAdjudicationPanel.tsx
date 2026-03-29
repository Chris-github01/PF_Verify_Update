import { useState } from 'react';
import { Play, RefreshCw, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import AutoAdjudicationDecisionCard from './AutoAdjudicationDecisionCard';
import SupplierRankingTable from './SupplierRankingTable';
import DecisionReasonPanel from './DecisionReasonPanel';
import ManualReviewBanner from './ManualReviewBanner';
import { runAutoAdjudication } from '../../lib/auto-adjudication/autoAdjudicationDecisionService';
import { persistAdjudicationRun } from '../../lib/auto-adjudication/autoAdjudicationPersistenceService';
import type { AutoAdjudicationResult, SupplierInputData } from '../../lib/auto-adjudication/autoAdjudicationTypes';

interface Props {
  projectId: string;
  trade: string;
  suppliers: SupplierInputData[];
  userId?: string;
  onRecommendationResolved?: (supplierId: string | null, outcome: string) => void;
}

export default function AutoAdjudicationPanel({
  projectId,
  trade,
  suppliers,
  userId,
  onRecommendationResolved,
}: Props) {
  const [result, setResult] = useState<AutoAdjudicationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNarratives, setShowNarratives] = useState(false);

  const handleRun = async () => {
    if (suppliers.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const adjResult = await runAutoAdjudication({
        project_id: projectId,
        trade,
        suppliers,
        run_by_user_id: userId,
      });
      setResult(adjResult);

      persistAdjudicationRun(projectId, trade, adjResult, userId).catch(() => {});

      if (onRecommendationResolved) {
        onRecommendationResolved(adjResult.recommended_supplier_id, adjResult.final_outcome);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Auto-adjudication failed unexpectedly.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Auto-Adjudication Mode</h2>
            <p className="text-xs text-slate-400">Commercial recommendation engine — advisory, config-driven</p>
          </div>
        </div>
        <button
          onClick={handleRun}
          disabled={loading || suppliers.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {loading
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running...</>
            : <><Play className="w-4 h-4" /> {result ? 'Re-run' : 'Run Adjudication'}</>
          }
        </button>
      </div>

      {error && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="p-8 text-center space-y-3">
          <Sparkles className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-400">
            Run the auto-adjudication engine to evaluate {suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''} and determine a defensible commercial recommendation.
          </p>
          <p className="text-xs text-slate-500">
            Uses scope intelligence, behaviour history, decision gates, and weighted commercial scoring.
          </p>
        </div>
      )}

      {loading && (
        <div className="p-8 text-center space-y-2">
          <RefreshCw className="w-8 h-8 text-blue-400 mx-auto animate-spin" />
          <p className="text-sm text-slate-300 font-medium">Evaluating commercial criteria...</p>
          <p className="text-xs text-slate-500">Scoring price position · Assessing scope strength · Evaluating behaviour trust</p>
        </div>
      )}

      {result && (
        <div className="p-5 space-y-5">
          <ManualReviewBanner
            outcome={result.final_outcome}
            manualReviewReasons={result.manual_review_reasons}
            blockReasons={result.block_reasons}
            manualReviewSummary={result.narratives.manual_review_summary}
          />

          <AutoAdjudicationDecisionCard result={result} />

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Supplier Rankings</h3>
            <SupplierRankingTable
              rankings={result.supplier_rankings}
              recommendedSupplierId={result.recommended_supplier_id}
              cheapestSupplierId={result.cheapest_supplier_id}
            />
          </div>

          <DecisionReasonPanel result={result} />

          <div className="rounded-xl border border-slate-700/40 overflow-hidden">
            <button
              onClick={() => setShowNarratives(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-300 hover:bg-slate-800/30 transition-colors"
            >
              <span className="font-medium">Commercial Narratives</span>
              {showNarratives ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>

            {showNarratives && (
              <div className="px-4 pb-4 space-y-4 border-t border-slate-700/40">
                {[
                  { label: 'Executive Summary', text: result.narratives.executive_summary },
                  { label: 'Commercial Recommendation', text: result.narratives.commercial_recommendation_summary },
                  { label: 'Supplier Comparison', text: result.narratives.supplier_comparison_summary },
                  { label: 'Why Recommended', text: result.narratives.why_recommended_summary },
                  ...(result.narratives.why_not_cheapest_summary
                    ? [{ label: 'Why Not Cheapest?', text: result.narratives.why_not_cheapest_summary }]
                    : []),
                ].map(item => (
                  <div key={item.label} className="pt-3">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{item.label}</h4>
                    <p className="text-sm text-slate-300 leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/30 flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Auto-adjudication is advisory only. All recommendations require QS review before award. This engine does not modify live parser outputs, supplier quote data, or existing workflow selections.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
