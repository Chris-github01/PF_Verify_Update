import { Unit } from "./types";
import { UNIT_MAP, SYSTEM_MAP } from "./normalization";

export const moneyToNum = (s?: string | null) => {
  if (!s) return undefined;

  let cleaned = s.replace(/[$\s]/g, '');

  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length === 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }

  const num = Number(cleaned);
  return isNaN(num) ? undefined : num;
};

export function normalizeUnit(raw: string): Unit {
  const key = raw.trim().toLowerCase();
  return UNIT_MAP[key] ?? "unknown";
}

export function extractMoneyTail(line: string): { rate?: number; total?: number } {
  const matches = [...line.matchAll(/\$?\s*([\d,\s]+[.,]\d{2})/g)].map(m => moneyToNum(m[1]));
  if (matches.length >= 2) return { rate: matches[matches.length - 2], total: matches[matches.length - 1] };
  if (matches.length === 1) return { total: matches[0] };
  return {};
}

export function normalizeSystems(text: string): string[] {
  const t = text.toLowerCase();
  const tags = new Set<string>();
  for (const [k, v] of Object.entries(SYSTEM_MAP)) {
    if (t.includes(k)) tags.add(v);
  }
  return [...tags];
}
