import { supabase } from '../../supabase';
import type { CdeSupplierProfile, CdeVariationExposure, CdeCostProjection } from './types';

function riskPremiumRate(variationRate: number): number {
  if (variationRate >= 0.20) return 0.12;
  if (variationRate >= 0.12) return 0.08;
  if (variationRate >= 0.05) return 0.05;
  return 0.02;
}

export function projectCosts(
  profiles: CdeSupplierProfile[],
  exposures: CdeVariationExposure[]
): CdeCostProjection[] {
  const exposureMap = new Map(exposures.map((e) => [e.supplierName, e]));

  return profiles.map((profile) => {
    const exposure = exposureMap.get(profile.supplierName);
    const quotedTotal = profile.quotedTotal;
    const exposureAmount = exposure
      ? exposure.exposureAmount * exposure.likelihoodScore
      : 0;

    const riskPremium = Math.round(quotedTotal * riskPremiumRate(profile.historicalVariationRate));
    const contingencyApplied = Math.round(exposureAmount);
    const projectedTotal = quotedTotal + contingencyApplied + riskPremium;

    const bandSpread = projectedTotal * 0.08;
    const confidenceBandLow = Math.round(projectedTotal - bandSpread * 0.4);
    const confidenceBandHigh = Math.round(projectedTotal + bandSpread * 0.6);

    return {
      projectId: profile.projectId,
      supplierName: profile.supplierName,
      quotedTotal,
      projectedTotal: Math.round(projectedTotal),
      contingencyApplied,
      riskPremium,
      confidenceBandLow,
      confidenceBandHigh,
      projectionBasis: 'historical_variation_rate',
    };
  });
}

export async function saveCostProjections(
  projections: CdeCostProjection[]
): Promise<void> {
  const rows = projections.map((p) => ({
    project_id: p.projectId,
    supplier_name: p.supplierName,
    quoted_total: p.quotedTotal,
    projected_total: p.projectedTotal,
    contingency_applied: p.contingencyApplied,
    risk_premium: p.riskPremium,
    confidence_band_low: p.confidenceBandLow,
    confidence_band_high: p.confidenceBandHigh,
    projection_basis: p.projectionBasis,
  }));
  await supabase.from('cde_cost_projections').insert(rows);
}

export async function loadCostProjections(
  projectId: string
): Promise<CdeCostProjection[]> {
  const { data } = await supabase
    .from('cde_cost_projections')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    supplierName: row.supplier_name,
    quotedTotal: row.quoted_total ?? 0,
    projectedTotal: row.projected_total ?? 0,
    contingencyApplied: row.contingency_applied ?? 0,
    riskPremium: row.risk_premium ?? 0,
    confidenceBandLow: row.confidence_band_low ?? 0,
    confidenceBandHigh: row.confidence_band_high ?? 0,
    projectionBasis: row.projection_basis ?? 'historical',
  }));
}
