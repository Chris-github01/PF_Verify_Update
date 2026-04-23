/**
 * Render PDF assistant layer.
 *
 * Runs BEFORE the extraction stage as a parallel intelligence source.
 * It is NOT the primary parser and NOT a fallback. It provides layout
 * hints (tables, row counts, section headers, totals blocks) that can
 * be surfaced for mismatch detection and operator visibility.
 *
 * If the Render service is unavailable, the call times out, or it
 * returns a non-2xx response, the function resolves with
 * `{ enabled: false, error }` so the parser continues normally.
 */

export type RenderTableHint = {
  page: number;
  section: string | null;
  rows_detected: number;
  columns: string[];
  rows: string[][];
};

export type RenderLayoutResult = {
  enabled: boolean;
  reason: string | null;
  rows_detected_total: number;
  tables_detected: number;
  totals_detected: number;
  sections_detected: number;
  render_pages: number;
  extracted_text_chars: number;
  items_count_from_render: number;
  http_status: number | null;
  endpoint: string | null;
  tables: RenderTableHint[];
  totals_blocks: Array<{ page: number; text: string; amount: number | null }>;
  section_headers: Array<{ page: number; text: string }>;
  page_zones: Array<{ page: number; zones: string[] }>;
  repeated_schedules: Array<{ section: string; occurrences: number }>;
  duration_ms: number;
  raw_response_summary: string | null;
  json_payload_preview: string | null;
};

