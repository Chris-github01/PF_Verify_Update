import type { RawLineItem, SmartChunk, TradeType } from "./types.ts";
import { isSummaryLine, parseMoney, roundTo2 } from "./utils.ts";

interface LLMItem {
  description: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  normalization_confidence: number;
}

const NORMALIZATION_CONFIDENCE_THRESHOLD = 0.8;

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
  - normalization_confidence: a number between 0.0 and 1.0 reflecting how confident you are that the output faithfully represents the input row without invention

Rules for field cleaning:
1. If qty * rate ≈ total (within 2%), keep all three values.
2. If only total is present and no qty/rate, set qty=1, unit="ls", rate=total.
3. If qty and total exist but rate is missing, compute rate = total / qty.
4. If rate and qty exist but total is missing, compute total = qty * rate.
5. If values conflict and cannot be reconciled, prefer total and set normalization_confidence low.
6. Strip currency symbols, commas, and whitespace from numbers.
7. Description should be clean text — remove leading dashes, bullets, numbers.
8. Set normalization_confidence=1.0 when all fields are clear and math checks out.
9. Set normalization_confidence<0.8 when you had to guess, infer, or are uncertain.
10. Return ONLY a JSON array with EXACTLY the same length as the input. No explanation. No markdown.`;

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

  return `${tradeHint ? tradeHint + "\n\n" : ""}Clean the fields of the following ${rows.length} rows. You MUST return a JSON array with EXACTLY ${rows.length} objects — one per input row, in the same order.

Input rows (${rows.length} total):
${rowsJson}

Return ONLY a valid JSON array of exactly ${rows.length} objects. Example format:
[
  {"description": "Fire collar 50mm dia", "qty": 12, "unit": "ea", "rate": 85.00, "total": 1020.00, "normalization_confidence": 1.0},
  {"description": "Intumescent wrap 75mm pipe", "qty": 1, "unit": "ls", "rate": 450.00, "total": 450.00, "normalization_confidence": 0.9}
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

  const normalization_confidence = typeof item.normalization_confidence === "number"
    ? Math.max(0, Math.min(1, item.normalization_confidence))
    : 0.5;

  return {
    description: String(item.description ?? "").trim(),
    qty: qty ?? (inferredTotal !== null ? 1 : null),
    unit: item.unit ? String(item.unit).toLowerCase().trim() : "ea",
    rate: inferredRate ?? inferredTotal,
    total: inferredTotal,
    sourceLineIndex: rowIndex,
    rawLine: JSON.stringify(item),
    confidence: normalization_confidence >= NORMALIZATION_CONFIDENCE_THRESHOLD ? "medium" : "low",
    parseMethod: "llm",
    normalization_confidence,
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

      if (llmItems.length !== batch.length) {
        console.warn(
          `[LLMNormalizer] normalizeWithLLM: output length mismatch — expected ${batch.length}, got ${llmItems.length}. Rejecting batch.`
        );
        globalRowIndex += batch.length;
        continue;
      }

      for (let i = 0; i < batch.length; i++) {
        const item = llmItems[i];
        if (!item.description || item.description.trim().length < 3) {
          globalRowIndex++;
          continue;
        }
        if (isSummaryLine(item.description)) {
          globalRowIndex++;
          continue;
        }
        if (item.total !== null && parseMoney(String(item.total)) <= 0) {
          globalRowIndex++;
          continue;
        }

        const normalization_confidence = typeof item.normalization_confidence === "number"
          ? Math.max(0, Math.min(1, item.normalization_confidence))
          : 0.5;

        if (normalization_confidence < NORMALIZATION_CONFIDENCE_THRESHOLD) {
          console.warn(
            `[LLMNormalizer] Row ${globalRowIndex} marked invalid: normalization_confidence=${normalization_confidence}`
          );
          globalRowIndex++;
          continue;
        }

        results.push(llmItemToRaw(item, globalRowIndex, globalRowIndex));
        globalRowIndex++;
      }
    } catch (err) {
      console.warn(`[LLMNormalizer] Batch ${batchStart / BATCH_SIZE + 1} failed:`, err);
      globalRowIndex += batch.length;
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

      if (llmItems.length !== batch.length) {
        console.warn(
          `[LLMNormalizer] normalizeFieldsWithLLM: output length mismatch — expected ${batch.length}, got ${llmItems.length}. Rejecting batch, keeping originals.`
        );
        continue;
      }

      for (let i = 0; i < batch.length; i++) {
        const srcIndex = batchStart + i;
        const original = items[srcIndex];
        const normalized = llmItems[i];

        if (!normalized) continue;

        const normalization_confidence = typeof normalized.normalization_confidence === "number"
          ? Math.max(0, Math.min(1, normalized.normalization_confidence))
          : 0.5;

        if (normalization_confidence < NORMALIZATION_CONFIDENCE_THRESHOLD) {
          console.warn(
            `[LLMNormalizer] Field normalization row ${srcIndex} confidence too low (${normalization_confidence}), marking invalid.`
          );
          results[srcIndex] = {
            ...original,
            confidence: "low",
            parseMethod: "llm",
            normalization_confidence,
          };
          continue;
        }

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
          confidence: normalization_confidence >= NORMALIZATION_CONFIDENCE_THRESHOLD ? "medium" : "low",
          parseMethod: "llm",
          normalization_confidence,
        };
      }
    } catch (err) {
      console.warn(`[LLMNormalizer] Field normalization batch failed:`, err);
    }
  }

  return results;
}
