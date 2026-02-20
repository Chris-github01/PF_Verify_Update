/**
 * V5 Page-based Chunker with Overlap
 * Prevents cutting table rows in half by chunking on page boundaries
 */

export interface PageChunk {
  chunk_number: number;
  page_start: number;
  page_end: number;
  text: string;
  has_overlap: boolean;
  line_count: number;
}

/**
 * Chunk pages with overlap to avoid splitting table rows
 * @param pages Array of {page: number, text: string}
 * @param overlapLines Number of lines to overlap between chunks (default 10)
 */
export function chunkByPages(
  pages: Array<{page: number; text: string}>,
  overlapLines: number = 10
): PageChunk[] {
  const chunks: PageChunk[] = [];

  for (let i = 0; i < pages.length; i++) {
    const currentPage = pages[i];
    const lines = currentPage.text.split('\n');

    let chunkText = currentPage.text;
    let hasOverlap = false;

    // Add overlap from previous page (last N lines)
    if (i > 0) {
      const prevPage = pages[i - 1];
      const prevLines = prevPage.text.split('\n');
      const overlapText = prevLines.slice(-overlapLines).join('\n');

      if (overlapText.trim()) {
        chunkText = `${overlapText}\n${chunkText}`;
        hasOverlap = true;
      }
    }

    chunks.push({
      chunk_number: i + 1,
      page_start: currentPage.page,
      page_end: currentPage.page,
      text: chunkText,
      has_overlap: hasOverlap,
      line_count: chunkText.split('\n').length,
    });
  }

  return chunks;
}

/**
 * Merge small adjacent pages into larger chunks (if pages are very short)
 * @param pages Array of {page: number, text: string}
 * @param minLinesPerChunk Minimum lines per chunk (default 50)
 */
export function chunkByPagesWithMerging(
  pages: Array<{page: number; text: string}>,
  minLinesPerChunk: number = 50,
  overlapLines: number = 10
): PageChunk[] {
  const chunks: PageChunk[] = [];
  let currentChunk: {pages: number[]; text: string} | null = null;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const lineCount = page.text.split('\n').length;

    // Start new chunk if needed
    if (!currentChunk) {
      currentChunk = {
        pages: [page.page],
        text: page.text,
      };
    } else {
      // Add to current chunk if too small
      const currentLineCount = currentChunk.text.split('\n').length;

      if (currentLineCount < minLinesPerChunk) {
        currentChunk.pages.push(page.page);
        currentChunk.text += '\n' + page.text;
      } else {
        // Flush current chunk
        const prevPage = pages[i - 1];
        const overlapText = prevPage ?
          prevPage.text.split('\n').slice(-overlapLines).join('\n') : '';

        chunks.push({
          chunk_number: chunks.length + 1,
          page_start: currentChunk.pages[0],
          page_end: currentChunk.pages[currentChunk.pages.length - 1],
          text: currentChunk.text,
          has_overlap: false,
          line_count: currentChunk.text.split('\n').length,
        });

        // Start new chunk with overlap
        currentChunk = {
          pages: [page.page],
          text: overlapText ? `${overlapText}\n${page.text}` : page.text,
        };
      }
    }
  }

  // Flush last chunk
  if (currentChunk) {
    chunks.push({
      chunk_number: chunks.length + 1,
      page_start: currentChunk.pages[0],
      page_end: currentChunk.pages[currentChunk.pages.length - 1],
      text: currentChunk.text,
      has_overlap: chunks.length > 0,
      line_count: currentChunk.text.split('\n').length,
    });
  }

  return chunks;
}

/**
 * Extract section subtotals from text for coverage audit
 * Returns map of section name -> total amount
 */
export function extractSectionTotals(text: string): Map<string, number> {
  const sections = new Map<string, number>();
  const lines = text.split('\n');

  for (const line of lines) {
    // Pattern: "Section Name $1,234.56" or "Section Name: $1,234.56"
    const match = line.match(/^([A-Za-z][A-Za-z\s&-]{3,40})\s*:?\s*\$\s*([\d,]+\.\d{2})$/);

    if (match) {
      const [, sectionName, amount] = match;
      const name = sectionName.trim().toLowerCase();

      // Skip if looks like a line item (too detailed)
      if (name.length > 50) continue;

      // Skip if contains item-like words
      if (name.match(/\b(supply|install|provide|including|each|per)\b/i)) continue;

      const value = parseFloat(amount.replace(/,/g, ''));

      if (value > 100) { // Reasonable threshold for section totals
        sections.set(name, value);
      }
    }

    // Pattern: "Sub-Total - Section: $1,234.56"
    const subtotalMatch = line.match(/sub-?total\s*-?\s*([^:$]+)\s*:?\s*\$\s*([\d,]+\.\d{2})/i);

    if (subtotalMatch) {
      const [, sectionName, amount] = subtotalMatch;
      const name = sectionName.trim().toLowerCase();
      const value = parseFloat(amount.replace(/,/g, ''));

      if (value > 100) {
        sections.set(name, value);
      }
    }
  }

  return sections;
}

/**
 * Calculate page coverage: compare extracted items total vs expected section total
 */
export interface CoverageReport {
  page: number;
  section_name: string | null;
  expected_total: number | null;
  extracted_total: number;
  coverage_ratio: number; // 0.0 to 1.0
  needs_reparse: boolean;
}

export function calculatePageCoverage(
  chunks: PageChunk[],
  itemsByChunk: Map<number, any[]>,
  sectionTotals: Map<string, number>,
  threshold: number = 0.85
): CoverageReport[] {
  const reports: CoverageReport[] = [];

  for (const chunk of chunks) {
    const items = itemsByChunk.get(chunk.chunk_number) || [];
    const extractedTotal = items.reduce((sum, item) =>
      sum + (Number(item.total) || 0), 0
    );

    // Try to find matching section total for this chunk
    let matchedSection: string | null = null;
    let expectedTotal: number | null = null;

    // Look for section headers in chunk text
    for (const [sectionName, sectionTotal] of sectionTotals.entries()) {
      if (chunk.text.toLowerCase().includes(sectionName)) {
        matchedSection = sectionName;
        expectedTotal = sectionTotal;
        break;
      }
    }

    const coverageRatio = expectedTotal && expectedTotal > 0
      ? extractedTotal / expectedTotal
      : 1.0;

    const needsReparse = expectedTotal !== null && coverageRatio < threshold;

    reports.push({
      page: chunk.page_start,
      section_name: matchedSection,
      expected_total: expectedTotal,
      extracted_total: extractedTotal,
      coverage_ratio: Math.min(1.0, coverageRatio),
      needs_reparse: needsReparse,
    });
  }

  return reports;
}
