import { supabase } from '../../supabase';
import type { CdeSupplierProfile, CdeBehaviourAnalysis, RiskTier, BehaviourClass } from './types';
import { VARIATION_RATE_THRESHOLDS } from './constants';

function classifyRiskTier(profile: CdeSupplierProfile): RiskTier {
  const varRate = profile.historicalVariationRate;
  const lateScore = profile.lateDeliveryCount;
  const rfi = profile.rfiResponseScore;

  if (varRate >= VARIATION_RATE_THRESHOLDS.high || lateScore >= 3 || rfi < 0.3) return 'critical';
  if (varRate >= VARIATION_RATE_THRESHOLDS.medium || lateScore >= 2 || rfi < 0.5) return 'high';
  if (varRate >= VARIATION_RATE_THRESHOLDS.low || lateScore >= 1 || rfi < 0.7) return 'medium';
  return 'low';
}

function classifyBehaviour(profile: CdeSupplierProfile): BehaviourClass {
  const varRate = profile.historicalVariationRate;
  const rfi = profile.rfiResponseScore;
  const programme = profile.programmeRiskScore;
  const scope = profile.scopeCoveragePct / 100;

  if (varRate < 0.03 && rfi >= 0.85 && scope >= 0.95) return 'compliant';
  if (varRate >= 0.20 && programme >= 0.7) return 'adversarial';
  if (varRate >= 0.12 && rfi < 0.5) return 'opportunistic';
  if (profile.lateDeliveryCount >= 2 || scope < 0.7) return 'unreliable';
  return 'standard';
}

function buildFlags(profile: CdeSupplierProfile): string[] {
  const flags: string[] = [];
  if (profile.historicalVariationRate >= VARIATION_RATE_THRESHOLDS.high)
    flags.push('High historical variation rate');
  if (profile.lateDeliveryCount >= 2) flags.push('Repeated late delivery history');
  if (profile.rfiResponseScore < 0.4) flags.push('Poor RFI responsiveness');
  if (profile.scopeCoveragePct < 70) flags.push('Incomplete scope coverage');
  if (profile.programmeRiskScore >= 0.7) flags.push('Elevated programme risk');
  return flags;
}

export function classifyBehaviours(
  profiles: CdeSupplierProfile[]
): CdeBehaviourAnalysis[] {
  return profiles.map((profile) => {
    const riskTier = classifyRiskTier(profile);
    const behaviourClass = classifyBehaviour(profile);
    const flags = buildFlags(profile);

    const tierConfidence: Record<RiskTier, number> = {
      low: 0.85,
      medium: 0.72,
      high: 0.65,
      critical: 0.60,
    };

    return {
      projectId: profile.projectId,
      supplierName: profile.supplierName,
      riskTier,
      behaviourClass,
      confidenceScore: tierConfidence[riskTier],
      flags,
      notes: flags.length === 0 ? 'No significant risk flags detected.' : '',
    };
  });
}

export async function saveBehaviourAnalysis(
  analyses: CdeBehaviourAnalysis[]
): Promise<void> {
  const rows = analyses.map((a) => ({
    project_id: a.projectId,
    supplier_name: a.supplierName,
    risk_tier: a.riskTier,
    behaviour_class: a.behaviourClass,
    confidence_score: a.confidenceScore,
    flags: a.flags,
    notes: a.notes,
  }));
  await supabase.from('cde_behaviour_analysis').insert(rows);
}

export async function loadBehaviourAnalysis(
  projectId: string
): Promise<CdeBehaviourAnalysis[]> {
  const { data } = await supabase
    .from('cde_behaviour_analysis')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    supplierName: row.supplier_name,
    riskTier: row.risk_tier as RiskTier,
    behaviourClass: row.behaviour_class as BehaviourClass,
    confidenceScore: row.confidence_score ?? 0.5,
    flags: row.flags ?? [],
    notes: row.notes ?? '',
  }));
}
