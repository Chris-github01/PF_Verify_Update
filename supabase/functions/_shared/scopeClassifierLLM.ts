const SYSTEM_PROMPT = `You are an expert construction estimator.

Classify each line item as:
- main (included in contract)
- optional (extra/add-on scope)
- excluded (not included)

Use CONTEXT, not just keywords. Section headers apply to ALL items below them until another header changes the section. Do not assume default = main without checking context.

Signals:
- "OPTIONAL SCOPE" / "add to scope" -> optional
- "by others" / "not included" / "excluded" -> excluded
- everything else under main/base/included headers -> main

Return strict JSON only: { "results": [ { "scope": "main|optional|excluded", "confidence": 0.0-1.0, "reason": "short" } ] }`;

const CHUNK_SIZE = 60;
const CHUNK_TIMEOUT_MS = 9_000;
const TOTAL_BUDGET_MS = 14_000;

function buildPrompt(chunk: any[]) {
  return `Classify these rows. Return one result per row, same order.

INPUT:
${JSON.stringify(chunk)}

OUTPUT:
{ "results": [ { "scope": "main|optional|excluded", "confidence": 0-1, "reason": "short" } ] }`;
}

async function classifyChunk(chunk: any[], apiKey: string, signal: AbortSignal): Promise<any[]> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(chunk) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai_${res.status}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "";
  return parseClassifications(content);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export async function classifyScopeWithLLM(rows: any[]) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const started = Date.now();
  const enriched = rows.map((row, i) => ({
    d: String(row.description ?? "").slice(0, 220),
    prev: rows.slice(Math.max(0, i - 2), i).map((r) => String(r.description ?? "").slice(0, 120)).join(" | "),
    next: rows.slice(i + 1, i + 3).map((r) => String(r.description ?? "").slice(0, 120)).join(" | "),
  }));

  const chunks: any[][] = [];
  for (let i = 0; i < enriched.length; i += CHUNK_SIZE) {
    chunks.push(enriched.slice(i, i + CHUNK_SIZE));
  }

  const controller = new AbortController();
  const chunkAbort = (idx: number) => {
    const t = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS);
    return t;
  };

  const work = (async (): Promise<any[][]> => {
    const chunkResults: any[][] = new Array(chunks.length).fill([]);
    const settled = await Promise.allSettled(
      chunks.map((c, idx) => {
        const t = chunkAbort(idx);
        return classifyChunk(c, apiKey, controller.signal)
          .finally(() => clearTimeout(t));
      }),
    );
    settled.forEach((r, idx) => {
      chunkResults[idx] = r.status === "fulfilled" ? r.value : [];
    });
    return chunkResults;
  })();

  let chunkResults: any[][] = [];
  try {
    chunkResults = await withTimeout(work, TOTAL_BUDGET_MS, "stage_10_budget");
  } catch (err) {
    controller.abort();
    throw err;
  }

  const flat: any[] = [];
  chunkResults.forEach((arr, i) => {
    const expected = chunks[i].length;
    for (let j = 0; j < expected; j++) flat.push(arr[j] ?? null);
  });

  const elapsed = Date.now() - started;
  const resolvedCount = flat.filter((r) => r != null).length;
  console.log(`[stage_10_llm] rows=${rows.length} chunks=${chunks.length} resolved=${resolvedCount} elapsed_ms=${elapsed}`);

  return rows.map((row, i) => {
    const r = flat[i];
    const scope = normaliseScope(r?.scope, row?.scope_category);
    return {
      ...row,
      scope_category: scope,
      scope_confidence: typeof r?.confidence === "number" ? r.confidence : 0.5,
      scope_reason: typeof r?.reason === "string" ? r.reason : (r ? "llm" : "fallback"),
    };
  });
}

function parseClassifications(raw: string): any[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.results)) return parsed.results;
    if (parsed && Array.isArray(parsed.classifications)) return parsed.classifications;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
    for (const key of Object.keys(parsed ?? {})) {
      if (Array.isArray((parsed as any)[key])) return (parsed as any)[key];
    }
    return [];
  } catch {
    return [];
  }
}

function normaliseScope(value: unknown, existing: unknown): "main" | "optional" | "excluded" {
  const v = String(value ?? "").toLowerCase().trim();
  if (v === "optional") return "optional";
  if (v === "excluded") return "excluded";
  if (v === "main") return "main";
  const e = String(existing ?? "").toLowerCase();
  if (e === "optional" || e === "excluded") return e as "optional" | "excluded";
  return "main";
}
