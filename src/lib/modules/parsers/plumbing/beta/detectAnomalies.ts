import type { DetectedAnomaly, AnomalySeverity } from './anomalyTypes';
import { getConfig, ANOMALY_SEVERITY_SCORES } from './anomalyConfig';

export interface AnomalyInputContext {
  parsedTotal?: number;
  documentTotal?: number;
  liveTotal?: number;
  shadowTotal?: number;
  totalRowsRaw?: number;
  totalRowsExcluded?: number;
  totalRowsInserted?: number;
  avgConfidence?: number;
  liveItemCount?: number;
  shadowItemCount?: number;
  runFailed?: boolean;
  riskFlags?: string[];
  orgRecentFailureCount?: number;
  knownRiskyPattern?: boolean;
  liveShadowDiff?: {
    totalDelta?: number;
    totalDeltaPercent?: number;
    itemCountDelta?: number;
  };
}

function severity(score: number): AnomalySeverity {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

export function detectAnomalies(ctx: AnomalyInputContext): DetectedAnomaly[] {
  const cfg = getConfig();
  const anomalies: DetectedAnomaly[] = [];

  if (ctx.runFailed) {
    anomalies.push({
      anomaly_type: 'parser_execution_failure',
      severity: 'critical',
      anomaly_score: ANOMALY_SEVERITY_SCORES['parser_execution_failure'],
      title: 'Parser execution failed',
      description: 'The plumbing parser threw an error or returned no result for this run.',
      evidence_json: { runFailed: true },
    });
    return anomalies;
  }

  if (ctx.shadowTotal === 0 && (ctx.documentTotal ?? 0) > 0) {
    anomalies.push({
      anomaly_type: 'shadow_total_zero',
      severity: 'high',
      anomaly_score: ANOMALY_SEVERITY_SCORES['shadow_total_zero'],
      title: 'Shadow parser returned zero total',
      description: 'Shadow parser total was $0 despite a non-zero document total.',
      evidence_json: { shadowTotal: ctx.shadowTotal, documentTotal: ctx.documentTotal },
    });
  }

  const parsedTotal = ctx.parsedTotal ?? ctx.shadowTotal ?? 0;
  const docTotal = ctx.documentTotal;
  if (docTotal && docTotal > 0 && parsedTotal > docTotal * 1.02) {
    const overBy = parsedTotal - docTotal;
    const score = ANOMALY_SEVERITY_SCORES['parsed_total_exceeds_document_total'];
    anomalies.push({
      anomaly_type: 'parsed_total_exceeds_document_total',
      severity: severity(score),
      anomaly_score: score,
      title: `Parsed total exceeds document total by $${overBy.toFixed(2)}`,
      description: `Parser produced a total of $${parsedTotal.toFixed(2)} which exceeds the detected document total of $${docTotal.toFixed(2)}. Possible duplicate line items.`,
      evidence_json: { parsedTotal, documentTotal: docTotal, overBy },
    });
  }

  if (docTotal && docTotal > 0 && parsedTotal > docTotal * 1.05) {
    anomalies.push({
      anomaly_type: 'likely_duplicate_total_included',
      severity: 'high',
      anomaly_score: ANOMALY_SEVERITY_SCORES['likely_duplicate_total_included'],
      title: 'Likely duplicate total row included in parsed output',
      description: 'Parsed total is more than 5% above document total — a summary total row may have been included as a line item.',
      evidence_json: { parsedTotal, documentTotal: docTotal },
    });
  }

  if (!docTotal || docTotal === 0) {
    anomalies.push({
      anomaly_type: 'no_document_total_detected',
      severity: 'low',
      anomaly_score: ANOMALY_SEVERITY_SCORES['no_document_total_detected'],
      title: 'No document total detected',
      description: 'The parser could not detect a reference document total. Validation accuracy may be reduced.',
      evidence_json: { documentTotal: ctx.documentTotal },
    });
  }

  if (ctx.liveShadowDiff) {
    const { totalDelta = 0, totalDeltaPercent = 0, itemCountDelta = 0 } = ctx.liveShadowDiff;
    const absDelta = Math.abs(totalDelta);
    const absPct = Math.abs(totalDeltaPercent);

    if (absDelta >= cfg.criticalTotalDeltaAbsolute || absPct >= cfg.criticalTotalDeltaPercent) {
      anomalies.push({
        anomaly_type: 'critical_total_delta',
        severity: 'critical',
        anomaly_score: ANOMALY_SEVERITY_SCORES['critical_total_delta'],
        title: `Critical total delta: $${absDelta.toFixed(2)} (${absPct.toFixed(1)}%)`,
        description: 'Live vs shadow total divergence exceeds critical threshold. Do not expand rollout.',
        evidence_json: { totalDelta, totalDeltaPercent, threshold: cfg.criticalTotalDeltaAbsolute },
      });
    } else if (absDelta >= cfg.largeTotalDeltaAbsolute || absPct >= cfg.largeTotalDeltaPercent) {
      anomalies.push({
        anomaly_type: 'large_live_shadow_total_delta',
        severity: 'high',
        anomaly_score: ANOMALY_SEVERITY_SCORES['large_live_shadow_total_delta'],
        title: `Large live-vs-shadow delta: $${absDelta.toFixed(2)} (${absPct.toFixed(1)}%)`,
        description: 'Live and shadow parsers produced noticeably different totals for the same document.',
        evidence_json: { totalDelta, totalDeltaPercent },
      });
    }

    if (Math.abs(itemCountDelta) > 0) {
      const rows = ctx.totalRowsInserted ?? ctx.totalRowsRaw ?? 0;
      const divergePct = rows > 0 ? (Math.abs(itemCountDelta) / rows) * 100 : 0;
      if (divergePct >= cfg.itemCountDivergencePercent) {
        anomalies.push({
          anomaly_type: 'live_shadow_item_count_divergence',
          severity: 'medium',
          anomaly_score: ANOMALY_SEVERITY_SCORES['live_shadow_item_count_divergence'],
          title: `Item count divergence: live=${ctx.liveItemCount}, shadow=${ctx.shadowItemCount}`,
          description: `Live and shadow parsers produced ${Math.abs(itemCountDelta)} different item counts (${divergePct.toFixed(0)}% divergence).`,
          evidence_json: { liveItemCount: ctx.liveItemCount, shadowItemCount: ctx.shadowItemCount, itemCountDelta },
        });
      }
    }
  }

  const totalRaw = ctx.totalRowsRaw ?? 0;
  const totalExcluded = ctx.totalRowsExcluded ?? 0;
  if (totalRaw > 0) {
    const excludePct = (totalExcluded / totalRaw) * 100;
    if (excludePct >= cfg.tooManyRowsExcludedPercent) {
      anomalies.push({
        anomaly_type: 'too_many_rows_excluded',
        severity: 'high',
        anomaly_score: ANOMALY_SEVERITY_SCORES['too_many_rows_excluded'],
        title: `${excludePct.toFixed(0)}% of rows excluded`,
        description: `${totalExcluded} of ${totalRaw} rows were excluded. This may indicate a parsing strategy mismatch for this document format.`,
        evidence_json: { totalRaw, totalExcluded, excludePct },
      });
    }

    const hasRiskyTotalPattern = ctx.riskFlags?.some((f) =>
      f.toLowerCase().includes('total') || f.toLowerCase().includes('duplicate')
    );
    if (hasRiskyTotalPattern && excludePct < cfg.tooFewRowsExcludedPercent) {
      anomalies.push({
        anomaly_type: 'too_few_rows_excluded_when_total_phrase_present',
        severity: 'medium',
        anomaly_score: ANOMALY_SEVERITY_SCORES['too_few_rows_excluded_when_total_phrase_present'],
        title: 'Total-phrase risk flag present but almost no rows excluded',
        description: 'Risk flags suggest a total row may be present but exclusion logic removed very few rows.',
        evidence_json: { totalRaw, totalExcluded, riskFlags: ctx.riskFlags },
      });
    }
  }

  const avgConf = ctx.avgConfidence ?? 1;
  if (avgConf < cfg.lowConfidenceThreshold) {
    anomalies.push({
      anomaly_type: 'low_confidence_summary_exclusion',
      severity: avgConf < 0.3 ? 'high' : 'medium',
      anomaly_score: ANOMALY_SEVERITY_SCORES['low_confidence_summary_exclusion'],
      title: `Low average confidence: ${(avgConf * 100).toFixed(0)}%`,
      description: 'Parser operated with low average item confidence. Results should be reviewed carefully.',
      evidence_json: { avgConfidence: avgConf, threshold: cfg.lowConfidenceThreshold },
    });
  }

  if (ctx.riskFlags && ctx.riskFlags.length > 0) {
    const classification = ctx.riskFlags.filter((f) =>
      f.toLowerCase().includes('classif') || f.toLowerCase().includes('unstable')
    );
    if (classification.length > 0) {
      anomalies.push({
        anomaly_type: 'classification_instability',
        severity: 'medium',
        anomaly_score: ANOMALY_SEVERITY_SCORES['classification_instability'],
        title: 'Classification instability detected',
        description: 'Risk flags indicate classification uncertainty in this run.',
        evidence_json: { flags: classification },
      });
    }
  }

  const orgFailures = ctx.orgRecentFailureCount ?? 0;
  if (orgFailures >= cfg.repeatedOrgFailureCount) {
    anomalies.push({
      anomaly_type: 'repeated_org_failures',
      severity: 'high',
      anomaly_score: ANOMALY_SEVERITY_SCORES['repeated_org_failures'],
      title: `Repeated failures for this organisation (${orgFailures})`,
      description: `This organisation has experienced ${orgFailures} recent parser failures. Their document format may be incompatible with shadow parser.`,
      evidence_json: { orgRecentFailureCount: orgFailures, threshold: cfg.repeatedOrgFailureCount },
    });
  }

  if (ctx.knownRiskyPattern) {
    anomalies.push({
      anomaly_type: 'run_on_known_risky_pattern',
      severity: 'medium',
      anomaly_score: ANOMALY_SEVERITY_SCORES['run_on_known_risky_pattern'],
      title: 'Run matched a known risky parsing pattern',
      description: 'This document matches patterns associated with previous failures in the regression suite.',
      evidence_json: { knownRiskyPattern: true },
    });
  }

  return anomalies;
}
