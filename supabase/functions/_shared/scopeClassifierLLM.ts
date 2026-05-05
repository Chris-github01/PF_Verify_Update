import OpenAI from "npm:openai@4.73.1";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

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

Return strict JSON only.
`;

function buildPrompt(chunk: any[]) {
  return `
Classify the following rows.

Each row includes:
- description
- surrounding context (previous and next rows)

Use context to determine if the row belongs to a MAIN or OPTIONAL section.

INPUT:
${JSON.stringify(chunk, null, 2)}

OUTPUT FORMAT:
[
  { "scope": "main | optional | excluded", "confidence": 0-1, "reason": "short" }
]
`;
}

export async function classifyScopeWithLLM(rows: any[]) {
  const enriched = rows.map((row, i) => {
    const prev = rows
      .slice(Math.max(0, i - 3), i)
      .map((r) => r.description)
      .join(" ");
    const next = rows
      .slice(i + 1, i + 4)
      .map((r) => r.description)
      .join(" ");

    return {
      description: row.description,
      context: {
        previous: prev,
        next: next,
      },
    };
  });

  const chunkSize = 25;
  const results: any[] = [];

  for (let i = 0; i < enriched.length; i += chunkSize) {
    const chunk = enriched.slice(i, i + chunkSize);
    const prompt = buildPrompt(chunk);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0].message.content ?? "[]";
    const parsed = parseClassifications(content);
    for (let j = 0; j < chunk.length; j++) {
      results.push(parsed[j] ?? null);
    }
  }

  return rows.map((row, i) => {
    const r = results[i];
    const scope = normaliseScope(r?.scope);
    return {
      ...row,
      scope,
      scope_category: scope,
      scope_confidence: typeof r?.confidence === "number" ? r.confidence : 0.7,
      scope_reason: typeof r?.reason === "string" ? r.reason : "fallback",
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
