import { supabase } from '../../supabase';
import type { CdeSupplierProfile, CdeVariationExposure } from './types';
import { VARIATION_RATE_THRESHOLDS } from './constants';

function estimateLikelihood(variationRate: number): number {
  if (variationRate >= VARIATION_RATE_THRESHOLDS.high) return 0.85;
  if (variationRate >= VARIATION_RATE_THRESHOLDS.medium) return 0.65;
  if (variationRate >= VARIATION_RATE_THRESHOLDS.low) return 0.40;
  return 0.20;
}

function buildCategoryBreakdown(profile: CdeSupplierProfile): Record<string, number> {
  const base = profile.quotedTotal;
  const varRate = profile.historicalVariationRate;

  return {
    scope_creep: Math.round(base * varRate * 0.40),
    programme_delays: Math.round(base * profile.programmeRiskScore * 0.15),
    rfi_delays: Math.round(base * (1 - profile.rfiResponseScore) * 0.10),
    omissions: Math.round(base * Math.max(0, 1 - profile.scopeCoveragePct / 100) * 0.35),
  };
}

export function calculateVariationExposures(
  profiles: CdeSupplierProfile[]
): CdeVariationExposure[] {
  return profiles.map((profile) => {
    const categoryBreakdown = buildCategoryBreakdown(profile);
    const exposureAmount = Object.values(categoryBreakdown).reduce((s, v) => s + v, 0);
    const exposurePct =
      profile.quotedTotal > 0
        ? Math.round((exposureAmount / profile.quotedTotal) * 10000) / 100
        : 0;
    const likelihoodScore = estimateLikelihood(profile.historicalVariationRate);

    return {
      projectId: profile.projectId,
      supplierName: profile.supplierName,
      exposureAmount,
      exposurePct,
      likelihoodScore,
      categoryBreakdown,
    };
  });
}

export async function saveVariationExposures(
  exposures: CdeVariationExposure[]
): Promise<void> {
  const rows = exposures.map((e) => ({
    project_id: e.projectId,
    supplier_name: e.supplierName,
    exposure_amount: e.exposureAmount,
    exposure_pct: e.exposurePct,
    likelihood_score: e.likelihoodScore,
    category_breakdown: e.categoryBreakdown,
  }));
  await supabase.from('cde_variation_exposure').insert(rows);
}

export async function loadVariationExposures(
  projectId: string
): Promise<CdeVariationExposure[]> {
  const { data } = await supabase
    .from('cde_variation_exposure')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    supplierName: row.supplier_name,
    exposureAmount: row.exposure_amount ?? 0,
    exposurePct: row.exposure_pct ?? 0,
    likelihoodScore: row.likelihood_score ?? 0.5,
    categoryBreakdown: row.category_breakdown ?? {},
  }));
}
