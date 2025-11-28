interface QuoteItem {
  quantity?: number | null;
}

export function needsQuantity(item: QuoteItem): boolean {
  return item.quantity === null || item.quantity === undefined || item.quantity === 0;
}

export function normaliseDescriptionForSystem(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(\d+(\.\d+)?\s*mm)/g, '')
    .replace(/fc\s*\d+/g, '')
    .replace(/[-–,]/g, ' ')
    .trim();
}

export function buildSuggestedSystemName(exampleDescription: string): string {
  return exampleDescription
    .replace(/\s+/g, ' ')
    .split(' ')
    .slice(0, 8)
    .join(' ');
}
