import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Winner = "v1" | "v2" | "equal";

interface RequestBody {
  run_id?: string | null;
  file_url: string;
  filename: string;
  supplier: string;
  trade: string;
  quote_id?: string | null;
  actual_total?: number | null;
  source?: string | null;
}

interface ParserResult {
  total: number;
  runtime_ms: number;
  requires_review: boolean;
  notes: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = (await req.json()) as RequestBody;
    if (!body.file_url) {
      return json({ error: "file_url is required" }, 400);
    }

    const runId = body.run_id ?? null;
    const source = body.source ?? (runId ? "vault_bulk" : "auto_on_import");
    console.log(
      `[bulk_compare_vault_pdf] start source=${source} quote_id=${body.quote_id ?? "n/a"} file=${body.filename}`,
    );

    if (body.quote_id) {
      const { data: existing } = await supabase
        .from("parser_version_comparisons")
        .select("id")
        .eq("quote_id", body.quote_id)
        .limit(1)
        .maybeSingle();
      if (existing) {
        console.log(
          `[bulk_compare_vault_pdf] skip duplicate quote_id=${body.quote_id} existing=${existing.id}`,
        );
        return json({ success: true, skipped: "duplicate", existing_id: existing.id });
      }
    }

    if (runId) {
      await supabase
        .from("parser_bulk_runs")
        .update({ current_file: body.filename ?? body.file_url })
        .eq("id", runId);
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("quotes")
      .download(body.file_url);

    if (downloadError || !fileData) {
      await recordFailure(supabase, body, "download_failed");
      return json({ success: false, reason: "download_failed" }, 200);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const rawText = await extractPdfText(arrayBuffer, body.filename);

    if (!rawText || rawText.length < 20) {
      await recordFailure(supabase, body, "empty_text");
      return json({ success: false, reason: "empty_text" }, 200);
    }

    const v1 = runLegacyParser(rawText);
    const v2 = runParserV2(rawText);

    const reference = body.actual_total ?? null;
    const winner = pickWinner(v1.total, v2.total, reference);
    const variance = computeVariance(v1.total, v2.total, reference);
    const requires_review = v1.requires_review || v2.requires_review;
    const failure_cause = deriveFailureCause(v1, v2, reference, winner);

    const { error: insertError } = await supabase
      .from("parser_version_comparisons")
      .insert({
        quote_id: body.quote_id ?? null,
        supplier: body.supplier ?? "Unknown",
        trade: body.trade ?? "unknown",
        v1_total: v1.total,
        v2_total: v2.total,
        actual_total: reference,
        v1_runtime_ms: v1.runtime_ms,
        v2_runtime_ms: v2.runtime_ms,
        v1_requires_review: v1.requires_review,
        v2_requires_review: v2.requires_review,
        requires_review,
        winner,
        variance_pct: variance,
        failure_cause,
        metadata: {
          source,
          run_id: runId,
          filename: body.filename,
          v1_notes: v1.notes,
          v2_notes: v2.notes,
        },
      });

    if (insertError) {
      await recordFailure(supabase, body, `insert_failed:${insertError.message}`);
      return json({ success: false, reason: "insert_failed", detail: insertError.message }, 200);
    }

    if (runId) {
      await bumpRunCounters(supabase, runId, winner, v1.runtime_ms, v2.runtime_ms);
    }
    console.log(
      `[bulk_compare_vault_pdf] done source=${source} quote_id=${body.quote_id ?? "n/a"} winner=${winner} v1=${v1.total} v2=${v2.total}`,
    );

    return json({
      success: true,
      winner,
      v1_total: v1.total,
      v2_total: v2.total,
      variance_pct: variance,
      requires_review,
    });
  } catch (err) {
    console.error("[bulk_compare_vault_pdf] error", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function recordFailure(
  supabase: ReturnType<typeof createClient>,
  body: RequestBody,
  reason: string,
) {
  console.log(
    `[bulk_compare_vault_pdf] failure quote_id=${body.quote_id ?? "n/a"} file=${body.filename} reason=${reason}`,
  );
  if (!body.run_id) return;
  await supabase.rpc("increment_bulk_run_failure", { p_run_id: body.run_id }).then(
    () => undefined,
    () => undefined,
  );

  const { data } = await supabase
    .from("parser_bulk_runs")
    .select("failed_count, processed_count, queued_unique")
    .eq("id", body.run_id)
    .maybeSingle();
  if (!data) return;

  const failed = (data.failed_count ?? 0) + 1;
  const processed = (data.processed_count ?? 0) + 1;
  const queued = data.queued_unique ?? 1;
  const progress = Math.min(100, Math.round((processed / Math.max(1, queued)) * 100));

  await supabase
    .from("parser_bulk_runs")
    .update({
      failed_count: failed,
      processed_count: processed,
      progress_percent: progress,
      current_file: `${body.filename ?? "unknown"} (failed: ${reason})`,
    })
    .eq("id", body.run_id);
}

async function bumpRunCounters(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  winner: Winner,
  v1ms: number,
  v2ms: number,
) {
  const { data } = await supabase
    .from("parser_bulk_runs")
    .select(
      "processed_count, queued_unique, v1_better_count, v2_better_count, equal_count, avg_v1_runtime_ms, avg_v2_runtime_ms",
    )
    .eq("id", runId)
    .maybeSingle();
  if (!data) return;

  const prevProcessed = data.processed_count ?? 0;
  const processed = prevProcessed + 1;
  const queued = data.queued_unique ?? 1;
  const progress = Math.min(100, Math.round((processed / Math.max(1, queued)) * 100));

  const v1Better = (data.v1_better_count ?? 0) + (winner === "v1" ? 1 : 0);
  const v2Better = (data.v2_better_count ?? 0) + (winner === "v2" ? 1 : 0);
  const equal = (data.equal_count ?? 0) + (winner === "equal" ? 1 : 0);

  const prevAvgV1 = data.avg_v1_runtime_ms ?? 0;
  const prevAvgV2 = data.avg_v2_runtime_ms ?? 0;
  const nextAvgV1 = Math.round((prevAvgV1 * prevProcessed + v1ms) / processed);
  const nextAvgV2 = Math.round((prevAvgV2 * prevProcessed + v2ms) / processed);

  await supabase
    .from("parser_bulk_runs")
    .update({
      processed_count: processed,
      progress_percent: progress,
      v1_better_count: v1Better,
      v2_better_count: v2Better,
      equal_count: equal,
      avg_v1_runtime_ms: nextAvgV1,
      avg_v2_runtime_ms: nextAvgV2,
    })
    .eq("id", runId);
}

async function extractPdfText(buffer: ArrayBuffer, filename: string): Promise<string> {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".pdf")) {
    const pdfjsLib = await import("npm:pdfjs-dist@4.0.379");
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    const parts: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      let lastY = -1;
      let pageText = "";
      for (const item of content.items as Array<{ str: string; transform: number[] }>) {
        const y = item.transform[5];
        if (lastY !== -1 && Math.abs(y - lastY) > 5) pageText += "\n";
        else if (pageText.length > 0) pageText += " ";
        pageText += item.str;
        lastY = y;
      }
      parts.push(pageText);
    }
    return parts.join("\n\n");
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const XLSX = await import("npm:xlsx@0.18.5");
    const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    return rows.map((r) => r.map((c) => String(c ?? "").trim()).join("\t")).join("\n");
  }
  return "";
}

// ---------------------------------------------------------------------------
// Legacy parser (V1) — single-pass regex grand-total scan. No structural
// awareness. Picks the largest labelled "total" amount it can find.
// ---------------------------------------------------------------------------
function runLegacyParser(text: string): ParserResult {
  const t0 = Date.now();
  const notes: string[] = [];
  const money = /[\$]?\s?([0-9]{1,3}(?:[,\s][0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+\.[0-9]{2})/g;
  const candidates: number[] = [];

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!/total|amount|sum|gst|incl\.?|price/.test(lower)) continue;
    let m: RegExpExecArray | null;
    while ((m = money.exec(line)) !== null) {
      const n = parseMoney(m[1]);
      if (n > 0) candidates.push(n);
    }
    money.lastIndex = 0;
  }

  if (candidates.length === 0) {
    for (const line of lines) {
      let m: RegExpExecArray | null;
      while ((m = money.exec(line)) !== null) {
        const n = parseMoney(m[1]);
        if (n > 0) candidates.push(n);
      }
      money.lastIndex = 0;
    }
    notes.push("fell_back_to_all_amounts");
  }

  const total = candidates.length ? Math.max(...candidates) : 0;
  const requires_review = total === 0 || candidates.length < 2;
  if (requires_review) notes.push("insufficient_candidates");

  return { total, runtime_ms: Date.now() - t0, requires_review, notes };
}

// ---------------------------------------------------------------------------
// Parser V2 — structural pass: understands labelled groupings, optional
// scope sections, and subtotal + optional = grand reconciliation.
// ---------------------------------------------------------------------------
function runParserV2(text: string): ParserResult {
  const t0 = Date.now();
  const notes: string[] = [];
  const lines = text.split(/\r?\n/);

  const labelled = {
    subtotal: [] as number[],
    optional: [] as number[],
    excluded: [] as number[],
    grand: [] as number[],
  };

  const moneyOnLine = (line: string): number[] => {
    const out: number[] = [];
    const re = /[\$]?\s?([0-9]{1,3}(?:[,\s][0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+\.[0-9]{2})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const n = parseMoney(m[1]);
      if (n > 0) out.push(n);
    }
    return out;
  };

  for (const line of lines) {
    const lower = line.toLowerCase();
    const amounts = moneyOnLine(line);
    if (amounts.length === 0) continue;
    const largest = Math.max(...amounts);

    if (/grand\s*total|total\s*incl|total\s*amount|contract\s*total|quoted\s*total/.test(lower)) {
      labelled.grand.push(largest);
    } else if (/sub[-\s]?total|net\s*total|base\s*total|main\s*total/.test(lower)) {
      labelled.subtotal.push(largest);
    } else if (/optional|alternate|add[-\s]?on|provisional\s*sum|ps\s*item/.test(lower)) {
      labelled.optional.push(largest);
    } else if (/excluded|exclusion|not\s*included/.test(lower)) {
      labelled.excluded.push(largest);
    }
  }

  const subtotal = labelled.subtotal.length ? Math.max(...labelled.subtotal) : 0;
  const optional = labelled.optional.length ? Math.max(...labelled.optional) : 0;
  const grandCandidates = labelled.grand.slice();

  let total = 0;
  let confidenceTier = 0;

  for (const g of grandCandidates) {
    if (subtotal > 0 && Math.abs(subtotal + optional - g) / g <= 0.01) {
      total = g;
      confidenceTier = 100;
      notes.push("reconciled_subtotal_plus_optional");
      break;
    }
  }

  if (total === 0) {
    for (const g of grandCandidates) {
      if (subtotal > 0 && optional > 0 && Math.abs(g - optional - subtotal) / subtotal <= 0.01) {
        total = g;
        confidenceTier = 75;
        notes.push("reconciled_grand_minus_optional");
        break;
      }
    }
  }

  if (total === 0 && grandCandidates.length) {
    total = Math.max(...grandCandidates);
    confidenceTier = 50;
    notes.push("labelled_grand_no_reconciliation");
  }

  if (total === 0 && subtotal > 0) {
    total = subtotal + optional;
    confidenceTier = 25;
    notes.push("derived_subtotal_plus_optional");
  }

  if (total === 0) {
    const allAmounts: number[] = [];
    for (const line of lines) allAmounts.push(...moneyOnLine(line));
    total = allAmounts.length ? Math.max(...allAmounts) : 0;
    confidenceTier = 0;
    notes.push("fallback_highest_amount");
  }

  const requires_review = total === 0 || confidenceTier < 50;

  return { total, runtime_ms: Date.now() - t0, requires_review, notes };
}

function parseMoney(s: string): number {
  const cleaned = s.replace(/[,\s]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function pickWinner(v1: number, v2: number, ref: number | null): Winner {
  if (ref != null && ref > 0) {
    const d1 = Math.abs(v1 - ref) / ref;
    const d2 = Math.abs(v2 - ref) / ref;
    if (Math.abs(d1 - d2) < 0.005) return "equal";
    return d2 < d1 ? "v2" : "v1";
  }
  if (v1 === 0 && v2 === 0) return "equal";
  if (v1 === 0) return "v2";
  if (v2 === 0) return "v1";
  if (Math.abs(v1 - v2) / Math.max(v1, v2) < 0.005) return "equal";
  return v2 > v1 ? "v2" : "v1";
}

function computeVariance(v1: number, v2: number, ref: number | null): number {
  const base = ref != null && ref > 0 ? ref : v1;
  if (!base) return 0;
  return Number((((v2 - base) / base) * 100).toFixed(4));
}

function deriveFailureCause(
  v1: ParserResult,
  v2: ParserResult,
  ref: number | null,
  winner: Winner,
): string | null {
  if (ref != null && ref > 0) {
    const d2 = Math.abs(v2.total - ref) / ref;
    if (d2 > 0.1) return "V2 total >10% off actual";
    if (d2 > 0.01) return "V2 total 1-10% off actual";
  }
  if (v2.total === 0) return "V2 produced no total";
  if (v2.requires_review) return "V2 flagged for review";
  if (winner === "v1") return "V1 outperformed V2";
  return null;
}
