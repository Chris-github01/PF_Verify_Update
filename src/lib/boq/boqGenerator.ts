import { supabase } from '../supabase';
import type { BOQLine, BOQTendererMap, ScopeGap, ModuleKey, BOQGenerationResult } from '../../types/boq.types';

interface QuoteItem {
  id: string;
  quote_id: string;
  description: string;
  system_name?: string;
  system_label?: string;
  system_detected?: string;
  mapped_system?: string;
  location?: string;
  frr_rating?: string;
  frr?: string;
  substrate?: string;
  service_type?: string;
  service?: string;
  size_opening?: string;
  size?: string;
  quantity: number;
  unit: string;
  unit_price?: number;
  rate?: number;
  amount?: number;
  total_price?: number;
  product?: string;
  install_method?: string;
  line_number?: number;
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
      supplier_name,
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
        supplier_name,
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

  // Debug: Log quote data
  if (quotes && quotes.length > 0) {
    console.log('📊 Quote Data Summary:');
    quotes.forEach((q, i) => {
      console.log(`  Quote ${i + 1}:`, {
        id: q.id.substring(0, 8) + '...',
        supplier_id: q.supplier_id ? q.supplier_id.substring(0, 8) + '...' : 'NULL ⚠️',
        supplier_name: q.supplier_name || 'NULL ⚠️',
        supplier_relation: q.suppliers?.name || 'NULL ⚠️'
      });
    });
  }

  if (quotesError) {
    console.error('Error fetching quotes:', quotesError);
    throw quotesError;
  }

  // Get project's organisation_id once
  const { data: project } = await supabase
    .from('projects')
    .select('organisation_id')
    .eq('id', projectId)
    .single();

  // Step 1: Fix suppliers that have "Unknown Supplier" but quotes have real names
  const quotesWithWrongSupplierNames = quotes?.filter(q =>
    q.supplier_id &&
    (q.suppliers as any)?.name === 'Unknown Supplier' &&
    q.supplier_name &&
    q.supplier_name.trim() !== '' &&
    q.supplier_name !== 'Unknown Supplier'
  ) || [];

  if (quotesWithWrongSupplierNames.length > 0) {
    console.log(`🔧 Found ${quotesWithWrongSupplierNames.length} suppliers with incorrect names. Updating...`);

    for (const quote of quotesWithWrongSupplierNames) {
      const correctName = quote.supplier_name.trim();
      console.log(`  Updating supplier ${quote.supplier_id.substring(0, 8)}... from "Unknown Supplier" to "${correctName}"`);

      // Update the supplier name
      await supabase
        .from('suppliers')
        .update({ name: correctName })
        .eq('id', quote.supplier_id);

      // Update the quote object in our array
      if (quote.suppliers) {
        (quote.suppliers as any).name = correctName;
      }
    }
  }

  // Step 2: Create suppliers for quotes that don't have one
  const quotesNeedingSuppliers = quotes?.filter(q => !q.supplier_id) || [];

  if (quotesNeedingSuppliers.length > 0) {
    console.log(`⚠ Found ${quotesNeedingSuppliers.length} quotes without supplier_id. Creating supplier records...`);

    for (const quote of quotesNeedingSuppliers) {
      // Use supplier_name from quote, or default to "Unknown Supplier"
      const supplierName = quote.supplier_name?.trim() || 'Unknown Supplier';

      console.log(`  Creating supplier "${supplierName}" for quote ${quote.id.substring(0, 8)}...`);

      // Check if supplier with this name already exists for this organisation
      const { data: existingSupplier } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('name', supplierName)
        .eq('organisation_id', project?.organisation_id)
        .maybeSingle();

      let supplierId: string;

      if (existingSupplier) {
        // Use existing supplier
        supplierId = existingSupplier.id;
        console.log(`    ✓ Found existing supplier: "${existingSupplier.name}" (${supplierId.substring(0, 8)}...)`);
      } else {
        // Create new supplier
        const { data: newSupplier, error: supplierError } = await supabase
          .from('suppliers')
          .insert({
            name: supplierName,
            organisation_id: project?.organisation_id
          })
          .select()
          .single();

        if (!supplierError && newSupplier) {
          supplierId = newSupplier.id;
          console.log(`    ✓ Created new supplier: "${newSupplier.name}" (${supplierId.substring(0, 8)}...)`);
        } else {
          console.error(`    ✗ Failed to create supplier:`, supplierError);
          continue;
        }
      }

      // Update the quote with the supplier_id
      await supabase
        .from('quotes')
        .update({ supplier_id: supplierId })
        .eq('id', quote.id);

      // Update the quote object in our array
      quote.supplier_id = supplierId;
      quote.suppliers = { id: supplierId, name: supplierName } as any;
    }
  }

