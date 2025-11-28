export interface GraderInput {
  itemA: {
    service: string;
    method: string;
    size_mm: number | null;
    substrate: string;
    extras: string[];
    quantity: number;
    unit_price: number;
    description: string;
  };
  candidates: Array<{
    service: string;
    method: string;
    size_mm: number | null;
    substrate: string;
    extras: string[];
    quantity: number;
    unit_price: number;
    description: string;
    index: number;
    similarity: number;
  }>;
}

export interface GraderDecision {
  match: 'accept' | 'review' | 'reject';
  chosen_index: number | null;
  confidence: number;
  reasons: string[];
  field_diffs: {
    size_mm_diff: number;
    substrate_same: boolean;
    extras_missing: string[];
  };
}

const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    match: { type: 'string', enum: ['accept', 'review', 'reject'] },
    chosen_index: { type: ['integer', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 100 },
    reasons: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    field_diffs: {
      type: 'object',
      properties: {
        size_mm_diff: { type: 'number' },
        substrate_same: { type: 'boolean' },
        extras_missing: { type: 'array', items: { type: 'string' } },
      },
      required: ['substrate_same'],
    },
  },
  required: ['match', 'confidence', 'reasons'],
};

const SYSTEM_PROMPT = `You are a strict line-item comparator for passive fire protection quotes. You must output only JSON that matches the provided schema. If data is insufficient, choose "review" with confidence 70-89 and explain briefly in reasons.`;

const GRADING_RULES = `Compare A against each B candidate and pick the best one if it is the same physical scope.

"Same scope" means identical service + method + size (±2mm tolerance) + same substrate class and equivalent extras (GIB/Batt/Insulation).

Quantity and rate may differ - that's expected and not a reason to reject.

RULES:
- Size tolerance: ±2mm = OK, 3-5mm = review, >5mm = reject
- Substrate class must match (e.g., "2x13mm GIB wall" ~ "gib2x13")
- Extras: if B bakes an extra into the base rate, still ACCEPT but include in reasons
- If two B items split the scope, choose the better one and set match = "review"

OUTPUT REQUIREMENTS:
- match: "accept" if confidence ≥90, "review" if 70-89, "reject" if <70
- chosen_index: the index from candidates array (0, 1, 2) or null if reject
- confidence: your confidence score (0-100)
- reasons: brief explanations (max 4 bullet points)
- field_diffs.size_mm_diff: absolute difference in mm
- field_diffs.substrate_same: true if substrate classes match
- field_diffs.extras_missing: extras in A but not in B`;

export async function gradeMatch(
  input: GraderInput,
  apiKey: string
): Promise<GraderDecision> {
  const userMessage = `${GRADING_RULES}

A: ${JSON.stringify(input.itemA, null, 2)}

B_candidates: ${JSON.stringify(input.candidates, null, 2)}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'Decision',
          schema: DECISION_SCHEMA,
          strict: true,
        },
      },
      temperature: 0,
      seed: 7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI grader failed: ${error}`);
  }

  const result = await response.json();
  const content = result.choices[0].message.content;
  const decision = JSON.parse(content) as GraderDecision;

  return decision;
}

export function shouldUseAI(unmatchedCount: number): boolean {
  return unmatchedCount > 0 && unmatchedCount <= 100;
}