export type ExtractRenderLayoutInput = {
  pdfBytes: Uint8Array | null;
  fileName: string;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;

const MAX_TABLES = 50;
const MAX_ROWS_PER_TABLE = 200;
const MAX_RAW_SUMMARY_CHARS = 1500;
const MAX_JSON_PAYLOAD_PREVIEW_CHARS = 6000;

function disabledResult(
  reason: string,
  duration_ms = 0,
  extras?: Partial<RenderLayoutResult>,
): RenderLayoutResult {
  return {
    enabled: false,
    reason,
    rows_detected_total: 0,
    tables_detected: 0,
    totals_detected: 0,
    sections_detected: 0,
    render_pages: 0,
    extracted_text_chars: 0,
    items_count_from_render: 0,
    http_status: null,
    endpoint: null,
    tables: [],
    totals_blocks: [],
    section_headers: [],
    page_zones: [],
    repeated_schedules: [],
    duration_ms,
    raw_response_summary: null,
    json_payload_preview: null,
    ...extras,
  };
}

function getBaseUrl(): string | null {
  const url = Deno.env.get("PDF_EXTRACTOR_BASE_URL")?.trim();
  if (url) return url.replace(/\/+$/, "");
  return "https://verify-pdf-extractor.onrender.com";
}

function getApiKey(): string | null {
  return (
    Deno.env.get("RENDER_PDF_EXTRACTOR_API_KEY")?.trim() ||
    Deno.env.get("PYTHON_PARSER_API_KEY")?.trim() ||
    null
  );
}

/**
 * Infer a "section" label for a table by scanning its first row for
 * header-like tokens (BLOCK 30, LEVEL 02, etc). Best-effort only.
 */
function inferSection(rows: string[][]): string | null {
  if (!rows.length) return null;
  const header = rows[0].filter(Boolean).map((c) => String(c).trim()).join(" ");
  const match = header.match(/\b(BLOCK|LEVEL|ZONE|AREA|STAGE|TOWER)\b[\s:]*([A-Z0-9-]+)/i);
  if (match) return `${match[1].toUpperCase()} ${match[2]}`;
  return null;
}

function toStringRow(row: unknown): string[] {
  if (!Array.isArray(row)) return [];
  return row.map((c) => (c == null ? "" : String(c).trim()));
}

function detectTotalsBlocks(text: string | null): RenderLayoutResult["totals_blocks"] {
  if (!text) return [];
  const blocks: RenderLayoutResult["totals_blocks"] = [];
  const totalPattern = /(grand\s+total|sub[-\s]?total|total\s+(?:excl|incl)[^\n]*|total\s+amount|amount\s+due)[^\n]{0,120}/gi;
  let match: RegExpExecArray | null;
  while ((match = totalPattern.exec(text)) != null && blocks.length < 10) {
    const snippet = match[0].trim();
    const amountMatch = snippet.match(/\$?\s*([0-9][0-9,]*(?:\.\d{2})?)/);
    const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : null;
    blocks.push({ page: 0, text: snippet, amount: Number.isFinite(amount) ? amount : null });
  }
  return blocks;
}

export async function extractRenderLayout(
  input: ExtractRenderLayoutInput,
): Promise<RenderLayoutResult> {
  const started = Date.now();

  if (!input.pdfBytes || input.pdfBytes.byteLength === 0) {
    console.log("[render_layout] skip reason=no_pdf_bytes");
    return disabledResult("no_pdf_bytes");
  }

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    console.log("[render_layout] skip reason=no_base_url");
    return disabledResult("no_base_url");
  }

  const apiKey = getApiKey();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = `${baseUrl}/parse/pdfplumber`;
  console.log(
    `[render_layout] calling endpoint=${endpoint} apiKey=${apiKey ? "present" : "absent"} ` +
    `pdf_bytes=${input.pdfBytes.byteLength} filename=${input.fileName}`,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const formData = new FormData();
    const blob = new Blob([input.pdfBytes], { type: "application/pdf" });
    formData.append("file", blob, input.fileName || "quote.pdf");

    const headers: Record<string, string> = {};
    if (apiKey) headers["X-API-Key"] = apiKey;

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[render_layout] http_error status=${res.status} body=${text.slice(0, 200)}`,
      );
      return disabledResult(
        `http_${res.status}:${text.slice(0, 200)}`,
        Date.now() - started,
        { http_status: res.status, endpoint },
      );
    }

    const rawBodyText = await res.text();
    console.log(
      `[render_layout] http_ok status=${res.status} body_chars=${rawBodyText.length}`,
    );

    let data: unknown;
    try {
      data = JSON.parse(rawBodyText);
    } catch (parseErr) {
      console.warn(
        `[render_layout] json_parse_failed body_preview=${rawBodyText.slice(0, 200)}`,
      );
      return disabledResult("invalid_json", Date.now() - started, {
        http_status: res.status,
        endpoint,
        json_payload_preview: rawBodyText.slice(0, MAX_JSON_PAYLOAD_PREVIEW_CHARS),
      });
    }
    if (!data || typeof data !== "object") {
      return disabledResult("invalid_json", Date.now() - started, {
        http_status: res.status,
        endpoint,
        json_payload_preview: rawBodyText.slice(0, MAX_JSON_PAYLOAD_PREVIEW_CHARS),
      });
    }

    const rawTables: unknown[] = Array.isArray((data as { raw_tables?: unknown }).raw_tables)
      ? ((data as { raw_tables: unknown[] }).raw_tables)
      : [];

    const tables: RenderTableHint[] = [];
    let rowsDetectedTotal = 0;
    const sectionSet = new Set<string>();
    const repeatedCounter = new Map<string, number>();

    for (const rawTable of rawTables.slice(0, MAX_TABLES)) {
      if (!rawTable || typeof rawTable !== "object") continue;
      const t = rawTable as { page?: number; rows?: unknown; row_count?: number };
      const rowsRaw = Array.isArray(t.rows) ? t.rows : [];
      const rows: string[][] = rowsRaw
        .slice(0, MAX_ROWS_PER_TABLE)
        .map(toStringRow)
        .filter((r) => r.some((c) => c.length > 0));
      if (rows.length === 0) continue;

      const columns = rows[0];
      const section = inferSection(rows);
      if (section) {
        sectionSet.add(section);
        repeatedCounter.set(section, (repeatedCounter.get(section) ?? 0) + 1);
      }

      const detectedRowCount = Math.max(0, (typeof t.row_count === "number" ? t.row_count : rows.length) - 1);
      rowsDetectedTotal += detectedRowCount;

      tables.push({
        page: typeof t.page === "number" ? t.page : 0,
        section,
        rows_detected: detectedRowCount,
        columns,
        rows,
      });
    }

    const textForTotals = typeof (data as { text?: unknown }).text === "string"
      ? ((data as { text: string }).text)
      : null;
    const totals_blocks = detectTotalsBlocks(textForTotals);

    const section_headers: RenderLayoutResult["section_headers"] = [...sectionSet].map((s) => ({
      page: 0,
      text: s,
    }));

    const repeated_schedules: RenderLayoutResult["repeated_schedules"] = [...repeatedCounter.entries()]
      .filter(([, count]) => count > 1)
      .map(([section, occurrences]) => ({ section, occurrences }));

    const page_zones: RenderLayoutResult["page_zones"] = tables.reduce((acc, t) => {
      if (t.page <= 0) return acc;
      const existing = acc.find((z) => z.page === t.page);
      const label = t.section ?? `table_${acc.length + 1}`;
      if (existing) existing.zones.push(label);
      else acc.push({ page: t.page, zones: [label] });
      return acc;
    }, [] as RenderLayoutResult["page_zones"]);

    const metadata = (data as { metadata?: { num_pages?: unknown; tables_found?: unknown } }).metadata ?? {};
    const render_pages = typeof metadata.num_pages === "number" ? metadata.num_pages : 0;
    const extracted_text_chars = typeof textForTotals === "string" ? textForTotals.length : 0;
    const items_count_from_render = Array.isArray((data as { items?: unknown }).items)
      ? ((data as { items: unknown[] }).items.length)
      : 0;

    const raw_response_summary = (() => {
      try {
        const pruned = {
          parser_name: (data as { parser_name?: unknown }).parser_name ?? null,
          num_pages: render_pages,
          tables_found: metadata.tables_found ?? null,
          items_count: items_count_from_render,
          text_chars: extracted_text_chars,
          tables_mapped: tables.length,
          rows_detected_total: rowsDetectedTotal,
        };
        return JSON.stringify(pruned).slice(0, MAX_RAW_SUMMARY_CHARS);
      } catch {
        return null;
      }
    })();

    const json_payload_preview = (() => {
      try {
        return JSON.stringify(data).slice(0, MAX_JSON_PAYLOAD_PREVIEW_CHARS);
      } catch {
        return rawBodyText.slice(0, MAX_JSON_PAYLOAD_PREVIEW_CHARS);
      }
    })();

    console.log(
      `[render_layout] result enabled=true render_pages=${render_pages} ` +
      `tables_mapped=${tables.length} rows_detected_total=${rowsDetectedTotal} ` +
      `totals_blocks=${totals_blocks.length} sections=${section_headers.length} ` +
      `text_chars=${extracted_text_chars} items_from_render=${items_count_from_render}`,
    );

    return {
      enabled: true,
      reason: null,
      rows_detected_total: rowsDetectedTotal,
      tables_detected: tables.length,
      totals_detected: totals_blocks.length,
      sections_detected: section_headers.length,
      render_pages,
      extracted_text_chars,
      items_count_from_render,
      http_status: res.status,
      endpoint,
      tables,
      totals_blocks,
      section_headers,
      page_zones,
      repeated_schedules,
      duration_ms: Date.now() - started,
      raw_response_summary,
      json_payload_preview,
    };
  } catch (err) {
    const reason = err instanceof Error
      ? (err.name === "AbortError" ? "timeout" : err.message.slice(0, 200))
      : "unknown_error";
    console.warn(`[render_layout] threw reason=${reason}`);
    return disabledResult(reason, Date.now() - started, { endpoint });
  } finally {
    clearTimeout(timer);
  }
}
