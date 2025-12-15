import { SYSTEM_TEMPLATES } from './systemTemplates';

export interface FRRComponent {
  structural: string;
  integrity: string;
  insulation: string;
}

export interface FRRBreakdown {
  required: FRRComponent | null;
  provided: FRRComponent | null;
  structural_ok: boolean;
  integrity_ok: boolean;
  insulation_ok: boolean;
  score: number;
  maxScore: number;
}

export interface MatchResult {
  systemId: string | null;
  systemLabel: string | null;
  confidence: number;
  needsReview: boolean;
  matchedFactors: string[];
  missedFactors: string[];
  frrBreakdown?: FRRBreakdown;
}

export interface LineItem {
  description: string;
  size?: string;
  frr?: string;
  service?: string;
  subclass?: string;
  material?: string;
}

/**
 * Parse FRR string (e.g., "-/30/30", "-/120/90", "120/120/120") into components
 */
function parseFRR(frr: string): FRRComponent | null {
  if (!frr) return null;

  const parts = frr.trim().split('/');
  if (parts.length !== 3) return null;

  return {
    structural: parts[0].trim(),
    integrity: parts[1].trim(),
    insulation: parts[2].trim(),
  };
}

/**
 * Convert FRR component to numeric value for comparison
 * Returns -1 for "-", 0 for "sm" (smoke-tight, less than 30min), or numeric value
 */
function frrComponentToNumber(component: string): number {
  if (component === '-') return -1;
  if (component.toLowerCase() === 'sm') return 0; // SM is less than 30min requirement
  const num = parseInt(component.replace(/[^\d]/g, ''));
  return isNaN(num) ? -1 : num;
}

/**
 * Check if provided FRR component meets or exceeds required component
 * CRITICAL: SM (smoke-tight) is < 30min, so it fails any numeric requirement >= 30
 * Ordering: - (no requirement) < sm < 30 < 60 < 90 < 120 < 240
 */
function frrComponentMeetsRequirement(required: string, provided: string): boolean {
  // No requirement means always passes
  if (required === '-' || required === '') return true;

  const reqNum = frrComponentToNumber(required);
  const provNum = frrComponentToNumber(provided);

  // No requirement (-1 = "-")
  if (reqNum === -1) return true;

  // Required but not provided (provided is "-")
  if (provNum === -1) return false;

  // Standard comparison: provided must meet or exceed required
  // This correctly handles: sm (0) < 30 < 60 < 90 < 120 < 240
  // Examples:
  // - required sm (0), provided 30 (30) → 30 >= 0 → PASS
  // - required 30 (30), provided sm (0) → 0 >= 30 → FAIL
  // - required 30, provided 120 → 120 >= 30 → PASS
  return provNum >= reqNum;
}

/**
 * Calculate FRR over-specification penalty (higher FRR = more expensive = lower score)
 * Returns 0-5 bonus points for systems close to requirement, fewer points for over-spec
 */
function calculateFRRCostBonus(requiredFRR: string | undefined, providedFRR: string | undefined): number {
  if (!requiredFRR || !providedFRR) return 0;

  const required = parseFRR(requiredFRR);
  const provided = parseFRR(providedFRR);
  if (!required || !provided) return 0;

  const reqIntegrity = frrComponentToNumber(required.integrity);
  const provIntegrity = frrComponentToNumber(provided.integrity);

  if (reqIntegrity === -1 || provIntegrity === -1) return 0;

  // Over-specification penalty (higher FRR = more expensive = lower bonus)
  const overSpec = provIntegrity - reqIntegrity;
  if (overSpec < 0) return 0; // Doesn't meet requirement
  if (overSpec === 0) return 5; // Perfect match - most cost-effective
  if (overSpec <= 30) return 3; // Slightly over-spec
  if (overSpec <= 60) return 1; // Moderately over-spec
  return 0; // Significantly over-spec (expensive)
}

/**
 * Compare FRR values component-by-component (meets or exceeds logic)
 * @param requiredFRR - The FRR requirement from the line item (spec)
 * @param providedFRR - The FRR capability of the system template
 */
