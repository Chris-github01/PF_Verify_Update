import type { RawLineItem, SmartChunk, TradeType } from "./types.ts";
import { isSummaryLine, parseMoney, roundTo2 } from "./utils.ts";

interface LLMItem {
  description: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
}

const SYSTEM_PROMPT = `You are a structured data extraction assistant for construction quote documents.

CRITICAL RULES:
- You are NOT identifying rows from scratch. You receive pre-detected candidate rows.
- Your job is ONLY to normalize and fix the fields in each row.
- Do NOT add rows that are not in the input.
- Do NOT remove rows unless they are clearly summary/total lines.
- Do NOT hallucinate quantities or rates.

For each input row, output a normalized JSON object with:
  - description: cleaned item description (string, required)
  - qty: quantity as a number (null if not determinable)
  - unit: unit of measure lowercase (ea, m, m2, lm, ls, hr, etc.) (null if not determinable)
  - rate: unit rate as a number (null if not determinable)
  - total: line total as a number (null if not determinable)

Rules for normalization:
1. If qty * rate ≈ total (within 2%), keep all three values.
2. If only total is present and no qty/rate, set qty=1, unit="ls", rate=total.
3. If qty and total exist but rate is missing, compute rate = total / qty.
4. If rate and qty exist but total is missing, compute total = qty * rate.
5. Never invent a qty or rate that isn't implied by the data.
6. Strip currency symbols, commas, and whitespace from numbers.
7. Description should be clean text — remove leading dashes, bullets, numbers.
8. Return ONLY a JSON array. No explanation. No markdown.`;

function buildTradeHint(tradeType: TradeType): string {
  const hints: Record<TradeType, string> = {
    passive_fire:
      "This is a passive fire protection quote. Items typically include fire collars, fire stopping, penetration seals, intumescent products, fire doors. FRR ratings like '60/60/60' are part of descriptions.",
    plumbing:
      "This is a plumbing quote. Items include sanitary fixtures, pipework, valves, hot/cold water systems. Quantities are often in metres (m) or each (ea).",
    electrical:
      "This is an electrical quote. Items include conduit, cable, switchboards, light fittings, power outlets.",
    hvac:
      "This is an HVAC/mechanical quote. Items include ductwork, fan coil units, chillers, ventilation grilles.",
    active_fire:
      "This is an active fire protection quote. Items include sprinkler heads, hydrants, hose reels, detection devices.",
    carpentry:
      "This is a carpentry/joinery quote. Items include door sets, skirting, architraves, wardrobes, kitchen cabinets.",
    unknown: "",
  };
  return hints[tradeType] ?? "";
}

function buildUserPrompt(rows: string[], tradeType: TradeType): string {
  const tradeHint = buildTradeHint(tradeType);
  const rowsJson = JSON.stringify(rows, null, 2);

  return `${tradeHint ? tradeHint + "\n\n" : ""}Normalize the following pre-detected rows. Return a JSON array with one object per input row.

Input rows:
${rowsJson}

Return ONLY a valid JSON array. Example format:
[
  {"description": "Fire collar 50mm dia", "qty": 12, "unit": "ea", "rate": 85.00, "total": 1020.00},
  {"description": "Intumescent wrap 75mm pipe", "qty": 1, "unit": "ls", "rate": 450.00, "total": 450.00}
]`;
}

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4000
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "{}";
}

function parseOpenAIResponse(raw: string): LLMItem[] {
  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) return parsed as LLMItem[];

    for (const key of Object.keys(parsed)) {
      if (Array.isArray(parsed[key])) return parsed[key] as LLMItem[];
    }

    return [];
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]) as LLMItem[];
      } catch {
        return [];
      }
    }
    return [];
  }
}

