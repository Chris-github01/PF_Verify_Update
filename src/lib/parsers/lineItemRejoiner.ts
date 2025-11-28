/**
 * Line Item Re-joining Logic
 *
 * Handles quotes where a single item wraps across 2-4 lines with no clear delimiter.
 * Rule: If line starts with lowercase OR has no quantity → append to previous line
 */

export interface ParsedLine {
  description?: string;
  qty?: number | string;
  unit?: string;
  rate?: number | string;
  total?: number | string;
  [key: string]: any;
}

/**
 * Check if a line is likely a continuation of the previous line
 */
function isContinuationLine(line: ParsedLine): boolean {
  const desc = line.description?.trim() || '';

  // No description at all
  if (!desc) {
    return true;
  }

  // Starts with lowercase (except common abbreviations)
  const firstChar = desc.charAt(0);
  if (firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase()) {
    // Check it's not a unit or abbreviation
    const commonAbbrev = /^(mm|cm|m²|m2|ea|nr|kg|hr|etc|incl?\.)/i;
    if (!commonAbbrev.test(desc)) {
      return true;
    }
  }

  // Has description but no quantity/total (likely a continuation)
  const hasNumbers = line.qty || line.total || line.rate;
  if (desc.length > 0 && !hasNumbers) {
    // Exception: If it's a section header or category, don't merge
    const sectionHeader = /^(group|section|category|part|schedule)\s+[\d.]+/i;
    if (sectionHeader.test(desc)) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Re-join line items that have been split across multiple lines
 */
export function rejoinLineItems(lines: ParsedLine[]): ParsedLine[] {
  if (lines.length === 0) {
    return lines;
  }

  const rejoined: ParsedLine[] = [];
  let current: ParsedLine | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isContinuationLine(line)) {
      // Append to current line
      if (current) {
        const continuationText = line.description?.trim() || '';
        if (continuationText) {
          current.description = `${current.description || ''} ${continuationText}`.trim();
        }
        // If continuation line has numbers that current doesn't, use them
        if (!current.qty && line.qty) current.qty = line.qty;
        if (!current.unit && line.unit) current.unit = line.unit;
        if (!current.rate && line.rate) current.rate = line.rate;
        if (!current.total && line.total) current.total = line.total;
      } else {
        // No current line to append to, skip this orphan
        console.warn('[Rejoin] Orphan continuation line:', line.description);
      }
    } else {
      // Start a new line item
      if (current) {
        rejoined.push(current);
      }
      current = { ...line };
    }
  }

  // Don't forget the last item
  if (current) {
    rejoined.push(current);
  }

  const merged = lines.length - rejoined.length;
  if (merged > 0) {
    console.log(`[Rejoin] Merged ${merged} continuation lines into complete items`);
  }

  return rejoined;
}

/**
 * Clean up descriptions after re-joining (remove extra spaces, normalize punctuation)
 */
export function cleanDescription(desc: string): string {
  return desc
    .replace(/\s+/g, ' ')           // Multiple spaces → single space
    .replace(/\s+([.,;:])/g, '$1')  // Space before punctuation
    .replace(/([.,;:])\s+/g, '$1 ') // Ensure single space after punctuation
    .trim();
}

/**
 * Apply re-joining and cleaning in one pass
 */
export function processLineItems(lines: ParsedLine[]): ParsedLine[] {
  const rejoined = rejoinLineItems(lines);
  return rejoined.map(line => ({
    ...line,
    description: line.description ? cleanDescription(line.description) : line.description,
  }));
}
