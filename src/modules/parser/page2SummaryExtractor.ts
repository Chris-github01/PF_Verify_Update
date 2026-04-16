// =============================================================================
// PAGE 2 SUMMARY EXTRACTOR
//
// SOURCE OF TRUTH PRIORITY (new architecture):
//   1. Parse page 2 summary labels — these are the canonical totals
//   2. Row parsing (pages 4–8) is SECONDARY — used only for item counts,
//      trade/block breakdown, and validation
//   3. Main Scope card = Grand Total (excluding GST) from page 2 summary
//   4. Never derive Main Scope by summing schedule rows if summary exists
// =============================================================================

export interface Page2Summary {
  grand_total: number | null;
  subtotal: number | null;
  ps3_qa: number | null;
  optional_total: number | null;
  summary_detected: boolean;
  used_source: 'page2_summary' | 'row_fallback';
  raw_matches: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Patterns for each labelled summary line
// ---------------------------------------------------------------------------

const SUMMARY_PATTERNS: Array<{ key: keyof Omit<Page2Summary, 'summary_detected' | 'used_source' | 'raw_matches'>; re: RegExp }> = [
  {
    key: 'grand_total',
    re: /Grand\s+Total\s*\(excl(?:uding)?\.?\s*GST\)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  },
  {
    key: 'subtotal',
    re: /Sub[-\s]?Total\s*\(?incl\.?\s*of\s*Services?\s*penetrations?[^)]*\)?\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  },
  {
    key: 'ps3_qa',
    re: /PS3\s*[&+]\s*QA\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  },
  {
    key: 'optional_total',
    re: /ADD\s+TO\s+SCOPE\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  },
];

// Secondary patterns for grand total — broader fallbacks on same page
const GRAND_TOTAL_FALLBACKS: RegExp[] = [
  /Grand\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Contract\s+(?:Sum|Total|Price)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Quote\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /TOTAL\s*\(excl(?:uding)?\.?\s*GST\)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
];

function parseMoney(raw: string): number {
  const val = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(val) ? 0 : val;
}

// ---------------------------------------------------------------------------
// Core extractor — runs over a single page's text (collapsed whitespace)
// ---------------------------------------------------------------------------

function extractFromText(text: string): Page2Summary {
  const flat = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

  const result: Page2Summary = {
    grand_total: null,
    subtotal: null,
    ps3_qa: null,
    optional_total: null,
    summary_detected: false,
    used_source: 'row_fallback',
    raw_matches: {},
  };

  for (const { key, re } of SUMMARY_PATTERNS) {
    const m = flat.match(re);
    if (m) {
      const val = parseMoney(m[1]);
      if (val > 0) {
        (result as any)[key] = val;
        result.raw_matches[key] = m[0].trim();
      }
    }
  }

  // If primary grand_total pattern didn't fire, try fallbacks
  if (result.grand_total === null) {
    for (const re of GRAND_TOTAL_FALLBACKS) {
      const m = flat.match(re);
      if (m) {
        const val = parseMoney(m[1]);
        if (val > 0) {
          result.grand_total = val;
          result.raw_matches['grand_total_fallback'] = m[0].trim();
          break;
        }
      }
    }
  }

  // summary_detected = true if at least grand_total found
  if (result.grand_total !== null) {
    result.summary_detected = true;
    result.used_source = 'page2_summary';
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public: try page 2 first, then scan all pages if not found
// ---------------------------------------------------------------------------

export function extractPage2Summary(pages: string[]): Page2Summary {
  if (pages.length === 0) {
    return {
      grand_total: null, subtotal: null, ps3_qa: null, optional_total: null,
      summary_detected: false, used_source: 'row_fallback', raw_matches: {},
    };
  }

  // Try page 2 (index 1) first — this is where Summerset-style docs put the summary
  if (pages.length >= 2) {
    const p2 = extractFromText(pages[1]);
    if (p2.summary_detected) {
      console.log(`[Page2Summary] Found on page 2: grand_total=${p2.grand_total} subtotal=${p2.subtotal} ps3_qa=${p2.ps3_qa} optional_total=${p2.optional_total}`);
      return p2;
    }
  }

  // Try page 1
  const p1 = extractFromText(pages[0]);
  if (p1.summary_detected) {
    console.log(`[Page2Summary] Found on page 1: grand_total=${p1.grand_total}`);
    return p1;
  }

  // Scan all pages — return first hit
  for (let i = 2; i < pages.length; i++) {
    const px = extractFromText(pages[i]);
    if (px.summary_detected) {
      console.log(`[Page2Summary] Found on page ${i + 1}: grand_total=${px.grand_total}`);
      return px;
    }
  }

  console.warn('[Page2Summary] No summary page found — will fallback to row summation');
  return {
    grand_total: null, subtotal: null, ps3_qa: null, optional_total: null,
    summary_detected: false, used_source: 'row_fallback', raw_matches: {},
  };
}
