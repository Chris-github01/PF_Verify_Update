import type { LearningEventRecord, PatternClusterRecord, PatternSignature } from './learningTypes';

const KEYWORD_STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'at', 'is', 'for']);

export function extractKeywordsFromText(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  return normalized
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !KEYWORD_STOP_WORDS.has(w));
}

export function extractPatternSignature(event: {
  rawText?: string;
  signals?: string[];
  amount?: number | null;
  quantity?: number | null;
  unit?: string | null;
  rate?: number | null;
  rowIndex?: number;
  totalRows?: number;
  anomalyType?: string;
}): PatternSignature {
  const sig: PatternSignature = { keywords: [] };
  const signals = event.signals ?? [];

  if (event.rawText) {
    sig.keywords = extractKeywordsFromText(event.rawText);
  }

  const phraseSignals = signals.filter((s) => s.startsWith('phrase_match:'));
  const extraKw = phraseSignals.map((s) => s.replace('phrase_match:', '').split(' ')).flat();
  sig.keywords = Array.from(new Set([...sig.keywords, ...extraKw])).slice(0, 12);

  sig.amountOnly = signals.includes('value:amount_only_row') || signals.includes('structure:amount_only_no_qty_rate');
  sig.missingQty = signals.includes('value:missing_quantity');
  sig.missingUnit = signals.includes('value:missing_unit');
  sig.highValue = signals.includes('value:much_larger_than_typical_line_item');
  sig.lumpSumPattern = signals.includes('structure:lump_sum_pattern');
  sig.shortDescription = signals.includes('structure:short_summary_description') || signals.includes('structure:minimal_description');

  if (signals.includes('position:last_3_rows')) sig.position = 'last_row';
  else if (signals.includes('position:near_end_of_document')) sig.position = 'near_end';
  else sig.position = 'any';

  sig.signalKeys = signals;

  return sig;
}

export function derivePatternKey(sig: PatternSignature): string {
  const parts: string[] = [];
  if (sig.amountOnly) parts.push('amount_only');
  if (sig.missingQty) parts.push('no_qty');
  if (sig.missingUnit) parts.push('no_unit');
  if (sig.highValue) parts.push('high_value');
  if (sig.position === 'last_row' || sig.position === 'near_end') parts.push('end_position');
  if (sig.shortDescription) parts.push('short_desc');
  if (sig.lumpSumPattern) parts.push('lump_sum');

  const topKw = (sig.keywords ?? [])
    .filter((k) => ['total', 'gst', 'sum', 'grand', 'contract', 'invoice', 'balance', 'net', 'sub', 'carried'].includes(k))
    .slice(0, 3);
  if (topKw.length > 0) parts.push(`kw_${topKw.join('_')}`);

  return parts.length > 0 ? parts.join('__') : 'unclassified_pattern';
}

export function computeSignatureSimilarity(a: PatternSignature, b: PatternSignature): number {
  let score = 0;

  if (a.amountOnly === b.amountOnly) score += 0.25;
  if (a.missingQty === b.missingQty) score += 0.15;
  if (a.missingUnit === b.missingUnit) score += 0.10;
  if (a.position === b.position) score += 0.20;
  if (a.highValue === b.highValue) score += 0.10;
  if (a.shortDescription === b.shortDescription) score += 0.10;

  const kwA = new Set(a.keywords ?? []);
  const kwB = new Set(b.keywords ?? []);
  const intersection = [...kwA].filter((k) => kwB.has(k)).length;
  const union = new Set([...kwA, ...kwB]).size;
  const jaccard = union > 0 ? intersection / union : 0;
  score += jaccard * 0.10;

  return Math.min(1, score);
}

export function clusterLearningEvents(events: LearningEventRecord[]): Map<string, {
  patternKey: string;
  signature: PatternSignature;
  events: LearningEventRecord[];
  label: string;
}> {
  const clusters = new Map<string, {
    patternKey: string;
    signature: PatternSignature;
    events: LearningEventRecord[];
    label: string;
  }>();

  for (const event of events) {
    const key = event.pattern_key;
    if (clusters.has(key)) {
      clusters.get(key)!.events.push(event);
    } else {
      clusters.set(key, {
        patternKey: key,
        signature: event.pattern_signature_json,
        events: [event],
        label: deriveClusterLabel(key, event.pattern_signature_json),
      });
    }
  }

  return clusters;
}

function deriveClusterLabel(patternKey: string, sig: PatternSignature): string {
  const parts: string[] = [];

  if (sig.keywords?.some((k) => ['total', 'grand', 'contract'].includes(k))) {
    parts.push('Summary total row');
  } else if (sig.keywords?.some((k) => ['gst', 'tax'].includes(k))) {
    parts.push('GST/tax row');
  } else if (sig.keywords?.includes('sub')) {
    parts.push('Subtotal row');
  } else if (sig.keywords?.some((k) => ['carried', 'forward'].includes(k))) {
    parts.push('Carry forward row');
  } else if (sig.highValue) {
    parts.push('High-value anomalous row');
  } else {
    parts.push('Unclassified pattern');
  }

  if (sig.amountOnly) parts.push('(amount-only)');
  if (sig.position === 'last_row') parts.push('at end of document');

  return parts.join(' ');
}

export function buildSeverityDistribution(
  events: LearningEventRecord[]
): { critical: number; warning: number; info: number } {
  const dist = { critical: 0, warning: 0, info: 0 };
  for (const e of events) {
    const sev = (e.context_json?.severity as string) ?? 'info';
    if (sev === 'critical') dist.critical++;
    else if (sev === 'warning') dist.warning++;
    else dist.info++;
  }
  return dist;
}

export function buildClusterRecords(
  moduleKey: string,
  events: LearningEventRecord[],
  existingClusters: PatternClusterRecord[]
): PatternClusterRecord[] {
  const clustered = clusterLearningEvents(events);
  const result: PatternClusterRecord[] = [];

  for (const [patternKey, cluster] of clustered.entries()) {
    const existing = existingClusters.find((c) => c.pattern_key === patternKey);
    const sevDist = buildSeverityDistribution(cluster.events);
    const exampleRows = cluster.events
      .slice(0, 5)
      .map((e) => ({ ...e.context_json, pattern_key: e.pattern_key, created_at: e.created_at }));

    if (existing) {
      result.push({
        ...existing,
        occurrence_count: existing.occurrence_count + cluster.events.length,
        failure_count: existing.failure_count + cluster.events.filter((e) => e.learning_type === 'regression_failure').length,
        last_seen_at: cluster.events[0]?.created_at ?? existing.last_seen_at,
        severity_distribution_json: {
          critical: existing.severity_distribution_json.critical + sevDist.critical,
          warning: existing.severity_distribution_json.warning + sevDist.warning,
          info: existing.severity_distribution_json.info + sevDist.info,
        },
        example_rows_json: exampleRows,
        updated_at: new Date().toISOString(),
      });
    } else {
      result.push({
        id: '',
        module_key: moduleKey,
        pattern_key: patternKey,
        pattern_label: cluster.label,
        pattern_signature_json: cluster.signature,
        example_rows_json: exampleRows,
        occurrence_count: cluster.events.length,
        failure_count: cluster.events.filter((e) => e.learning_type === 'regression_failure').length,
        last_seen_at: cluster.events[0]?.created_at ?? new Date().toISOString(),
        severity_distribution_json: sevDist,
        linked_suggestion_ids: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  return result;
}
