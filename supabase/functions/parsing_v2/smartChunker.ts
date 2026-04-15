import type { DocumentStructure, SmartChunk, StructureBlock, StructureSection } from "./types.ts";
import { isSummaryLine } from "./utils.ts";

const MAX_LINES_PER_CHUNK = 80;
const MIN_LINES_FOR_FLUSH = 5;

function findSectionForLine(
  lineIndex: number,
  sections: StructureSection[]
): string {
  for (let i = sections.length - 1; i >= 0; i--) {
    if (lineIndex >= sections[i].startLine && lineIndex <= sections[i].endLine) {
      return sections[i].heading;
    }
  }
  return "Main";
}

function findBlockForLine(
  lineIndex: number,
  blocks: StructureBlock[]
): string | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (lineIndex >= blocks[i].startLine && lineIndex <= blocks[i].endLine) {
      return blocks[i].label;
    }
  }
  return null;
}

function isRowContinuationLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const startsWithAlpha = /^[A-Za-z]/.test(trimmed);
  const hasNoNumbers = !/\d/.test(trimmed);
  const isShort = trimmed.length < 80;
  return startsWithAlpha && hasNoNumbers && isShort && trimmed.length > 3;
}

function looksLikeDataRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 5) return false;
  if (isSummaryLine(trimmed)) return false;
  const hasNumbers = /\d/.test(trimmed);
  const hasDescription = /[A-Za-z]{2,}/.test(trimmed);
  return hasNumbers && hasDescription;
}

function estimateItemCount(lines: string[]): number {
  return lines.filter((l) => looksLikeDataRow(l)).length;
}

function safeFlush(
  lines: string[],
  section: string,
  block: string | null,
  startLine: number,
  chunkIndex: number
): SmartChunk {
  const text = lines.join("\n").trim();
  return {
    chunkText: text,
    section,
    block,
    pageRange: null,
    startLine,
    endLine: startLine + lines.length - 1,
    estimatedItemCount: estimateItemCount(lines),
  };
}

function splitByStructureBoundaries(
  lines: string[],
  structure: DocumentStructure
): SmartChunk[] {
  const chunks: SmartChunk[] = [];

  const boundaries = new Set<number>();

  for (const section of structure.sections) {
    if (section.startLine > 0) boundaries.add(section.startLine);
  }
  for (const block of structure.blocks) {
    if (block.startLine > 0) boundaries.add(block.startLine);
  }

  const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

  let segmentStart = 0;

  const processSegment = (start: number, end: number) => {
    const segmentLines = lines.slice(start, end + 1);
    if (segmentLines.join("").trim().length === 0) return;

    if (segmentLines.length <= MAX_LINES_PER_CHUNK) {
      const section = findSectionForLine(start, structure.sections);
      const block = findBlockForLine(start, structure.blocks);
      if (segmentLines.length >= MIN_LINES_FOR_FLUSH || estimateItemCount(segmentLines) > 0) {
        chunks.push(safeFlush(segmentLines, section, block, start, chunks.length));
      }
    } else {
      let subStart = 0;
      let currentLines: string[] = [];

      for (let i = 0; i < segmentLines.length; i++) {
        const line = segmentLines[i];
        const absLine = start + i;

        const wouldExceed = currentLines.length >= MAX_LINES_PER_CHUNK;

        if (wouldExceed) {
          const nextLine = segmentLines[i + 1]?.trim() ?? "";
          const isContinuation = isRowContinuationLine(nextLine) || nextLine === "";

          if (!isContinuation || currentLines.length >= MAX_LINES_PER_CHUNK + 5) {
            const section = findSectionForLine(start + subStart, structure.sections);
            const block = findBlockForLine(start + subStart, structure.blocks);
            if (currentLines.length >= MIN_LINES_FOR_FLUSH) {
              chunks.push(safeFlush(currentLines, section, block, start + subStart, chunks.length));
            }
            subStart = i;
            currentLines = [];
          }
        }

        currentLines.push(line);
      }

      if (currentLines.length >= MIN_LINES_FOR_FLUSH || estimateItemCount(currentLines) > 0) {
        const section = findSectionForLine(start + subStart, structure.sections);
        const block = findBlockForLine(start + subStart, structure.blocks);
        chunks.push(safeFlush(currentLines, section, block, start + subStart, chunks.length));
      }
    }
  };

  for (const boundary of sortedBoundaries) {
    if (boundary > segmentStart) {
      processSegment(segmentStart, boundary - 1);
    }
    segmentStart = boundary;
  }

  processSegment(segmentStart, lines.length - 1);

  return chunks;
}

function mergeOrphanChunks(chunks: SmartChunk[]): SmartChunk[] {
  const result: SmartChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const lineCount = chunk.chunkText.split("\n").length;

    if (lineCount < MIN_LINES_FOR_FLUSH && chunk.estimatedItemCount === 0 && result.length > 0) {
      const last = result[result.length - 1];
      result[result.length - 1] = {
        ...last,
        chunkText: last.chunkText + "\n" + chunk.chunkText,
        endLine: chunk.endLine,
        estimatedItemCount: last.estimatedItemCount + chunk.estimatedItemCount,
      };
    } else {
      result.push(chunk);
    }
  }

  return result;
}

export function createSmartChunks(
  text: string,
  structure: DocumentStructure
): SmartChunk[] {
  const rawLines = text.split("\n");

  const lines = rawLines.map((l) => l.trimEnd());

  const hasStructure =
    structure.sections.length > 1 ||
    structure.blocks.length > 1 ||
    structure.tables.length > 1;

  let chunks: SmartChunk[];

  if (hasStructure) {
    chunks = splitByStructureBoundaries(lines, structure);
  } else {
    chunks = splitByStructureBoundaries(lines, {
      ...structure,
      sections: [],
      blocks: [],
    });
  }

  if (chunks.length === 0) {
    chunks = [{
      chunkText: text.trim(),
      section: "Main",
      block: null,
      pageRange: null,
      startLine: 0,
      endLine: lines.length - 1,
      estimatedItemCount: estimateItemCount(lines),
    }];
  }

  chunks = mergeOrphanChunks(chunks);

  console.log(
    `[SmartChunker] ${chunks.length} chunks from ${lines.length} lines` +
    ` (${structure.sections.length} sections, ${structure.blocks.length} blocks)`
  );

  return chunks;
}
