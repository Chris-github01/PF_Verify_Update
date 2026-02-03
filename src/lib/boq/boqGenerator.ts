import { supabase } from '../supabase';
import type { BOQLine, BOQTendererMap, ScopeGap, ModuleKey, BOQGenerationResult } from '../../types/boq.types';

interface QuoteItem {
  id: string;
  quote_id: string;
  system_name: string;
  location?: string;
  frr_rating?: string;
  substrate?: string;
  service_type?: string;
  size_opening?: string;
  quantity: number;
  unit: string;
  rate?: number;
  amount: number;
  product?: string;
  install_method?: string;
}

interface Tenderer {
  id: string;
  name: string;
  quote_id: string;
}

const QUANTITY_TOLERANCE_PERCENT = 5;
const QUANTITY_TOLERANCE_EACH = 0;

export async function generateBaselineBOQ(
  projectId: string,
  moduleKey: ModuleKey
): Promise<BOQGenerationResult> {
  // Step 1: Get all tenderers and their quotes for this project
  // First try with trade filter, then without if nothing found
  let quotes: any[] | null = null;
  let quotesError: any = null;

  const result = await supabase
    .from('quotes')
    .select(`
      id,
      supplier_id,
      trade,
      suppliers (
        id,
        name
      )
    `)
    .eq('project_id', projectId)
    .eq('trade', moduleKey);

  quotes = result.data;
  quotesError = result.error;

  // If no quotes found with trade filter, try without it (for backward compatibility)
  if (!quotesError && (!quotes || quotes.length === 0)) {
    console.log('No quotes found with trade filter, trying without trade filter...');
    const fallbackResult = await supabase
      .from('quotes')
      .select(`
        id,
        supplier_id,
        trade,
        suppliers (
          id,
          name
        )
      `)
      .eq('project_id', projectId);

    quotes = fallbackResult.data;
    quotesError = fallbackResult.error;
  }

  if (quotesError) throw quotesError;

  const tenderers: Tenderer[] = quotes?.map(q => ({
    id: q.supplier_id,
    name: (q.suppliers as any)?.name || 'Unknown',
    quote_id: q.id
  })) || [];

  if (tenderers.length === 0) {
    throw new Error('No quotes found for this project. Please import quotes first using the "Import Quotes" step.');
  }

  // Step 2: Get all quote items from all tenderers
  const { data: allItems, error: itemsError } = await supabase
    .from('quote_items')
    .select('*')
    .in('quote_id', tenderers.map(t => t.quote_id));

  if (itemsError) throw itemsError;

  // Step 3: Normalize and create baseline BOQ lines
  const normalizedLines = normalizeItems(allItems || [], moduleKey);

  // Step 4: Insert baseline BOQ lines
  const boqLines: BOQLine[] = [];
  let lineCounter = 1;

  for (const line of normalizedLines) {
    const boqLineId = `SYS-${String(lineCounter).padStart(4, '0')}`;

    const { data: insertedLine, error: insertError } = await supabase
      .from('boq_lines')
      .insert({
        project_id: projectId,
        module_key: moduleKey,
        boq_line_id: boqLineId,
        trade: line.trade,
        system_group: line.system_group,
        system_name: line.system_name,
        drawing_spec_ref: line.drawing_spec_ref,
        location_zone: line.location_zone,
        element_asset: line.element_asset,
        frr_rating: line.frr_rating,
        substrate: line.substrate,
        service_type: line.service_type,
        penetration_size_opening: line.penetration_size_opening,
        quantity: line.quantity,
        unit: line.unit,
        system_variant_product: line.system_variant_product,
        install_method_buildup: line.install_method_buildup,
        constraints_access: line.constraints_access,
        baseline_included: true,
        baseline_scope_notes: line.baseline_scope_notes,
        baseline_measure_rule: line.baseline_measure_rule,
        baseline_allowance_type: 'none'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting BOQ line:', insertError);
      continue;
    }

    boqLines.push(insertedLine);
    lineCounter++;
  }

  // Step 5: Create tenderer mappings
  const mappingsCreated = await createTendererMappings(
    projectId,
    moduleKey,
    boqLines,
    tenderers,
    allItems || []
  );

  // Step 6: Detect and create scope gaps
  const gapsDetected = await detectScopeGaps(
    projectId,
    moduleKey,
    boqLines,
    tenderers,
    allItems || []
  );

  // Step 7: Mark BOQ Builder as completed
  await supabase
    .from('projects')
    .update({
      boq_builder_completed: true,
      boq_builder_completed_at: new Date().toISOString()
    })
    .eq('id', projectId);

  return {
    lines_created: boqLines.length,
    mappings_created,
    gaps_detected,
    completion_percentage: 100
  };
}

function normalizeItems(items: any[], moduleKey: ModuleKey): Partial<BOQLine>[] {
  // Group items by system/location/attributes to create unique BOQ lines
  const groupedMap = new Map<string, any[]>();

  for (const item of items) {
    const key = createGroupingKey(item);
    if (!groupedMap.has(key)) {
      groupedMap.set(key, []);
    }
    groupedMap.get(key)!.push(item);
  }

  // Create baseline lines from groups (use max quantity across all tenderers)
  const normalizedLines: Partial<BOQLine>[] = [];

  for (const [key, groupItems] of groupedMap.entries()) {
    const representative = groupItems[0];
    const maxQty = Math.max(...groupItems.map(i => i.quantity || 0));

    normalizedLines.push({
      trade: moduleKey,
      system_group: extractSystemGroup(representative.system_name),
      system_name: representative.system_name || 'Unnamed System',
      drawing_spec_ref: representative.drawing_ref || null,
      location_zone: representative.location || null,
      element_asset: representative.element || null,
      frr_rating: representative.frr_rating || null,
      substrate: representative.substrate || null,
      service_type: representative.service_type || null,
      penetration_size_opening: representative.size_opening || null,
      quantity: maxQty,
      unit: representative.unit || 'Each',
      system_variant_product: representative.product || null,
      install_method_buildup: representative.install_method || null,
      constraints_access: representative.access_notes || null,
      baseline_scope_notes: null,
      baseline_measure_rule: null
    });
  }

  return normalizedLines;
}

function createGroupingKey(item: any): string {
  // Create a unique key based on system, location, and key attributes
  const parts = [
    item.system_name || '',
    item.location || '',
    item.frr_rating || '',
    item.substrate || '',
    item.service_type || '',
    item.size_opening || ''
  ];
  return parts.join('|').toLowerCase();
}

function extractSystemGroup(systemName: string): string {
  // Extract system group from system name
  if (!systemName) return 'General';

  const lowerName = systemName.toLowerCase();

  if (lowerName.includes('penetration')) return 'Penetrations';
  if (lowerName.includes('door') || lowerName.includes('fire door')) return 'Fire Doors';
  if (lowerName.includes('wall') || lowerName.includes('partition')) return 'Walls & Partitions';
  if (lowerName.includes('floor') || lowerName.includes('ceiling')) return 'Floors & Ceilings';
  if (lowerName.includes('joint')) return 'Joints';
  if (lowerName.includes('duct') || lowerName.includes('cable')) return 'Services';
  if (lowerName.includes('damper')) return 'Dampers';
  if (lowerName.includes('curtain wall')) return 'Curtain Walls';

  return 'General';
}

async function createTendererMappings(
  projectId: string,
  moduleKey: ModuleKey,
  boqLines: BOQLine[],
  tenderers: Tenderer[],
  allItems: any[]
): Promise<number> {
  let mappingsCount = 0;

  for (const boqLine of boqLines) {
    for (const tenderer of tenderers) {
      // Find matching items from this tenderer
      const tendererItems = allItems.filter(item => item.quote_id === tenderer.quote_id);
      const matchingItem = findMatchingItem(boqLine, tendererItems);

      let includedStatus: 'included' | 'excluded' | 'unclear' | 'missing' = 'missing';
      let tendererQty = null;
      let tendererRate = null;
      let tendererAmount = null;
      let tendererNotes = null;

      if (matchingItem) {
        // Determine included status
        if (matchingItem.quantity > 0 && matchingItem.amount > 0) {
          includedStatus = 'included';
        } else if (matchingItem.quantity === 0 || matchingItem.amount === 0) {
          includedStatus = 'unclear';
        }

        tendererQty = matchingItem.quantity;
        tendererRate = matchingItem.rate;
        tendererAmount = matchingItem.amount;
        tendererNotes = matchingItem.notes;
      }

      const { error } = await supabase
        .from('boq_tenderer_map')
        .insert({
          project_id: projectId,
          module_key: moduleKey,
          boq_line_id: boqLine.id,
          tenderer_id: tenderer.id,
          included_status: includedStatus,
          tenderer_qty: tendererQty,
          tenderer_rate: tendererRate,
          tenderer_amount: tendererAmount,
          tenderer_notes: tendererNotes,
          clarification_tag_ids: []
        });

      if (!error) {
        mappingsCount++;
      }
    }
  }

  return mappingsCount;
}

function findMatchingItem(boqLine: BOQLine, tendererItems: any[]): any | null {
  // Try to find exact match first
  for (const item of tendererItems) {
    const itemKey = createGroupingKey(item);
    const boqKey = createGroupingKey({
      system_name: boqLine.system_name,
      location: boqLine.location_zone,
      frr_rating: boqLine.frr_rating,
      substrate: boqLine.substrate,
      service_type: boqLine.service_type,
      size_opening: boqLine.penetration_size_opening
    });

    if (itemKey === boqKey) {
      return item;
    }
  }

  // Try fuzzy match on system name only
  for (const item of tendererItems) {
    if (fuzzyMatch(item.system_name, boqLine.system_name)) {
      return item;
    }
  }

  return null;
}

function fuzzyMatch(str1: string, str2: string): boolean {
  if (!str1 || !str2) return false;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  return s1.includes(s2) || s2.includes(s1);
}

async function detectScopeGaps(
  projectId: string,
  moduleKey: ModuleKey,
  boqLines: BOQLine[],
  tenderers: Tenderer[],
  allItems: any[]
): Promise<number> {
  const gaps: Partial<ScopeGap>[] = [];
  let gapCounter = 1;

  for (const boqLine of boqLines) {
    for (const tenderer of tenderers) {
      const tendererItems = allItems.filter(item => item.quote_id === tenderer.quote_id);
      const matchingItem = findMatchingItem(boqLine, tendererItems);

      // Gap 1: Missing item
      if (!matchingItem) {
        gaps.push({
          project_id: projectId,
          module_key: moduleKey,
          gap_id: `GAP-${String(gapCounter++).padStart(4, '0')}`,
          boq_line_id: boqLine.id,
          tenderer_id: tenderer.id,
          gap_type: 'missing',
          description: `${tenderer.name} has not included ${boqLine.system_name} in their quote`,
          expected_requirement: `${boqLine.quantity} ${boqLine.unit} of ${boqLine.system_name}`,
          risk_if_not_included: 'Scope gap leading to variations post-award',
          commercial_treatment: 'rfi',
          status: 'open',
          owner_role: 'qs'
        });
        continue;
      }

      // Gap 2: Under-measured (quantity variance)
      const tolerance = boqLine.unit.toLowerCase() === 'each'
        ? QUANTITY_TOLERANCE_EACH
        : QUANTITY_TOLERANCE_PERCENT;

      const variancePercent = Math.abs((matchingItem.quantity - boqLine.quantity) / boqLine.quantity * 100);

      if (matchingItem.quantity < boqLine.quantity && variancePercent > tolerance) {
        gaps.push({
          project_id: projectId,
          module_key: moduleKey,
          gap_id: `GAP-${String(gapCounter++).padStart(4, '0')}`,
          boq_line_id: boqLine.id,
          tenderer_id: tenderer.id,
          gap_type: 'under_measured',
          description: `${tenderer.name} quantity (${matchingItem.quantity}) is less than baseline (${boqLine.quantity})`,
          expected_requirement: `${boqLine.quantity} ${boqLine.unit}`,
          risk_if_not_included: 'Under-measured quantities may result in variations',
          commercial_treatment: 'rfi',
          status: 'open',
          owner_role: 'qs'
        });
      }

      // Gap 3: Unclear (missing attributes)
      const missingAttributes: string[] = [];
      if (boqLine.frr_rating && !matchingItem.frr_rating) missingAttributes.push('FRR Rating');
      if (boqLine.substrate && !matchingItem.substrate) missingAttributes.push('Substrate');
      if (boqLine.service_type && !matchingItem.service_type) missingAttributes.push('Service Type');

      if (missingAttributes.length > 0) {
        gaps.push({
          project_id: projectId,
          module_key: moduleKey,
          gap_id: `GAP-${String(gapCounter++).padStart(4, '0')}`,
          boq_line_id: boqLine.id,
          tenderer_id: tenderer.id,
          gap_type: 'unclear',
          description: `${tenderer.name} quote missing attributes: ${missingAttributes.join(', ')}`,
          expected_requirement: missingAttributes.join(', '),
          risk_if_not_included: 'Unclear specifications may lead to disputes',
          commercial_treatment: 'rfi',
          status: 'open',
          owner_role: 'engineer'
        });
      }

      // Gap 4: Unpriced (has quantity but no rate/amount)
      if (matchingItem.quantity > 0 && (!matchingItem.rate || !matchingItem.amount || matchingItem.amount === 0)) {
        gaps.push({
          project_id: projectId,
          module_key: moduleKey,
          gap_id: `GAP-${String(gapCounter++).padStart(4, '0')}`,
          boq_line_id: boqLine.id,
          tenderer_id: tenderer.id,
          gap_type: 'unpriced',
          description: `${tenderer.name} has not priced ${boqLine.system_name}`,
          expected_requirement: 'Unit rate and total amount',
          risk_if_not_included: 'Unpriced items create commercial uncertainty',
          commercial_treatment: 'ps',
          status: 'open',
          owner_role: 'qs'
        });
      }
    }
  }

  // Insert all gaps
  if (gaps.length > 0) {
    const { error } = await supabase
      .from('scope_gaps')
      .insert(gaps);

    if (error) {
      console.error('Error inserting scope gaps:', error);
      return 0;
    }
  }

  return gaps.length;
}