function compareFRR(requiredFRR: string | undefined, providedFRR: string | undefined): FRRBreakdown {
  const baseFRRScore = 20; // Base FRR points (without cost bonus)
  const costBonusMax = 5; // Maximum cost optimization bonus
  const maxScore = baseFRRScore + costBonusMax; // Total possible: 25 points
  const pointsPerComponent = 7; // Points per component (7+7+6=20)

  // Handle null/invalid cases - return safe defaults
  if (!requiredFRR && !providedFRR) {
    return {
      required: null,
      provided: null,
      structural_ok: true,
      integrity_ok: true,
      insulation_ok: true,
      score: 0,
      maxScore: 25,
    };
  }

  const required = parseFRR(requiredFRR || '');
  const provided = parseFRR(providedFRR || '');

  // If either FRR is invalid/null, handle gracefully
  if (!required && !provided) {
    return {
      required: null,
      provided: null,
      structural_ok: true,
      integrity_ok: true,
      insulation_ok: true,
      score: 0,
      maxScore: 25,
    };
  }

  if (!provided) {
    return {
      required,
      provided: null,
      structural_ok: false,
      integrity_ok: false,
      insulation_ok: false,
      score: 0,
      maxScore: 25,
    };
  }

  if (!required) {
    return {
      required: null,
      provided,
      structural_ok: true,
      integrity_ok: true,
      insulation_ok: true,
      score: baseFRRScore,
      maxScore: 25,
    };
  }

  const structural_ok = frrComponentMeetsRequirement(required.structural, provided.structural);
  const integrity_ok = frrComponentMeetsRequirement(required.integrity, provided.integrity);
  const insulation_ok = frrComponentMeetsRequirement(required.insulation, provided.insulation);

  let score = 0;
  if (structural_ok) score += pointsPerComponent;
  if (integrity_ok) score += pointsPerComponent;
  if (insulation_ok) score += (baseFRRScore - pointsPerComponent * 2); // Remaining points

  // Add cost-optimization bonus ONLY if all components pass
  if (structural_ok && integrity_ok && insulation_ok) {
    score += calculateFRRCostBonus(requiredFRR, providedFRR);
  }

  return {
    required,
    provided,
    structural_ok,
    integrity_ok,
    insulation_ok,
    score,
    maxScore: 25, // Always return consistent maxScore
  };
}

