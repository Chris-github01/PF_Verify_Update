import type { ImpactEvent, AggregatedMetrics, MetricPeriod, ImpactType } from './analyticsTypes';

function getPeriodBounds(period: MetricPeriod): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  switch (period) {
    case 'daily':      start.setDate(start.getDate() - 1); break;
    case 'weekly':     start.setDate(start.getDate() - 7); break;
    case 'monthly':    start.setMonth(start.getMonth() - 1); break;
    case 'rolling_30': start.setDate(start.getDate() - 30); break;
  }
  return { start, end };
}

export function aggregateImpactEvents(
  events: ImpactEvent[],
  period: MetricPeriod,
  totalQuotesProcessed: number
): AggregatedMetrics {
  const { start, end } = getPeriodBounds(period);

  const inPeriod = events.filter((e) => {
    const d = new Date(e.created_at);
    return d >= start && d <= end;
  });

  const totalFinancialRiskPrevented = inPeriod.reduce(
    (sum, e) => sum + (e.estimated_financial_value ?? 0),
    0
  );

  const byType = {} as Record<ImpactType, { count: number; totalValue: number }>;
  for (const e of inPeriod) {
    const existing = byType[e.impact_type] ?? { count: 0, totalValue: 0 };
    existing.count++;
    existing.totalValue += e.estimated_financial_value ?? 0;
    byType[e.impact_type] = existing;
  }

  const quotesBase = totalQuotesProcessed || 1;

  return {
    period,
    periodStart: start,
    periodEnd: end,
    totalFinancialRiskPrevented,
    averageRiskPerQuote: totalFinancialRiskPrevented / quotesBase,
    anomalyRate: ((byType['duplicate_total_prevented']?.count ?? 0) + (byType['incorrect_total_detected']?.count ?? 0)) / quotesBase * 100,
    duplicateTotalRate: (byType['duplicate_total_prevented']?.count ?? 0) / quotesBase * 100,
    classificationErrorRate: (byType['classification_error_prevented']?.count ?? 0) / quotesBase * 100,
    reviewCorrectionRate: (byType['manual_review_correction']?.count ?? 0) / quotesBase * 100,
    highRiskDetectionRate: (byType['high_risk_flagged_pre_parse']?.count ?? 0) / quotesBase * 100,
    totalImpactEvents: inPeriod.length,
    totalQuotesProcessed,
    impactByType: byType,
  };
}

export function computeOrgRiskFromEvents(events: ImpactEvent[]): Map<string, {
  totalRisk: number;
  eventCount: number;
  types: Set<ImpactType>;
  lastEvent: string;
}> {
  const map = new Map<string, { totalRisk: number; eventCount: number; types: Set<ImpactType>; lastEvent: string }>();
  for (const e of events) {
    const key = e.org_id ?? '__unknown__';
    const existing = map.get(key) ?? { totalRisk: 0, eventCount: 0, types: new Set<ImpactType>(), lastEvent: e.created_at };
    existing.totalRisk += e.estimated_financial_value ?? 0;
    existing.eventCount++;
    existing.types.add(e.impact_type);
    if (new Date(e.created_at) > new Date(existing.lastEvent)) existing.lastEvent = e.created_at;
    map.set(key, existing);
  }
  return map;
}

export function derivePeriodLabel(period: MetricPeriod): string {
  return {
    daily:      'Last 24 hours',
    weekly:     'Last 7 days',
    monthly:    'Last 30 days',
    rolling_30: 'Rolling 30 days',
  }[period];
}

export function buildTrendData(events: ImpactEvent[], days: number): Array<{ date: string; value: number; count: number }> {
  const buckets: Map<string, { value: number; count: number }> = new Map();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { value: 0, count: 0 });
  }
  for (const e of events) {
    const key = e.created_at.slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.value += e.estimated_financial_value ?? 0;
      bucket.count++;
    }
  }
  return Array.from(buckets.entries()).map(([date, { value, count }]) => ({ date, value, count }));
}