  const tenderers: Tenderer[] = quotes
    ?.filter(q => q.supplier_id) // Only include quotes with valid supplier_id
    ?.map(q => ({
      id: q.supplier_id!,
      name: (q.suppliers as any)?.name || q.supplier_name || 'Unknown Supplier',
      quote_id: q.id
    })) || [];

  console.log('✓ Tenderers found:', tenderers.length);
  console.log('Tenderers:');
  tenderers.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.name} (supplier_id: ${t.id.substring(0, 8)}..., quote_id: ${t.quote_id.substring(0, 8)}...)`);
  });

  if (tenderers.length === 0) {
    throw new Error('No quotes with valid suppliers found for this project. Please check your quote imports.');
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

    if (!insertedLine) {
      console.error('ERROR: No data returned from BOQ line insert (but no error either)');
      console.error('Line data:', line);
      continue;
    }

    if (!insertedLine.id) {
      console.error('ERROR: Inserted BOQ line missing ID field:', insertedLine);
      continue;
    }

    // Log first inserted line for debugging
    if (boqLines.length === 0) {
      console.log('Sample inserted BOQ line with ID:', {
        id: insertedLine.id,
        boq_line_id: insertedLine.boq_line_id,
        system_name: insertedLine.system_name
      });
    }

    boqLines.push(insertedLine);
    lineCounter++;
  }

  console.log('Successfully inserted BOQ lines:', boqLines.length);

  if (boqLines.length === 0) {
    throw new Error('No BOQ lines were successfully inserted! Check the console for errors.');
  }

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

  // Group items by system/location/attributes to create unique BOQ lines
  const groupedMap = new Map<string, any[]>();

  for (const item of items) {
    // Skip items without a system name or description
    if (!item.system_name && !item.description) {
      console.warn('Skipping item without system_name or description:', item);
      continue;
    }

    const key = createGroupingKey(item);
    if (!groupedMap.has(key)) {
      groupedMap.set(key, []);
    }
    groupedMap.get(key)!.push(item);
  }

  console.log('normalizeItems: Created', groupedMap.size, 'unique groups');

  // Log sample keys to debug grouping
  const sampleKeys = Array.from(groupedMap.keys()).slice(0, 5);
  console.log('Sample grouping keys:', sampleKeys);

  // Create baseline lines from groups (use max quantity across all tenderers)
  const normalizedLines: Partial<BOQLine>[] = [];

  for (const [key, groupItems] of groupedMap.entries()) {
    const representative = groupItems[0];

    // PRIORITY: Use original description to preserve detailed line items
    // The mapped/detected system fields are useful for categorization but
    // lose the specific product details that QS teams need
    const itemDescription =
      representative.description ||
      representative.raw_description ||
      representative.normalized_description ||
      representative.system_name ||
      representative.system_label ||
      representative.mapped_system ||
      representative.system_detected ||
      'Unnamed System';

    // For items with the same description, use the max quantity across all tenderers
    const maxQty = Math.max(...groupItems.map(i => i.quantity || 0));

    // Get amount/rate - try multiple field names
    const amount = representative.amount || representative.total_price || 0;
    const rate = representative.rate || representative.unit_price || 0;

    console.log(`Creating BOQ line: ${itemDescription} x ${maxQty} ${representative.unit || 'each'} (from ${groupItems.length} items across ${new Set(groupItems.map(i => i.quote_id)).size} suppliers)`);

    // Use the mapped system for system_group categorization, but keep original description
    const systemForGrouping = representative.system_label || representative.mapped_system || representative.system_detected || itemDescription;

    normalizedLines.push({
      trade: moduleKey,
      system_group: extractSystemGroup(systemForGrouping),
      system_name: itemDescription,
      drawing_spec_ref: representative.drawing_ref || null,
      location_zone: representative.location || null,
      element_asset: representative.element || null,
      frr_rating: representative.frr_rating || representative.frr || null,
      substrate: representative.substrate || null,
      service_type: representative.service_type || representative.service || null,
      penetration_size_opening: representative.size_opening || representative.size || null,
      quantity: maxQty,
      unit: representative.unit || 'each',
      system_variant_product: representative.product || null,
      install_method_buildup: representative.install_method || null,
      constraints_access: representative.access_notes || null,
      baseline_scope_notes: null,
      baseline_measure_rule: null
    });
  }

  console.log('normalizeItems: Created', normalizedLines.length, 'normalized lines');
  if (normalizedLines.length > 0) {
    console.log('Sample normalized lines (first 3):');
    normalizedLines.slice(0, 3).forEach((line, idx) => {
      console.log(`  ${idx + 1}. ${line.system_name} - ${line.quantity} ${line.unit}`);
    });
  }

  return normalizedLines;
}

function createGroupingKey(item: any): string {
  // CRITICAL: Use the original description as the PRIMARY identifier
  // This preserves the detailed line items from the original quotes
  // Only fall back to mapped/detected systems if description is missing
  const itemDescription = (
    item.description ||
    item.raw_description ||
    item.normalized_description ||
    item.system_name ||
    item.system_label ||
    item.mapped_system ||
    item.system_detected ||
    ''
  ).toLowerCase().trim();

  const location = (item.location || '').toLowerCase().trim();
  const frr = (item.frr_rating || item.frr || '').toLowerCase().trim();
  const substrate = (item.substrate || '').toLowerCase().trim();
  const serviceType = (item.service_type || item.service || '').toLowerCase().trim();
  const sizeOpening = (item.size_opening || item.size || '').toLowerCase().trim();

  // Create unique key based on the ACTUAL item description plus attributes
  // This ensures "Ryanfire Mastic (Cable Bundle)" stays separate from
  // "Ryanbatt 502 with Ryanfire Mastic" even if they map to the same system
  const parts = [
    itemDescription,
    location,
    frr,
    substrate,
    serviceType,
    sizeOpening
  ];

  return parts.join('|');
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
  console.log('=== Creating Tenderer Mappings ===');
  console.log('Processing', boqLines.length, 'lines x', tenderers.length, 'tenderers =', boqLines.length * tenderers.length, 'total mappings');
  console.log('Project ID:', projectId);
  console.log('Module Key:', moduleKey);

  // All tenderers should now have valid supplier_ids since we created missing suppliers
  console.log(`✓ All ${tenderers.length} tenderers have valid supplier IDs`);
  console.log('Sample tenderer:', tenderers[0]);

  let mappingsCount = 0;
  let matchedCount = 0;
  let missingCount = 0;
  const errors: any[] = [];

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

        // Get amount and rate (try multiple field names)
        const itemAmount = matchingItem.amount || matchingItem.total_price || 0;
        const itemRate = matchingItem.rate || matchingItem.unit_price || 0;

        // Determine included status
        if (matchingItem.quantity > 0 && itemAmount > 0) {
          includedStatus = 'included';
        } else if (matchingItem.quantity === 0 || itemAmount === 0) {
          includedStatus = 'unclear';
        }

        tendererQty = matchingItem.quantity;
        tendererRate = itemRate;
        tendererAmount = itemAmount;
        tendererNotes = matchingItem.notes;
      } else {
        missingCount++;
      }

      // Build mapping record
      const mappingRecord = {
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
      };

      // Log first mapping for debugging
      if (mappingsCount === 0) {
        console.log('Sample mapping record:', mappingRecord);
      }

      const { data: insertedMapping, error } = await supabase
        .from('boq_tenderer_map')
        .insert(mappingRecord)
        .select()
        .single();

      if (!error && insertedMapping) {
        mappingsCount++;
      } else if (error) {
        errors.push({
          boq_line: boqLine.system_name,
          tenderer: tenderer.name,
          error: error,
          errorDetails: {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          }
        });
        console.error(`❌ Error creating mapping for "${boqLine.system_name}" x "${tenderer.name}":`);
        console.error('  Message:', error.message);
        console.error('  Details:', error.details);
        console.error('  Hint:', error.hint);
        console.error('  Code:', error.code);
        console.error('  Full error:', error);
      }
    }
  }

  console.log('=== Mapping Creation Complete ===');
  console.log('✓ Mappings created:', mappingsCount);
  console.log('✓ Matched items:', matchedCount);
  console.log('✗ Missing items:', missingCount);

  if (errors.length > 0) {
    console.error('⚠ Errors encountered:', errors.length);
    console.error('First 3 errors:', errors.slice(0, 3));

    // Throw error if NO mappings were created at all
    if (mappingsCount === 0) {
      throw new Error(
        `Failed to create any tenderer mappings! ` +
        `Expected ${boqLines.length * tenderers.length} mappings but created 0. ` +
        `Check console for detailed errors. ` +
        `First error: ${errors[0]?.error?.message || JSON.stringify(errors[0])}`
      );
    }
  }

  // Verify mappings were actually created
  if (mappingsCount === 0 && boqLines.length > 0 && tenderers.length > 0) {
    console.error('CRITICAL ERROR: No mappings created despite having BOQ lines and tenderers!');
    console.error('This usually indicates an RLS policy issue or database constraint violation.');

    // Try to verify by querying the database
    const { data: verifyMappings, error: verifyError } = await supabase
      .from('boq_tenderer_map')
      .select('id')
      .eq('project_id', projectId)
      .eq('module_key', moduleKey)
      .limit(1);

    if (verifyError) {
      console.error('Cannot verify mappings - RLS SELECT policy may be failing:', verifyError);
      throw new Error(
        `Mapping creation failed and cannot verify. ` +
        `This indicates an RLS policy issue. Error: ${verifyError.message}`
      );
    }

    if (verifyMappings && verifyMappings.length > 0) {
      console.error('Mappings exist in database but were not counted during creation!');
      console.error('This is a logic error in the mapping creation loop.');
    }
  }

  return mappingsCount;
}

function findMatchingItem(boqLine: BOQLine, tendererItems: any[]): any | null {
  // Try to find exact match first using the same grouping logic
  for (const item of tendererItems) {
    const itemKey = createGroupingKey(item);
    const boqKey = createGroupingKey({
      description: boqLine.system_name, // BOQ line stores original description in system_name
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

  // Try fuzzy match on description (prioritize original description over mapped fields)
  for (const item of tendererItems) {
    const itemDescription =
      item.description ||
      item.raw_description ||
      item.normalized_description ||
      item.system_name ||
      item.system_label ||
      item.mapped_system ||
      item.system_detected ||
      '';

    if (fuzzyMatch(itemDescription, boqLine.system_name)) {
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
      const itemFrr = matchingItem.frr_rating || matchingItem.frr;
      const itemServiceType = matchingItem.service_type || matchingItem.service;

      if (boqLine.frr_rating && !itemFrr) missingAttributes.push('FRR Rating');
      if (boqLine.substrate && !matchingItem.substrate) missingAttributes.push('Substrate');
      if (boqLine.service_type && !itemServiceType) missingAttributes.push('Service Type');

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
      const itemRate = matchingItem.rate || matchingItem.unit_price;
      const itemAmount = matchingItem.amount || matchingItem.total_price;

      if (matchingItem.quantity > 0 && (!itemRate || !itemAmount || itemAmount === 0)) {
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
