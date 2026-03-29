import type {
  FinalOutcome,
  SupplierScoreBreakdown,
  SupplierInputData,
  AdjudicationNarratives,
} from './autoAdjudicationTypes';

interface NarrativeInput {
  finalOutcome: FinalOutcome;
  recommendedSupplier: SupplierScoreBreakdown | null;
  cheapestSupplier: SupplierInputData;
  rankings: SupplierScoreBreakdown[];
  confidence: number;
  recommendationReasons: string[];
  warningReasons: string[];
  blockReasons: string[];
  manualReviewReasons: string[];
  trade: string;
}

function fmt(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function buildAdjudicationNarratives(input: NarrativeInput): AdjudicationNarratives {
  const {
    finalOutcome,
    recommendedSupplier,
    cheapestSupplier,
    rankings,
    confidence,
    recommendationReasons,
    warningReasons,
    blockReasons,
    manualReviewReasons,
    trade,
  } = input;

  const tradeName = trade.replace(/_/g, ' ');
  const supplierCount = rankings.length;
  const eligibleCount = rankings.filter(r => r.recommendation_eligible).length;

  const executive_summary = buildExecutiveSummary(
    finalOutcome, recommendedSupplier, supplierCount, eligibleCount, confidence, tradeName
  );

  const commercial_recommendation_summary = buildCommercialRecommendationSummary(
    finalOutcome, recommendedSupplier, confidence, recommendationReasons, warningReasons
  );

  const supplier_comparison_summary = buildSupplierComparisonSummary(rankings, cheapestSupplier);

  const why_not_cheapest_summary = buildWhyNotCheapestSummary(
    recommendedSupplier, cheapestSupplier, rankings
  );

  const why_recommended_summary = buildWhyRecommendedSummary(
    recommendedSupplier, recommendationReasons, finalOutcome
  );

  const manual_review_summary = buildManualReviewSummary(
    finalOutcome, manualReviewReasons, blockReasons
  );

  return {
    executive_summary,
    commercial_recommendation_summary,
    supplier_comparison_summary,
    why_not_cheapest_summary,
    why_recommended_summary,
    manual_review_summary,
  };
}

function buildExecutiveSummary(
  outcome: FinalOutcome,
  recommended: SupplierScoreBreakdown | null,
  supplierCount: number,
  eligibleCount: number,
  confidence: number,
  tradeName: string
): string {
  const base = `Auto-adjudication evaluated ${supplierCount} supplier${supplierCount !== 1 ? 's' : ''} for ${tradeName}, with ${eligibleCount} meeting eligibility criteria.`;

  if (outcome === 'auto_recommend') {
    return `${base} ${recommended!.supplier_name} has been automatically recommended as best tenderer with ${pct(confidence)} system confidence, having achieved the strongest overall commercial position across price, scope, and risk.`;
  }
  if (outcome === 'recommend_with_warnings') {
    return `${base} ${recommended!.supplier_name} leads on commercial criteria with ${pct(confidence)} confidence. Active warnings require QS review before award can be confirmed.`;
  }
  if (outcome === 'manual_review_required') {
    return `${base} The auto-adjudication system has intentionally withheld a recommendation — commercial data does not meet the threshold for a defensible automatic determination. Human judgment is required.`;
  }
  return `${base} A critical validation block prevents any automatic recommendation for this tender. Manual review and QS oversight are required before proceeding.`;
}

function buildCommercialRecommendationSummary(
  outcome: FinalOutcome,
  recommended: SupplierScoreBreakdown | null,
  confidence: number,
  reasons: string[],
  warnings: string[]
): string {
  if (!recommended || outcome === 'blocked_no_safe_recommendation' || outcome === 'manual_review_required') {
    return 'No commercial recommendation has been issued by the auto-adjudication system.';
  }

  const lines: string[] = [
    `${recommended.supplier_name} is the ${outcome === 'auto_recommend' ? 'recommended' : 'conditionally recommended'} best tenderer.`,
    `Overall commercial score: ${(recommended.overall_score * 100).toFixed(1)} points (confidence: ${pct(confidence)}).`,
  ];

  if (reasons.length > 0) {
    lines.push(`Key strengths: ${reasons.slice(0, 3).join(' ')}`.trimEnd());
  }
  if (warnings.length > 0) {
    lines.push(`Active warnings: ${warnings[0]}`);
  }

  return lines.join(' ');
}

function buildSupplierComparisonSummary(
  rankings: SupplierScoreBreakdown[],
  cheapest: SupplierInputData
): string {
  if (rankings.length === 0) return 'No supplier comparison data available.';

  const lines: string[] = [`${rankings.length} supplier${rankings.length !== 1 ? 's' : ''} evaluated.`];
  const top3 = rankings.slice(0, 3);

  top3.forEach((s, i) => {
    const eligibleLabel = s.recommendation_eligible ? '' : ' [not eligible]';
    lines.push(
      `#${i + 1} ${s.supplier_name}${eligibleLabel}: overall ${(s.overall_score * 100).toFixed(1)}, submitted ${fmt(s.submitted_total)}, gate ${s.gate_status}.`
    );
  });

  lines.push(`Lowest submitted price: ${cheapest.supplier_name} at ${fmt(cheapest.submitted_total)}.`);

  return lines.join(' ');
}

function buildWhyNotCheapestSummary(
  recommended: SupplierScoreBreakdown | null,
  cheapest: SupplierInputData,
  rankings: SupplierScoreBreakdown[]
): string | null {
  if (!recommended) return null;
  if (recommended.supplier_id === cheapest.supplier_id) return null;

  const cheapestRank = rankings.find(r => r.supplier_id === cheapest.supplier_id);
  if (!cheapestRank) return null;

  const scoreDiff = ((recommended.overall_score - cheapestRank.overall_score) * 100).toFixed(1);
  const lines: string[] = [
    `${cheapest.supplier_name} submitted the lowest price (${fmt(cheapest.submitted_total)}) but was not selected.`,
    `${recommended.supplier_name} scored ${scoreDiff} points higher on the weighted commercial criteria.`,
  ];

  if (cheapestRank.scope_strength_score < recommended.scope_strength_score - 0.10) {
    lines.push(`${cheapest.supplier_name}'s scope coverage score (${(cheapestRank.scope_strength_score * 100).toFixed(0)}) is materially weaker than ${recommended.supplier_name}'s (${(recommended.scope_strength_score * 100).toFixed(0)}).`);
  }
  if (cheapestRank.behaviour_trust_score < recommended.behaviour_trust_score - 0.10) {
    lines.push(`${cheapest.supplier_name}'s behaviour trust score reflects a less favourable commercial track record.`);
  }
  if (cheapestRank.gate_status === 'fail') {
    lines.push(`${cheapest.supplier_name} failed the commercial decision gate and is not eligible for recommendation.`);
  } else if (cheapestRank.gate_status === 'warn') {
    lines.push(`${cheapest.supplier_name} carries unresolved gate warnings.`);
  }

  return lines.join(' ');
}

function buildWhyRecommendedSummary(
  recommended: SupplierScoreBreakdown | null,
  reasons: string[],
  outcome: FinalOutcome
): string {
  if (!recommended || outcome === 'blocked_no_safe_recommendation' || outcome === 'manual_review_required') {
    return 'No supplier was recommended by the auto-adjudication system.';
  }

  if (reasons.length === 0) {
    return `${recommended.supplier_name} achieved the highest weighted commercial score among eligible suppliers.`;
  }

  return `${recommended.supplier_name} was ${outcome === 'auto_recommend' ? 'automatically' : 'conditionally'} recommended on the basis of: ${reasons.join(' ')}`;
}

function buildManualReviewSummary(
  outcome: FinalOutcome,
  manualReasons: string[],
  blockReasons: string[]
): string | null {
  if (outcome !== 'manual_review_required' && outcome !== 'blocked_no_safe_recommendation') {
    return null;
  }

  const lines: string[] = [];

  if (outcome === 'blocked_no_safe_recommendation') {
    lines.push('Auto-adjudication is blocked. No automatic recommendation can be issued.');
    blockReasons.forEach(r => lines.push(`— ${r}`));
  } else {
    lines.push('Manual review is required. The system has intentionally declined to issue an automatic recommendation.');
    manualReasons.forEach(r => lines.push(`— ${r}`));
  }

  lines.push('QS review, additional supplier clarification, or override approval is required before proceeding.');

  return lines.join(' ');
}
