import { AlertTriangle, XCircle, Zap } from 'lucide-react';

interface PlumbingBetaWarningsBannerProps {
  killSwitchActive: boolean;
  regressionStale: boolean;
  hasApproval: boolean;
  unresolvedCriticalCount: number;
  healthStatus: 'healthy' | 'watch' | 'at_risk' | 'critical';
  anomalyRateRising: boolean;
}

export default function PlumbingBetaWarningsBanner({
  killSwitchActive,
  regressionStale,
  hasApproval,
  unresolvedCriticalCount,
  healthStatus,
  anomalyRateRising,
}: PlumbingBetaWarningsBannerProps) {
  const warnings: { msg: string; level: 'critical' | 'high' | 'medium' }[] = [];

  if (killSwitchActive) warnings.push({ msg: 'Kill switch is active — shadow parser is bypassed entirely', level: 'critical' });
  if (healthStatus === 'critical') warnings.push({ msg: 'Health score is CRITICAL — immediate review required', level: 'critical' });
  if (unresolvedCriticalCount > 0) warnings.push({ msg: `${unresolvedCriticalCount} unresolved critical anomaly(s) require admin attention`, level: 'critical' });
  if (healthStatus === 'at_risk') warnings.push({ msg: 'Beta health is at-risk — consider pausing expansion', level: 'high' });
  if (regressionStale) warnings.push({ msg: 'Regression suite has not been run in 7+ days — refresh before expanding rollout', level: 'medium' });
  if (!hasApproval) warnings.push({ msg: 'No approval record exists for this active rollout', level: 'high' });
  if (anomalyRateRising) warnings.push({ msg: 'Anomaly rate is trending upward over the last period', level: 'high' });

  if (warnings.length === 0) return null;

  const colors: Record<string, string> = {
    critical: 'bg-red-500/10 border-red-500/30 text-red-200',
    high: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
    medium: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200',
  };

  const icons: Record<string, React.ReactNode> = {
    critical: <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />,
    high: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />,
    medium: <Zap className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />,
  };

  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <div key={i} className={`flex items-start gap-3 border text-xs px-4 py-3 rounded-xl ${colors[w.level]}`}>
          {icons[w.level]}
          {w.msg}
        </div>
      ))}
    </div>
  );
}
