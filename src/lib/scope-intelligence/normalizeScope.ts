import type { RawParsedLine } from "./types";

export interface NormalizedScopeLine {
  description: string;
  value: number | null;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  section: string | null;
  serviceType: string | null;
  rawText: string | null;
}

function safeString(v: unknown): string {
  if (v == null) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function safeMoney(v: unknown): number | null {
  if (v == null || v === "") return null;
  const s = String(v).replace(/[$,\u00a0\s]/g, "").replace(/NZD/gi, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function safeNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function resolveValue(line: RawParsedLine): number | null {
  const candidates = [line.total, line.total_price, line.amount];
  for (const c of candidates) {
    const v = safeMoney(c);
    if (v !== null && v !== 0) return v;
  }

  const qty = safeNumber(line.qty);
  const rate = safeMoney(line.rate);
  if (qty !== null && rate !== null && qty > 0 && rate > 0) {
    return parseFloat((qty * rate).toFixed(2));
  }

  return null;
}

export function normalizeScopeLine(line: RawParsedLine): NormalizedScopeLine {
  return {
    description: safeString(line.description),
    value: resolveValue(line),
    qty: safeNumber(line.qty),
    unit: safeString(line.unit) || null,
    rate: safeMoney(line.rate),
    section: safeString(line.section) || null,
    serviceType: safeString(line.service_type) || null,
    rawText: safeString(line.raw_text) || null,
  };
}

export function normalizeScopeLines(lines: unknown[]): NormalizedScopeLine[] {
  if (!Array.isArray(lines)) return [];
  return lines.map(l => {
    try {
      return normalizeScopeLine(l as RawParsedLine);
    } catch {
      return {
        description: "",
        value: null,
        qty: null,
        unit: null,
        rate: null,
        section: null,
        serviceType: null,
        rawText: null,
      };
    }
  });
}
