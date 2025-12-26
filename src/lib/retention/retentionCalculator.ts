export interface RetentionTier {
  threshold_nzd: number | null;
  rate_percent: number;
}

export interface RetentionCalculation {
  method: 'flat' | 'sliding_scale';
  totalAmount: number;
  retentionHeld: number;
  netPayable: number;
  effectiveRate: number;
  breakdown?: RetentionBandBreakdown[];
}

export interface RetentionBandBreakdown {
  bandLabel: string;
  amountInBand: number;
  rate: number;
  retentionForBand: number;
}

export function calculateRetention(
  totalAmount: number,
  retentionPercentage: number,
  retentionMethod: 'flat' | 'sliding_scale' = 'flat',
  retentionTiers: RetentionTier[] | null = null
): RetentionCalculation {
  if (retentionMethod === 'flat') {
    const retentionHeld = totalAmount * (retentionPercentage / 100);
    return {
      method: 'flat',
      totalAmount,
      retentionHeld,
      netPayable: totalAmount - retentionHeld,
      effectiveRate: retentionPercentage
    };
  }

  if (!retentionTiers || retentionTiers.length === 0) {
    const retentionHeld = totalAmount * (retentionPercentage / 100);
    return {
      method: 'sliding_scale',
      totalAmount,
      retentionHeld,
      netPayable: totalAmount - retentionHeld,
      effectiveRate: retentionPercentage,
      breakdown: []
    };
  }

  const sortedTiers = [...retentionTiers].sort((a, b) => {
    if (a.threshold_nzd === null) return 1;
    if (b.threshold_nzd === null) return -1;
    return a.threshold_nzd - b.threshold_nzd;
  });

  let totalRetention = 0;
  let remainingAmount = totalAmount;
  let previousThreshold = 0;
  const breakdown: RetentionBandBreakdown[] = [];

  for (let i = 0; i < sortedTiers.length; i++) {
    const tier = sortedTiers[i];
    const currentThreshold = tier.threshold_nzd ?? Infinity;

    if (remainingAmount <= 0) break;

    const amountInBand = Math.min(
      remainingAmount,
      currentThreshold - previousThreshold
    );

    if (amountInBand > 0) {
      const retentionForBand = amountInBand * (tier.rate_percent / 100);
      totalRetention += retentionForBand;

      const bandLabel = tier.threshold_nzd === null
        ? `Above ${formatNZD(previousThreshold)}`
        : i === 0
        ? `Up to ${formatNZD(currentThreshold)}`
        : `${formatNZD(previousThreshold)} – ${formatNZD(currentThreshold)}`;

      breakdown.push({
        bandLabel,
        amountInBand,
        rate: tier.rate_percent,
        retentionForBand
      });

      remainingAmount -= amountInBand;
    }

    if (tier.threshold_nzd !== null) {
      previousThreshold = tier.threshold_nzd;
    }
  }

  const effectiveRate = totalAmount > 0 ? (totalRetention / totalAmount) * 100 : 0;

  return {
    method: 'sliding_scale',
    totalAmount,
    retentionHeld: totalRetention,
    netPayable: totalAmount - totalRetention,
    effectiveRate,
    breakdown
  };
}

export function formatNZD(value: number): string {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

export function getRetentionSummaryText(calculation: RetentionCalculation): string {
  if (calculation.method === 'flat') {
    return `A retention of ${calculation.effectiveRate.toFixed(1)}% shall be deducted from each payment claim and held in accordance with the subcontract.`;
  }

  return `Retention shall be applied on a sliding scale basis. Effective retention rate: ${calculation.effectiveRate.toFixed(2)}%`;
}
