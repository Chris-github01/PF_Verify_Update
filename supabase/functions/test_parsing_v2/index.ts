import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PARSER_VERSION = "v2.0.0-2026-04-15";

// ─── Types ────────────────────────────────────────────────────────────────────

type TradeType = "passive_fire" | "plumbing" | "electrical" | "hvac" | "active_fire" | "carpentry" | "unknown";

interface SmartChunk {
  chunkText: string;
  section: string;
  block: string | null;
  pageRange: [number, number] | null;
  startLine: number;
  endLine: number;
  estimatedItemCount: number;
}

interface RawLineItem {
  description: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  sourceLineIndex: number;
  rawLine: string;
  confidence: "high" | "medium" | "low";
  parseMethod: "deterministic" | "llm" | "inferred";
  normalization_confidence?: number;
  parseConfidence?: number;
}

interface NormalizedLineItem {
  description: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
  section: string;
  block: string | null;
  isOptional: boolean;
  isAdjustment: boolean;
  isSummaryRow: boolean;
  frr: string | null;
  sourceChunk: number;
  confidence: "high" | "medium" | "low";
  parseMethod: "deterministic" | "llm" | "inferred";
  source: "deterministic" | "llm";
  chunkIndex: number;
  originalText: string;
}

interface ValidationIssue {
  type: string;
  severity: "error" | "warning";
  itemIndex: number | null;
  message: string;
  details?: Record<string, unknown>;
}

interface StructureSection { heading: string; startLine: number; endLine: number; level: number; }
interface StructureTable { startLine: number; endLine: number; columnCount: number; headerLine: string | null; }
interface StructureBlock { label: string; startLine: number; endLine: number; }
interface DocumentStructure {
  sections: StructureSection[];
  tables: StructureTable[];
  blocks: StructureBlock[];
  metadata: {
    lineCount: number;
    estimatedTradeType: TradeType;
    hasPageMarkers: boolean;
    hasLevelStructure: boolean;
    hasSectionSubtotals: boolean;
    grandTotal: number | null;
  };
}

interface TestRequest {
  text?: string;
  fileUrl?: string;
  tradeType?: TradeType;
  documentTotal?: number;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function parseMoney(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const cleaned = String(raw).replace(/\u00A0/g, " ").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mathCheck(qty: number, rate: number, total: number, tolerancePct = 0.02): boolean {
  if (qty <= 0 || rate <= 0 || total <= 0) return false;
  const computed = qty * rate;
  const diff = Math.abs(computed - total);
  const tolerance = Math.max(0.5, total * tolerancePct);
  return diff <= tolerance;
}

function extractDocumentTotal(text: string): number | null {
  const t = text.replace(/\u00A0/g, " ");
  const patterns = [
    /Grand\s+Total\s*\(excluding\s+GST\)\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /Grand\s+Total\s*\(excl\.?\s*GST\)\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /Grand\s+Total\s+excl\.?\s+GST\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /Grand\s+Total\s+ex\.?\s+GST\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /Grand\s+Total\s*:\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /Total\s+\(excl\.?\s*GST\)\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /Total\s+excluding\s+GST\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /\bTOTAL\s+COST\b\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/i,
    /^TOTAL\s*:?\s*\$?\s*([\d,\s]+\.?\d*)/im,
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(/\s/g, "").replace(/,/g, ""));
      if (value > 0 && Number.isFinite(value)) return value;
    }
  }
  return null;
}

