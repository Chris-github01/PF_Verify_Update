/**
 * V5 GPT Parsing Prompt
 * Two-pass strategy: Recall mode (find everything) -> Cleanup mode (remove summaries)
 */

export const PARSING_V5_SYSTEM_PROMPT = `You are extracting line items from construction quotes.
Return ONLY real cost lines (items/services).

There are TWO valid item formats:

**A) Itemised lines** (preferred):
- description (required)
- quantity (required)
- total price (required)
- unit OPTIONAL (ea, m, lm, hr, etc.)
- rate OPTIONAL (can be calculated from qty and total)

**B) Lump sum / service lines**:
- description (required)
- total price (required)
- quantity defaults to 1
- unit = "LS" or leave blank
- rate OPTIONAL

SKIP summary/subtotal lines such as:
- "Heritage Building $8,877.50" (section header)
- "New Building $1,580,700.00" (section header)
- "TOTAL $..." / "Subtotal" / "Grand Total" / "P&G" / "GST"
- Any line that aggregates other lines

IMPORTANT:
- Multi-line descriptions are common: join lines when numbers appear on the next line
- If you can see a total price but rate is missing, keep the item anyway (rate=null)
- If you can see a total price but unit is missing, keep the item anyway (unit=null)
- Keep items even if they look unusual - we want high recall

Output JSON format:
{
  "items": [
    {
      "description": "...",
      "qty": number,
      "unit": "ea|m|LS|..." or null,
      "rate": number or null,
      "total": number,
      "page": number,
      "raw_text": "original line(s)"
    }
  ],
  "confidence": number,
  "warnings": []
}`;

export const PARSING_V5_RECALL_PROMPT = `Extract ALL line items from this quote text.
Include ANY line that looks like it has a cost, even if you're unsure about the format.
Be generous - we'll clean up later.

CHUNK TEXT:
{text}

DETERMINISTIC CANDIDATES (pre-extracted via regex):
{candidates}

Your task: Confirm the candidates above and find ANY additional items they missed.`;

export const PARSING_V5_CLEANUP_PROMPT = `Review these extracted items and remove any that are clearly summaries or duplicates.

EXTRACTED ITEMS:
{items}

Rules:
1. Remove section totals/subtotals (e.g., "Electrical $762,874.50")
2. Remove duplicates (keep the most detailed version)
3. Validate totals where rate exists: abs(qty * rate - total) should be < 5% of total
4. Flag suspicious items in warnings

Return cleaned items in same JSON format.`;

/**
 * Build recall mode prompt with candidates
 */
export function buildRecallPrompt(
  chunkText: string,
  candidates: any[]
): string {
  const candidatesText = candidates.length > 0
    ? JSON.stringify(candidates, null, 2)
    : 'None found - you must find all items manually';

  return PARSING_V5_RECALL_PROMPT
    .replace('{text}', chunkText)
    .replace('{candidates}', candidatesText);
}

/**
 * Build cleanup mode prompt
 */
export function buildCleanupPrompt(items: any[]): string {
  return PARSING_V5_CLEANUP_PROMPT
    .replace('{items}', JSON.stringify(items, null, 2));
}

/**
 * Two-pass GPT extraction
 */
export async function twoPassExtraction(
  chunkText: string,
  candidates: any[],
  openaiKey: string,
  pageNumber?: number
): Promise<{ items: any[]; warnings: string[] }> {
  // Pass 1: Recall mode (find everything)
  const recallPrompt = buildRecallPrompt(chunkText, candidates);
  const recallItems = await callGPT(recallPrompt, openaiKey, 0.3); // Low temperature

  // Pass 2: Cleanup mode (remove summaries)
  const cleanupPrompt = buildCleanupPrompt(recallItems.items || []);
  const cleanedItems = await callGPT(cleanupPrompt, openaiKey, 0.1); // Very low temperature

  // Add page numbers
  const itemsWithPage = (cleanedItems.items || []).map((item: any) => ({
    ...item,
    page: item.page || pageNumber,
  }));

  return {
    items: itemsWithPage,
    warnings: [
      ...(recallItems.warnings || []),
      ...(cleanedItems.warnings || []),
    ],
  };
}

/**
 * Call OpenAI GPT-4 for extraction
 */
async function callGPT(
  userPrompt: string,
  openaiKey: string,
  temperature: number
): Promise<any> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: PARSING_V5_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  return JSON.parse(content);
}
