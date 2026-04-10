export interface LineItem {
  description: string;
  quantity: number;
  unitRate: number;
  total: number;
  trade?: string;
}

export interface ScopeGap {
  item: string;
  severity: 'low' | 'medium' | 'high';
  reason: string;
}

export interface CostAnomaly {
  item: string;
  submittedRate: number;
  benchmarkRate: number;
  variancePct: number;
  direction: 'over' | 'under';
}

export interface WeaknessIndicator {
  category: string;
  signal: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface QuoteAnalysisResult {
  scopeGaps: ScopeGap[];
  costAnomalies: CostAnomaly[];
  weaknessIndicators: WeaknessIndicator[];
  overallRiskScore: number;
  summary: string;
}

const BENCHMARK_RATES: Record<string, number> = {
  'labour': 85,
  'concrete': 220,
  'steel': 3200,
  'formwork': 65,
  'excavation': 45,
  'plumbing': 120,
  'electrical': 110,
  'painting': 55,
  'tiling': 75,
  'carpentry': 95,
};

export function analyseQuote(lineItems: LineItem[]): QuoteAnalysisResult {
  console.log('[VERIFYTRADE NEXT] Running mock AI analysis on', lineItems.length, 'line items');

  const scopeGaps: ScopeGap[] = [];
  const costAnomalies: CostAnomaly[] = [];
  const weaknessIndicators: WeaknessIndicator[] = [];

  const hasProvisionalSums = lineItems.some(
    (li) => li.description.toLowerCase().includes('provisional') || li.description.toLowerCase().includes('p.c.')
  );
  if (hasProvisionalSums) {
    scopeGaps.push({
      item: 'Provisional Sums',
      severity: 'high',
      reason: 'Provisional sums present — final cost exposure not defined.',
    });
  }

  const hasAllowances = lineItems.some(
    (li) => li.description.toLowerCase().includes('allowance')
  );
  if (hasAllowances) {
    scopeGaps.push({
      item: 'Allowances',
      severity: 'medium',
      reason: 'Allowance items detected. Confirm scope is fully priced.',
    });
  }

  const totalValue = lineItems.reduce((sum, li) => sum + li.total, 0);
  const hasMobilisation = lineItems.some(
    (li) => li.description.toLowerCase().includes('mobilisation') || li.description.toLowerCase().includes('establishment')
  );
  if (!hasMobilisation && totalValue > 50000) {
    scopeGaps.push({
      item: 'Mobilisation / Site Establishment',
      severity: 'low',
      reason: 'No mobilisation line item found for a contract over $50k.',
    });
  }

  for (const item of lineItems) {
    const tradeKey = Object.keys(BENCHMARK_RATES).find(
      (k) => item.description.toLowerCase().includes(k) || item.trade?.toLowerCase().includes(k)
    );
    if (!tradeKey) continue;

    const benchmark = BENCHMARK_RATES[tradeKey];
    const variance = ((item.unitRate - benchmark) / benchmark) * 100;

    if (Math.abs(variance) > 25) {
      costAnomalies.push({
        item: item.description,
        submittedRate: item.unitRate,
        benchmarkRate: benchmark,
        variancePct: Math.round(variance),
        direction: variance > 0 ? 'over' : 'under',
      });
    }
  }

  const veryLowItems = lineItems.filter((li) => li.unitRate < 10 && li.total > 5000);
  if (veryLowItems.length > 0) {
    weaknessIndicators.push({
      category: 'Pricing Pattern',
      signal: `${veryLowItems.length} item(s) show very low unit rates with high totals — possible quantity errors.`,
      confidence: 'medium',
    });
  }

  const uniqueTrades = new Set(lineItems.map((li) => li.trade).filter(Boolean));
  if (uniqueTrades.size === 0) {
    weaknessIndicators.push({
      category: 'Trade Breakdown',
      signal: 'No trade breakdown provided. Risk of scope overlap or duplication.',
      confidence: 'low',
    });
  }

  if (lineItems.length < 5) {
    weaknessIndicators.push({
      category: 'Quote Granularity',
      signal: 'Very few line items. Quote may be lump-sum with insufficient detail.',
      confidence: 'high',
    });
  }

  const riskScore = Math.min(
    100,
    scopeGaps.reduce((s, g) => s + (g.severity === 'high' ? 30 : g.severity === 'medium' ? 15 : 5), 0) +
    costAnomalies.length * 10 +
    weaknessIndicators.reduce((s, w) => s + (w.confidence === 'high' ? 15 : w.confidence === 'medium' ? 8 : 3), 0)
  );

  const riskLabel = riskScore >= 60 ? 'high risk' : riskScore >= 30 ? 'moderate risk' : 'low risk';

  return {
    scopeGaps,
    costAnomalies,
    weaknessIndicators,
    overallRiskScore: riskScore,
    summary: `Quote analysis identified ${scopeGaps.length} scope gap(s), ${costAnomalies.length} cost anomaly(ies), and ${weaknessIndicators.length} weakness indicator(s). Overall assessment: ${riskLabel} (score: ${riskScore}/100).`,
  };
}
