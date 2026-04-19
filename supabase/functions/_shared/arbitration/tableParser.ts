/**
 * Universal Table Parsing Engine
 *
 * Detects header rows of shape: Qty | Unit | Rate | Total (or permutations/synonyms)
 * When detected, preserves true qty and rate from their respective columns.
 * Never flattens unreadable rows to qty=1 + rate=total.
 */

export interface DetectedTableHeader {
  line_number: number;
  columns: Array<{ index: number; label: string; role: ColumnRole | null }>;
  confidence: number;
}

export type ColumnRole = "qty" | "unit" | "rate" | "total" | "description" | "item_number" | "unknown";

export interface ParsedTableRow {
  qty: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  description: string;
  item_number: string | null;
  line_number: number;
  source: "table_parser";
  confidence: number;
}

const HEADER_SYNONYMS: Record<ColumnRole, RegExp[]> = {
  qty: [/^q(?:ty|uantity)$/i, /^no\.?$/i, /^nr$/i, /^count$/i],
  unit: [/^unit$/i, /^uom$/i, /^u\/m$/i, /^measure$/i],
  rate: [/^rate$/i, /^unit\s*(?:price|cost|rate)$/i, /^u\/?p$/i, /^price$/i],
  total: [/^total$/i, /^amount$/i, /^line\s*total$/i, /^ext(?:ension)?$/i, /^sub\s*total$/i, /^value$/i],
  description: [/^desc(?:ription)?$/i, /^item$/i, /^scope$/i, /^particulars?$/i, /^works?$/i],
  item_number: [/^#$/i, /^no$/i, /^item\s*no\.?$/i, /^ref(?:erence)?$/i, /^line$/i, /^code$/i],
  unknown: [],
};

const classifyHeaderCell = (cell: string): ColumnRole | null => {
  const trimmed = cell.trim();
  if (!trimmed) return null;
  for (const [role, patterns] of Object.entries(HEADER_SYNONYMS) as Array<[ColumnRole, RegExp[]]>) {
    for (const p of patterns) {
      if (p.test(trimmed)) return role;
    }
  }
  return null;
};

const splitRow = (line: string): string[] => {
  if (line.includes("\t")) return line.split("\t").map((s) => s.trim());
  if (line.includes("|")) return line.split("|").map((s) => s.trim()).filter((_, i, arr) => i !== 0 || arr[0] !== "");
  return line.split(/\s{2,}/).map((s) => s.trim()).filter((s) => s.length > 0);
};

export function detectTableHeaders(text: string): DetectedTableHeader[] {
  const headers: DetectedTableHeader[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells.length < 3) continue;
    const roles = cells.map((c) => classifyHeaderCell(c));
    const recognised = roles.filter((r) => r !== null).length;
    if (recognised < 2) continue;
    const hasMoney = roles.includes("total") || roles.includes("rate");
    if (!hasMoney) continue;
    headers.push({
      line_number: i + 1,
      columns: cells.map((label, idx) => ({ index: idx, label, role: roles[idx] })),
      confidence: Math.min(0.95, 0.55 + 0.1 * recognised),
    });
  }
  return headers;
}

const parseMoney = (raw: string): number | null => {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/\d/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const parseQty = (raw: string): number | null => {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Parse a text block given a detected header. Returns typed rows with
 * TRUE qty and rate preserved from their respective columns.
 * Unreadable values become null, never fabricated.
 */
export function parseTableRows(text: string, header: DetectedTableHeader): ParsedTableRow[] {
  const lines = text.split(/\r?\n/);
  const rows: ParsedTableRow[] = [];
  const roleIndex = (role: ColumnRole): number =>
    header.columns.findIndex((c) => c.role === role);

  const qtyIdx = roleIndex("qty");
  const unitIdx = roleIndex("unit");
  const rateIdx = roleIndex("rate");
  const totalIdx = roleIndex("total");
  const descIdx = roleIndex("description");
  const itemIdx = roleIndex("item_number");

  for (let i = header.line_number; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = splitRow(line);
    if (cells.length < 2) continue;

    const qty = qtyIdx >= 0 ? parseQty(cells[qtyIdx] ?? "") : null;
    const unit = unitIdx >= 0 ? (cells[unitIdx] ?? "").trim() || null : null;
    const rate = rateIdx >= 0 ? parseMoney(cells[rateIdx] ?? "") : null;
    const total = totalIdx >= 0 ? parseMoney(cells[totalIdx] ?? "") : null;
    const description = descIdx >= 0 ? (cells[descIdx] ?? "").trim() : cells.find((c) => /[A-Za-z]{4,}/.test(c)) ?? "";
    const item_number = itemIdx >= 0 ? (cells[itemIdx] ?? "").trim() || null : null;

    if (total === null && rate === null) continue;
    if (!description || description.length < 3) continue;

    let confidence = 0.80;
    if (qty !== null && rate !== null && total !== null) {
      const expected = qty * rate;
      const diff = Math.abs(expected - total);
      const tol = Math.max(total * 0.02, 0.5);
      confidence = diff <= tol ? 0.95 : 0.65;
    } else if (total !== null && rate === null && qty === null) {
      confidence = 0.70;
    }

    rows.push({
      qty,
      unit,
      rate,
      total,
      description,
      item_number,
      line_number: i + 1,
      source: "table_parser",
      confidence,
    });
  }

  return rows;
}
