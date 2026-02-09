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
  console.log('=== BOQ Generation Started ===');
  console.log('Project ID:', projectId);
  console.log('Module Key:', moduleKey);

  // Step 1: Get all tenderers and their quotes for this project
  // First try with trade filter, then without if nothing found
  let quotes: any[] | null = null;
  let quotesError: any = null;

  console.log('Step 1: Fetching quotes...');
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

  console.log('Quotes with trade filter:', quotes?.length || 0);

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
    console.log('Quotes without trade filter:', quotes?.length || 0);
  }

  if (quotesError) {
    console.error('Error fetching quotes:', quotesError);
    throw quotesError;
  }

  const tenderers: Tenderer[] = quotes?.map(q => ({
    id: q.supplier_id,
    name: (q.suppliers as any)?.name || 'Unknown',
    quote_id: q.id
  })) || [];

  console.log('Tenderers found:', tenderers.length);
  console.log('Tenderers:', tenderers.map(t => ({ name: t.name, quote_id: t.quote_id })));

  if (tenderers.length === 0) {
    throw new Error('No quotes found for this project. Please import quotes first using the "Import Quotes" step.');
  }

  // Step 2: Get all quote items from all tenderers
  console.log('Step 2: Fetching quote items...');
  console.log('Quote IDs to fetch:', tenderers.map(t => t.quote_id));

  const { data: allItems, error: itemsError } = await supabase
    .from('quote_items')
    .select('*')
    .in('quote_id', tenderers.map(t => t.quote_id));

  if (itemsError) {
    console.error('Error fetching quote items:', itemsError);
    throw itemsError;
  }

  console.log('Total quote items found:', allItems?.length || 0);

  if (!allItems || allItems.length === 0) {
    console.error('WARNING: No quote items found for any quotes!');
    console.log('This means the quotes were imported but have no line items.');
    throw new Error('No quote items found. The quotes may not have been parsed correctly. Please reimport the quotes.');
  }

  // Log sample of items for debugging
  if (allItems && allItems.length > 0) {
    console.log('Sample quote item:', allItems[0]);
  }

  // Step 3: Normalize and create baseline BOQ lines
  console.log('Step 3: Normalizing items...');
  const normalizedLines = normalizeItems(allItems || [], moduleKey);
  console.log('Normalized lines created:', normalizedLines.length);

  if (normalizedLines.length === 0) {
    console.error('WARNING: No normalized lines created from items!');
    console.log('This could mean items lack required fields like system_name');
  }

  // Step 4: Insert baseline BOQ lines
  console.log('Step 4: Inserting BOQ lines...');
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
      console.error('Failed line data:', line);
      continue;
    }

    boqLines.push(insertedLine);
    lineCounter++;
  }

  console.log('Successfully inserted BOQ lines:', boqLines.length);

  // Step 5: Create tenderer mappings
  console.log('Step 5: Creating tenderer mappings...');
  const mappingsCreated = await createTendererMappings(
    projectId,
    moduleKey,
    boqLines,
    tenderers,
    allItems || []
  );
  console.log('Mappings created:', mappingsCreated);

  // Step 6: Detect and create scope gaps
  console.log('Step 6: Detecting scope gaps...');
  const gapsDetected = await detectScopeGaps(
    projectId,
    moduleKey,
    boqLines,
    tenderers,
    allItems || []
  );
  console.log('Gaps detected:', gapsDetected);

  // Step 7: Mark BOQ Builder as completed
  console.log('Step 7: Marking BOQ Builder as completed...');
  await supabase
    .from('projects')
    .update({
      boq_builder_completed: true,
      boq_builder_completed_at: new Date().toISOString()
    })
    .eq('id', projectId);

  console.log('=== BOQ Generation Complete ===');
  console.log('Final stats:', {
    lines_created: boqLines.length,
    mappings_created: mappingsCreated,
    gaps_detected: gapsDetected
  });

  return {
    lines_created: boqLines.length,
    mappings_created: mappingsCreated,
    gaps_detected: gapsDetected,
    completion_percentage: 100
  };
}

