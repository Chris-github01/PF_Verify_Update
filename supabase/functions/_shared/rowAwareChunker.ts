export interface ChunkResult {
  section: string;
  content: string;
  lineCount: number;
  estimatedItems: number;
}

function looksLikeSubtotal(line: string): boolean {
  const lower = line.toLowerCase().trim();

  const subtotalPatterns = [
    /^(sub)?total[\s:]/i,
    /^grand\s+total/i,
    /^carried\s+forward/i,
    /^brought\s+forward/i,
    /^amount\s+due/i,
    /^balance/i,
    /^gst/i,
    /^tax/i,
    /^p\s*&\s*g/i,
    /^margin/i,
    /^less\s+discount/i,
  ];

  return subtotalPatterns.some(pattern => pattern.test(lower));
}

function looksLikeLineItem(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 10) return false;
  if (looksLikeSubtotal(trimmed)) return false;

  const hasQuantity = /\b\d+\.?\d*\s*(ea|m|LS|lm|sm|per|each|unit|kit|box|bag)/i.test(trimmed);
  const hasPrice = /\$[\d,]+\.?\d*/i.test(trimmed);
  const hasDescription = /[a-zA-Z]{3,}/.test(trimmed);

  return hasQuantity && hasPrice && hasDescription;
}

function detectSectionHeader(line: string): string | null {
  const trimmed = line.trim();

  const sectionPatterns = [
    /^([A-Z][A-Za-z\s&-]+)\s+\$[\d,]+\.?\d*/,
    /^([A-Z][A-Z\s&-]+)$/,
    /^(\d+\.?\d*)\s+([A-Z][A-Za-z\s&-]+)/,
    /^(SECTION|PART|CHAPTER)\s+\d+/i,
  ];

  for (const pattern of sectionPatterns) {
    const match = trimmed.match(pattern);
    if (match && trimmed.length < 100) {
      return match[1]?.trim() || match[0]?.trim();
    }
  }

  return null;
}

export function chunkByLineItems(
  text: string,
  maxLinesPerChunk: number = 30,
  maxCharsPerChunk: number = 3500
): ChunkResult[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const chunks: ChunkResult[] = [];

  let currentSection = 'Main';
  let currentLines: string[] = [];
  let currentChars = 0;
  let itemCount = 0;

  for (const line of lines) {
    const sectionHeader = detectSectionHeader(line);
    if (sectionHeader) {
      if (currentLines.length > 5) {
        chunks.push({
          section: currentSection,
          content: currentLines.join('\n'),
          lineCount: currentLines.length,
          estimatedItems: itemCount,
        });
        currentLines = [];
        currentChars = 0;
        itemCount = 0;
      }
      currentSection = sectionHeader;
      currentLines.push(line);
      currentChars += line.length + 1;
      continue;
    }

    if (looksLikeSubtotal(line)) {
      continue;
    }

    const isItem = looksLikeLineItem(line);
    if (isItem) itemCount++;

    const wouldExceedLimit =
      currentLines.length >= maxLinesPerChunk ||
      currentChars + line.length > maxCharsPerChunk;

    if (wouldExceedLimit && currentLines.length > 0) {
      chunks.push({
        section: `${currentSection} (part ${chunks.filter(c => c.section.startsWith(currentSection)).length + 1})`,
        content: currentLines.join('\n'),
        lineCount: currentLines.length,
        estimatedItems: itemCount,
      });
      currentLines = [];
      currentChars = 0;
      itemCount = 0;
    }

    currentLines.push(line);
    currentChars += line.length + 1;
  }

  if (currentLines.length > 5) {
    chunks.push({
      section: currentSection,
      content: currentLines.join('\n'),
      lineCount: currentLines.length,
      estimatedItems: itemCount,
    });
  }

  console.log(`[Row-Aware Chunker] Created ${chunks.length} chunks from ${lines.length} lines`);
  chunks.forEach((chunk, i) => {
    console.log(`  Chunk ${i + 1}: ${chunk.section} - ${chunk.lineCount} lines, ~${chunk.estimatedItems} items`);
  });

  return chunks;
}

export function extractCandidateRows(text: string): string[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const candidates: string[] = [];

  for (const line of lines) {
    if (looksLikeSubtotal(line)) continue;
    if (looksLikeLineItem(line)) {
      candidates.push(line);
    }
  }

  return candidates;
}
