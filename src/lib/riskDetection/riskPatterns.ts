export interface RiskPattern {
  id: string;
  pattern: RegExp;
  category: 'exclusion' | 'assumption' | 'vague' | 'pricing' | 'scope' | 'timeline' | 'quality' | 'access' | 'compliance';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}

export const RISK_PATTERNS: RiskPattern[] = [
  // EXCLUSIONS
  {
    id: 'EXC_BY_OTHERS',
    pattern: /\b(by others?|by another|by separate|by client|by main contractor)\b/i,
    category: 'exclusion',
    severity: 'high',
    description: 'Work explicitly excluded as "by others"',
    recommendation: 'Clarify responsibility and ensure scope boundaries are clear'
  },
  {
    id: 'EXC_NOT_INCLUDED',
    pattern: /\b(not included|excluded|omitted|does not include|excludes)\b/i,
    category: 'exclusion',
    severity: 'high',
    description: 'Items explicitly not included in scope',
    recommendation: 'List all exclusions and verify against project requirements'
  },
  {
    id: 'EXC_UNLESS_STATED',
    pattern: /\bunless (otherwise )?stated\b/i,
    category: 'exclusion',
    severity: 'medium',
    description: 'Conditional exclusion clause',
    recommendation: 'Request explicit list of what IS included'
  },
  {
    id: 'EXC_EXCEPT',
    pattern: /\bexcept (for|where|as)\b/i,
    category: 'exclusion',
    severity: 'medium',
    description: 'Exception clause that may hide exclusions',
    recommendation: 'Clarify all exceptions in writing'
  },
  {
    id: 'EXC_OUT_OF_SCOPE',
    pattern: /\bout of scope\b/i,
    category: 'exclusion',
    severity: 'high',
    description: 'Work declared out of scope',
    recommendation: 'Verify scope boundaries match project requirements'
  },
  {
    id: 'EXC_NOT_SHOWN',
    pattern: /\b(not shown|not indicated|not depicted) (on drawings?|on plans?)\b/i,
    category: 'exclusion',
    severity: 'critical',
    description: 'Items not shown on drawings excluded',
    recommendation: 'Conduct site survey to identify all required work'
  },
  {
    id: 'EXC_PROVISIONAL',
    pattern: /\bprovisional (sum|allowance|item)\b/i,
    category: 'exclusion',
    severity: 'medium',
    description: 'Provisional items may not cover actual costs',
    recommendation: 'Quantify provisional items and establish variation process'
  },

  // ASSUMPTIONS
  {
    id: 'ASM_ASSUME',
    pattern: /\bassume[ds]?\b/i,
    category: 'assumption',
    severity: 'high',
    description: 'Supplier making assumptions about scope or conditions',
    recommendation: 'Verify all assumptions against actual site conditions'
  },
  {
    id: 'ASM_PRESUME',
    pattern: /\bpresume[ds]?\b/i,
    category: 'assumption',
    severity: 'high',
    description: 'Supplier presuming conditions or requirements',
    recommendation: 'Validate presumptions with site inspection'
  },
  {
    id: 'ASM_BASED_ON',
    pattern: /\bbased on (preliminary|initial|draft|indicative)/i,
    category: 'assumption',
    severity: 'medium',
    description: 'Quote based on preliminary information',
    recommendation: 'Update quote when final information available'
  },
  {
    id: 'ASM_SUBJECT_TO',
    pattern: /\bsubject to (site survey|inspection|verification|confirmation)\b/i,
    category: 'assumption',
    severity: 'high',
    description: 'Quote subject to further verification',
    recommendation: 'Ensure site survey completed before contract award'
  },
  {
    id: 'ASM_ANTICIPATED',
    pattern: /\banticipate[ds]?\b/i,
    category: 'assumption',
    severity: 'medium',
    description: 'Supplier anticipating conditions or quantities',
    recommendation: 'Replace anticipated values with confirmed quantities'
  },
  {
    id: 'ASM_IF_REQUIRED',
    pattern: /\bif required\b/i,
    category: 'assumption',
    severity: 'medium',
    description: 'Optional items that may be required',
    recommendation: 'Clarify which items ARE required'
  },

  // VAGUE WORDING
  {
    id: 'VAGUE_APPROXIMATELY',
    pattern: /\b(approximately|approx\.?|circa|about|around)\s+\d/i,
    category: 'vague',
    severity: 'medium',
    description: 'Approximate quantities used',
    recommendation: 'Obtain exact quantities from drawings or site measure'
  },
  {
    id: 'VAGUE_ESTIMATE',
    pattern: /\b(estimate[ds]?|estimated|estimation)\b/i,
    category: 'vague',
    severity: 'high',
    description: 'Pricing described as estimate rather than fixed',
    recommendation: 'Request fixed pricing or clarify variation process'
  },
  {
    id: 'VAGUE_TBC',
    pattern: /\b(tbc|to be confirmed|to be determined|tbd)\b/i,
    category: 'vague',
    severity: 'critical',
    description: 'Items to be confirmed',
    recommendation: 'Obtain confirmation before contract award'
  },
  {
    id: 'VAGUE_TBA',
    pattern: /\b(tba|to be advised|to be agreed)\b/i,
    category: 'vague',
    severity: 'critical',
    description: 'Items to be advised/agreed',
    recommendation: 'Resolve all TBA items before contract signing'
  },
  {
    id: 'VAGUE_VARIOUS',
    pattern: /\bvarious\b/i,
    category: 'vague',
    severity: 'medium',
    description: 'Vague "various" description',
    recommendation: 'Request specific breakdown'
  },
  {
    id: 'VAGUE_ALLOWANCE',
    pattern: /\ballowance\b/i,
    category: 'vague',
    severity: 'medium',
    description: 'Allowance items may not reflect actual costs',
    recommendation: 'Quantify allowances and establish adjustment mechanism'
  },
  {
    id: 'VAGUE_AS_REQUIRED',
    pattern: /\bas required\b/i,
    category: 'vague',
    severity: 'medium',
    description: 'Undefined "as required" scope',
    recommendation: 'Define specific requirements'
  },

  // PRICING RISKS
  {
    id: 'PRICE_RATE_ONLY',
    pattern: /\brate only\b/i,
    category: 'pricing',
    severity: 'medium',
    description: 'Rate-only pricing without total commitment',
    recommendation: 'Ensure rates applied to confirmed quantities for comparison'
  },
  {
    id: 'PRICE_PROVISIONAL_RATE',
    pattern: /\bprovisional rate\b/i,
    category: 'pricing',
    severity: 'high',
    description: 'Rates may change',
    recommendation: 'Obtain fixed rates or price adjustment formula'
  },
  {
    id: 'PRICE_SUBJECT_TO_ESCALATION',
    pattern: /\bsubject to (price )?(escalation|increase|adjustment)\b/i,
    category: 'pricing',
    severity: 'critical',
    description: 'Prices may escalate after quote',
    recommendation: 'Request fixed pricing or clear escalation formula'
  },
  {
    id: 'PRICE_CURRENT_PRICING',
    pattern: /\bcurrent pricing\b/i,
    category: 'pricing',
    severity: 'medium',
    description: 'Pricing may change',
    recommendation: 'Request validity period and price hold guarantee'
  },
  {
    id: 'PRICE_PLUS_VARIATIONS',
    pattern: /\bplus variations?\b/i,
    category: 'pricing',
    severity: 'high',
    description: 'Additional variation costs expected',
    recommendation: 'Clarify what constitutes a variation and pricing mechanism'
  },
  {
    id: 'PRICE_EXTRA',
    pattern: /\bextra cost\b/i,
    category: 'pricing',
    severity: 'high',
    description: 'Additional costs not included in total',
    recommendation: 'Quantify all extra costs for true total'
  },

  // SCOPE AMBIGUITY
  {
    id: 'SCOPE_AS_PER_DRAWINGS',
    pattern: /\bas per drawings?\b/i,
    category: 'scope',
    severity: 'low',
    description: 'Scope defined by drawings',
    recommendation: 'Ensure drawings are complete and issued for construction'
  },
  {
    id: 'SCOPE_TYPICAL',
    pattern: /\btypical\b/i,
    category: 'scope',
    severity: 'medium',
    description: 'Typical details may not cover all conditions',
    recommendation: 'Verify typical details apply to all locations'
  },
  {
    id: 'SCOPE_SIMILAR',
    pattern: /\bsimilar\b/i,
    category: 'scope',
    severity: 'medium',
    description: 'Similar items may have important differences',
    recommendation: 'Specify exact requirements'
  },
  {
    id: 'SCOPE_OR_EQUIVALENT',
    pattern: /\bor equivalent\b/i,
    category: 'scope',
    severity: 'low',
    description: 'Equivalent products may not meet exact specifications',
    recommendation: 'Define equivalence criteria or specify exact products'
  },
  {
    id: 'SCOPE_WHERE_APPLICABLE',
    pattern: /\bwhere applicable\b/i,
    category: 'scope',
    severity: 'medium',
    description: 'Undefined applicability',
    recommendation: 'Clarify where work applies'
  },
  {
    id: 'SCOPE_AS_NECESSARY',
    pattern: /\bas necessary\b/i,
    category: 'scope',
    severity: 'medium',
    description: 'Undefined necessity criteria',
    recommendation: 'Define specific requirements'
  },

  // TIMELINE RISKS
  {
    id: 'TIME_SUBJECT_TO_PROGRAMME',
    pattern: /\bsubject to (programme|program|schedule)\b/i,
    category: 'timeline',
    severity: 'medium',
    description: 'Pricing subject to programme constraints',
    recommendation: 'Provide programme and confirm pricing'
  },
  {
    id: 'TIME_LEAD_TIME',
    pattern: /\blead time[s]?\b/i,
    category: 'timeline',
    severity: 'medium',
    description: 'Extended lead times may affect programme',
    recommendation: 'Confirm lead times and early ordering requirements'
  },
  {
    id: 'TIME_AVAILABILITY',
    pattern: /\bsubject to availability\b/i,
    category: 'timeline',
    severity: 'high',
    description: 'Materials or resources may not be available',
    recommendation: 'Confirm availability and procurement timeline'
  },

  // QUALITY & COMPLIANCE
  {
    id: 'QUAL_SUBJECT_TO_TESTING',
    pattern: /\bsubject to (site )?testing\b/i,
    category: 'quality',
    severity: 'medium',
    description: 'Quote contingent on testing outcomes',
    recommendation: 'Clarify testing requirements and cost allocation'
  },
  {
    id: 'QUAL_FIRE_RATING',
    pattern: /\bfire rating not confirmed\b/i,
    category: 'compliance',
    severity: 'critical',
    description: 'Fire rating requirements unclear',
    recommendation: 'Confirm required fire ratings from building consent'
  },
  {
    id: 'QUAL_BUILDING_CONSENT',
    pattern: /\bbuilding consent required\b/i,
    category: 'compliance',
    severity: 'high',
    description: 'Work requires building consent',
    recommendation: 'Ensure consent obtained before starting work'
  },
  {
    id: 'QUAL_PS3_REQUIREMENT',
    pattern: /\bps[13] (required|documentation)\b/i,
    category: 'compliance',
    severity: 'medium',
    description: 'PS1/PS3 documentation required',
    recommendation: 'Ensure PS documentation included in scope and pricing'
  },

  // ACCESS & SITE CONDITIONS
  {
    id: 'ACCESS_MEWP',
    pattern: /\bmewp (not included|excluded|by others)\b/i,
    category: 'access',
    severity: 'high',
    description: 'Access equipment not included',
    recommendation: 'Clarify access equipment provision and cost'
  },
  {
    id: 'ACCESS_SCAFFOLD',
    pattern: /\bscaffold(ing)? (not included|excluded|by others)\b/i,
    category: 'access',
    severity: 'high',
    description: 'Scaffolding not included',
    recommendation: 'Clarify scaffolding provision and cost'
  },
  {
    id: 'ACCESS_HEIGHT',
    pattern: /\b(working at )?height (restrictions?|limitations?)\b/i,
    category: 'access',
    severity: 'medium',
    description: 'Height access restrictions noted',
    recommendation: 'Verify access equipment suitable for all work areas'
  },
  {
    id: 'ACCESS_SITE_SURVEY',
    pattern: /\bsite (survey|inspection) required\b/i,
    category: 'access',
    severity: 'high',
    description: 'Site survey required to confirm pricing',
    recommendation: 'Complete site survey before contract award'
  },
  {
    id: 'ACCESS_AFTER_HOURS',
    pattern: /\bafter hours\b/i,
    category: 'access',
    severity: 'medium',
    description: 'After hours work may attract premium',
    recommendation: 'Clarify working hours and any premium rates'
  },

  // CRITICAL RED FLAGS
  {
    id: 'CRITICAL_BUDGET_ONLY',
    pattern: /\bbudget (only|estimate|indicative)\b/i,
    category: 'pricing',
    severity: 'critical',
    description: 'Budget estimate not a firm quote',
    recommendation: 'Request firm fixed price quotation'
  },
  {
    id: 'CRITICAL_PRELIMINARY',
    pattern: /\bpreliminary (quote|pricing|estimate)\b/i,
    category: 'pricing',
    severity: 'critical',
    description: 'Preliminary pricing not final',
    recommendation: 'Obtain final pricing before comparison'
  },
  {
    id: 'CRITICAL_NON_BINDING',
    pattern: /\bnon-binding\b/i,
    category: 'scope',
    severity: 'critical',
    description: 'Quote not binding on supplier',
    recommendation: 'Request binding quotation'
  },
  {
    id: 'CRITICAL_INDICATIVE',
    pattern: /\bindicative (only|pricing|cost)\b/i,
    category: 'pricing',
    severity: 'critical',
    description: 'Indicative pricing not firm',
    recommendation: 'Request firm pricing'
  },

  // COMPLIANCE & STANDARDS
  {
    id: 'COMP_AS_PER_CODE',
    pattern: /\bas per (nzbc|building code|nz3101|as\s*\/?\s*nzs)/i,
    category: 'compliance',
    severity: 'low',
    description: 'Work to code requirements',
    recommendation: 'Verify specific code clauses and editions'
  },
  {
    id: 'COMP_CERTIFICATION',
    pattern: /\bcertification required\b/i,
    category: 'compliance',
    severity: 'medium',
    description: 'Third-party certification required',
    recommendation: 'Confirm certification included in pricing'
  },
  {
    id: 'COMP_APPRAISAL',
    pattern: /\bfire engineering appraisal\b/i,
    category: 'compliance',
    severity: 'high',
    description: 'May require fire engineering input',
    recommendation: 'Clarify fire engineering requirements and costs'
  },

  // ADDITIONAL PATTERNS
  {
    id: 'OTHER_DAYWORK',
    pattern: /\bdaywork\b/i,
    category: 'pricing',
    severity: 'medium',
    description: 'Daywork rates rather than fixed price',
    recommendation: 'Quantify work and obtain fixed pricing'
  },
  {
    id: 'OTHER_PRIME_COST',
    pattern: /\bprime cost\b/i,
    category: 'pricing',
    severity: 'medium',
    description: 'Cost-plus pricing arrangement',
    recommendation: 'Request fixed price or clear cost breakdown'
  },
  {
    id: 'OTHER_TO_SUIT',
    pattern: /\bto suit\b/i,
    category: 'scope',
    severity: 'low',
    description: 'Work to suit unspecified conditions',
    recommendation: 'Define specific conditions'
  },
  {
    id: 'OTHER_UPON_INSPECTION',
    pattern: /\bupon inspection\b/i,
    category: 'assumption',
    severity: 'high',
    description: 'Final scope/price depends on inspection',
    recommendation: 'Complete inspection before finalizing quote'
  }
];

