import type { TradeType } from "./types.ts";

export const PARSER_VERSION = "v2.0.0-2026-04-15";

export function parseMoney(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const cleaned = String(raw)
    .replace(/\u00A0/g, " ")
    .replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function cleanText(s: string): string {
  return s
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractDocumentTotal(text: string): number | null {
  const t = text.replace(/\u00A0/g, " ");

  const patterns = [
    /Grand\s+Total\s*\(excluding\s+GST\)\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /Grand\s+Total\s*\(excl\.?\s*GST\)\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /Grand\s+Total\s+excl\.?\s+GST\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /Grand\s+Total\s+ex\.?\s+GST\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /Grand\s+Total\s*:\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /Total\s+\(excl\.?\s*GST\)\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /Total\s+excluding\s+GST\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /\bTOTAL\s+COST\b\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /^TOTAL\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/im,
  ];

  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) {
      const raw = match[1].replace(/\s/g, "").replace(/,/g, "");
      const value = parseFloat(raw);
      if (value > 0 && Number.isFinite(value)) return value;
    }
  }

  return null;
}

export function detectTradeType(text: string): TradeType {
  const lower = text.toLowerCase();
  const counts: Record<TradeType, number> = {
    passive_fire: 0,
    plumbing: 0,
    electrical: 0,
    hvac: 0,
    active_fire: 0,
    carpentry: 0,
    unknown: 0,
  };

  const signals: Record<TradeType, string[]> = {
    passive_fire: [
      "fire stopping",
      "firestopping",
      "intumescent",
      "passive fire",
      "fire collar",
      "fire door",
      "frr",
      "fire rated",
      "penetration seal",
      "ablative",
      "promat",
      "hilti cp",
    ],
    plumbing: [
      "plumbing",
      "sanitary",
      "drainage",
      "hot water",
      "cold water",
      "copper pipe",
      "upvc",
      "pvc pipe",
      "valve",
      "cistern",
      "toilet",
      "basin",
      "shower",
    ],
    electrical: [
      "electrical",
      "conduit",
      "cable tray",
      "switchboard",
      "circuit breaker",
      "light fitting",
      "power outlet",
      "distribution board",
    ],
    hvac: [
      "hvac",
      "mechanical",
      "ductwork",
      "air conditioning",
      "ventilation",
      "fan coil",
      "chiller",
      "heat pump",
    ],
    active_fire: [
      "sprinkler",
      "fire suppression",
      "fire hydrant",
      "hose reel",
      "detection",
      "alarm",
      "active fire",
    ],
    carpentry: [
      "carpentry",
      "joinery",
      "door set",
      "skirting",
      "architrave",
      "wardrobe",
      "kitchen",
      "cabinetry",
      "timber",
    ],
    unknown: [],
  };

  for (const [trade, keywords] of Object.entries(signals) as [TradeType, string[]][]) {
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw.replace(/\s+/g, "\\s+")}\\b`, "gi");
      const matches = lower.match(regex);
      if (matches) counts[trade] += matches.length;
    }
  }

  let best: TradeType = "unknown";
  let bestScore = 0;
  for (const [trade, score] of Object.entries(counts) as [TradeType, number][]) {
    if (trade === "unknown") continue;
    if (score > bestScore) {
      bestScore = score;
      best = trade;
    }
  }

  return bestScore >= 2 ? best : "unknown";
}

export function isLumpSumPattern(line: string): boolean {
  const trimmed = line.trim();
  return /\b(lump\s*sum|l\.?s\.?|allow|pc\s+sum|provisional)\b/i.test(trimmed);
}

export function isSummaryLine(line: string): boolean {
  const lower = line.trim().toLowerCase();
  const patterns = [
    /^(sub)?total[\s:$]/i,
    /^grand\s+total/i,
    /^total\s+(ex|excl|excluding|incl|including)/i,
    /^carried\s+forward/i,
    /^brought\s+forward/i,
    /^amount\s+due/i,
    /^balance\s+(due|forward)/i,
    /^\s*gst\s*(\(|@|:)/i,
    /^tax\b/i,
    /^p\s*&\s*g\b/i,
    /^margin\b/i,
    /^overhead/i,
    /^profit\b/i,
    /^less\s+(discount|credit|retention)/i,
    /^summary\s*(of\s+)?costs?/i,
    /^total\s+(cost|price|amount)\s*:/i,
  ];
  return patterns.some((p) => p.test(lower));
}

export function extractFRR(description: string): string | null {
  const match = description.match(
    /\b(FRL|FRR)\s*[-–]?\s*([0-9]{1,3}\/[0-9]{1,3}\/[0-9]{1,3})\b/i
  );
  return match ? match[0].toUpperCase() : null;
}

export function dedupeKey(item: {
  description: string;
  qty: number;
  unit: string;
  rate: number;
}): string {
  return [
    item.description.toLowerCase().trim(),
    String(item.qty),
    (item.unit || "").toLowerCase().trim(),
    String(item.rate),
  ].join("|");
}

export function fuzzyDedupeKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .substring(0, 60);
}

export function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function mathCheck(
  qty: number,
  rate: number,
  total: number,
  tolerancePct = 0.02
): boolean {
  if (qty <= 0 || rate <= 0 || total <= 0) return false;
  const computed = qty * rate;
  const diff = Math.abs(computed - total);
  const tolerance = Math.max(0.5, total * tolerancePct);
  return diff <= tolerance;
}
