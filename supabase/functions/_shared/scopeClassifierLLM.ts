const SYSTEM_PROMPT = `
You are an expert construction estimator.

Your task is to classify each line item into:
- MAIN (included in contract)
- OPTIONAL (extra/add-on scope)
- EXCLUDED (not included)

CRITICAL:
- You must use CONTEXT, not just keywords
- Section headers apply to ALL items below them
- Sections can change multiple times in a document
- Do NOT assume default = MAIN without checking context

Examples:
- "OPTIONAL SCOPE" -> all following items are OPTIONAL
- "Add to scope" -> OPTIONAL
- "By others" -> EXCLUDED
- Fire stopping services -> MAIN unless under Optional

Return strict JSON only in the form: { "results": [ { "scope": "main|optional|excluded", "confidence": 0-1, "reason": "short" } ] }
`;

const CHUNK_SIZE = 40;
const CHUNK_TIMEOUT_MS = 20_000;
const MAX_PARALLEL = 4;

function buildPrompt(chunk: any[]) {
  return `
Classify the following rows. Return one result per input row, in order.

Each row includes:
- description
- surrounding context (previous and next rows)

Use context to determine if the row belongs to a MAIN or OPTIONAL section.

INPUT:
${JSON.stringify(chunk, null, 2)}

OUTPUT FORMAT:
{ "results": [ { "scope": "main | optional | excluded", "confidence": 0-1, "reason": "short" } ] }
`;
}

async function classifyChunk(chunk: any[], apiKey: string): Promise<any[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
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
    if (!res.ok) {
      throw new Error(`openai_${res.status}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    return parseClassifications(content);
  } finally {
    clearTimeout(timer);
  }
}

export async function classifyScopeWithLLM(rows: any[]) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const enriched = rows.map((row, i) => ({
    description: row.description,
    context: {
      previous: rows.slice(Math.max(0, i - 3), i).map((r) => r.description).join(" "),
      next: rows.slice(i + 1, i + 4).map((r) => r.description).join(" "),
    },
  }));

  const chunks: any[][] = [];
  for (let i = 0; i < enriched.length; i += CHUNK_SIZE) {
    chunks.push(enriched.slice(i, i + CHUNK_SIZE));
  }

  const chunkResults: any[][] = new Array(chunks.length);
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL) {
    const batch = chunks.slice(i, i + MAX_PARALLEL);
    const settled = await Promise.allSettled(
      batch.map((c) => classifyChunk(c, apiKey)),
    );
    settled.forEach((r, j) => {
      chunkResults[i + j] = r.status === "fulfilled" ? r.value : [];
    });
  }

  const flat: any[] = [];
  chunkResults.forEach((arr, i) => {
    const expected = chunks[i].length;
    for (let j = 0; j < expected; j++) flat.push(arr[j] ?? null);
  });

  return rows.map((row, i) => {
    const r = flat[i];
    const scope = normaliseScope(r?.scope);
    return {
      ...row,
      scope_category: scope,
      scope_confidence: typeof r?.confidence === "number" ? r.confidence : 0.7,
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

function normaliseScope(value: unknown): "main" | "optional" | "excluded" {
  const v = String(value ?? "").toLowerCase().trim();
  if (v === "optional") return "optional";
  if (v === "excluded") return "excluded";
  return "main";
}
