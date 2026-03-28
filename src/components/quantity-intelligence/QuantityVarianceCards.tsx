import { AlertTriangle, CheckCircle2, TrendingDown, BarChart2, ShieldAlert, Info, Shield } from 'lucide-react';
import type { QuantityIntelligenceResult } from '../../lib/quantity-intelligence/quantityScoring';
import { computeAllConfidence, PROTECTION_STATEMENT, type SupplierConfidence } from '../../lib/quantity-intelligence/quantityConfidence';

interface Props {
  result: QuantityIntelligenceResult;
}

function StatCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className={`w-8 h-8 rounded-lg ${accent} flex items-center justify-center mb-3`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function AlertCard({
  title, description, severity,
}: {
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
}) {
  const styles = {
    critical: { border: 'border-red-500/30', bg: 'bg-red-500/5', icon: ShieldAlert, iconColor: 'text-red-400', titleColor: 'text-red-300' },
    warning: { border: 'border-amber-500/30', bg: 'bg-amber-500/5', icon: AlertTriangle, iconColor: 'text-amber-400', titleColor: 'text-amber-300' },
    info: { border: 'border-blue-500/30', bg: 'bg-blue-500/5', icon: BarChart2, iconColor: 'text-blue-400', titleColor: 'text-blue-300' },
    success: { border: 'border-teal-500/30', bg: 'bg-teal-500/5', icon: CheckCircle2, iconColor: 'text-teal-400', titleColor: 'text-teal-300' },
  };
  const s = styles[severity];
  const SeverityIcon = s.icon;
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${s.border} ${s.bg}`}>
      <SeverityIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${s.iconColor}`} />
      <div>
        <div className={`text-xs font-semibold ${s.titleColor}`}>{title}</div>
        <div className="text-xs text-gray-400 mt-0.5">{description}</div>
      </div>
    </div>
  );
}

const CONFIDENCE_STYLES = {
  HIGH: { badge: 'bg-teal-500/15 border border-teal-500/30 text-teal-400', dot: 'bg-teal-400' },
  MEDIUM: { badge: 'bg-amber-500/15 border border-amber-500/30 text-amber-400', dot: 'bg-amber-400' },
  LOW: { badge: 'bg-gray-700/60 border border-gray-600/40 text-gray-400', dot: 'bg-gray-500' },
};

function ConfidencePill({ level }: { level: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const s = CONFIDENCE_STYLES[level];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {level} CONFIDENCE
    </span>
  );
}

function buildConfidenceAwareAlerts(
  suppliers: QuantityIntelligenceResult['suppliers'],
  confidenceMap: Map<string, SupplierConfidence>,
  linesWithMajorVariance: number,
  linesWithReviewFlag: number,
) {
  const alerts: Array<{ title: string; description: string; severity: 'critical' | 'warning' | 'info' | 'success' }> = [];

  for (const s of suppliers) {
    if (!s.underallowanceFlag) continue;
    const conf = confidenceMap.get(s.quoteId);
    const level = conf?.level ?? 'MEDIUM';
    const interpretation = conf?.commercialInterpretation;
    const gapFormatted = formatCurrency(Math.abs(s.quantityGapValue));

    if (level === 'HIGH') {
      alerts.push({
        title: `${s.supplierName} — Under-allowance risk`,
        description: interpretation
          ? `${interpretation.explanation} Normalised total is ${gapFormatted} higher than quoted. ${interpretation.actionNote}`
          : `Appears ${s.underallowedLinesCount} line${s.underallowedLinesCount !== 1 ? 's' : ''} below reference quantity. Normalised total is ${gapFormatted} higher than quoted.`,
        severity: 'critical',
      });
    } else if (level === 'MEDIUM') {
      alerts.push({
        title: `${s.supplierName} — Probable under-allowance position`,
        description: interpretation
          ? `${interpretation.explanation} Estimated gap: ${gapFormatted}. ${interpretation.actionNote}`
          : `${s.underallowedLinesCount} line${s.underallowedLinesCount !== 1 ? 's' : ''} appear below reference but confidence is moderate — may reflect documentation gaps. Gap estimate: ${gapFormatted}.`,
        severity: 'warning',
      });
    } else {
      alerts.push({
        title: `${s.supplierName} — Quantity variance detected — low confidence`,
        description: `Low confidence in reference quantities. Differences may reflect drawing incompleteness rather than under-pricing. Estimated gap: ${gapFormatted}. ${interpretation?.actionNote ?? 'Manual review recommended.'}`,
        severity: 'info',
      });
    }
  }

  const lowestByNorm = [...suppliers].sort((a, b) => a.normalizedTotal - b.normalizedTotal)[0];
  const lowestByRaw = [...suppliers].sort((a, b) => a.rawTotal - b.rawTotal)[0];
  const rankFlipped = lowestByRaw && lowestByNorm && lowestByRaw.quoteId !== lowestByNorm.quoteId;

  if (rankFlipped && lowestByNorm) {
    alerts.push({
      title: 'Quantity normalisation changes cost ranking',
      description: `Lowest raw total: ${lowestByRaw?.supplierName}. Lowest on equal quantities: ${lowestByNorm.supplierName}. Quantity under-allowance may be distorting the raw comparison. Review line-level quantities before drawing conclusions.`,
      severity: 'warning',
    });
  }

  if (linesWithMajorVariance > 0) {
    alerts.push({
      title: `${linesWithMajorVariance} line item${linesWithMajorVariance !== 1 ? 's' : ''} with major quantity spread (>30%)`,
      description: 'These lines show a large quantity variance across suppliers. Reference quantity may not fully resolve the discrepancy — manual review recommended.',
      severity: 'warning',
    });
  }

  if (linesWithReviewFlag > 0 && linesWithMajorVariance === 0) {
    alerts.push({
      title: `${linesWithReviewFlag} line item${linesWithReviewFlag !== 1 ? 's' : ''} flagged for quantity review`,
      description: 'Quantity spread between 15–30%. These lines warrant attention but are not yet at major variance threshold.',
      severity: 'info',
    });
  }

  const highestCompleteness = [...suppliers].sort((a, b) => b.completenessScore - a.completenessScore)[0];
  const underallowedIds = new Set(suppliers.filter(s => s.underallowanceFlag).map(s => s.quoteId));
  if (highestCompleteness && !underallowedIds.has(highestCompleteness.quoteId)) {
    alerts.push({
      title: `${highestCompleteness.supplierName} has the highest quantity completeness score`,
      description: `Completeness: ${highestCompleteness.completenessScore.toFixed(0)}/100. This supplier's quantities most closely match the reference across all matched lines. Note: completeness is a quantity measure only — not a tender recommendation.`,
      severity: 'success',
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      title: 'No significant quantity under-allowance detected',
      description: 'All matched lines show comparable quantities across suppliers. Raw totals are a reliable basis for comparison.',
      severity: 'success',
    });
  }

  return alerts;
}