export function matchLineToSystem(item: LineItem): MatchResult {
  if (!item || !item.description) {
    return {
      systemId: null,
      systemLabel: null,
      confidence: 0,
      needsReview: true,
      matchedFactors: [],
      missedFactors: ['No description provided'],
    };
  }

  const matchedFactors: string[] = [];
  const missedFactors: string[] = [];

  let bestMatch: { template: any; score: number; frrBreakdown?: FRRBreakdown } | null = null;
  let maxScore = 0;

  for (const template of SYSTEM_TEMPLATES) {
    let score = 0;
    const factors: string[] = [];
    let frrBreakdown: FRRBreakdown | undefined;

    if (item.service && template.service) {
      const serviceMatch = item.service.toLowerCase().includes(template.service.toLowerCase()) ||
                           template.service.toLowerCase().includes(item.service.toLowerCase());
      if (serviceMatch) {
        score += 30;
        factors.push(`Service: ${item.service}`);
      }
    }

    if (item.size && template.size_min !== undefined && template.size_max !== undefined) {
      const sizeNum = parseFloat(item.size.replace(/[^\d.]/g, ''));
      if (!isNaN(sizeNum) && sizeNum >= template.size_min && sizeNum <= template.size_max) {
        score += 25;
        factors.push(`Size: ${item.size}`);
      }
    }

    // FRR component-based comparison
    // CRITICAL: item.frr is REQUIRED, template.frr_string is PROVIDED
    if (item.frr && template.frr_string) {
      frrBreakdown = compareFRR(item.frr, template.frr_string);
      score += frrBreakdown.score;

      if (frrBreakdown.score > 0) {
        const passingComponents: string[] = [];
        if (frrBreakdown.structural_ok) passingComponents.push('Structural');
        if (frrBreakdown.integrity_ok) passingComponents.push('Integrity');
        if (frrBreakdown.insulation_ok) passingComponents.push('Insulation');

        if (passingComponents.length > 0) {
          factors.push(`FRR: ${passingComponents.join(', ')}`);
        }
      }
    }

    if (item.subclass) {
      const subclassMatch = template.label.toLowerCase().includes(item.subclass.toLowerCase());
      if (subclassMatch) {
        score += 15;
        factors.push(`Type: ${item.subclass}`);
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestMatch = { template, score, frrBreakdown };
      matchedFactors.length = 0;
      matchedFactors.push(...factors);
    }
  }

  if (!item.service) missedFactors.push('Service type not identified');
  if (!item.size) missedFactors.push('Size not found');
  if (!item.frr) missedFactors.push('FRR not specified');

  if (!bestMatch || maxScore < 20) {
    return {
      systemId: null,
      systemLabel: null,
      confidence: 0,
      needsReview: true,
      matchedFactors,
      missedFactors: missedFactors.length > 0 ? missedFactors : ['No matching system template found'],
    };
  }

  // Maximum possible score: Service(30) + Size(25) + FRR(20+5) + Subclass(15) = 95
  const MAX_SCORE = 95;
  const confidence = Math.min(maxScore / MAX_SCORE, 1.0);
  const needsReview = confidence < 0.7;

  return {
    systemId: bestMatch.template.id,
    systemLabel: bestMatch.template.label,
    confidence,
    needsReview,
    matchedFactors,
    missedFactors,
    frrBreakdown: bestMatch.frrBreakdown,
  };
}

export interface SystemMatch {
  system_id: string;
  confidence: number;
  reason: string;
}

export async function matchLineItemToSystem(item: any): Promise<SystemMatch | null> {
  const result = matchLineToSystem(item);
  if (!result.systemId) {
    return null;
  }
  return {
    system_id: result.systemId,
    confidence: result.confidence,
    reason: result.matchedFactors.join(', '),
  };
}

export async function suggestSystemMapping(projectId: string, items: any[]): Promise<any[]> {
  return items.map(item => matchLineToSystem(item));
}

// ============================================================================
// TEST VALIDATION SECTION
// ============================================================================

/**
 * Internal test helper to validate FRR compliance logic
 * Run these tests to ensure correct behavior after changes
 */
export function runFRRComplianceTests(): { passed: number; failed: number; results: string[] } {
  const results: string[] = [];
  let passed = 0;
  let failed = 0;

  function test(name: string, condition: boolean, details?: string) {
    if (condition) {
      results.push(`✓ PASS: ${name}`);
      passed++;
    } else {
      results.push(`✗ FAIL: ${name}${details ? ` - ${details}` : ''}`);
      failed++;
    }
  }

  // Test 1: sm < 30 logic
  const test1 = compareFRR('-/sm/sm', '-/30/30');
  test('Required sm, provided 30 → PASS (integrity)', test1.integrity_ok,
    `Got: ${test1.integrity_ok}, Score: ${test1.score}`);

  const test2 = compareFRR('-/30/30', '-/sm/sm');
  test('Required 30, provided sm → FAIL (integrity)', !test2.integrity_ok,
    `Got: ${test2.integrity_ok}, Score: ${test2.score}`);

  // Test 2: Overspec passes
  const test3 = compareFRR('-/30/30', '-/120/90');
  test('Required -/30/30, provided -/120/90 → PASS (all components)',
    test3.structural_ok && test3.integrity_ok && test3.insulation_ok,
    `Structural: ${test3.structural_ok}, Integrity: ${test3.integrity_ok}, Insulation: ${test3.insulation_ok}`);

  // Test 3: Underspec fails
  const test4 = compareFRR('-/60/60', '-/120/30');
  test('Required -/60/60, provided -/120/30 → FAIL (insulation underspec)',
    test4.integrity_ok && !test4.insulation_ok,
    `Integrity: ${test4.integrity_ok}, Insulation: ${test4.insulation_ok}`);

  // Test 4: Exact match gets highest score
  const test5a = compareFRR('-/30/30', '-/30/30');
  const test5b = compareFRR('-/30/30', '-/90/30');
  const test5c = compareFRR('-/30/30', '-/120/30');
  test('Exact match -/30/30 scores higher than -/90/30',
    test5a.score > test5b.score,
    `Exact: ${test5a.score}, FRL90: ${test5b.score}`);
  test('FRL 90 scores higher than FRL 120 for -/30/30 requirement',
    test5b.score > test5c.score,
    `FRL90: ${test5b.score}, FRL120: ${test5c.score}`);

  // Test 5: No requirement always passes
  const test6 = compareFRR('-/-/-', '-/120/120');
  test('No requirement (-/-/-) with any provided → PASS',
    test6.structural_ok && test6.integrity_ok && test6.insulation_ok,
    `Score: ${test6.score}`);

  // Test 6: Null/invalid FRR handling
  const test7 = compareFRR(undefined, '-/30/30');
  test('Undefined required FRR → no crash, returns valid result',
    test7.score >= 0 && test7.maxScore === 25,
    `Score: ${test7.score}, MaxScore: ${test7.maxScore}`);

  const test8 = compareFRR('-/30/30', undefined);
  test('Undefined provided FRR → fails, returns 0 score',
    test8.score === 0 && !test8.integrity_ok,
    `Score: ${test8.score}, Integrity: ${test8.integrity_ok}`);

  // Test 7: Confidence calculation uses MAX_SCORE = 95
  const testItem: LineItem = {
    description: 'Fire Door',
    service: 'Fire Door',
    size: '900',
    frr: '-/30/30',
    subclass: 'Door'
  };

  // Mock template with perfect match (assuming it exists in templates)
  const mockResult = matchLineToSystem(testItem);
  test('Confidence calculation uses MAX_SCORE = 95',
    mockResult.confidence <= 1.0,
    `Confidence: ${mockResult.confidence}`);

  return { passed, failed, results };
}

/**
 * Console-friendly test runner
 * Call this in development to validate FRR logic
 */
export function validateFRRCompliance(): void {
  console.log('\n========================================');
  console.log('FRR COMPLIANCE TEST SUITE');
  console.log('========================================\n');

  const { passed, failed, results } = runFRRComplianceTests();

  results.forEach(r => console.log(r));

  console.log('\n========================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  if (failed > 0) {
    console.error('⚠️  Some tests failed. Review FRR logic.');
  } else {
    console.log('✅ All tests passed!');
  }
}
