import { supabase } from '../supabase';
import { PASSIVE_FIRE_ONTOLOGY, type PassiveFireSystem } from '../ontology/passiveFireOntology';

interface MappingResult {
  systemId: string;
  confidence: number;
  reasoning: string;
  matchedFactors: string[];
  missedFactors: string[];
}

export async function mapItemToSystemWithLLM(
  description: string,
  quantity?: number,
  unit?: string,
  existingSystemId?: string
): Promise<MappingResult> {
  const { data: configData } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'OPENAI_API_KEY')
    .single();

  const openaiApiKey = configData?.value;

  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const systemsList = PASSIVE_FIRE_ONTOLOGY.map(s => ({
    id: s.id,
    label: s.label,
    category: s.category,
    serviceType: s.serviceType,
    frr: s.frr,
    sizeRange: s.sizeMin && s.sizeMax ? `${s.sizeMin}-${s.sizeMax}mm` : undefined,
    material: s.material,
    keywords: s.keywords.join(', ')
  }));

  const prompt = `You are an expert in passive fire protection systems. Map this line item to the most appropriate system from our ontology.

LINE ITEM:
Description: ${description}
Quantity: ${quantity || 'not specified'}
Unit: ${unit || 'not specified'}
${existingSystemId ? `Current Mapping: ${existingSystemId}` : ''}

AVAILABLE SYSTEMS:
${JSON.stringify(systemsList, null, 2)}

Analyze the line item and:
1. Identify the fire protection category (penetration, joint, coating, door, etc.)
2. Determine service type (electrical, plumbing, HVAC, etc.)
3. Extract fire rating requirement (30min, 60min, 90min, 120min, 240min)
4. Extract size/dimension if mentioned
5. Identify materials or products mentioned
6. Match to the BEST system from the list

Return JSON:
{
  "systemId": "matching system ID from list",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of why this system matches",
  "matchedFactors": ["factor1", "factor2"],
  "missedFactors": ["factor that doesn't match but is acceptable"]
}

If no good match, return systemId as "UNMATCHED" with low confidence and explanation.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a passive fire protection systems expert. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_completion_tokens: 1000
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No response from OpenAI');
  }

  const mapping: MappingResult = JSON.parse(content);

  return mapping;
}

export async function batchMapItems(
  items: Array<{ id: string; description: string; quantity?: number; unit?: string }>
): Promise<Map<string, MappingResult>> {
  const results = new Map<string, MappingResult>();

  for (const item of items) {
    try {
      const mapping = await mapItemToSystemWithLLM(
        item.description,
        item.quantity,
        item.unit
      );
      results.set(item.id, mapping);
    } catch (error) {
      console.error(`Failed to map item ${item.id}:`, error);
      results.set(item.id, {
        systemId: 'UNMATCHED',
        confidence: 0,
        reasoning: 'Mapping failed due to error',
        matchedFactors: [],
        missedFactors: []
      });
    }
  }

  return results;
}

export async function suggestSystemForUnmapped(quoteItemId: string): Promise<MappingResult | null> {
  const { data: item } = await supabase
    .from('quote_items')
    .select('description, quantity, unit, system_id')
    .eq('id', quoteItemId)
    .single();

  if (!item) {
    return null;
  }

  if (item.system_id && item.system_id !== 'UNMATCHED') {
    return null;
  }

  return await mapItemToSystemWithLLM(
    item.description,
    item.quantity,
    item.unit,
    item.system_id
  );
}

export async function remapAllUnmatchedItems(projectId: string): Promise<number> {
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id')
    .eq('project_id', projectId);

  if (!quotes || quotes.length === 0) {
    return 0;
  }

  const quoteIds = quotes.map(q => q.id);

  const { data: unmatchedItems } = await supabase
    .from('quote_items')
    .select('id, description, quantity, unit')
    .in('quote_id', quoteIds)
    .or('system_id.is.null,system_id.eq.UNMATCHED');

  if (!unmatchedItems || unmatchedItems.length === 0) {
    return 0;
  }

  let updatedCount = 0;

  for (const item of unmatchedItems) {
    try {
      const mapping = await mapItemToSystemWithLLM(
        item.description,
        item.quantity,
        item.unit
      );

      if (mapping.systemId !== 'UNMATCHED' && mapping.confidence >= 0.7) {
        await supabase
          .from('quote_items')
          .update({
            system_id: mapping.systemId,
            system_confidence: mapping.confidence,
            system_needs_review: mapping.confidence < 0.85,
            matched_factors: mapping.matchedFactors,
            missed_factors: mapping.missedFactors
          })
          .eq('id', item.id);

        updatedCount++;
      }
    } catch (error) {
      console.error(`Failed to remap item ${item.id}:`, error);
    }
  }

  return updatedCount;
}
