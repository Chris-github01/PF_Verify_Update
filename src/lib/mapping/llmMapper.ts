import { supabase } from '../supabase';
import { PASSIVE_FIRE_ONTOLOGY, type PassiveFireSystem } from '../ontology/passiveFireOntology';

interface MappingResult {
  systemId: string;
  confidence: number;
  reasoning: string;
  matchedFactors: string[];
  missedFactors: string[];
  trade?: string;
  electrical?: {
    electricalScopeCategory?: string | null;
    voltage?: string | null;
    protection?: string | null;
    cableSignal?: string | null;
    containmentSignal?: string | null;
    commissioningSignal?: string | null;
    leadTimeSignal?: string | null;
    exclusionSignal?: string | null;
  };
}

export async function mapItemToSystemWithLLM(
  description: string,
  quantity?: number,
  unit?: string,
  existingSystemId?: string,
  trade?: string
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

  const tradeType = trade || 'passive_fire';

  const prompt = `TRADE: ${tradeType}

You are an expert in passive fire protection systems AND electrical trade scope mapping.

Your job depends on TRADE:

IF TRADE == "passive_fire":
- Map this line item to the most appropriate passive fire system from our ontology (PASSIVE_FIRE_ONTOLOGY).
- Use passive fire rules: penetration/joint/coating/door categories, service type, FRR, substrate, method, certified system matching.

IF TRADE == "electrical":
- Map this line item to the most appropriate ELECTRICAL scope system from our ELECTRICAL_ONTOLOGY (if provided).
- If ELECTRICAL_ONTOLOGY is not provided, map to the BEST "electricalScopeCategory" using the allowed categories list below.
- Extract key technical/commercial attributes (voltage, breaker type, cable spec, installation method, inclusions/exclusions signals, commissioning/testing, lead times, interfaces).

LINE ITEM:
Description: ${description}
Quantity: ${quantity || 'not specified'}
Unit: ${unit || 'not specified'}
${existingSystemId ? `Current Mapping: ${existingSystemId}` : ''}

AVAILABLE SYSTEMS:
${JSON.stringify(systemsList, null, 2)}

ALLOWED ELECTRICAL SCOPE CATEGORIES (use if ELECTRICAL_ONTOLOGY not available):
- "switchboards_panels" (MSB/DB/MCC/UPS/discrimination studies references)
- "cable_power_installed_terminated" (mains/submains/finals, copper vs aluminium changes)
- "cable_support_containment" (cable tray, basket, ladder, conduit, bracketing, bonding)
- "lighting_power_devices" (switches, GPOs, power outlets, small power)
- "luminaires_appliances" (light fittings, emergency lighting, façade lighting)
- "access_equipment" (EWP/scissor lifts/undercroft/facade access allowances)
- "lightning_protection" (LPS level references, bonding, down conductors)
- "security_data_elv" (CCTV, access control, intercoms, data outlets)
- "seismic_bracing" (seismic bracing count/allowance + engineering)
- "prelims_ohp" (P&G, overheads, preliminaries)
- "design_documentation_bim" (design fee, BIM/shop drawings, DB schedule/load updates)
- "correction_variation_credit" (price corrections, credits, deltas)
- "excluded_out_of_scope" (if the line item is explicitly excluded/not included)

Analyze the line item and:
PASSIVE FIRE (only if TRADE == passive_fire):
1) Identify fire protection category (penetration, joint, coating, door, etc.)
2) Determine service type (electrical, plumbing, HVAC, etc.) [service passing through the fire barrier]
3) Extract fire rating requirement (30min, 60min, 90min, 120min, 240min)
4) Extract size/dimension if mentioned
5) Identify materials/products mentioned
6) Match to BEST system from ontology list

ELECTRICAL (only if TRADE == electrical):
1) Identify electricalScopeCategory (from allowed list or electrical ontology)
2) Identify system/package: MSB/DB/UPS, cable tray, lighting, LPS, ELV/security/data, seismic bracing, P&G, etc.
3) Extract technical attributes when present:
   - voltage (230V/415V/LV/ELV)
   - protection (MCB/MCCB/RCD/RCBO), ratings (A, kA if stated)
   - cable spec signals (mm², core count, copper vs aluminium, fire-rated cable)
   - containment type (tray/basket/ladder/conduit), finish (PG/pre-galv)
   - commissioning/testing/documentation signals (test certs, DB schedules, discrimination studies)
4) Extract commercial risk signals when present:
   - lead times
   - exclusions ("by others", builder's works, authority charges, trenching, fibre by Chorus, EV chargers, etc.)
   - assumptions ("as per design/build drawings", "subject to manufacturing lead times")
5) Choose best mapping

Return JSON (same schema as before + additive fields allowed):
{
  "systemId": "matching system ID from list OR 'UNMATCHED' OR (electrical) a stable category id like 'switchboards_panels'",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of why this mapping matches",
  "matchedFactors": ["factor1", "factor2"],
  "missedFactors": ["factor that doesn't match but is acceptable"],

  "trade": "passive_fire|electrical",
  "electrical": {
    "electricalScopeCategory": "string|null",
    "voltage": "string|null",
    "protection": "string|null",
    "cableSignal": "string|null",
    "containmentSignal": "string|null",
    "commissioningSignal": "string|null",
    "leadTimeSignal": "string|null",
    "exclusionSignal": "string|null"
  }
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
        { role: 'system', content: 'You are a construction trade scope-mapping expert with deep specialization in: 1) Passive Fire Protection systems (fire stopping, FRR/FRL compliance, certified systems) 2) Electrical trade scope (commercial/industrial electrical works, switchboards, cabling, lighting, ELV/security/data, cable containment, lightning protection, testing & commissioning). Respond ONLY with valid JSON.' },
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
