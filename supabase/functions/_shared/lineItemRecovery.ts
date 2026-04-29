/**
 * Stage 7.5 — Line Item Recovery Engine.
 *
 * Hidden, opt-out fallback that activates ONLY when Stage 7 returns zero or
 * unusably low-quality rows. When Stage 7 is healthy, this function returns
 * the original items unchanged.
 *
 * Toggle via ENABLE_STAGE_75_RECOVERY (env). Default: enabled.
 */

export const STAGE_75_VERSION = "stage_75_recovery_v1";

export type RecoverableItem = {
  line_id?: number | string;
  item_number?: string | null;
  description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  total_price?: number | null;
  value?: number;
  scope_category?: "main" | "optional" | "excluded";
  trade?: string;
  sub_scope?: string | null;
  frr?: string | null;
  source?: string;
  confidence?: number;
  recovered?: boolean;
  source_section?: string | null;
  source_page?: number | null;
  building_or_block?: string | null;
  [key: string]: unknown;
};

export type RecoveryInput = {
  extractedLineItems: RecoverableItem[];
  rawText?: string;
  structuredData?: unknown;
  documentClass?: string;
  debug?: boolean;
};

export type RecoveryDebug = {
  activated: boolean;
  reason: string;
  original_row_count: number;
  recovered_row_count: number;
  recovery_confidence_avg: number;
  main_count: number;
  optional_count: number;
  excluded_count: number;
  markers_found: string[];
  flag_enabled: boolean;
};

export type RecoveryResult = {
  items: RecoverableItem[];
  debug: RecoveryDebug;
};

const MAIN_BIAS_TERMS = [
  "electrical", "hydraulics", "hydraulic", "plumbing", "fire protection",
  "fire", "mechanical", "hvac", "services", "penetration", "cable",
  "pipe", "conduit", "duct",
];

const OPTIONAL_BIAS_TERMS = [
  "optional scope", "optional extras", "optional extra", "add to scope",
  "flush box", "putty pad", "architectural", "structural", "beam",
  "steel", "cavity barrier", "slab edge",
];

const EXCLUSION_TERMS = [
  "by others", "excluded", "not included", "nic", "no allowance",
];

const BLOCK_HEADER_RE = /\b(?:BLOCK\s+B?\d{1,3}|B\d{1,3})\b/i;
const OPTIONAL_HEADER_RE = /\bOPTIONAL\s+(?:SCOPE|EXTRAS?)\b/i;

const MONEY_RE = /\$?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/;

function flagEnabled(): boolean {
  try {
    const raw = (globalThis as { Deno?: { env?: { get: (k: string) => string | undefined } } })
      .Deno?.env?.get?.("ENABLE_STAGE_75_RECOVERY");
    if (raw == null) return true;
    const v = String(raw).trim().toLowerCase();
    return !(v === "false" || v === "0" || v === "no" || v === "off");
  } catch {
    return true;
  }
}

