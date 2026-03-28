import type { CdeRankedSupplier, CdeBehaviourAnalysis, CdeVariationExposure } from './types';

function fmt(n: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}

export function buildJustification(
  ranked: CdeRankedSupplier[],
  behaviours: CdeBehaviourAnalysis[],
  exposures: CdeVariationExposure[]
): string {
  if (ranked.length === 0) return 'No suppliers available for comparison.';

  const top = ranked[0];
  const runnerUp = ranked[1];
  const behaviourMap = new Map(behaviours.map((b) => [b.supplierName, b]));
  const exposureMap = new Map(exposures.map((e) => [e.supplierName, e]));

  const topBehaviour = behaviourMap.get(top.supplierName);
  const topExposure = exposureMap.get(top.supplierName);

  const lines: string[] = [];

  lines.push(
    `${top.supplierName} is recommended as the preferred tenderer with a composite score of ` +
      `${(top.compositeScore * 100).toFixed(1)}/100.`
  );

  lines.push(
    `Their quoted total of ${fmt(top.quotedTotal)} projects to ${fmt(top.projectedTotal)} ` +
      `after applying historical variation rate adjustments and risk premiums.`
  );

  if (topExposure && topExposure.exposurePct > 0) {
    lines.push(
      `Variation exposure is estimated at ${fmtPct(topExposure.exposurePct)} of contract value ` +
        `(${fmt(topExposure.exposureAmount)}), which is ${topExposure.exposurePct < 8 ? 'within acceptable bounds' : 'elevated and should be managed contractually'}.`
    );
  }

  if (topBehaviour) {
    const flagText =
      topBehaviour.flags.length > 0
        ? `Key flags: ${topBehaviour.flags.join('; ')}.`
        : 'No significant risk flags were identified.';
    lines.push(
      `Behaviour classification: ${topBehaviour.behaviourClass} (Risk tier: ${topBehaviour.riskTier}). ${flagText}`
    );
  }

  if (runnerUp) {
    const gap = top.projectedTotal > 0
      ? (((runnerUp.projectedTotal - top.projectedTotal) / top.projectedTotal) * 100).toFixed(1)
      : '0.0';
    lines.push(
      `Runner-up: ${runnerUp.supplierName} at ${fmt(runnerUp.projectedTotal)} projected total ` +
        `(+${gap}% vs recommended), composite score ${(runnerUp.compositeScore * 100).toFixed(1)}/100.`
    );
  }

  return lines.join(' ');
}
