/**
 * extractAuthoritativeTotalsFromText — deterministic, regex-based pass that
 * pulls the authoritative MAIN-scope and OPTIONAL-scope totals (excl GST)
 * directly from the raw quote text BEFORE any LLM scope segmentation runs.
 *
 * The Scope Segmentation Engine's Layer 4 (totals reconciliation) is
 * disabled when both totals are null. By extracting them up-front we let
 * Layer 4 reconcile mis-tagged rows against a known authoritative envelope.
 *
 * This helper is intentionally conservative: it only emits a value when a
 * known label pattern is matched on the same line as a currency amount.
 * When in doubt it returns null — better to leave reconciliation off than
 * feed the engine a wrong anchor.
 */

export type AuthoritativeTotals = {
  main_total: number | null;
  optional_total: number | null;
  excluded_total: number | null;
  main_label: string | null;
  optional_label: string | null;
  source: "deterministic_text_extractor";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  matches: Array<{ label: string; value: number; line_snippet: string }>;
};

const CURRENCY_RE =
  /\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/;

const MAIN_PATTERNS: RegExp[] = [
  /grand\s*total\s*(?:\(\s*excl(?:uding)?\.?\s*gst\s*\)|excl(?:uding)?\.?\s*gst|ex(?:cl)?\.?\s*gst)/i,
  /total\s*(?:price\s*)?excl(?:uding)?\.?\s*gst/i,
  /sub[-\s]*total\s*excl(?:uding)?\.?\s*gst/i,
  /quote\s*total\s*excl(?:uding)?\.?\s*gst/i,
  /tender\s*total\s*excl(?:uding)?\.?\s*gst/i,
  /total\s*tender\s*price\s*excl(?:uding)?\.?\s*gst/i,
  /contract\s*sum\s*excl(?:uding)?\.?\s*gst/i,
  /total\s*lump\s*sum\s*excl(?:uding)?\.?\s*gst/i,
];

const OPTIONAL_PATTERNS: RegExp[] = [
  /optional\s*scope[^\n$]{0,80}?(?:total|sum|amount|price)?\s*(?:\(\s*excl(?:uding)?\.?\s*gst\s*\))?/i,
  /add\s*to\s*scope[^\n$]{0,80}?(?:total|sum|amount|price)?/i,
  /optional\s*items?\s*total/i,
  /total\s*optional/i,
  /optional\s*scope\s*\(confirmation\s*required\)/i,
  /provisional\s*sum[s]?\s*total/i,
];

const EXCLUDED_PATTERNS: RegExp[] = [
  /total\s*excluded/i,
  /excluded\s*items?\s*total/i,
];

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").replace(/[$\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function matchOnLine(line: string, patterns: RegExp[]): { label: string; value: number } | null {
  for (const p of patterns) {
    const labelMatch = line.match(p);
    if (!labelMatch) continue;
    // Find a currency value AFTER the label match on the same line.
    const tail = line.slice(labelMatch.index! + labelMatch[0].length);
    const valMatch = tail.match(CURRENCY_RE);
    if (!valMatch) continue;
    const value = parseMoney(valMatch[1]);
    if (value == null || value <= 0) continue;
    return { label: labelMatch[0].trim(), value };
  }
  return null;
}

export function extractAuthoritativeTotalsFromText(rawText: string): AuthoritativeTotals {
  const lines = rawText.split(/\r?\n/);
  const matches: Array<{ label: string; value: number; line_snippet: string; bucket: "main" | "optional" | "excluded" }> = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const main = matchOnLine(line, MAIN_PATTERNS);
    if (main) {
      matches.push({ ...main, line_snippet: line.slice(0, 160), bucket: "main" });
      continue;
    }
    const opt = matchOnLine(line, OPTIONAL_PATTERNS);
    if (opt) {
      matches.push({ ...opt, line_snippet: line.slice(0, 160), bucket: "optional" });
      continue;
    }
    const exc = matchOnLine(line, EXCLUDED_PATTERNS);
    if (exc) {
      matches.push({ ...exc, line_snippet: line.slice(0, 160), bucket: "excluded" });
    }
  }

  const mainCandidates = matches.filter((m) => m.bucket === "main");
  const optionalCandidates = matches.filter((m) => m.bucket === "optional");
  const excludedCandidates = matches.filter((m) => m.bucket === "excluded");

  const pickLargest = (arr: typeof matches) =>
    arr.length === 0 ? null : arr.reduce((best, cur) => (cur.value > best.value ? cur : best));

  const mainPick = pickLargest(mainCandidates);
  const optionalPick = pickLargest(optionalCandidates);
  const excludedPick = pickLargest(excludedCandidates);

  let confidence: AuthoritativeTotals["confidence"] = "LOW";
  if (mainPick && optionalPick) confidence = "HIGH";
  else if (mainPick) confidence = "MEDIUM";

  return {
    main_total: mainPick?.value ?? null,
    optional_total: optionalPick?.value ?? null,
    excluded_total: excludedPick?.value ?? null,
    main_label: mainPick?.label ?? null,
    optional_label: optionalPick?.label ?? null,
    source: "deterministic_text_extractor",
    confidence,
    matches: matches.map(({ label, value, line_snippet }) => ({ label, value, line_snippet })),
  };
}