function llmItemToRaw(item: LLMItem, chunkIndex: number, rowIndex: number): RawLineItem {
  const total = item.total !== null ? parseMoney(String(item.total)) : null;
  const qty = item.qty !== null ? parseMoney(String(item.qty)) : null;
  const rate = item.rate !== null ? parseMoney(String(item.rate)) : null;

  const inferredTotal = total ?? (qty !== null && rate !== null ? roundTo2(qty * rate) : null);
  const inferredRate = rate ?? (qty !== null && qty > 0 && inferredTotal !== null ? roundTo2(inferredTotal / qty) : null);

  return {
    description: String(item.description ?? "").trim(),
    qty: qty ?? (inferredTotal !== null ? 1 : null),
    unit: item.unit ? String(item.unit).toLowerCase().trim() : "ea",
    rate: inferredRate ?? inferredTotal,
    total: inferredTotal,
    sourceLineIndex: rowIndex,
    rawLine: JSON.stringify(item),
    confidence: "medium",
    parseMethod: "llm",
  };
}

const BATCH_SIZE = 40;

export async function normalizeWithLLM(
  chunk: SmartChunk,
  deterministicItems: RawLineItem[],
  tradeType: TradeType,
  openaiApiKey: string
): Promise<RawLineItem[]> {
  const lines = chunk.chunkText.split("\n");

  const deterministicLineIndexes = new Set(deterministicItems.map((i) => i.sourceLineIndex));

  const candidateLines = lines.filter((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) return false;
    if (isSummaryLine(trimmed)) return false;
    if (deterministicLineIndexes.has(idx)) return false;
    const hasText = /[A-Za-z]{3,}/.test(trimmed);
    const hasNumbers = /\d/.test(trimmed);
    return hasText && hasNumbers;
  });

  if (candidateLines.length === 0) return [];

  const results: RawLineItem[] = [];
  let globalRowIndex = 0;

  for (let batchStart = 0; batchStart < candidateLines.length; batchStart += BATCH_SIZE) {
    const batch = candidateLines.slice(batchStart, batchStart + BATCH_SIZE);

    try {
      const userPrompt = buildUserPrompt(batch, tradeType);
      const raw = await callOpenAI(openaiApiKey, SYSTEM_PROMPT, userPrompt);
      const llmItems = parseOpenAIResponse(raw);

      for (let i = 0; i < llmItems.length && i < batch.length; i++) {
        const item = llmItems[i];
        if (!item.description || item.description.trim().length < 3) continue;
        if (isSummaryLine(item.description)) continue;
        if (item.total !== null && parseMoney(String(item.total)) <= 0) continue;

        results.push(llmItemToRaw(item, globalRowIndex, globalRowIndex));
        globalRowIndex++;
      }
    } catch (err) {
      console.warn(`[LLMNormalizer] Batch ${batchStart / BATCH_SIZE + 1} failed:`, err);
    }
  }

  return results;
}

export async function normalizeFieldsWithLLM(
  items: RawLineItem[],
  tradeType: TradeType,
  openaiApiKey: string
): Promise<RawLineItem[]> {
  if (items.length === 0) return [];

  const rows = items.map((item) =>
    JSON.stringify({
      description: item.description,
      qty: item.qty,
      unit: item.unit,
      rate: item.rate,
      total: item.total,
    })
  );

  const results: RawLineItem[] = [...items];

  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);

    try {
      const userPrompt = buildUserPrompt(batch, tradeType);
      const raw = await callOpenAI(openaiApiKey, SYSTEM_PROMPT, userPrompt);
      const llmItems = parseOpenAIResponse(raw);

      for (let i = 0; i < llmItems.length && i < batch.length; i++) {
        const srcIndex = batchStart + i;
        const original = items[srcIndex];
        const normalized = llmItems[i];

        if (!normalized) continue;

        const total = normalized.total !== null ? parseMoney(String(normalized.total)) : original.total;
        const qty = normalized.qty !== null ? parseMoney(String(normalized.qty)) : original.qty;
        const rate = normalized.rate !== null ? parseMoney(String(normalized.rate)) : original.rate;

        results[srcIndex] = {
          ...original,
          description: normalized.description?.trim() || original.description,
          qty: qty ?? original.qty,
          unit: normalized.unit?.toLowerCase() || original.unit,
          rate: rate ?? original.rate,
          total: total ?? original.total,
          parseMethod: "llm",
        };
      }
    } catch (err) {
      console.warn(`[LLMNormalizer] Field normalization batch failed:`, err);
    }
  }

  return results;
}
