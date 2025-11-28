import { SYSTEM_TEMPLATES } from './systemTemplates';

export interface MatchResult {
  systemId: string | null;
  systemLabel: string | null;
  confidence: number;
  needsReview: boolean;
  matchedFactors: string[];
  missedFactors: string[];
}

export interface LineItem {
  description: string;
  size?: string;
  frr?: string;
  service?: string;
  subclass?: string;
  material?: string;
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

  let bestMatch: { template: any; score: number } | null = null;
  let maxScore = 0;

  for (const template of SYSTEM_TEMPLATES) {
    let score = 0;
    const factors: string[] = [];

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

    if (item.frr && template.frr) {
      const frrNum = parseInt(item.frr.replace(/[^\d]/g, ''));
      if (!isNaN(frrNum) && frrNum === template.frr) {
        score += 20;
        factors.push(`FRR: ${item.frr}`);
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
      bestMatch = { template, score };
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