function parseMoney(s: string): number | null {
  const m = s.match(MONEY_RE);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function containsAny(lower: string, terms: string[]): string | null {
  for (const t of terms) if (lower.includes(t)) return t;
  return null;
}

function rowValue(r: RecoverableItem): number {
  const v = r.total_price ?? r.value ?? 0;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function rowDescription(r: RecoverableItem): string {
  return String(r.description ?? "").trim();
}

/**
 * Quality gate: decides whether Stage 7.5 should try to recover.
 */
function needsRecovery(items: RecoverableItem[], rawText: string): { needed: boolean; reason: string } {
  if (items.length === 0) return { needed: true, reason: "zero_rows" };

  const missingValues = items.filter((r) => rowValue(r) === 0).length;
  const missingDesc = items.filter((r) => rowDescription(r).length === 0).length;
  const totalValue = items.reduce((s, r) => s + rowValue(r), 0);
  const hasCurrencyInText = MONEY_RE.test(rawText ?? "");

  if (missingValues / items.length > 0.8) {
    return { needed: true, reason: "over_80pct_missing_values" };
  }
  if (missingDesc / items.length > 0.8) {
    return { needed: true, reason: "over_80pct_missing_descriptions" };
  }
  if (totalValue === 0 && hasCurrencyInText) {
    return { needed: true, reason: "zero_total_but_currency_in_text" };
  }
  return { needed: false, reason: "stage7_healthy" };
}

/**
 * Recover rows from rawText: scan line-by-line, detect description + amount,
 * carry active scope based on section headers / block resets.
 */
function recoverFromText(rawText: string, markersFound: Set<string>): RecoverableItem[] {
  const out: RecoverableItem[] = [];
  if (!rawText) return out;

  const lines = rawText.split(/\r?\n/);
  let activeScope: "main" | "optional" | "excluded" = "main";
  let activeBlock = "";
  let sequential = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;

    const upper = line.toUpperCase();
    const lower = line.toLowerCase();

    const blockMatch = upper.match(BLOCK_HEADER_RE);
    if (blockMatch) {
      const b = blockMatch[0].toUpperCase();
      if (b !== activeBlock) {
        activeBlock = b;
        activeScope = "main";
        markersFound.add(`BLOCK_RESET:${b}`);
      }
    }

    if (OPTIONAL_HEADER_RE.test(upper)) {
      activeScope = "optional";
      markersFound.add("OPTIONAL_SCOPE");
    }

    const exclusion = containsAny(lower, EXCLUSION_TERMS);
    const optionalTerm = containsAny(lower, OPTIONAL_BIAS_TERMS);
    const mainTerm = containsAny(lower, MAIN_BIAS_TERMS);

    const amount = parseMoney(line);
    if (amount == null || amount === 0) continue;

    const hasDescriptor = mainTerm || optionalTerm || exclusion ||
      /[a-zA-Z]{3,}/.test(line.replace(MONEY_RE, ""));
    if (!hasDescriptor) continue;

    const descriptionText = line
      .replace(/\s*\$?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s*$/, "")
      .trim();
    if (descriptionText.length < 3) continue;

    let scope: "main" | "optional" | "excluded" = activeScope;
    let confidence = 0.75;

    if (exclusion) {
      scope = "excluded";
      confidence = 0.9;
      markersFound.add(`EXCLUSION:${exclusion}`);
    } else if (optionalTerm || activeScope === "optional") {
      scope = "optional";
      confidence = optionalTerm ? 0.88 : 0.8;
      if (optionalTerm) markersFound.add(`OPTIONAL_TERM:${optionalTerm}`);
    } else if (mainTerm) {
      scope = "main";
      confidence = 0.85;
      markersFound.add(`MAIN_TERM:${mainTerm}`);
    }

    sequential++;
    out.push({
      line_id: sequential,
      item_number: String(sequential),
      description: descriptionText,
      quantity: null,
      unit: null,
      unit_price: null,
      total_price: amount,
      value: amount,
      scope_category: scope,
      trade: "passive_fire",
      sub_scope: null,
      frr: null,
      source: "recovered",
      confidence,
      recovered: true,
      source_section: activeBlock || null,
      source_page: null,
      building_or_block: activeBlock || null,
    });
  }

  return out;
}

/**
 * Entry point. If extractedLineItems is healthy, returns it unchanged.
 * Otherwise recovers rows from rawText / structuredData.
 */
export async function recoverLineItemsIfNeeded(
  params: RecoveryInput,
): Promise<RecoveryResult> {
  const {
    extractedLineItems,
    rawText = "",
    debug = false,
  } = params;

  const enabled = flagEnabled();
  const original = Array.isArray(extractedLineItems) ? extractedLineItems : [];

  const base: RecoveryDebug = {
    activated: false,
    reason: "not_evaluated",
    original_row_count: original.length,
    recovered_row_count: 0,
    recovery_confidence_avg: 0,
    main_count: original.filter((r) => r.scope_category === "main").length,
    optional_count: original.filter((r) => r.scope_category === "optional").length,
    excluded_count: original.filter((r) => r.scope_category === "excluded").length,
    markers_found: [],
    flag_enabled: enabled,
  };

  if (!enabled) {
    base.reason = "flag_disabled";
    if (debug) logDebug(base);
    return { items: original, debug: base };
  }

  const gate = needsRecovery(original, rawText);
  base.reason = gate.reason;
  if (!gate.needed) {
    if (debug) logDebug(base);
    return { items: original, debug: base };
  }

  const markers = new Set<string>();
  const recovered = recoverFromText(rawText, markers);

  base.activated = true;
  base.recovered_row_count = recovered.length;
  base.markers_found = [...markers];
  base.main_count = recovered.filter((r) => r.scope_category === "main").length;
  base.optional_count = recovered.filter((r) => r.scope_category === "optional").length;
  base.excluded_count = recovered.filter((r) => r.scope_category === "excluded").length;
  base.recovery_confidence_avg = recovered.length
    ? Number(
        (recovered.reduce((s, r) => s + (r.confidence ?? 0), 0) / recovered.length).toFixed(3),
      )
    : 0;

  if (debug) logDebug(base);

  if (recovered.length === 0) {
    return { items: original, debug: base };
  }
  return { items: recovered, debug: base };
}

function logDebug(d: RecoveryDebug): void {
  console.log(
    `[stage_7_5] activated=${d.activated} reason=${d.reason} ` +
      `original=${d.original_row_count} recovered=${d.recovered_row_count} ` +
      `avg_conf=${d.recovery_confidence_avg} main=${d.main_count} ` +
      `optional=${d.optional_count} excluded=${d.excluded_count} ` +
      `flag=${d.flag_enabled} markers=${d.markers_found.join("|")}`,
  );
}
