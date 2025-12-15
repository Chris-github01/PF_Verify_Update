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
 * CRITICAL: SM (smoke-tight) is < 30min, so it fails any numeric requirement
 */
function frrComponentMeetsRequirement(required: string, provided: string): boolean {
  if (required === '-') return true; // No requirement

  const reqNum = frrComponentToNumber(required);
  const provNum = frrComponentToNumber(provided);

  // No requirement
  if (reqNum === -1) return true;

  // Required but not provided
  if (provNum === -1) return false;

  // SM requirement must match SM exactly
  if (required.toLowerCase() === 'sm') {
    return provided.toLowerCase() === 'sm';
  }

  // Numeric requirement: SM (0) will fail, numeric values must be >= requirement
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
 */
function compareFRR(requiredFRR: string | undefined, providedFRR: string | undefined): FRRBreakdown {
  const maxScore = 20; // Total FRR points available
  const pointsPerComponent = 7; // Points per component (7+7+6=20)

  if (!requiredFRR && !providedFRR) {
    return {
      required: null,
      provided: null,
      structural_ok: true,
      integrity_ok: true,
      insulation_ok: true,
      score: 0,
      maxScore: 0,
    };
  }

  const required = parseFRR(requiredFRR || '');
  const provided = parseFRR(providedFRR || '');

  if (!required && !provided) {
    return {
      required: null,
      provided: null,
      structural_ok: true,
      integrity_ok: true,
      insulation_ok: true,
      score: 0,
      maxScore: 0,
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
      maxScore,
    };
  }

  if (!required) {
    return {
      required: null,
      provided,
      structural_ok: true,
      integrity_ok: true,
      insulation_ok: true,
      score: maxScore,
      maxScore,
    };
  }

  const structural_ok = frrComponentMeetsRequirement(required.structural, provided.structural);
  const integrity_ok = frrComponentMeetsRequirement(required.integrity, provided.integrity);
  const insulation_ok = frrComponentMeetsRequirement(required.insulation, provided.insulation);

  let score = 0;
  if (structural_ok) score += pointsPerComponent;
  if (integrity_ok) score += pointsPerComponent;
  if (insulation_ok) score += (maxScore - pointsPerComponent * 2); // Remaining points

  // Add cost-optimization bonus for systems close to requirement
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
    maxScore: maxScore + 5, // Include cost bonus in max score
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

    // New FRR component-based comparison
    if (item.frr && template.frr_string) {
      frrBreakdown = compareFRR(template.frr_string, item.frr);
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

  const confidence = Math.min(maxScore / 90, 1.0);
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
