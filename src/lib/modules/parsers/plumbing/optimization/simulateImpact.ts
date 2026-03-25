import type { OptimizationBundle, ImpactSimulation, RuleChange } from './optimizationTypes';

function estimateAccuracyDelta(changes: RuleChange[]): number {
  let delta = 0;
  for (const c of changes) {
    if (c.changeType === 'pattern_add') delta += 1.2;
    else if (c.changeType === 'modify') delta += 0.8;
    else if (c.changeType === 'threshold_adjust') delta += 0.5;
    else if (c.changeType === 'add') delta += 1.0;
    else if (c.changeType === 'remove') delta -= 0.3;
  }
  return Math.round(Math.min(delta, 8) * 10) / 10;
}

function estimateAnomalyRateDelta(changes: RuleChange[]): number {
  let delta = 0;
  for (const c of changes) {
    if (c.changeType === 'pattern_add') delta -= 0.5;
    else if (c.changeType === 'threshold_adjust') {
      const v = String(c.proposedValue ?? '');
      delta += v.includes('raise') ? -0.4 : 0.3;
    } else if (c.changeType === 'modify') delta -= 0.3;
  }
  return Math.round(Math.max(delta, -5) * 10) / 10;
}

function estimateFinancialImpact(changes: RuleChange[], anomalyDelta: number): number {
  const basePerAnomalyReduction = 2500;
  return Math.round(Math.abs(Math.min(anomalyDelta, 0)) * basePerAnomalyReduction * changes.length);
}

function estimatePredictiveDelta(changes: RuleChange[]): number {
  const thresholdAdjustments = changes.filter((c) => c.changeType === 'threshold_adjust').length;
  const patternAdds = changes.filter((c) => c.changeType === 'pattern_add').length;
  return Math.round((thresholdAdjustments * 1.5 + patternAdds * 0.8) * 10) / 10;
}

function estimateRegressionRisk(changes: RuleChange[]): number {
  let risk = 0;
  for (const c of changes) {
    if (c.changeType === 'remove') risk += 15;
    else if (c.changeType === 'modify') risk += 5;
    else if (c.changeType === 'pattern_add') risk += 2;
    else if (c.changeType === 'threshold_adjust') risk += 3;
    else if (c.changeType === 'add') risk += 2;
  }
  return Math.min(risk, 50);
}

export function simulateImpact(bundle: OptimizationBundle): ImpactSimulation {
  const changes = bundle.combined_rule_changes_json.changes;

  const accuracyDelta = estimateAccuracyDelta(changes);
  const anomalyRateDelta = estimateAnomalyRateDelta(changes);
  const estimatedAdditionalFinancialImpact = estimateFinancialImpact(changes, anomalyRateDelta);
  const predictivePrecisionDelta = estimatePredictiveDelta(changes);
  const regressionRisk = estimateRegressionRisk(changes);

  const explanationParts: string[] = [];
  if (accuracyDelta > 0) explanationParts.push(`+${accuracyDelta}% accuracy gain from ${changes.length} rule changes`);
  if (anomalyRateDelta < 0) explanationParts.push(`${anomalyRateDelta}% anomaly rate reduction`);
  if (estimatedAdditionalFinancialImpact > 0) explanationParts.push(`~$${estimatedAdditionalFinancialImpact.toLocaleString()} additional risk prevented`);
  if (regressionRisk > 20) explanationParts.push(`Regression risk: ${regressionRisk}% — test carefully`);

  return {
    accuracyDelta,
    anomalyRateDelta,
    estimatedAdditionalFinancialImpact,
    predictivePrecisionDelta,
    regressionRisk,
    explanation: explanationParts.join('. ') || 'Minimal projected impact from this bundle.',
  };
}
