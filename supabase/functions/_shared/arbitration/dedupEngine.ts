/**
 * Contextual Fuzzy Dedup Engine
 *
 * Key = normalised(description) + block + page + line_id + total
 * Repeated items across DIFFERENT blocks are preserved (they represent
 * legitimate repetition across building stages / locations).
 */

export interface DedupInputItem {
  description: string;
  total: number | null;
  qty: number | null;
  rate: number | null;
  block?: string | null;
  page?: number | null;
  line_id?: string | null;
  [key: string]: unknown;
}

export interface DedupResult<T extends DedupInputItem> {
  kept: T[];
  removed: T[];
  warnings: string[];
}

const normaliseDescription = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Generate a fuzzy context key. Items sharing this key are considered duplicates.
 */
export function buildContextKey(item: DedupInputItem): string {
  const desc = normaliseDescription(item.description || "");
  const block = item.block ? String(item.block).toLowerCase().trim() : "";
  const page = item.page ?? "";
  const lineId = item.line_id ? String(item.line_id).toLowerCase().trim() : "";
  const total = item.total !== null && item.total !== undefined ? item.total.toFixed(2) : "";
  return [desc, block, page, lineId, total].join("|");
}

/**
 * Dedup items using the context key. Items without a block/page context that
 * share description+total are still merged (tight duplicates). Items with
 * different blocks/pages are KEPT even with identical descriptions.
 */
export function dedupItems<T extends DedupInputItem>(items: T[]): DedupResult<T> {
  const seen = new Map<string, T>();
  const removed: T[] = [];
  const warnings: string[] = [];

  for (const item of items) {
    const key = buildContextKey(item);
    const prior = seen.get(key);
    if (prior) {
      removed.push(item);
      continue;
    }
    seen.set(key, item);
  }

  if (removed.length > 0) {
    warnings.push(`Removed ${removed.length} duplicate line(s) sharing context key`);
  }

  return { kept: [...seen.values()], removed, warnings };
}