function detectTradeType(text: string): TradeType {
  const lower = text.toLowerCase();
  const counts: Record<TradeType, number> = { passive_fire: 0, plumbing: 0, electrical: 0, hvac: 0, active_fire: 0, carpentry: 0, unknown: 0 };
  const signals: Record<TradeType, string[]> = {
    passive_fire: ["fire stopping", "firestopping", "intumescent", "passive fire", "fire collar", "fire door", "frr", "fire rated", "penetration seal", "ablative", "promat", "hilti cp"],
    plumbing: ["plumbing", "sanitary", "drainage", "hot water", "cold water", "copper pipe", "upvc", "pvc pipe", "valve", "cistern", "toilet", "basin", "shower"],
    electrical: ["electrical", "conduit", "cable tray", "switchboard", "circuit breaker", "light fitting", "power outlet", "distribution board"],
    hvac: ["hvac", "mechanical", "ductwork", "air conditioning", "ventilation", "fan coil", "chiller", "heat pump"],
    active_fire: ["sprinkler", "fire suppression", "fire hydrant", "hose reel", "detection", "alarm", "active fire"],
    carpentry: ["carpentry", "joinery", "door set", "skirting", "architrave", "wardrobe", "kitchen", "cabinetry", "timber"],
    unknown: [],
  };
  for (const [trade, keywords] of Object.entries(signals) as [TradeType, string[]][]) {
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw.replace(/\s+/g, "\\s+")}\\b`, "gi");
      const matches = lower.match(regex);
      if (matches) counts[trade] += matches.length;
    }
  }
  let best: TradeType = "unknown";
  let bestScore = 0;
  for (const [trade, score] of Object.entries(counts) as [TradeType, number][]) {
    if (trade === "unknown") continue;
    if (score > bestScore) { bestScore = score; best = trade; }
  }
  return bestScore >= 2 ? best : "unknown";
}

function isSummaryLine(line: string): boolean {
  const lower = line.trim().toLowerCase();
  const patterns = [
    /^(sub)?total[\s:$]/i, /^grand\s+total/i, /^total\s+(ex|excl|excluding|incl|including)/i,
    /^carried\s+forward/i, /^brought\s+forward/i, /^amount\s+due/i, /^balance\s+(due|forward)/i,
    /^\s*gst\s*(\(|@|:)/i, /^tax\b/i, /^p\s*&\s*g\b/i, /^margin\b/i, /^overhead/i,
    /^profit\b/i, /^less\s+(discount|credit|retention)/i, /^summary\s*(of\s+)?costs?/i,
    /^total\s+(cost|price|amount)\s*:/i,
  ];
  return patterns.some((p) => p.test(lower));
}

function isLumpSumPattern(line: string): boolean {
  return /\b(lump\s*sum|l\.?s\.?|allow|pc\s+sum|provisional)\b/i.test(line.trim());
}

function extractFRR(description: string): string | null {
  const match = description.match(/\b(FRL|FRR)\s*[-–]?\s*([0-9]{1,3}\/[0-9]{1,3}\/[0-9]{1,3})\b/i);
  return match ? match[0].toUpperCase() : null;
}

function dedupeKey(item: { description: string; qty: number; unit: string; rate: number }): string {
  return [item.description.toLowerCase().trim(), String(item.qty), (item.unit || "").toLowerCase().trim(), String(item.rate)].join("|");
}

function fuzzyDedupeKey(description: string): string {
  return description.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim().substring(0, 60);
}

// ─── Structure Detector ───────────────────────────────────────────────────────

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
      if (tableStart === null) { tableStart = i; if (i > 0) headerLine = lines[i - 1]?.trim() || null; }
      consecutiveNumericRows++;
      maxCols = Math.max(maxCols, numerics.length);
    } else {
      if (tableStart !== null && consecutiveNumericRows >= 3) {
        tables.push({ startLine: tableStart, endLine: i - 1, columnCount: maxCols, headerLine });
      }
      if (!looksLikeRow) { tableStart = null; consecutiveNumericRows = 0; maxCols = 0; headerLine = null; }
    }
  }
  if (tableStart !== null && consecutiveNumericRows >= 3) {
    tables.push({ startLine: tableStart, endLine: lines.length - 1, columnCount: maxCols, headerLine });
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
        sections.push({ heading: last.heading, startLine: last.startLine, endLine: i - 1, level: last.level });
      }
      pending.push({ heading: line, startLine: i, level });
    }
  }
  while (pending.length > 0) {
    const last = pending.pop()!;
    sections.push({ heading: last.heading, startLine: last.startLine, endLine: lines.length - 1, level: last.level });
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
      if (current) blocks.push({ label: current.label, startLine: current.startLine, endLine: i - 1 });
      current = { label: blockMatch.label, startLine: i };
    }
  }
  if (current) blocks.push({ label: current.label, startLine: current.startLine, endLine: lines.length - 1 });
  return blocks;
}

function detectStructure(text: string): DocumentStructure {
  const lines = text.split("\n");
  return {
    sections: detectSections(lines),
    tables: detectTableRegions(lines),
    blocks: detectBlocks(lines),
    metadata: {
      lineCount: lines.length,
      estimatedTradeType: detectTradeType(text),
      hasPageMarkers: /\bPage\s+\d+\s+of\s+\d+\b/i.test(text) || /\f/.test(text),
      hasLevelStructure: lines.filter((l) => /^Level\s+\d+|^L\d+\s*[-–:]/i.test(l.trim())).length >= 2,
      hasSectionSubtotals: /(sub)?total\s*[-–:]?\s*\$?\s*[\d,]+\.\d{2}/i.test(text),
      grandTotal: extractDocumentTotal(text),
    },
  };
}

// ─── Smart Chunker ────────────────────────────────────────────────────────────

const MAX_LINES_PER_CHUNK = 80;
const MIN_LINES_FOR_FLUSH = 5;

function looksLikeDataRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 5) return false;
  if (isSummaryLine(trimmed)) return false;
  return /\d/.test(trimmed) && /[A-Za-z]{2,}/.test(trimmed);
}

function estimateItemCount(lines: string[]): number {
  return lines.filter((l) => looksLikeDataRow(l)).length;
}

function findSectionForLine(lineIndex: number, sections: StructureSection[]): string {
  for (let i = sections.length - 1; i >= 0; i--) {
    if (lineIndex >= sections[i].startLine && lineIndex <= sections[i].endLine) return sections[i].heading;
  }
  return "Main";
}

function findBlockForLine(lineIndex: number, blocks: StructureBlock[]): string | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (lineIndex >= blocks[i].startLine && lineIndex <= blocks[i].endLine) return blocks[i].label;
  }
  return null;
}

function safeFlush(lines: string[], section: string, block: string | null, startLine: number): SmartChunk {
  const text = lines.join("\n").trim();
  return { chunkText: text, section, block, pageRange: null, startLine, endLine: startLine + lines.length - 1, estimatedItemCount: estimateItemCount(lines) };
}

function splitByStructureBoundaries(lines: string[], structure: DocumentStructure): SmartChunk[] {
  const chunks: SmartChunk[] = [];
  const boundaries = new Set<number>();
  for (const section of structure.sections) { if (section.startLine > 0) boundaries.add(section.startLine); }
  for (const block of structure.blocks) { if (block.startLine > 0) boundaries.add(block.startLine); }
  const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);
  let segmentStart = 0;
  const processSegment = (start: number, end: number) => {
    const segmentLines = lines.slice(start, end + 1);
    if (segmentLines.join("").trim().length === 0) return;
    if (segmentLines.length <= MAX_LINES_PER_CHUNK) {
      const section = findSectionForLine(start, structure.sections);
      const block = findBlockForLine(start, structure.blocks);
      if (segmentLines.length >= MIN_LINES_FOR_FLUSH || estimateItemCount(segmentLines) > 0) {
        chunks.push(safeFlush(segmentLines, section, block, start));
      }
    } else {
      let subStart = 0;
      let currentLines: string[] = [];
      for (let i = 0; i < segmentLines.length; i++) {
        if (currentLines.length >= MAX_LINES_PER_CHUNK) {
          const nextLine = segmentLines[i + 1]?.trim() ?? "";
          const isContinuation = (!nextLine || (/^[A-Za-z]/.test(nextLine) && !/\d/.test(nextLine) && nextLine.length < 80 && nextLine.length > 3));
          if (!isContinuation || currentLines.length >= MAX_LINES_PER_CHUNK + 5) {
            const section = findSectionForLine(start + subStart, structure.sections);
            const block = findBlockForLine(start + subStart, structure.blocks);
            if (currentLines.length >= MIN_LINES_FOR_FLUSH) chunks.push(safeFlush(currentLines, section, block, start + subStart));
            subStart = i;
            currentLines = [];
          }
        }
        currentLines.push(segmentLines[i]);
      }
      if (currentLines.length >= MIN_LINES_FOR_FLUSH || estimateItemCount(currentLines) > 0) {
        const section = findSectionForLine(start + subStart, structure.sections);
        const block = findBlockForLine(start + subStart, structure.blocks);
        chunks.push(safeFlush(currentLines, section, block, start + subStart));
      }
    }
  };
  for (const boundary of sortedBoundaries) {
    if (boundary > segmentStart) processSegment(segmentStart, boundary - 1);
    segmentStart = boundary;
  }
  processSegment(segmentStart, lines.length - 1);
  return chunks;
}

function createSmartChunks(text: string, structure: DocumentStructure): SmartChunk[] {
  const lines = text.split("\n").map((l) => l.trimEnd());
  const hasStructure = structure.sections.length > 1 || structure.blocks.length > 1 || structure.tables.length > 1;
  let chunks = splitByStructureBoundaries(lines, hasStructure ? structure : { ...structure, sections: [], blocks: [] });
  if (chunks.length === 0) {
    chunks = [{ chunkText: text.trim(), section: "Main", block: null, pageRange: null, startLine: 0, endLine: lines.length - 1, estimatedItemCount: estimateItemCount(lines) }];
  }
  const result: SmartChunk[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const lineCount = chunk.chunkText.split("\n").length;
    if (lineCount < MIN_LINES_FOR_FLUSH && chunk.estimatedItemCount === 0 && result.length > 0) {
      const last = result[result.length - 1];
      result[result.length - 1] = { ...last, chunkText: last.chunkText + "\n" + chunk.chunkText, endLine: chunk.endLine, estimatedItemCount: last.estimatedItemCount + chunk.estimatedItemCount };
    } else {
      result.push(chunk);
    }
  }
  return result;
}

// ─── Deterministic Parser ─────────────────────────────────────────────────────

const UNIT_TOKENS = /\b(ea|each|no\.?|nr|m2|m²|sqm|lm|rm|m3|m|mm|kg|t\b|tonne|ls|l\.s\.|lump\s*sum|item|kit|set|pair|hr|hour|day|week|allow|pc|pcs|box|bag|roll|length|lot|asm|assy)\b/i;
const NOISE_TERMS = /\b(subtotal|sub\s*total|grand\s*total|contract\s*sum|margin|gst|tax|overhead|profit)\b/i;
const COL_SPLIT_RE = /  +/;

function parseMonyRobust(raw: string): number {
  const cleaned = raw.replace(/\s/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function extractAllMoneyValues(line: string): number[] {
  const values: number[] = [];
  const pattern = /\$?\s*([\d,\s]{1,15}\.\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(line)) !== null) {
    const v = parseMonyRobust(m[1]);
    if (v > 0) values.push(v);
  }
  return values;
}

function extractAllNumbers(line: string): number[] {
  const moneyPositions = new Set<number>();
  const moneyPat = /\$?\s*[\d,\s]{1,15}\.\d{2}\b/g;
  let mm: RegExpExecArray | null;
  while ((mm = moneyPat.exec(line)) !== null) {
    for (let i = mm.index; i < mm.index + mm[0].length; i++) moneyPositions.add(i);
  }
  const values: number[] = [];
  const numPat = /\b(\d{1,6}(?:\.\d{1,4})?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = numPat.exec(line)) !== null) {
    if (!moneyPositions.has(m.index)) {
      const v = parseFloat(m[1]);
      if (v > 0) values.push(v);
    }
  }
  return values;
}

function extractUnit(line: string): string | null {
  const m = line.match(UNIT_TOKENS);
  return m ? m[0].trim().toLowerCase() : null;
}

function stripNumbers(line: string): string {
  return line.replace(/\$?\s*[\d,\s]{1,15}\.\d{2}\b/g, "").replace(/\b\d+\.?\d*\s*(ea|each|no\.?|nr|m2|m²|sqm|lm|rm|m|ls|item|kit|set|hr|allow)\b/gi, "").replace(/\b\d+\.?\d*\b/g, "").replace(/\s+/g, " ").trim();
}

function cleanDescription(raw: string): string {
  return raw.replace(/\u00A0/g, " ").replace(/\s+/g, " ").replace(/^[-–•·*]+\s*/, "").replace(/\s+$/g, "").trim();
}

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  return isSummaryLine(trimmed) || NOISE_TERMS.test(trimmed);
}

function tryColumnParse(line: string): { description: string; qty: number | null; unit: string | null; rate: number | null; total: number | null; method: "column" | "fallback" } | null {
  const cols = line.split(COL_SPLIT_RE).map((c) => c.trim()).filter(Boolean);
  if (cols.length < 2) return null;
  const numericCols: Array<{ idx: number; value: number }> = [];
  for (let i = cols.length - 1; i >= 0; i--) {
    const stripped = cols[i].replace(/[$,\s]/g, "");
    const n = parseFloat(stripped);
    if (Number.isFinite(n) && n > 0) numericCols.push({ idx: i, value: n });
  }
  if (numericCols.length === 0) return null;
  const total = numericCols[0]?.value ?? null;
  const rate = numericCols[1]?.value ?? null;
  const qty = numericCols[2]?.value ?? null;
  const numericIdxs = new Set(numericCols.map((n) => n.idx));
  const descParts = cols.filter((_, i) => !numericIdxs.has(i));
  const rawDesc = descParts.join(" ").trim();
  if (!rawDesc || rawDesc.length < 3) return null;
  const unit = extractUnit(rawDesc);
  const description = cleanDescription(rawDesc);
  return { description, qty, unit, rate, total, method: "column" };
}

function inferFieldsFallback(line: string): { qty: number | null; unit: string | null; rate: number | null; total: number | null } {
  const moneyValues = extractAllMoneyValues(line);
  const plainNumbers = extractAllNumbers(line);
  const unit = extractUnit(line);
  if (moneyValues.length === 0 && plainNumbers.length === 0) return { qty: null, unit: null, rate: null, total: null };
  if (isLumpSumPattern(line)) { const total = moneyValues[moneyValues.length - 1] ?? null; return { qty: 1, unit: "ls", rate: total, total }; }
  if (moneyValues.length >= 2) {
    const total = moneyValues[moneyValues.length - 1];
    const rate = moneyValues[moneyValues.length - 2];
    if (plainNumbers.length > 0) return { qty: plainNumbers[0], unit: unit ?? "ea", rate, total };
    const impliedQty = rate > 0 ? roundTo2(total / rate) : null;
    const qtyIsClean = impliedQty !== null && Math.abs(impliedQty - Math.round(impliedQty)) < 0.05;
    return { qty: qtyIsClean ? Math.round(impliedQty) : impliedQty, unit: unit ?? "ea", rate, total };
  }
  if (moneyValues.length === 1) {
    const total = moneyValues[0];
    if (plainNumbers.length >= 2) {
      const qty = plainNumbers[0]; const rate = plainNumbers[1];
      if (Math.abs(roundTo2(qty * rate) - total) < Math.max(1, total * 0.02)) return { qty, unit: unit ?? "ea", rate, total };
    }
    if (plainNumbers.length === 1) { const qty = plainNumbers[0]; return { qty, unit: unit ?? "ea", rate: qty > 0 ? roundTo2(total / qty) : total, total }; }
    return { qty: 1, unit: unit ?? "ls", rate: total, total };
  }
  if (plainNumbers.length >= 3) { const total = plainNumbers[plainNumbers.length - 1]; const rate = plainNumbers[plainNumbers.length - 2]; const qty = plainNumbers[plainNumbers.length - 3]; return { qty, unit: unit ?? "ea", rate, total }; }
  if (plainNumbers.length === 2) { const total = plainNumbers[plainNumbers.length - 1]; const rate = plainNumbers[plainNumbers.length - 2]; return { qty: 1, unit: unit ?? "ls", rate, total }; }
  if (plainNumbers.length === 1) { const total = plainNumbers[0]; return { qty: 1, unit: unit ?? "ls", rate: total, total }; }
  return { qty: null, unit: null, rate: null, total: null };
}

function scoreParseConfidence(params: { hasMoney: boolean; hasQty: boolean; hasRate: boolean; hasTotal: boolean; mathChecksOut: boolean; descLength: number; method: "column" | "fallback" | "multiline" }): number {
  let score = 0;
  if (params.descLength >= 10) score += 0.15; else if (params.descLength >= 5) score += 0.08;
  if (params.hasTotal) score += 0.25;
  if (params.hasRate) score += 0.15;
  if (params.hasQty) score += 0.15;
  if (params.hasMoney) score += 0.10;
  if (params.mathChecksOut) score += 0.20;
  if (params.method === "column") score += 0.10; else if (params.method === "multiline") score += 0.05;
  return Math.min(1, roundTo2(score));
}

function tryParseFullRow(line: string, lineIndex: number): RawLineItem | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 5) return null;
  if (isNoiseLine(trimmed)) return null;
  const hasMoney = /\$?\s*[\d,]+\.\d{2}/.test(trimmed);
  if (!/[A-Za-z]{3,}/.test(trimmed)) return null;
  const colResult = tryColumnParse(trimmed);
  if (colResult && colResult.total !== null && colResult.total > 0 && colResult.description.length >= 3) {
    const mathOk = colResult.qty !== null && colResult.rate !== null ? mathCheck(colResult.qty, colResult.rate, colResult.total) : false;
    const parseConfidence = scoreParseConfidence({ hasMoney, hasQty: colResult.qty !== null, hasRate: colResult.rate !== null, hasTotal: colResult.total !== null, mathChecksOut: mathOk, descLength: colResult.description.length, method: "column" });
    const hasQtyAndRate = colResult.qty !== null && colResult.rate !== null;
    const confidence: "high" | "medium" | "low" = hasQtyAndRate && hasMoney && mathOk ? "high" : hasQtyAndRate && hasMoney ? "medium" : hasMoney ? "medium" : "low";
    return { description: colResult.description, qty: colResult.qty, unit: colResult.unit, rate: colResult.rate, total: colResult.total, sourceLineIndex: lineIndex, rawLine: trimmed, confidence, parseMethod: "deterministic", parseConfidence };
  }
  const fields = inferFieldsFallback(trimmed);
  if (fields.total === null && fields.qty === null) return null;
  if (fields.total !== null && fields.total <= 0) return null;
  const desc = cleanDescription(stripNumbers(trimmed));
  if (desc.length < 3) return null;
  const mathOk = fields.qty !== null && fields.rate !== null && fields.total !== null ? mathCheck(fields.qty, fields.rate, fields.total) : false;
  const parseConfidence = scoreParseConfidence({ hasMoney, hasQty: fields.qty !== null, hasRate: fields.rate !== null, hasTotal: fields.total !== null, mathChecksOut: mathOk, descLength: desc.length, method: "fallback" });
  const hasQtyAndRate = fields.qty !== null && fields.rate !== null;
  const confidence: "high" | "medium" | "low" = hasQtyAndRate && hasMoney && mathOk ? "high" : hasMoney ? "medium" : "low";
  return { description: desc, qty: fields.qty, unit: fields.unit, rate: fields.rate, total: fields.total, sourceLineIndex: lineIndex, rawLine: trimmed, confidence, parseMethod: "deterministic", parseConfidence };
}

function tryParseMultiLine(lines: string[], startIndex: number): { item: RawLineItem; linesConsumed: number } | null {
  const firstLine = lines[startIndex]?.trim() ?? "";
  if (!firstLine || firstLine.length < 5) return null;
  if (isNoiseLine(firstLine)) return null;
  if (!/[A-Za-z]{3,}/.test(firstLine)) return null;
  if (/\$?\s*[\d,]+\.\d{2}/.test(firstLine)) return null;
  let combined = firstLine;
  let linesConsumed = 1;
  for (let offset = 1; offset <= 2 && startIndex + offset < lines.length; offset++) {
    const nextLine = lines[startIndex + offset]?.trim() ?? "";
    if (!nextLine) break;
    if (isNoiseLine(nextLine)) break;
    const nextHasMoney = /\$?\s*[\d,]+\.\d{2}/.test(nextLine);
    const nextHasNumbers = /\b\d+\.?\d*\b/.test(nextLine);
    if (!nextHasMoney && !nextHasNumbers) break;
    combined = combined + " " + nextLine;
    linesConsumed = offset + 1;
    if (nextHasMoney) break;
  }
  if (linesConsumed === 1) return null;
  const colResult = tryColumnParse(combined);
  let fields: { qty: number | null; unit: string | null; rate: number | null; total: number | null };
  let method: "column" | "fallback" | "multiline" = "multiline";
  if (colResult && colResult.total !== null && colResult.total > 0) { fields = { qty: colResult.qty, unit: colResult.unit, rate: colResult.rate, total: colResult.total }; method = "column"; }
  else { fields = inferFieldsFallback(combined); }
  if (fields.total === null) return null;
  const desc = cleanDescription(firstLine);
  if (desc.length < 3) return null;
  const hasMoney = /\$?\s*[\d,]+\.\d{2}/.test(combined);
  const mathOk = fields.qty !== null && fields.rate !== null && fields.total !== null ? mathCheck(fields.qty, fields.rate, fields.total) : false;
  const parseConfidence = scoreParseConfidence({ hasMoney, hasQty: fields.qty !== null, hasRate: fields.rate !== null, hasTotal: fields.total !== null, mathChecksOut: mathOk, descLength: desc.length, method });
  return { item: { description: desc, qty: fields.qty, unit: fields.unit, rate: fields.rate, total: fields.total, sourceLineIndex: startIndex, rawLine: combined, confidence: hasMoney && mathOk ? "high" : hasMoney ? "medium" : "low", parseMethod: "deterministic", parseConfidence }, linesConsumed };
}

function parseDeterministic(chunk: SmartChunk): RawLineItem[] {
  const lines = chunk.chunkText.split("\n");
  const items: RawLineItem[] = [];
  const usedLines = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (usedLines.has(i)) continue;
    const singleResult = tryParseFullRow(lines[i], i);
    if (singleResult) { items.push(singleResult); usedLines.add(i); continue; }
    const multiResult = tryParseMultiLine(lines, i);
    if (multiResult) { items.push(multiResult.item); for (let j = i; j < i + multiResult.linesConsumed; j++) usedLines.add(j); i += multiResult.linesConsumed - 1; }
  }
  return items;
}

// ─── LLM Normalizer ───────────────────────────────────────────────────────────

const NORMALIZATION_CONFIDENCE_THRESHOLD = 0.8;
const BATCH_SIZE = 40;

const SYSTEM_PROMPT = `You are a structured data field-cleaning assistant for construction quote documents.

ABSOLUTE RULES — NEVER VIOLATE:
1. You MUST return EXACTLY the same number of objects as the input array. No more, no less.
2. You MUST NOT create new rows. One input row → one output row, in the same order.
3. You MUST NOT merge rows together.
4. You MUST NOT invent quantities or rates that are not present or mathematically implied by the data.
5. You MUST NOT hallucinate values.

YOUR ONLY JOB is to clean the fields in each row:
  - description: cleaned item description (string, required)
  - qty: quantity as a number (null if not determinable from the input row)
  - unit: unit of measure lowercase (ea, m, m2, lm, ls, hr, etc.) (null if not determinable)
  - rate: unit rate as a number (null if not determinable from the input row)
  - total: line total as a number (null if not determinable from the input row)
  - normalization_confidence: a number between 0.0 and 1.0

Rules:
1. If qty * rate ≈ total (within 2%), keep all three values.
2. If only total is present and no qty/rate, set qty=1, unit="ls", rate=total.
3. If qty and total exist but rate is missing, compute rate = total / qty.
4. If rate and qty exist but total is missing, compute total = qty * rate.
5. Strip currency symbols, commas, and whitespace from numbers.
6. Description should be clean text — remove leading dashes, bullets, numbers.
7. Set normalization_confidence=1.0 when all fields are clear and math checks out.
8. Return ONLY a JSON array with EXACTLY the same length as the input. No explanation. No markdown.`;

function buildTradeHint(tradeType: TradeType): string {
  const hints: Record<TradeType, string> = {
    passive_fire: "This is a passive fire protection quote. Items typically include fire collars, fire stopping, penetration seals, intumescent products, fire doors. FRR ratings like '60/60/60' are part of descriptions.",
    plumbing: "This is a plumbing quote. Items include sanitary fixtures, pipework, valves, hot/cold water systems.",
    electrical: "This is an electrical quote. Items include conduit, cable, switchboards, light fittings, power outlets.",
    hvac: "This is an HVAC/mechanical quote. Items include ductwork, fan coil units, chillers, ventilation grilles.",
    active_fire: "This is an active fire protection quote. Items include sprinkler heads, hydrants, hose reels, detection devices.",
    carpentry: "This is a carpentry/joinery quote. Items include door sets, skirting, architraves, wardrobes, kitchen cabinets.",
    unknown: "",
  };
  return hints[tradeType] ?? "";
}

async function callOpenAI(apiKey: string, userPrompt: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt }], temperature: 0, max_tokens: 4000, response_format: { type: "json_object" } }),
  });
  if (!response.ok) { const err = await response.text(); throw new Error(`OpenAI API error ${response.status}: ${err}`); }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "{}";
}

function parseOpenAIResponse(raw: string): Array<{ description: string; qty: number | null; unit: string | null; rate: number | null; total: number | null; normalization_confidence: number }> {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    for (const key of Object.keys(parsed)) { if (Array.isArray(parsed[key])) return parsed[key]; }
    return [];
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) { try { return JSON.parse(match[0]); } catch { return []; } }
    return [];
  }
}

async function normalizeWithLLM(chunk: SmartChunk, deterministicItems: RawLineItem[], tradeType: TradeType, openaiApiKey: string): Promise<RawLineItem[]> {
  const lines = chunk.chunkText.split("\n");
  const deterministicLineIndexes = new Set(deterministicItems.map((i) => i.sourceLineIndex));
  const candidateLines = lines.filter((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) return false;
    if (isSummaryLine(trimmed)) return false;
    if (deterministicLineIndexes.has(idx)) return false;
    return /[A-Za-z]{3,}/.test(trimmed) && /\d/.test(trimmed);
  });
  if (candidateLines.length === 0) return [];
  const results: RawLineItem[] = [];
  let globalRowIndex = 0;
  const tradeHint = buildTradeHint(tradeType);
  for (let batchStart = 0; batchStart < candidateLines.length; batchStart += BATCH_SIZE) {
    const batch = candidateLines.slice(batchStart, batchStart + BATCH_SIZE);
    try {
      const userPrompt = `${tradeHint ? tradeHint + "\n\n" : ""}Clean the fields of the following ${batch.length} rows. Return ONLY a valid JSON array of exactly ${batch.length} objects.\n\nInput rows:\n${JSON.stringify(batch, null, 2)}`;
      const raw = await callOpenAI(openaiApiKey, userPrompt);
      const llmItems = parseOpenAIResponse(raw);
      if (llmItems.length !== batch.length) { globalRowIndex += batch.length; continue; }
      for (let i = 0; i < batch.length; i++) {
        const item = llmItems[i];
        if (!item.description || item.description.trim().length < 3) { globalRowIndex++; continue; }
        if (isSummaryLine(item.description)) { globalRowIndex++; continue; }
        const nc = typeof item.normalization_confidence === "number" ? Math.max(0, Math.min(1, item.normalization_confidence)) : 0.5;
        if (nc < NORMALIZATION_CONFIDENCE_THRESHOLD) { globalRowIndex++; continue; }
        const total = item.total !== null ? parseMoney(String(item.total)) : null;
        const qty = item.qty !== null ? parseMoney(String(item.qty)) : null;
        const rate = item.rate !== null ? parseMoney(String(item.rate)) : null;
        const inferredTotal = total ?? (qty !== null && rate !== null ? roundTo2(qty * rate) : null);
        const inferredRate = rate ?? (qty !== null && qty > 0 && inferredTotal !== null ? roundTo2(inferredTotal / qty) : null);
        if (!inferredTotal || inferredTotal <= 0) { globalRowIndex++; continue; }
        results.push({ description: String(item.description).trim(), qty: qty ?? (inferredTotal !== null ? 1 : null), unit: item.unit ? String(item.unit).toLowerCase().trim() : "ea", rate: inferredRate ?? inferredTotal, total: inferredTotal, sourceLineIndex: globalRowIndex, rawLine: JSON.stringify(item), confidence: nc >= NORMALIZATION_CONFIDENCE_THRESHOLD ? "medium" : "low", parseMethod: "llm", normalization_confidence: nc });
        globalRowIndex++;
      }
    } catch (err) { console.warn(`[TestParsingV2] LLM batch failed:`, err); globalRowIndex += batch.length; }
  }
  return results;
}

// ─── Validation Engine ────────────────────────────────────────────────────────

const MATH_TOLERANCE_PCT = 0.02;
const DOCUMENT_TOTAL_TOLERANCE_PCT = 0.05;

function validateItems(items: NormalizedLineItem[], documentTotal: number | null) {
  const issues: ValidationIssue[] = [];
  const validItems: NormalizedLineItem[] = [];
  const invalidItems: NormalizedLineItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemIssues: ValidationIssue[] = [];
    if (!item.description || item.description.trim().length < 3) itemIssues.push({ type: "missing_description", severity: "error", itemIndex: i, message: `Item ${i} has no usable description`, details: {} });
    if (item.total <= 0 && !item.isAdjustment) itemIssues.push({ type: "zero_total", severity: "warning", itemIndex: i, message: `Item has zero or negative total: "${item.description}"`, details: { total: item.total } });
    if (item.total < 0 && !item.isAdjustment) itemIssues.push({ type: "negative_total", severity: "warning", itemIndex: i, message: `Item has negative total: "${item.description}" = ${item.total}`, details: { total: item.total } });
    if (item.qty > 0 && item.rate > 0 && item.total > 0 && !mathCheck(item.qty, item.rate, item.total, MATH_TOLERANCE_PCT)) {
      const computed = roundTo2(item.qty * item.rate);
      itemIssues.push({ type: "math_mismatch", severity: "warning", itemIndex: i, message: `Math mismatch: ${item.qty} × ${item.rate} = ${computed}, but total is ${item.total}`, details: { qty: item.qty, rate: item.rate, total: item.total, computed } });
    }
    if (item.rate > 1_000_000) itemIssues.push({ type: "implausible_rate", severity: "warning", itemIndex: i, message: `Implausibly high rate $${item.rate} for "${item.description}"`, details: { rate: item.rate } });
    if (item.qty > 100_000) itemIssues.push({ type: "implausible_qty", severity: "warning", itemIndex: i, message: `Implausibly high qty ${item.qty} for "${item.description}"`, details: { qty: item.qty } });
    issues.push(...itemIssues);
    if (itemIssues.some((iss) => iss.severity === "error")) invalidItems.push(item); else validItems.push(item);
  }
  const exactSeen = new Map<string, number>();
  const fuzzySeen = new Map<string, number>();
  const dupeErrorIndexes = new Set<number>();
  for (let i = 0; i < validItems.length; i++) {
    const item = validItems[i];
    if (item.isAdjustment) continue;
    const exact = dedupeKey(item);
    if (exactSeen.has(exact)) { issues.push({ type: "duplicate", severity: "error", itemIndex: i, message: `Exact duplicate of item ${exactSeen.get(exact)}: "${item.description}"`, details: { duplicateOf: exactSeen.get(exact) } }); dupeErrorIndexes.add(i); }
    else { exactSeen.set(exact, i); }
    const fuzzy = fuzzyDedupeKey(item.description);
    if (fuzzySeen.has(fuzzy) && !exactSeen.has(exact)) {
      const prev = validItems[fuzzySeen.get(fuzzy)!];
      if (prev && Math.abs(prev.total - item.total) / Math.max(item.total, 1) < 0.1) issues.push({ type: "duplicate", severity: "warning", itemIndex: i, message: `Likely duplicate of item ${fuzzySeen.get(fuzzy)}: "${item.description}"`, details: { duplicateOf: fuzzySeen.get(fuzzy), similarity: "fuzzy" } });
    } else if (!fuzzySeen.has(fuzzy)) { fuzzySeen.set(fuzzy, i); }
  }
  const finalValid = validItems.filter((_, idx) => !dupeErrorIndexes.has(idx));
  invalidItems.push(...validItems.filter((_, idx) => dupeErrorIndexes.has(idx)));
  const itemsTotal = roundTo2(finalValid.reduce((s, i) => s + i.total, 0));
  if (documentTotal !== null && documentTotal > 0) {
    const gap = roundTo2(documentTotal - itemsTotal);
    const gapPct = Math.abs(gap) / documentTotal;
    if (gapPct > DOCUMENT_TOTAL_TOLERANCE_PCT) issues.push({ type: "document_total_gap", severity: gapPct > 0.15 ? "error" : "warning", itemIndex: null, message: `Items total $${itemsTotal.toFixed(2)} differs from document total $${documentTotal.toFixed(2)} by $${Math.abs(gap).toFixed(2)} (${(gapPct * 100).toFixed(1)}%)`, details: { itemsTotal, documentTotal, gap, gapPct } });
  }
  const parsingGap = documentTotal !== null ? roundTo2(documentTotal - itemsTotal) : 0;
  const parsingGapPercent = documentTotal !== null && documentTotal > 0 ? roundTo2((Math.abs(parsingGap) / documentTotal) * 100) : 0;
  let score = 100;
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  score -= errors * 15;
  score -= warnings * 5;
  const highConfidence = finalValid.filter((i) => i.confidence === "high").length;
  const lowConfidence = finalValid.filter((i) => i.confidence === "low").length;
  if (finalValid.length > 0) {
    score += Math.round((highConfidence / finalValid.length) * 10);
    score -= Math.round((lowConfidence / finalValid.length) * 10);
  }
  if (documentTotal !== null) {
    const gapPct = Math.abs(documentTotal - itemsTotal) / documentTotal;
    if (gapPct < 0.01) score += 10; else if (gapPct < 0.05) score += 5; else if (gapPct > 0.2) score -= 15;
  }
  score = Math.max(0, Math.min(100, score));
  return { validItems: finalValid, invalidItems, issues, score, itemsTotal, documentTotal, parsingGap, parsingGapPercent, hasGap: parsingGapPercent > 2, hasCriticalErrors: issues.some((i) => i.severity === "error" && i.type !== "duplicate") };
}

// ─── Normalization ────────────────────────────────────────────────────────────

function rawToNormalized(raw: RawLineItem, chunk: SmartChunk, chunkIndex: number, source: "deterministic" | "llm"): NormalizedLineItem {
  const qty = safeNum(raw.qty ?? 1);
  const rate = safeNum(raw.rate ?? raw.total ?? 0);
  const total = safeNum(raw.total ?? qty * rate);
  const inferredTotal = total > 0 ? total : roundTo2(qty * rate);
  const inferredRate = rate > 0 ? rate : qty > 0 ? roundTo2(inferredTotal / qty) : 0;
  const desc = (raw.description ?? "").trim();
  return { description: desc, qty: qty > 0 ? qty : 1, unit: (raw.unit ?? "ea").toLowerCase().trim() || "ea", rate: inferredRate, total: inferredTotal, section: chunk.section, block: chunk.block, isOptional: /\b(optional|option\s+\d|alt\b|\(opt\))\b/i.test(desc), isAdjustment: false, isSummaryRow: false, frr: extractFRR(desc), sourceChunk: chunkIndex, confidence: raw.confidence, parseMethod: raw.parseMethod, source, chunkIndex, originalText: raw.rawLine };
}

function deduplicateItems(items: NormalizedLineItem[]): NormalizedLineItem[] {
  const seen = new Map<string, number>();
  const result: NormalizedLineItem[] = [];
  for (const item of items) {
    if (item.isAdjustment) { result.push(item); continue; }
    const key = dedupeKey(item);
    if (!seen.has(key)) { seen.set(key, result.length); result.push(item); }
  }
  return result;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startMs = Date.now();

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let body: TestRequest;
    try { body = await req.json(); }
    catch { return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

    const { text: rawText, fileUrl, tradeType, documentTotal: providedDocTotal } = body;

    let text: string;
    if (fileUrl) {
      console.log(`[TestParsingV2] Fetching file from URL: ${fileUrl}`);
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error(`Failed to fetch file: ${res.status} ${res.statusText}`);
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        text = typeof json.text === "string" ? json.text : typeof json.content === "string" ? json.content : JSON.stringify(json);
      } else {
        text = await res.text();
      }
      console.log(`[TestParsingV2] Fetched ${text.length} chars from URL`);
    } else if (rawText && typeof rawText === "string" && rawText.trim().length > 0) {
      text = rawText;
    } else {
      return new Response(JSON.stringify({ error: "Provide either 'text' or 'fileUrl'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const inputLines = text.split("\n").filter((l) => l.trim().length > 0);

    console.log(`[TestParsingV2] Input: ${text.length} chars, ${inputLines.length} non-empty lines`);
    console.log(`[TestParsingV2] Trade override: ${tradeType ?? "auto-detect"}`);

    const structure = detectStructure(text);
    const detectedTrade: TradeType = tradeType ?? structure.metadata.estimatedTradeType;
    const documentTotal = providedDocTotal ?? structure.metadata.grandTotal ?? extractDocumentTotal(text);

    console.log(`[TestParsingV2] Detected trade: ${detectedTrade}, document total: ${documentTotal ?? "N/A"}`);

    const chunks = createSmartChunks(text, structure);
    console.log(`[TestParsingV2] Created ${chunks.length} chunks`);

    const allNormalized: NormalizedLineItem[] = [];
    let totalDeterministicRaw = 0;
    let totalLlmRaw = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const deterministicItems = parseDeterministic(chunk);
      const chunkLineCount = chunk.chunkText.split("\n").filter((l) => l.trim()).length;
      const coverage = chunkLineCount > 0 ? deterministicItems.length / chunkLineCount : 0;
      const needsLLM = apiKey && (deterministicItems.length === 0 || coverage < 0.2 || chunk.estimatedItemCount > deterministicItems.length * 1.5);
      let llmItems: RawLineItem[] = [];
      if (needsLLM && apiKey) {
        try { llmItems = await normalizeWithLLM(chunk, deterministicItems, detectedTrade, apiKey); }
        catch (err) { console.warn(`[TestParsingV2] LLM fallback failed for chunk ${i}:`, err); }
      }
      totalDeterministicRaw += deterministicItems.length;
      totalLlmRaw += llmItems.length;
      console.log(`[TestParsingV2] Chunk ${i + 1}/${chunks.length} "${chunk.section}": ${deterministicItems.length} det + ${llmItems.length} llm`);
      for (const raw of deterministicItems) {
        if (!raw.description || raw.description.trim().length < 3) continue;
        const item = rawToNormalized(raw, chunk, i, "deterministic");
        if (item.total <= 0 && !item.isAdjustment) continue;
        allNormalized.push(item);
      }
      for (const raw of llmItems) {
        if (!raw.description || raw.description.trim().length < 3) continue;
        const item = rawToNormalized(raw, chunk, i, "llm");
        if (item.total <= 0 && !item.isAdjustment) continue;
        allNormalized.push(item);
      }
    }

    const mergedItems = deduplicateItems(allNormalized);
    const validation = validateItems(mergedItems, documentTotal ?? null);
    const totalParsedRows = totalDeterministicRaw + totalLlmRaw;
    const deterministicRatio = totalParsedRows > 0 ? roundTo2(totalDeterministicRaw / totalParsedRows) : 0;
    const llmRatio = totalParsedRows > 0 ? roundTo2(totalLlmRaw / totalParsedRows) : 0;
    const lowConfidenceItemsCount = validation.validItems.filter((i) => i.confidence === "low").length;
    const processingMs = Date.now() - startMs;

    console.log(`[TestParsingV2] Complete — ${validation.validItems.length} valid items, score=${validation.score}, ${processingMs}ms`);
    console.log(`[TestParsingV2] Input lines: ${inputLines.length} | Parsed rows: ${totalParsedRows}`);
    console.log(`[TestParsingV2] Deterministic: ${totalDeterministicRaw} (${(deterministicRatio * 100).toFixed(1)}%) | LLM: ${totalLlmRaw} (${(llmRatio * 100).toFixed(1)}%)`);

    return new Response(
      JSON.stringify({
        items: validation.validItems,
        validation: {
          score: validation.score,
          itemsTotal: validation.itemsTotal,
          documentTotal: validation.documentTotal,
          parsingGap: validation.parsingGap,
          parsingGapPercent: validation.parsingGapPercent,
          hasGap: validation.hasGap,
          hasCriticalErrors: validation.hasCriticalErrors,
        },
        confidence_score: validation.score,
        issues: validation.issues,
        stats: {
          totalChunks: chunks.length,
          deterministicItems: totalDeterministicRaw,
          llmItems: totalLlmRaw,
          validationScore: validation.score,
        },
        debug: {
          parsingGap: validation.parsingGap,
          parsingGapPercent: validation.parsingGapPercent,
          invalidItemsCount: validation.invalidItems.length,
          lowConfidenceItemsCount,
          inputLines: inputLines.length,
          totalParsedRows,
          deterministicRatio,
          llmRatio,
          detectedTrade,
          documentTotal: documentTotal ?? null,
          chunksTotal: chunks.length,
          processingMs,
          parserVersion: PARSER_VERSION,
        },
      }, null, 2),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const processingMs = Date.now() - startMs;
    console.error("[TestParsingV2] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err), debug: { processingMs } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
