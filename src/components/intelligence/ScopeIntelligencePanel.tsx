import type { SupplierScopeSummary } from '../../lib/intelligence/types';
import CoverageBar from './CoverageBar';

interface Props {
  summary: SupplierScopeSummary;
  supplierName: string;
}

interface CountBadgeProps {
  label: string;
  count: number;
  variant: 'danger' | 'warning' | 'neutral' | 'muted';
}

function CountBadge({ label, count, variant }: CountBadgeProps) {
  const styles = {
    danger: 'bg-red-500/10 text-red-400 border border-red-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    neutral: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
    muted: 'bg-slate-600/20 text-slate-400 border border-slate-600/30',
  };
  return (
    <div className={`flex flex-col items-center p-2 rounded-lg ${styles[variant]}`}>
      <span className="text-lg font-bold">{count}</span>
      <span className="text-xs mt-0.5 text-center leading-tight opacity-80">{label}</span>
    </div>
  );
}

export default function ScopeIntelligencePanel({ summary, supplierName }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Scope Coverage</h4>
        <div className="space-y-2.5">
          <CoverageBar label="Core Scope Coverage" pct={summary.coreScope.coveragePct} />
          <CoverageBar label="Secondary Scope Coverage" pct={summary.secondaryScope.coveragePct} colorClass="bg-sky-500" />
          <CoverageBar
            label="Classification Confidence"
            pct={summary.scopeConfidenceScore}
            colorClass={summary.scopeConfidenceScore >= 70 ? 'bg-emerald-500' : 'bg-amber-500'}
          />
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Item Breakdown</h4>
        <div className="grid grid-cols-4 gap-2">
          <CountBadge
            label="Excluded"
            count={summary.excludedScopeCount}
            variant={summary.excludedScopeCount >= 5 ? 'danger' : summary.excludedScopeCount >= 2 ? 'warning' : 'muted'}
          />
          <CountBadge
            label="Risk Items"
            count={summary.riskScopeCount}
            variant={summary.riskScopeCount >= 4 ? 'danger' : summary.riskScopeCount >= 2 ? 'warning' : 'muted'}
          />
          <CountBadge
            label="Optional"
            count={summary.optionalScopeCount}
            variant="neutral"
          />
          <CountBadge
            label="Unknown"
            count={summary.unknownScopeCount}
            variant={summary.unknownScopeCount >= 6 ? 'warning' : 'muted'}
          />
        </div>
      </div>

      {summary.likelyVariationExposureScore > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Variation Exposure</h4>
          <CoverageBar
            label="Exposure Score"
            pct={summary.likelyVariationExposureScore}
            colorClass={
              summary.likelyVariationExposureScore >= 60 ? 'bg-red-500' :
              summary.likelyVariationExposureScore >= 30 ? 'bg-amber-500' : 'bg-emerald-500'
            }
          />
          <p className="text-xs text-slate-500 mt-1">
            Higher score = greater post-award variation risk
          </p>
        </div>
      )}

      {summary.scopeSummaryText && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3">
          <p className="text-xs text-slate-300 leading-relaxed">{summary.scopeSummaryText}</p>
        </div>
      )}
    </div>
  );
}
