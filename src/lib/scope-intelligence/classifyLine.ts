import type { ScopeClassification, ScopeIntelligenceLine } from "./types";
import type { NormalizedScopeLine } from "./normalizeScope";
import {
  TOTAL_LINE_RULES,
  EXCLUSION_RULES,
  QUALIFICATION_RULES,
  OPTIONAL_RULES,
  NARRATIVE_RULES,
  MAIN_SCOPE_POSITIVE_RULES,
} from "./rules";
import { extractRiskSignals } from "./riskSignals";

interface ClassificationCandidate {
  classification: ScopeClassification;
  score: number;
  reasons: string[];
}

const CONFIDENCE_THRESHOLD = 0.5;

function scoreRules(
  description: string,
  rules: { pattern: RegExp; weight: number; reason: string }[]
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(description)) {
      score = Math.max(score, rule.weight);
      reasons.push(rule.reason);
    }
  }
  return { score, reasons };
}

function candidateFor(
  classification: ScopeClassification,
  description: string,
  rules: { pattern: RegExp; weight: number; reason: string }[]
): ClassificationCandidate {
  const { score, reasons } = scoreRules(description, rules);
  return { classification, score, reasons };
}

function scoreMainScope(
  description: string,
  value: number | null
): ClassificationCandidate {
  const { score: keywordScore, reasons } = scoreRules(description, MAIN_SCOPE_POSITIVE_RULES);

  let valueBonus = 0;
  if (value !== null && value > 0) {
    valueBonus = 0.4;
    reasons.push("Has positive monetary value");
  }

  const descLength = description.trim().length;
  let lengthBonus = 0;
  if (descLength > 10 && descLength < 300) {
    lengthBonus = 0.1;
  }

  const totalScore = Math.min(1, keywordScore + valueBonus + lengthBonus);
  return { classification: "main_scope", score: totalScore, reasons };
}

function scoreUnknown(
  description: string,
  value: number | null
): ClassificationCandidate {
  const reasons: string[] = [];
  let score = 0.3;

  if (value !== null && value > 0) {
    score += 0.2;
    reasons.push("Has monetary value");
  }

  if (description.trim().length > 3) {
    reasons.push("Has non-empty description");
  }

  return { classification: "unknown", score, reasons };
}

function pickBestCandidate(candidates: ClassificationCandidate[]): ClassificationCandidate {
  return candidates.reduce((best, c) => (c.score > best.score ? c : best), candidates[0]);
}

export function classifyLine(
  line: NormalizedScopeLine,
  originalIndex: number
): ScopeIntelligenceLine {
  const desc = line.description;
  const value = line.value;
  const riskSignals = extractRiskSignals(desc);

  const candidates: ClassificationCandidate[] = [
    candidateFor("total_line",     desc, TOTAL_LINE_RULES),
    candidateFor("exclusion",      desc, EXCLUSION_RULES),
    candidateFor("qualification",  desc, QUALIFICATION_RULES),
    candidateFor("optional_item",  desc, OPTIONAL_RULES),
    candidateFor("narrative",      desc, NARRATIVE_RULES),
    scoreMainScope(desc, value),
    scoreUnknown(desc, value),
  ];

  const best = pickBestCandidate(candidates);

  const classification: ScopeClassification =
    best.score >= CONFIDENCE_THRESHOLD ? best.classification : "unknown";

  const shouldCount = classification === "main_scope";

  return {
    originalIndex,
    description: desc,
    value,
    classification,
    confidence: parseFloat(best.score.toFixed(3)),
    reasons: best.reasons,
    shouldCountInScopeTotal: shouldCount,
    riskSignals,
  };
}
