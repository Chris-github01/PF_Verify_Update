export function calculateConfidence(item: any): number {
  let score = 0;
  
  if (item.qty && item.rate) score += 40;
  if (item.unit) score += 20;
  if (item.description && item.description.length > 10) score += 20;
  if (item.system_id) score += 20;
  
  return Math.min(score, 100);
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 80) return 'text-green-600';
  if (confidence >= 60) return 'text-amber-600';
  return 'text-red-600';
}

export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 80) return 'High';
  if (confidence >= 60) return 'Medium';
  return 'Low';
}
