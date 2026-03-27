import { useEffect, useState } from 'react';
import {
  Sparkles, RefreshCw, ChevronDown, ChevronUp,
  ArrowRight, Database, HelpCircle,
} from 'lucide-react';
import { getOrGenerateCopilotOutput, generateCopilotOutput } from '../../lib/phase6/decisionCopilotEngine';
import type { DecisionCopilotOutput, CopilotEntityType } from '../../lib/phase6/decisionCopilotEngine';

interface Props {
  entityType: CopilotEntityType;
  entityId: string;
  compact?: boolean;
}

function RecommendationChip({ text }: { text: string }) {
  const isPositive = text.toLowerCase().includes('award') || text.toLowerCase().includes('accept') || text.toLowerCase().includes('rollout') || text.toLowerCase().includes('test');
  const isNegative = text.toLowerCase().includes('do not') || text.toLowerCase().includes('reject') || text.toLowerCase().includes('not met');
  const base = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border';
  if (isNegative) return <span className={`${base} bg-red-500/10 border-red-500/30 text-red-300`}>{text}</span>;
  if (isPositive) return <span className={`${base} bg-teal-500/10 border-teal-500/30 text-teal-300`}>{text}</span>;
  return <span className={`${base} bg-amber-500/10 border-amber-500/30 text-amber-300`}>{text}</span>;
}

function ConfidenceDot({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? 'bg-teal-400' : pct >= 60 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-gray-500">{pct}% confidence</span>
    </div>
  );
}

export default function DecisionCopilotPanel({ entityType, entityId, compact = false }: Props) {
  const [output, setOutput] = useState<DecisionCopilotOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReasoning, setShowReasoning] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    load();
  }, [entityType, entityId]);

  async function load() {
    setLoading(true);
    const data = await getOrGenerateCopilotOutput(entityType, entityId);
    setOutput(data);
    setLoading(false);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    const data = await generateCopilotOutput(entityType, entityId);
    setOutput(data);
    setRegenerating(false);
  }

  const entityLabel = entityType === 'run' ? 'Run' : entityType === 'candidate_improvement' ? 'Candidate' : 'Version';

  if (loading) {
    return (
      <div className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${compact ? '' : 'p-5'}`}>
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Sparkles className="w-4 h-4 animate-pulse text-amber-400" />
          AI Copilot is analysing this {entityLabel.toLowerCase()}...
        </div>
      </div>
    );
  }

  if (!output) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <HelpCircle className="w-4 h-4" />
          No copilot output available.
          <button onClick={handleRegenerate} className="text-amber-400 hover:text-amber-300 underline">Generate now</button>
        </div>
      </div>
    );
  }

  const reasoning = output.reasoning_json;

  return (
    <div className="bg-gray-900 border border-amber-500/20 rounded-xl overflow-hidden">
      <div className={`${compact ? 'px-4 py-3' : 'px-5 py-4'} border-b border-gray-800 flex items-center justify-between`}>
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <span className="text-sm font-semibold text-white">AI Decision Copilot</span>
          <span className="text-xs text-gray-600">·</span>
          <span className="text-xs text-gray-500">{entityLabel}</span>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
          {regenerating ? 'Updating...' : 'Refresh'}
        </button>
      </div>

      <div className={`${compact ? 'p-4' : 'p-5'} space-y-4`}>
        <p className="text-sm text-gray-200 leading-relaxed">{output.summary_text}</p>

        <div className="flex items-center gap-3 flex-wrap">
          <RecommendationChip text={output.recommendation} />
          <ConfidenceDot score={output.confidence_score} />
        </div>

        {!compact && reasoning && (
          <div>
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              <Database className="w-3.5 h-3.5" />
              View reasoning & data points
              {showReasoning ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showReasoning && (
              <div className="mt-3 space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="bg-gray-800/60 rounded-lg p-3 space-y-1">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">What</div>
                    <div className="text-xs text-gray-300 leading-relaxed">{reasoning.what}</div>
                  </div>
                  <div className="bg-gray-800/60 rounded-lg p-3 space-y-1">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Why it matters</div>
                    <div className="text-xs text-gray-300 leading-relaxed">{reasoning.why}</div>
                  </div>
                  <div className="bg-gray-800/60 rounded-lg p-3 space-y-1">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">What to do next</div>
                    <div className="text-xs text-gray-300 leading-relaxed">{reasoning.next_step}</div>
                  </div>
                </div>

                {reasoning.data_points?.length > 0 && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Data Points</div>
                    <div className="space-y-1">
                      {reasoning.data_points.map((pt, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <ArrowRight className="w-3 h-3 text-gray-600 flex-shrink-0 mt-0.5" />
                          <span className="text-xs text-gray-400">{pt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