function normalizeItems(items: any[], moduleKey: ModuleKey): Partial<BOQLine>[] {
  console.log('normalizeItems: Processing', items.length, 'items');

  // Log first 3 items to see their structure
  if (items.length > 0) {
    console.log('First 3 items:', items.slice(0, 3));
    console.log('Sample item keys:', Object.keys(items[0]));
  }

  // Group items by system/location/attributes to create unique BOQ lines
  const groupedMap = new Map<string, any[]>();
  const keyExamples = new Set<string>();

  for (const item of items) {
    const key = createGroupingKey(item);

    // Collect first 10 unique keys for debugging
    if (keyExamples.size < 10) {
      keyExamples.add(key);
    }

    if (!groupedMap.has(key)) {
      groupedMap.set(key, []);
    }
    groupedMap.get(key)!.push(item);
  }

  console.log('normalizeItems: Created', groupedMap.size, 'unique groups');
  console.log('Sample grouping keys:', Array.from(keyExamples));

  // Create baseline lines from groups (use max quantity across all tenderers)
  const normalizedLines: Partial<BOQLine>[] = [];

  for (const [key, groupItems] of groupedMap.entries()) {
    const representative = groupItems[0];
    const maxQty = Math.max(...groupItems.map(i => i.quantity || 0));

    // CORRECTED FIELD MAPPING based on actual quote_items schema
    const systemName = representative.system_label
      || representative.mapped_system
      || representative.system_name
      || representative.description
      || representative.normalized_description
      || 'Unnamed System';

    normalizedLines.push({
      trade: moduleKey,
      system_group: extractSystemGroup(systemName),
      system_name: systemName,
      drawing_spec_ref: representative.drawing_ref || representative.drawing || representative.system_id || null,
      location_zone: representative.location || representative.location_zone || null,
      element_asset: representative.element || null,
      frr_rating: representative.frr || representative.frr_rating || representative.fire_rating || null,
      substrate: representative.material || representative.substrate || null,
      service_type: representative.mapped_service_type || representative.service || representative.service_type || null,
      penetration_size_opening: representative.size || representative.size_opening || representative.opening_size || null,
      quantity: maxQty,
      unit: representative.unit || representative.canonical_unit || representative.normalized_unit || representative.uom || 'Each',
      system_variant_product: representative.product || representative.product_name || representative.mapped_penetration || null,
      install_method_buildup: representative.install_method || representative.installation_method || null,
      constraints_access: representative.access_notes || representative.notes || null,
      baseline_scope_notes: null,
      baseline_measure_rule: null
    });
  }

  console.log('normalizeItems: Created', normalizedLines.length, 'normalized lines');
  if (normalizedLines.length > 0) {
    console.log('Sample normalized line:', normalizedLines[0]);
  }

  return normalizedLines;
}

function createGroupingKey(item: any): string {
  // CORRECTED FIELD MAPPING based on actual quote_items schema
  // quote_items fields: system_label, mapped_system, description, size, frr, service, mapped_service_type

  const parts = [
    // System/Description - use system_label first, then mapped_system, then description
    item.system_label || item.mapped_system || item.system_name || item.description || '',
    // Size/Opening - from size column
    item.size || item.size_opening || item.opening_size || '',
    // FRR - from frr column
    item.frr || item.frr_rating || item.fire_rating || '',
    // Service Type - from service or mapped_service_type columns
    item.mapped_service_type || item.service || item.service_type || '',
    // Material/Substrate - from material or subclass
    item.material || item.substrate || item.subclass || ''
  ];

  const key = parts.join('|').toLowerCase().trim();

  // If all parts are empty (key is just pipes), each item should be separate
  // This prevents collapse when parsing hasn't populated detailed fields yet
  if (key === '||||' || key === '' || key.replace(/\|/g, '').trim() === '') {
    // Use description as fallback, or item ID to keep items separate
    const description = item.description || item.raw_description || item.normalized_description || '';
    if (description) {
      return description.toLowerCase().trim();
    }

    // Last resort: use item ID to ensure uniqueness
    const fallbackKey = item.id || item.item_number || `item_${Math.random()}`;
    console.warn('Empty grouping key for item, using fallback:', fallbackKey);
    return `unique_${fallbackKey}`;
  }

  return key;
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
  console.log('createTendererMappings: Processing', boqLines.length, 'lines x', tenderers.length, 'tenderers');
  let mappingsCount = 0;
  let matchedCount = 0;
  let missingCount = 0;

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
        matchedCount++;
        // Determine included status using correct field names
        const itemAmount = matchingItem.total_price || matchingItem.amount || 0;
        const itemQty = matchingItem.quantity || 0;

        if (itemQty > 0 && itemAmount > 0) {
          includedStatus = 'included';
        } else if (itemQty === 0 || itemAmount === 0) {
          includedStatus = 'unclear';
        }

        tendererQty = matchingItem.quantity;
        tendererRate = matchingItem.unit_price || matchingItem.rate;
        tendererAmount = matchingItem.total_price || matchingItem.amount;
        tendererNotes = matchingItem.notes || matchingItem.raw_description;
      } else {
        missingCount++;
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
      } else {
        console.error('Error creating mapping:', error);
      }
    }
  }

  console.log('createTendererMappings: Created', mappingsCount, 'mappings');
  console.log('createTendererMappings: Matched items:', matchedCount, 'Missing items:', missingCount);

  return mappingsCount;
}

function findMatchingItem(boqLine: BOQLine, tendererItems: any[]): any | null {
  // Try to find exact match first using corrected field mapping
  for (const item of tendererItems) {
    const itemKey = createGroupingKey(item);

    // Create a pseudo-item from BOQ line with correct field names for comparison
    const boqKey = createGroupingKey({
      system_label: boqLine.system_name,
      description: boqLine.system_name,
      location: boqLine.location_zone,
      frr: boqLine.frr_rating,
      material: boqLine.substrate,
      mapped_service_type: boqLine.service_type,
      service: boqLine.service_type,
      size: boqLine.penetration_size_opening
    });

    if (itemKey === boqKey) {
      return item;
    }
  }

  // Try fuzzy match on system name/description only
  for (const item of tendererItems) {
    const itemDesc = item.system_label || item.mapped_system || item.description || '';
    if (fuzzyMatch(itemDesc, boqLine.system_name)) {
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
  console.log('detectScopeGaps: Analyzing', boqLines.length, 'lines x', tenderers.length, 'tenderers');
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
