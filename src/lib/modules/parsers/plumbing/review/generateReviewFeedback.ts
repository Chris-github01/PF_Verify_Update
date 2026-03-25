import type { ReviewDecision, FeedbackType, CorrectionPayload } from './reviewTypes';

export interface FeedbackPayload {
  feedbackType: FeedbackType;
  payload: Record<string, unknown>;
  explanation: string;
}

export function generateReviewFeedback(decision: ReviewDecision): FeedbackPayload[] {
  const results: FeedbackPayload[] = [];

  switch (decision.decision_type) {
    case 'needs_rule_change': {
      const correction = decision.correction_payload_json as CorrectionPayload | undefined;
      results.push({
        feedbackType: 'rule_training',
        payload: {
          decisionId: decision.id,
          decisionSummary: decision.decision_summary,
          targetRowPhrase: correction?.targetRowPhrase,
          targetClassification: correction?.targetClassification,
          correctAction: correction?.correctAction,
          ruleCandidate: correction?.ruleCandidate,
          confidence: decision.confidence_score,
          rationale: correction?.rationale ?? decision.decision_summary,
        },
        explanation: `Rule change needed — "${decision.decision_summary}". Candidate for rule_suggestions intake.`,
      });
      break;
    }

    case 'needs_manual_correction_pattern': {
      const correction = decision.correction_payload_json as CorrectionPayload | undefined;
      results.push({
        feedbackType: 'pattern_training',
        payload: {
          decisionId: decision.id,
          phrase: correction?.targetRowPhrase,
          rowIndex: correction?.targetRowIndex,
          correctAction: correction?.correctAction,
          matchType: correction?.ruleCandidate?.matchType ?? 'contains',
          notes: correction?.notes,
          confidence: decision.confidence_score,
        },
        explanation: 'Recurring correction pattern candidate for parser_pattern_clusters enrichment.',
      });
      break;
    }

    case 'confirm_shadow_better': {
      results.push({
        feedbackType: 'regression_case_candidate',
        payload: {
          decisionId: decision.id,
          verdict: 'shadow_better',
          summary: decision.decision_summary,
          detailsJson: decision.decision_details_json,
          confidence: decision.confidence_score,
        },
        explanation: 'Shadow parser confirmed superior — strong regression case candidate.',
      });
      break;
    }

    case 'false_positive_alert': {
      results.push({
        feedbackType: 'routing_policy_candidate',
        payload: {
          decisionId: decision.id,
          type: 'false_positive',
          summary: decision.decision_summary,
          policyHint: 'reduce_sensitivity_for_similar_patterns',
          confidence: decision.confidence_score,
        },
        explanation: 'False positive alert — routing policy candidate to reduce over-sensitivity.',
      });
      break;
    }

    case 'false_negative_alert': {
      results.push({
        feedbackType: 'routing_policy_candidate',
        payload: {
          decisionId: decision.id,
          type: 'false_negative',
          summary: decision.decision_summary,
          policyHint: 'increase_sensitivity_for_similar_patterns',
          confidence: decision.confidence_score,
        },
        explanation: 'False negative alert — routing policy candidate to increase detection sensitivity.',
      });
      break;
    }

    case 'escalate': {
      results.push({
        feedbackType: 'regression_case_candidate',
        payload: {
          decisionId: decision.id,
          verdict: 'escalated',
          summary: decision.decision_summary,
          priority: 'high',
        },
        explanation: 'Escalated case — candidate for regression coverage with elevated priority.',
      });
      break;
    }

    default:
      break;
  }

  return results;
}

export function shouldGenerateFeedback(decisionType: ReviewDecision['decision_type']): boolean {
  const feedbackGeneratingTypes: ReviewDecision['decision_type'][] = [
    'needs_rule_change',
    'needs_manual_correction_pattern',
    'confirm_shadow_better',
    'false_positive_alert',
    'false_negative_alert',
    'escalate',
  ];
  return feedbackGeneratingTypes.includes(decisionType);
}
