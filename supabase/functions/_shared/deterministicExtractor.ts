/**
 * V5 Deterministic Line Item Extractor
 * Extracts candidate line items using regex patterns BEFORE GPT
 * This catches structured table rows that GPT might miss
 */

export interface LineCandidate {
  raw_text: string;
  description: string;
  qty?: number;
  unit?: string;
  rate?: number;
  total: number;
  confidence: 'high' | 'medium' | 'low';
  page?: number;
}

/**
 * Extract line item candidates from text using deterministic patterns
 */
export function extractCandidates(text: string, pageNumber?: number): LineCandidate[] {
  const candidates: LineCandidate[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip obvious headers/summaries
    if (isSkipLine(line)) continue;

    // Pattern 1: Itemised line (qty + unit + rate + total)
    // Example: "50 ea $120.50 $6,025.00"
    const itemisedMatch = line.match(
      /^(.*?)\s+(\d+(?:\.\d+)?)\s+(ea|each|m|lm|hr|hrs|day|days|sqm|set|item|no|nr|lot)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)$/i
    );

    if (itemisedMatch) {
      const [, desc, qty, unit, rate, total] = itemisedMatch;
      candidates.push({
        raw_text: line,
        description: desc.trim(),
        qty: parseFloat(qty),
        unit: unit,
        rate: parseMoney(rate),
        total: parseMoney(total),
        confidence: 'high',
        page: pageNumber,
      });
      continue;
    }

    // Pattern 2: Itemised without explicit unit (qty + rate + total)
    // Example: "Acoustic panel 25 $45.00 $1,125.00"
    const itemisedNoUnitMatch = line.match(
      /^(.*?)\s+(\d+(?:\.\d+)?)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)$/
    );

    if (itemisedNoUnitMatch) {
      const [, desc, qty, rate, total] = itemisedNoUnitMatch;
      const totalNum = parseMoney(total);
      const qtyNum = parseFloat(qty);
      const rateNum = parseMoney(rate);

      // Validate: qty * rate should roughly equal total
      if (Math.abs(qtyNum * rateNum - totalNum) / totalNum < 0.05) {
        candidates.push({
          raw_text: line,
          description: desc.trim(),
          qty: qtyNum,
          rate: rateNum,
          total: totalNum,
          confidence: 'high',
          page: pageNumber,
        });
        continue;
      }
    }

    // Pattern 3: Lump sum / service (description + total only)
    // Example: "Supply and install fire system $25,000.00"
    // Must end with money and not be a summary
    const lumpSumMatch = line.match(/^(.+?)\s+\$?([\d,]+\.\d{2})$/);

    if (lumpSumMatch) {
      const [, desc, total] = lumpSumMatch;
      const description = desc.trim();

      // Must have reasonable description (not just a category)
      if (description.length > 15 && !isSummaryLine(description)) {
        candidates.push({
          raw_text: line,
          description,
          qty: 1,
          unit: 'LS',
          total: parseMoney(total),
          confidence: 'medium',
          page: pageNumber,
        });
        continue;
      }
    }

    // Pattern 4: Table row where numbers are on next line
    // Example:
    // "Ryanbatt 502, Servowrap & Mastic (Cable Bundle)"
    // "100mm Heritage Concrete Wall (120)/120/120 2 ea $215.00 $430.00"
    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const multiLineMatch = nextLine.match(
        /^.*?\s+(\d+(?:\.\d+)?)\s+(ea|m|lm|hr|lot|ls)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)$/i
      );

      if (multiLineMatch && line.length > 10 && !line.match(/\$[\d,]/)) {
        const [, qty, unit, rate, total] = multiLineMatch;
        candidates.push({
          raw_text: `${line} ${nextLine}`,
          description: line,
          qty: parseFloat(qty),
          unit,
          rate: parseMoney(rate),
          total: parseMoney(total),
          confidence: 'high',
          page: pageNumber,
        });
        i++; // Skip next line since we consumed it
        continue;
      }
    }
  }

  return candidates;
}

/**
 * Check if line should be skipped (headers, summaries, etc.)
 */
function isSkipLine(line: string): boolean {
  const lower = line.toLowerCase();

  // Skip headers
  if (lower.match(/^(description|item|qty|quantity|unit|rate|total|amount|line\s*id)/)) {
    return true;
  }

  // Skip page numbers
  if (lower.match(/^page\s+\d+/)) {
    return true;
  }

  // Skip very short lines
  if (line.length < 5) {
    return true;
  }

  return false;
}

/**
 * Check if description looks like a summary/subtotal line
 */
function isSummaryLine(desc: string): boolean {
  const lower = desc.toLowerCase();

  const summaryKeywords = [
    'subtotal', 'sub-total', 'sub total',
    'total', 'grand total',
    'p&g', 'ps3', 'margin',
    'gst', 'tax', 'vat',
    'please note', 'exclusions',
  ];

  for (const keyword of summaryKeywords) {
    if (lower.includes(keyword)) return true;
  }

  // Check for section header format: "Electrical $xxx"
  if (lower.match(/^[a-z][a-z\s&-]{2,30}\s*\$/)) {
    return true;
  }

  return false;
}

/**
 * Parse monetary string to number
 */
function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Merge GPT results with deterministic candidates
 * Deterministic candidates have priority for exact matches
 */
export function mergeCandidatesWithGPT(
  candidates: LineCandidate[],
  gptItems: any[]
): any[] {
  const merged = [...candidates];

  // Add GPT items that aren't already in candidates
  for (const gptItem of gptItems) {
    const isDuplicate = candidates.some(c =>
      Math.abs(c.total - (gptItem.total || 0)) < 0.01 &&
      normalizeDesc(c.description) === normalizeDesc(gptItem.description)
    );

    if (!isDuplicate) {
      merged.push(gptItem);
    }
  }

  return merged;
}

function normalizeDesc(desc: string): string {
  return desc.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 50);
}
