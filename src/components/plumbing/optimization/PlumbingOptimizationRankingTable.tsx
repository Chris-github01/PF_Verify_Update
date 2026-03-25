import { Medal, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { OptimizationRanking, OptimizationBundle } from '../../../lib/modules/parsers/plumbing/optimization/optimizationTypes';

interface PlumbingOptimizationRankingTableProps {
  rankings: OptimizationRanking[];
  bundles: OptimizationBundle[];
  onSelectBundle: (bundleId: string) => void;
}

const REC_LEVEL_CONFIG = {
  strong:       { label: 'Strong',       color: 'text-teal-300',   bg: 'bg-teal-900/20 border-teal-700/30' },
  moderate:     { label: 'Moderate',     color: 'text-amber-300',  bg: 'bg-amber-900/20 border-amber-700/30' },
  experimental: { label: 'Experimental', color: 'text-gray-400',   bg: 'bg-gray-800/50 border-gray-700' },
};

const RISK_COLOR = {
  low:    'text-teal-400',
  medium: 'text-amber-400',
  high:   'text-red-400',
};

const POSITION_MEDALS = ['text-yellow-300', 'text-gray-300', 'text-amber-600'];

export default function PlumbingOptimizationRankingTable({ rankings, bundles, onSelectBundle }: PlumbingOptimizationRankingTableProps) {
  const bundleMap = new Map(bundles.map((b) => [b.id, b]));

  if (rankings.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-gray-600">
        No rankings yet. Run simulations on bundles to generate rankings.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rankings.map((ranking) => {
        const bundle = bundleMap.get(ranking.bundle_id);
        const recCfg = REC_LEVEL_CONFIG[ranking.recommendation_level];
        const medalColor = POSITION_MEDALS[ranking.rank_position - 1] ?? 'text-gray-600';

        return (
          <button
            key={ranking.id}
            onClick={() => onSelectBundle(ranking.bundle_id)}
            className="w-full text-left flex items-center gap-3 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-600 transition-colors group"
          >
            {/* Position */}
            <div className="w-6 shrink-0 text-center">
              {ranking.rank_position <= 3 ? (
                <Medal className={`w-4 h-4 ${medalColor} mx-auto`} />
              ) : (
                <span className="text-[10px] text-gray-600 font-bold">#{ranking.rank_position}</span>
              )}
            </div>

            {/* Bundle info */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">
                {bundle?.bundle_name ?? ranking.bundle_id.slice(0, 24)}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gray-500">
                <span>{bundle?.bundle_size}</span>
                <span>{bundle?.candidate_ids.length ?? '?'} candidates</span>
                <span>{bundle?.combined_rule_changes_json.changes.length ?? '?'} changes</span>
              </div>
            </div>

            {/* Recommendation level */}
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border shrink-0 ${recCfg.bg} ${recCfg.color}`}>
              {recCfg.label}
            </span>

            {/* Risk */}
            <div className={`flex items-center gap-1 text-[10px] shrink-0 ${RISK_COLOR[ranking.risk_level]}`}>
              {ranking.risk_level === 'low' ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
              {ranking.risk_level} risk
            </div>

            {/* Score */}
            <div className={`text-xl font-black tabular-nums shrink-0 ${ranking.rank_score >= 70 ? 'text-teal-300' : ranking.rank_score >= 45 ? 'text-amber-300' : 'text-gray-500'}`}>
              {ranking.rank_score.toFixed(0)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