export function detectRisks(text: string): Array<{ pattern: RiskPattern; matches: string[] }> {
  const detectedRisks: Array<{ pattern: RiskPattern; matches: string[] }> = [];

  for (const pattern of RISK_PATTERNS) {
    const matches = text.match(new RegExp(pattern.pattern, 'gi'));
    if (matches && matches.length > 0) {
      detectedRisks.push({
        pattern,
        matches: [...new Set(matches)]
      });
    }
  }

  return detectedRisks;
}

export function analyzeQuoteRisks(quoteText: string, lineItems: Array<{ description: string }>) {
  const narrativeRisks = detectRisks(quoteText);

  const lineItemRisks = lineItems.flatMap((item, index) => {
    const risks = detectRisks(item.description);
    return risks.map(risk => ({
      ...risk,
      lineItemIndex: index,
      lineItemDescription: item.description
    }));
  });

  const riskSummary = {
    totalRisks: narrativeRisks.length + lineItemRisks.length,
    criticalRisks: [...narrativeRisks, ...lineItemRisks].filter(r => r.pattern.severity === 'critical').length,
    highRisks: [...narrativeRisks, ...lineItemRisks].filter(r => r.pattern.severity === 'high').length,
    mediumRisks: [...narrativeRisks, ...lineItemRisks].filter(r => r.pattern.severity === 'medium').length,
    lowRisks: [...narrativeRisks, ...lineItemRisks].filter(r => r.pattern.severity === 'low').length,
    byCategory: {} as Record<string, number>
  };

  for (const risk of [...narrativeRisks, ...lineItemRisks]) {
    const category = risk.pattern.category;
    riskSummary.byCategory[category] = (riskSummary.byCategory[category] || 0) + 1;
  }

  return {
    narrativeRisks,
    lineItemRisks,
    summary: riskSummary
  };
}

export function getRisksBySeverity(severity: RiskPattern['severity']): RiskPattern[] {
  return RISK_PATTERNS.filter(p => p.severity === severity);
}

export function getRisksByCategory(category: RiskPattern['category']): RiskPattern[] {
  return RISK_PATTERNS.filter(p => p.category === category);
}