export default function QuantityVarianceCards({ result }: Props) {
  const { suppliers, totalMatchedLines, linesWithMajorVariance, linesWithReviewFlag } = result;

  const confidenceMap = computeAllConfidence(suppliers, result.matchedGroups, result.referenceResults);

  const underallowedSuppliers = suppliers.filter((s) => s.underallowanceFlag);

  const overallConfidenceLevels = suppliers.map(s => confidenceMap.get(s.quoteId)?.level ?? 'MEDIUM');
  const overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW' =
    overallConfidenceLevels.every(l => l === 'HIGH') ? 'HIGH'
      : overallConfidenceLevels.some(l => l === 'LOW') ? 'LOW'
        : 'MEDIUM';

  const alerts = buildConfidenceAwareAlerts(suppliers, confidenceMap, linesWithMajorVariance, linesWithReviewFlag);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Matched Line Groups"
          value={totalMatchedLines}
          sub="comparable across suppliers"
          icon={BarChart2}
          accent="bg-blue-500/15 text-blue-400"
        />
        <StatCard
          label="Major Variance Lines"
          value={linesWithMajorVariance}
          sub=">30% quantity spread"
          icon={TrendingDown}
          accent={linesWithMajorVariance > 0 ? 'bg-red-500/15 text-red-400' : 'bg-gray-800 text-gray-500'}
        />
        <StatCard
          label="Review Flag Lines"
          value={linesWithReviewFlag}
          sub="15–30% spread"
          icon={AlertTriangle}
          accent={linesWithReviewFlag > 0 ? 'bg-amber-500/15 text-amber-400' : 'bg-gray-800 text-gray-500'}
        />
        <StatCard
          label="Quantity Risk"
          value={underallowedSuppliers.length > 0 ? `${underallowedSuppliers.length} supplier${underallowedSuppliers.length !== 1 ? 's' : ''}` : 'None'}
          sub="flagged for quantity gap"
          icon={ShieldAlert}
          accent={underallowedSuppliers.length > 0 ? 'bg-red-500/15 text-red-400' : 'bg-teal-500/15 text-teal-400'}
        />
      </div>

      <div className="flex items-center justify-between px-3 py-2.5 bg-gray-900/60 border border-gray-800 rounded-lg">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Shield className="w-3.5 h-3.5 text-gray-500" />
          Reference confidence
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <ConfidencePill level={overallConfidence} />
          {suppliers.map(s => {
            const conf = confidenceMap.get(s.quoteId);
            if (!conf) return null;
            return (
              <span key={s.quoteId} className="text-xs text-gray-500 hidden sm:inline">
                {s.supplierName.split(' ')[0]}:{' '}
                <span className={conf.level === 'HIGH' ? 'text-teal-400' : conf.level === 'MEDIUM' ? 'text-amber-400' : 'text-gray-400'}>
                  {conf.level}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <AlertCard key={i} {...a} />
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-900/40 border border-gray-800/60">
        <Info className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500 italic">{PROTECTION_STATEMENT}</p>
      </div>
    </div>
  );
}

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000).toLocaleString()}k`;
  return `$${v.toLocaleString()}`;
}
