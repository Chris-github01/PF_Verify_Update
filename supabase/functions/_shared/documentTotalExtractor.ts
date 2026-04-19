/**
 * Document Total Extractor
 *
 * Extracts authoritative totals from raw PDF text BEFORE any row filtering.
 * Distinguishes grand total, subtotals, QA totals, optional scope totals, and block totals.
 *
 * Supports:
 *   - label before amount (standard)
 *   - amount before label (reversed columns)
 *   - nearby label-value matching on same PDF page
 *   - spaced digit amounts (PDF kerning artifacts)
 *
 * Priority for hybrid quotes:
 *   grand_total > subtotal + qa_total > row_sum
 */

export interface DocumentTotals {
  grandTotal: number | null;
  subTotal: number | null;
  qaTotal: number | null;
  optionalTotal: number | null;
  blockTotals: Array<{ label: string; value: number }>;
}

function parseSpacedAmount(raw: string): number {
  const noCommas = raw.replace(/,/g, '');
  const tokens = noCommas.trim().split(/\s+/).filter(t => /^\d+(\.\d+)?$/.test(t));
  if (tokens.length === 0) return 0;
  const merged = tokens.join('');
  const val = parseFloat(merged);
  return Number.isFinite(val) ? val : 0;
}

function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, '');
  const v = parseFloat(cleaned);
  return isNaN(v) ? 0 : v;
}

function flattenText(text: string): string {
  return text
    .replace(/\u00A0/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Grand Total patterns — label before amount (forward)
// IMPORTANT: Capture group must be tight — only digits/commas/dot, no spaces,
// to prevent parseSpacedAmount from greedily consuming adjacent amounts on the
// same flattened line.  Spaced-thousands (OCR artifact) are handled by a
// secondary spaced-digit variant appended below.
// ---------------------------------------------------------------------------
const GRAND_TOTAL_FWD_PATTERNS: RegExp[] = [
  // Strict: label + optional whitespace + $ + amount (no space between digits)
  /Grand\s+Total\s*\(\s*excl(?:uding)?\.?\s*(?:of\s+)?GST\s*\)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Grand\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /TOTAL\s*\(\s*excl(?:uding)?\.?\s*(?:of\s+)?GST\s*\)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Total\s+Price\s*\(\s*excl(?:uding)?\.?\s*(?:of\s+)?GST\s*\)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Contract\s+(?:Sum|Total|Price|Value)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Quote\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Lump\s+Sum\s+(?:Total\s+)?:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Net\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Tender\s+(?:Sum|Total)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Total\s+(?:excl(?:uding)?\.?\s*(?:of\s+)?GST)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Total\s+Ex\.?\s*GST\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Total\s+Excluding\s+GST\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  // Spaced-thousands OCR variant: digits may have a space as thousands separator
  // e.g. "59 278.75".  Only allow a single internal space (not free-form).
  /Grand\s+Total\s*\(\s*excl(?:uding)?\.?\s*(?:of\s+)?GST\s*\)\s*:?\s*\$?\s*([\d]{1,3}\s[\d]{3}\.\d{2})/i,
  /Grand\s+Total\s*:?\s*\$?\s*([\d]{1,3}\s[\d]{3}\.\d{2})/i,
];

// ---------------------------------------------------------------------------
// Grand Total patterns — amount before label (reversed column order)
// ---------------------------------------------------------------------------
const GRAND_TOTAL_REV_PATTERNS: RegExp[] = [
  /\$?\s*([\d][\d\s,]*\.\d{2})\s+Grand\s+Total/i,
  /\$?\s*([\d][\d\s,]*\.\d{2})\s+Contract\s+(?:Sum|Total|Price)/i,
  /\$?\s*([\d][\d\s,]*\.\d{2})\s+Total\s*\(\s*excl/i,
  /\$?\s*([\d][\d\s,]*\.\d{2})\s+Net\s+Total/i,
];

// ---------------------------------------------------------------------------
// Sub-total patterns
// ---------------------------------------------------------------------------
const SUB_TOTAL_FWD_PATTERNS: RegExp[] = [
  /Sub[-\s]?Total\s*\([^)]{0,80}\)\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /Sub[-\s]?Total\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /Section\s+Total\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
];

const SUB_TOTAL_REV_PATTERNS: RegExp[] = [
  /\$?\s*([\d][\d\s,]*\.\d{2})\s+Sub[-\s]?Total/i,
];

// ---------------------------------------------------------------------------
// QA / PS3 patterns — part of the main scope total build-up
// ---------------------------------------------------------------------------
const QA_TOTAL_PATTERNS: RegExp[] = [
  /(?:PS3\s*&\s*QA|QA\s*(?:&\s*PS3)?|Quality\s+Assurance|Preliminary\s+(?:Sums?|Works?))\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /\$?\s*([\d][\d\s,]*\.\d{2})\s+(?:PS3\s*&\s*QA|Quality\s+Assurance)/i,
];

// ---------------------------------------------------------------------------
// Optional scope patterns
// ---------------------------------------------------------------------------
const OPTIONAL_SCOPE_FWD_PATTERNS: RegExp[] = [
  /OPTIONAL\s+SCOPE\s+(?:TOTAL|ITEMS?)\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /ADD\s+TO\s+SCOPE\s+(?:TOTAL)?\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /OPTIONAL\s+ITEMS?\s+TOTAL\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /OPTIONAL\s+(?:ITEMS?|WORKS?|SCOPE)\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /Items?\s+with\s+Confirmation\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
];

const OPTIONAL_SCOPE_REV_PATTERNS: RegExp[] = [
  /\$?\s*([\d][\d\s,]*\.\d{2})\s+(?:OPTIONAL\s+SCOPE|ADD\s+TO\s+SCOPE|Items?\s+with\s+Confirmation)/i,
];

// ---------------------------------------------------------------------------
// Block total patterns
// ---------------------------------------------------------------------------
const BLOCK_TOTAL_PATTERNS: RegExp[] = [
  /((?:BLOCK|LEVEL|ZONE|STAGE|BUILDING|AREA|LOT)\s+[A-Z0-9]{1,5})\s+(?:TOTAL|SUB[-\s]?TOTAL)\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
];

// ---------------------------------------------------------------------------
// Proximity search — for PDFs where label and amount are on adjacent lines.
// FORWARD-ONLY for grand totals: never look backward.  Backward search risks
// picking up an unrelated amount that appears above the label (e.g. a block
// total from earlier in the document).
// ---------------------------------------------------------------------------
function proximitySearch(
  lines: string[],
  labelRe: RegExp,
  windowLines = 2,
  allowBackward = false,
): number | null {
  // Tight money pattern — no spaced-thousands here to avoid false matches
  const AMOUNT_RE = /\$?\s*([\d,]+\.\d{2})/;
  for (let i = 0; i < lines.length; i++) {
    if (!labelRe.test(lines[i])) continue;

    // Same-line amount takes highest priority
    const sameLine = lines[i].match(AMOUNT_RE);
    if (sameLine) {
      const v = parseMoney(sameLine[1]);
      if (v > 100) return v;
    }

    // Forward window (next 1-2 lines)
    for (let j = i + 1; j <= Math.min(i + windowLines, lines.length - 1); j++) {
      const m = lines[j].match(AMOUNT_RE);
      if (m) {
        const v = parseMoney(m[1]);
        if (v > 100) return v;
      }
    }

    // Backward window — only used for non-grand-total fields like subtotals
    if (allowBackward) {
      for (let j = i - 1; j >= Math.max(i - windowLines, 0); j--) {
        const m = lines[j].match(AMOUNT_RE);
        if (m) {
          const v = parseMoney(m[1]);
          if (v > 100) return v;
        }
      }
    }
  }
  return null;
}

function firstMatch(flat: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = flat.match(pattern);
    if (match) {
      const captureIdx = match.length - 1;
      const amount = parseSpacedAmount(match[captureIdx]);
      if (amount > 100) return amount;
    }
  }
  return null;
}

function allMatchValues(flat: string, patterns: RegExp[]): number[] {
  const results: number[] = [];
  for (const pattern of patterns) {
    const gp = new RegExp(pattern.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = gp.exec(flat)) !== null) {
      const captureIdx = m.length - 1;
      const amount = parseSpacedAmount(m[captureIdx]);
      if (amount > 100) results.push(amount);
    }
  }
  return results;
}

