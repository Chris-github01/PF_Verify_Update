import type {
  DocumentStructure,
  StructureBlock,
  StructureSection,
  StructureTable,
  TradeType,
} from "./types.ts";
import {
  detectTradeType,
  extractDocumentTotal,
  isSummaryLine,
} from "./utils.ts";

const HEADING_PATTERNS: RegExp[] = [
  /^([A-Z][A-Z0-9\s\-&/()]{2,60})$/,
  /^(\d{1,2}\.\s+[A-Z][A-Za-z0-9\s\-&/()]{2,60})$/,
  /^(SECTION|PART|DIVISION|SCHEDULE|APPENDIX)\s+\w/i,
  /^(Block|Level|Floor|Building|Zone|Area)\s+[\w\d\-]+\s*$/i,
  /^(FIRE\s+STOPPING|PENETRATION|PASSIVE\s+FIRE|PLUMBING|ELECTRICAL|HVAC|MECHANICAL|CARPENTRY)/i,
];

const BLOCK_PATTERNS: RegExp[] = [
  /^Block\s+([A-Z][0-9]{1,3})\b/i,
  /^(B[0-9]{1,3})\b\s*[-–:]/i,
  /^Level\s+([0-9]{1,2}|G|B|RF|GF|UG)\b/i,
  /^(L[0-9]{1,2}|GF|RF|B[0-9]?)\s*[-–:]/i,
  /^(Stage|Phase)\s+([0-9]{1,2}|[A-Z])\b/i,
];

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 100) return false;
  if (isSummaryLine(trimmed)) return false;
  if (/\$[\d,]+/.test(trimmed)) return false;
  return HEADING_PATTERNS.some((p) => p.test(trimmed));
}

function isBlockMarker(line: string): { label: string } | null {
  const trimmed = line.trim();
  for (const pattern of BLOCK_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m) return { label: m[0].trim() };
  }
  return null;
}

function detectTableRegions(lines: string[]): StructureTable[] {
  const tables: StructureTable[] = [];
  let tableStart: number | null = null;
  let consecutiveNumericRows = 0;
  let maxCols = 0;
  let headerLine: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const numerics = line.match(/\b\d+\.?\d*\b/g) ?? [];
    const hasMoney = /\$[\d,]+\.?\d*|\b[\d,]{3,}\.\d{2}\b/.test(line);
    const hasDescription = /[A-Za-z]{3,}/.test(line);

    const looksLikeRow = numerics.length >= 2 && (hasMoney || numerics.length >= 3) && hasDescription;

    if (looksLikeRow) {
      if (tableStart === null) {
        tableStart = i;
        if (i > 0) headerLine = lines[i - 1]?.trim() || null;
      }
      consecutiveNumericRows++;
      maxCols = Math.max(maxCols, numerics.length);
    } else {
      if (tableStart !== null && consecutiveNumericRows >= 3) {
        tables.push({
          startLine: tableStart,
          endLine: i - 1,
          columnCount: maxCols,
          headerLine,
        });
      }
      if (!looksLikeRow) {
        tableStart = null;
        consecutiveNumericRows = 0;
        maxCols = 0;
        headerLine = null;
      }
    }
  }

  if (tableStart !== null && consecutiveNumericRows >= 3) {
    tables.push({
      startLine: tableStart,
      endLine: lines.length - 1,
      columnCount: maxCols,
      headerLine,
    });
  }

  return tables;
}

function detectSections(lines: string[]): StructureSection[] {
  const sections: StructureSection[] = [];
  const pending: Array<{ heading: string; startLine: number; level: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (isHeadingLine(line)) {
      const level = /^\d+\./.test(line) ? 2 : 1;

      if (pending.length > 0 && (level <= pending[pending.length - 1].level || i - pending[pending.length - 1].startLine > 3)) {
        const last = pending.pop()!;
        sections.push({
          heading: last.heading,
          startLine: last.startLine,
          endLine: i - 1,
          level: last.level,
        });
      }

      pending.push({ heading: line, startLine: i, level });
    }
  }

  while (pending.length > 0) {
    const last = pending.pop()!;
    sections.push({
      heading: last.heading,
      startLine: last.startLine,
      endLine: lines.length - 1,
      level: last.level,
    });
  }

  return sections.sort((a, b) => a.startLine - b.startLine);
}

function detectBlocks(lines: string[]): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  let current: { label: string; startLine: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const blockMatch = isBlockMarker(line);
    if (blockMatch) {
      if (current) {
        blocks.push({ label: current.label, startLine: current.startLine, endLine: i - 1 });
      }
      current = { label: blockMatch.label, startLine: i };
    }
  }

  if (current) {
    blocks.push({ label: current.label, startLine: current.startLine, endLine: lines.length - 1 });
  }

  return blocks;
}

function hasPageMarkers(text: string): boolean {
  return /\bPage\s+\d+\s+of\s+\d+\b/i.test(text) || /\f/.test(text);
}

function hasLevelStructure(lines: string[]): boolean {
  const levelCount = lines.filter((l) => /^Level\s+\d+|^L\d+\s*[-–:]/i.test(l.trim())).length;
  return levelCount >= 2;
}

function hasSectionSubtotals(text: string): boolean {
  return (/(sub)?total\s*[-–:]?\s*\$?\s*[\d,]+\.\d{2}/i.test(text));
}

export function detectStructure(text: string): DocumentStructure {
  const lines = text.split("\n");
  const tradeType: TradeType = detectTradeType(text);
  const grandTotal = extractDocumentTotal(text);

  const sections = detectSections(lines);
  const tables = detectTableRegions(lines);
  const blocks = detectBlocks(lines);

  return {
    sections,
    tables,
    blocks,
    metadata: {
      lineCount: lines.length,
      estimatedTradeType: tradeType,
      hasPageMarkers: hasPageMarkers(text),
      hasLevelStructure: hasLevelStructure(lines),
      hasSectionSubtotals: hasSectionSubtotals(text),
      grandTotal,
    },
  };
}
