import type { CdeRankedSupplier, CdeBehaviourAnalysis, CdeVariationExposure, GatingResult } from './types';

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
  exposures: CdeVariationExposure[],
  gating: GatingResult
): string {
  if (ranked.length === 0) return 'No suppliers available for comparison.';

  const top = ranked[0];
  const runnerUp = ranked[1];
  const behaviourMap = new Map(behaviours.map((b) => [b.supplierName, b]));
  const exposureMap = new Map(exposures.map((e) => [e.supplierName, e]));

  const topBehaviour = behaviourMap.get(top.supplierName);
  const topExposure = exposureMap.get(top.supplierName);

  const lines: string[] = [];

  const isProvisional = !gating.passed;
  const isNarrow = gating.isNarrowMargin;

  if (isProvisional) {
    lines.push(
      `${top.supplierName} is the composite leader with a score of ${(top.compositeScore * 100).toFixed(1)}/100, ` +
        `however this is a provisional result — scope validation is required before a final recommendation can be issued.`
    );
  } else if (isNarrow) {
    lines.push(
      `${top.supplierName} leads by a narrow composite margin (score: ${(top.compositeScore * 100).toFixed(1)}/100). ` +
        `The margin over the runner-up is within the 3-point threshold. A final recommendation requires additional scope validation.`
    );
  } else {
    lines.push(
      `${top.supplierName} is the preferred tenderer with a composite score of ${(top.compositeScore * 100).toFixed(1)}/100. ` +
        `All gating conditions have been satisfied.`
    );
  }

  lines.push(
    `Quoted total: ${fmt(top.quotedTotal)}, projecting to ${fmt(top.projectedTotal)} after variation rate adjustments and risk premiums.`
  );

  if (topExposure && topExposure.exposurePct > 0) {
    const exposureRisk =
      topExposure.exposurePct < 5
        ? 'within acceptable bounds'
        : topExposure.exposurePct < 12
        ? 'moderate — recommend contractual controls'
        : 'elevated — contractual mitigation required';
    lines.push(
      `Variation exposure: ${fmtPct(topExposure.exposurePct)} of contract value (${fmt(topExposure.exposureAmount)}) — ${exposureRisk}.`
    );
  }

  if (topBehaviour) {
    const flagText =
      topBehaviour.flags.length > 0
        ? `Unresolved flags: ${topBehaviour.flags.join('; ')}.`
        : 'No significant risk flags identified.';
    lines.push(
      `Supplier behaviour: ${topBehaviour.behaviourClass}, risk tier: ${topBehaviour.riskTier}. ${flagText}`
    );
  }

  if (gating.failedGates.length > 0) {
    lines.push(
      `Unresolved conditions preventing final recommendation: ${gating.failedGates.join('; ')}.`
    );
  }

  if (runnerUp) {
    const gap =
      top.projectedTotal > 0
        ? (((runnerUp.projectedTotal - top.projectedTotal) / top.projectedTotal) * 100).toFixed(1)
        : '0.0';
    lines.push(
      `Runner-up: ${runnerUp.supplierName} — projected ${fmt(runnerUp.projectedTotal)} (+${gap}%), composite score ${(runnerUp.compositeScore * 100).toFixed(1)}/100.`
    );
  }

  return lines.join(' ');
}