export function extractDocumentTotals(rawText: string): DocumentTotals {
  const flat = flattenText(rawText);
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // --- Grand Total (forward-only proximity — never look backward) ---
  let grandTotal = firstMatch(flat, GRAND_TOTAL_FWD_PATTERNS);
  if (!grandTotal) grandTotal = firstMatch(flat, GRAND_TOTAL_REV_PATTERNS);
  if (!grandTotal) {
    grandTotal = proximitySearch(
      lines,
      /Grand\s+Total|Contract\s+(?:Sum|Total)|Total\s+excl|Total\s+Ex\.?\s*GST|Total\s+Excluding\s+GST/i,
      2,
      false, // forward-only — no backward scan for grand total
    );
  }

  // --- Sub Total (take SMALLEST non-zero to avoid block totals polluting) ---
  // Block totals and section subtotals can be large; the true commercial subtotal
  // is usually the smallest one on the summary page.
  const subTotalMatches = [
    ...allMatchValues(flat, SUB_TOTAL_FWD_PATTERNS),
    ...allMatchValues(flat, SUB_TOTAL_REV_PATTERNS),
  ].filter(v => v > 100);
  const subTotal = subTotalMatches.length > 0
    ? subTotalMatches.reduce((a, b) => a < b ? a : b)
    : null;

  // --- QA / PS3 Total ---
  let qaTotal = firstMatch(flat, QA_TOTAL_PATTERNS);
  if (!qaTotal) {
    qaTotal = proximitySearch(lines, /PS3\s*&\s*QA|Quality\s+Assurance/i, 2, true);
  }

  // --- Optional Total (forward-only proximity) ---
  let optionalTotal = firstMatch(flat, OPTIONAL_SCOPE_FWD_PATTERNS);
  if (!optionalTotal) optionalTotal = firstMatch(flat, OPTIONAL_SCOPE_REV_PATTERNS);
  if (!optionalTotal) {
    optionalTotal = proximitySearch(
      lines,
      /OPTIONAL\s+SCOPE|ADD\s+TO\s+SCOPE|Items?\s+with\s+Confirmation/i,
      2,
      false,
    );
  }

  // --- Block Totals ---
  const blockTotals: Array<{ label: string; value: number }> = [];
  for (const pattern of BLOCK_TOTAL_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = globalPattern.exec(flat)) !== null) {
      const label = match[1].trim();
      const value = parseSpacedAmount(match[2]);
      if (value > 100) blockTotals.push({ label, value });
    }
  }

  console.log(`[DocTotalExtractor] grandTotal=${grandTotal} subTotal=${subTotal} qaTotal=${qaTotal} optionalTotal=${optionalTotal} blockTotals=${blockTotals.length}`);

  return { grandTotal, subTotal, qaTotal, optionalTotal, blockTotals };
}
