import { AlertTriangle, XCircle, Users } from 'lucide-react';
import type { FinalOutcome } from '../../lib/auto-adjudication/autoAdjudicationTypes';

interface Props {
  outcome: FinalOutcome;
  manualReviewReasons: string[];
  blockReasons: string[];
  manualReviewSummary: string | null;
}

export default function ManualReviewBanner({ outcome, manualReviewReasons, blockReasons, manualReviewSummary }: Props) {
  if (outcome === 'auto_recommend' || outcome === 'recommend_with_warnings') return null;

  const isBlocked = outcome === 'blocked_no_safe_recommendation';
  const reasons = isBlocked ? blockReasons : manualReviewReasons;

  return (
    <div className={`rounded-xl border p-5 space-y-3 ${
      isBlocked
        ? 'border-red-500/40 bg-red-500/8'
        : 'border-orange-500/30 bg-orange-500/8'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isBlocked ? 'bg-red-500/15 border border-red-500/30' : 'bg-orange-500/15 border border-orange-500/30'
        }`}>
          {isBlocked
            ? <XCircle className="w-5 h-5 text-red-400" />
            : <AlertTriangle className="w-5 h-5 text-orange-400" />
          }
        </div>
        <div className="flex-1">
          <h3 className={`text-sm font-bold ${isBlocked ? 'text-red-400' : 'text-orange-400'}`}>
            {isBlocked
              ? 'Auto-Adjudication Blocked — No Safe Recommendation'
              : 'Auto-Adjudication Withheld — Manual Review Required'}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {isBlocked
              ? 'Critical validation blocks prevent any automatic recommendation from being issued.'
              : 'The system has intentionally declined to issue an automatic recommendation. Human judgment is required.'}
          </p>
        </div>
      </div>

      {reasons.length > 0 && (
        <ul className="space-y-1.5 pl-1">
          {reasons.map((r, i) => (
            <li key={i} className={`text-sm flex items-start gap-2 ${isBlocked ? 'text-red-300' : 'text-orange-300'}`}>
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
              {r}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700/40">
        <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <p className="text-xs text-slate-400">
          QS review, additional supplier clarification, or an approved override is required before proceeding with award.
        </p>
      </div>

      {manualReviewSummary && (
        <p className="text-xs text-slate-400 italic">{manualReviewSummary}</p>
      )}
    </div>
  );
}
