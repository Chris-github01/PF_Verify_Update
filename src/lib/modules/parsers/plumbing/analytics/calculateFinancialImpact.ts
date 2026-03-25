import type { ImpactType, FinancialImpactResult } from './analyticsTypes';

interface ImpactInput {
  impactType: ImpactType;
  parsedValue?: number;
  documentValue?: number;
  correctedValue?: number;
  originalValue?: number;
  confidenceScore?: number;
  context?: Record<string, unknown>;
}

const CONFIDENCE_WEIGHT_TABLE: Record<ImpactType, number> = {
  duplicate_total_prevented:    0.85,
  incorrect_total_detected:     0.80,
  classification_error_prevented: 0.60,
  manual_review_correction:     0.90,
  high_risk_flagged_pre_parse:  0.40,
};

export function calculateFinancialImpact(input: ImpactInput): FinancialImpactResult {
  const baseWeight = CONFIDENCE_WEIGHT_TABLE[input.impactType];
  const dataConfidence = (input.confidenceScore ?? 5) / 10;
  const confidenceWeight = baseWeight * dataConfidence;

  let rawDifference = 0;
  let explanation = '';

  switch (input.impactType) {
    case 'duplicate_total_prevented': {
      const inflated = input.parsedValue ?? 0;
      const correct = input.correctedValue ?? input.documentValue ?? 0;
      rawDifference = Math.max(0, inflated - correct);
      explanation = `Duplicate total row added $${formatNZD(rawDifference)} to parsed total. Conservative impact applied at ${pct(confidenceWeight)} confidence.`;
      break;
    }
    case 'incorrect_total_detected': {
      const parsed = input.parsedValue ?? 0;
      const document = input.documentValue ?? 0;
      rawDifference = Math.abs(parsed - document);
      explanation = `Parsed total ($${formatNZD(parsed)}) diverged from document total ($${formatNZD(document)}) by $${formatNZD(rawDifference)}. Flagged for review.`;
      break;
    }
    case 'classification_error_prevented': {
      const raw = input.originalValue ?? 0;
      rawDifference = raw * 0.05;
      explanation = `Classification error on $${formatNZD(raw)} item. Estimated impact of 5% misclassification error applied conservatively.`;
      break;
    }
    case 'manual_review_correction': {
      const original = input.originalValue ?? 0;
      const corrected = input.correctedValue ?? 0;
      rawDifference = Math.abs(original - corrected);
      explanation = `Reviewer corrected value from $${formatNZD(original)} to $${formatNZD(corrected)}, preventing $${formatNZD(rawDifference)} error.`;
      break;
    }
    case 'high_risk_flagged_pre_parse': {
      const exposure = input.parsedValue ?? 0;
      rawDifference = exposure * 0.02;
      explanation = `High-risk flag raised on $${formatNZD(exposure)} quote. Conservative 2% estimated exposure applied.`;
      break;
    }
  }

  const estimatedImpact = Math.round(rawDifference * confidenceWeight);

  return {
    rawDifference,
    confidenceWeight,
    estimatedImpact,
    explanation,
    impactType: input.impactType,
  };
}

export function buildImpactEventPayload(input: ImpactInput): {
  impact_value_json: Record<string, unknown>;
  estimated_financial_value: number;
  confidence_score: number;
} {
  const result = calculateFinancialImpact(input);
  return {
    impact_value_json: {
      rawDifference: result.rawDifference,
      confidenceWeight: result.confidenceWeight,
      explanation: result.explanation,
      parsedValue: input.parsedValue,
      documentValue: input.documentValue,
      correctedValue: input.correctedValue,
      originalValue: input.originalValue,
      ...input.context,
    },
    estimated_financial_value: result.estimatedImpact,
    confidence_score: (input.confidenceScore ?? 5),
  };
}

function formatNZD(v: number): string {
  return v.toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
