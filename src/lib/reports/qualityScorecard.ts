import type { ComparisonRow } from '../../types/comparison.types';

export interface DataQualityMetrics {
  normalisationAccuracy: number;
  mappingAccuracy: number;
  missingUnits: number;
  failedExtractions: number;
  duplicatesRemoved: number;
  confidenceScore: number;
  totalItems: number;
  itemsWithModelRates: number;
  itemsWithSystems: number;
  itemsWithQuantities: number;
}

export function calculateDataQuality(
  comparisonData: ComparisonRow[]
): DataQualityMetrics {
  const totalItems = comparisonData.length;

  let missingUnits = 0;
  let itemsWithModelRates = 0;
  let itemsWithSystems = 0;
  let itemsWithQuantities = 0;
  let itemsWithValidDescriptions = 0;
  let totalConfidence = 0;

  comparisonData.forEach(row => {
    if (!row.unit || row.unit.trim() === '') {
      missingUnits++;
    }

    if (row.modelUnitRate && row.modelUnitRate > 0) {
      itemsWithModelRates++;
    }

    if (row.systemId && row.systemId !== 'UNMAPPED') {
      itemsWithSystems++;
    }

    if (row.quantity && row.quantity > 0) {
      itemsWithQuantities++;
    }

    if (row.description && row.description.length > 10) {
      itemsWithValidDescriptions++;
    }

    if (row.confidence) {
      totalConfidence += row.confidence;
    }
  });

  const normalisationAccuracy = totalItems > 0
    ? (itemsWithValidDescriptions / totalItems) * 100
    : 0;

  const mappingAccuracy = totalItems > 0
    ? (itemsWithSystems / totalItems) * 100
    : 0;

  const confidenceScore = totalItems > 0
    ? totalConfidence / totalItems
    : 0;

  const failedExtractions = totalItems - itemsWithValidDescriptions;

  return {
    normalisationAccuracy: Math.round(normalisationAccuracy * 10) / 10,
    mappingAccuracy: Math.round(mappingAccuracy * 10) / 10,
    missingUnits,
    failedExtractions,
    duplicatesRemoved: 0,
    confidenceScore: Math.round(confidenceScore * 10) / 10,
    totalItems,
    itemsWithModelRates,
    itemsWithSystems,
    itemsWithQuantities
  };
}
