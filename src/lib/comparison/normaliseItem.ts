export interface RawQuoteItem {
  id: string;
  description: string;
  service: string;
  material: string;
  unit: string;
  unit_price: number;
  size: string;
  frr: string;
}

export interface NormalisedItem {
  cleanDescription: string;
  size: string;
  unit: string;
  service: string;
}

export function extractSize(item: RawQuoteItem): string {
  if (item.size && item.size.trim() !== '') {
    return item.size.trim();
  }
  const sizeMatch = item.description?.match(/\d+\s*mm|\d+\s*"|\d+x\d+/i);
  if (sizeMatch) {
    return sizeMatch[0];
  }
  if (item.frr && item.frr.trim() !== '') {
    return item.frr.trim();
  }
  return '';
}

export function normaliseItem(item: RawQuoteItem): NormalisedItem {
  const cleanDescription = (item.description || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*mm\s*/g, 'mm')
    .replace(/\s*"\s*/g, '"');

  const size = extractSize(item);

  const unit = (item.unit || '').toLowerCase().trim();

  const service = (item.service || '').toLowerCase().trim();

  return { cleanDescription, size, unit, service };
}

export function buildItemKey(normalised: NormalisedItem): string {
  return `${normalised.cleanDescription}|${normalised.size}|${normalised.unit}`;
}
