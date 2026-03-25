import ExcelJS from 'exceljs';
import { supabase } from '../supabase';
import type { BOQLine, BOQTendererMap, ScopeGap, ProjectTag, ExportOptions, ExportType } from '../../types/boq.types';

export async function exportBOQPack(options: ExportOptions): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VerifyTrade';
  workbook.created = new Date();

  // Get project details
  const { data: project } = await supabase
    .from('projects')
    .select('*, organisations(name)')
    .eq('id', options.project_id)
    .single();

  // Get tenderers and their quotes - filtered by trade/module to ensure data isolation
  const { data: quotes } = await supabase
    .from('quotes')
    .select(`
      id,
      supplier_id,
      latest,
      trade,
      suppliers (
        id,
        name
      )
    `)
    .eq('project_id', options.project_id)
    .eq('trade', options.module_key)
    .eq('latest', true);

  const tenderers = quotes?.map(q => ({
    id: q.supplier_id,
    name: (q.suppliers as any)?.name || 'Unknown',
    quote_id: q.id
  })) || [];

  console.log('[exportBOQPack] Tenderers from quotes:', tenderers.map(t => ({ id: t.id, name: t.name })));

  // Get ALL quote items from all tenderers
  const { data: allQuoteItems } = await supabase
    .from('quote_items')
    .select('*')
    .in('quote_id', tenderers.map(t => t.quote_id))
    .order('quote_id, line_number');

  // Get BOQ lines (may not exist if BOQ hasn't been generated yet)
  const { data: boqLines } = await supabase
    .from('boq_lines')
    .select('*')
    .eq('project_id', options.project_id)
    .eq('module_key', options.module_key)
    .order('boq_line_id');

  // Get tenderer mappings (may not exist if BOQ hasn't been generated yet)
  const { data: mappings, error: mappingsError } = await supabase
    .from('boq_tenderer_map')
    .select(`
      *,
      suppliers (
        id,
        name
      )
    `)
    .eq('project_id', options.project_id)
    .eq('module_key', options.module_key);

  console.log('[exportBOQPack] Mappings query result:', {
    count: mappings?.length || 0,
    error: mappingsError,
    projectId: options.project_id,
    moduleKey: options.module_key
  });

  // Get scope gaps (with optional BOQ line details if linked)
  const { data: gaps, error: gapsError } = await supabase
    .from('scope_gaps')
    .select(`
      *,
      boq_lines (
        boq_line_id,
        system_name,
        location_zone
      ),
      suppliers (
        name
      )
    `)
    .eq('project_id', options.project_id)
    .eq('module_key', options.module_key)
    .order('gap_id');

  if (gapsError) {
    console.error('Error fetching scope gaps:', gapsError);
    throw new Error(`Failed to fetch scope gaps: ${gapsError.message}`);
  }
  console.log('Scope gaps fetched:', gaps?.length || 0, 'gaps');

  // Get tags
  const { data: tags } = await supabase
    .from('project_tags')
    .select('*')
    .eq('project_id', options.project_id)
    .eq('module_key', options.module_key)
    .order('tag_id');

  // Get fire schedule items
  const { data: fireScheduleItems } = await supabase
    .from('fire_schedule_items')
    .select('*')
    .eq('project_id', options.project_id)
    .order('created_at');

  // Tab 1: README_CONTROLS
  console.log('[exportBOQPack] Creating README tab...');
  createREADMETab(workbook, project, options, tenderers || []);

  // Tab 2: BASELINE_BOQ_LINES - Normalized baseline
  console.log('[exportBOQPack] Creating baseline tab...');
  if (boqLines && boqLines.length > 0) {
    createBOQBaselineTab(workbook, boqLines || [], mappings || [], tenderers || [], options);
  } else {
    // Generate baseline from quote items if BOQ hasn't been generated
    createBaselineFromQuotesTab(workbook, allQuoteItems || [], tenderers || [], options);
  }

  // Tab 3: TENDERER_MAPPING - How tenderer items map to baseline
  console.log('[exportBOQPack] Creating tenderer mapping tab...');
  await createTendererMappingTab(workbook, tenderers || [], allQuoteItems || [], boqLines || [], mappings || [], options);

  // Tab 4: SCOPE_GAPS_REGISTER
  console.log('[exportBOQPack] Creating scope gaps tab with', gaps?.length, 'gaps...');
  createScopeGapsTab(workbook, gaps || [], tenderers || [], boqLines || []);

  // Tab 5: TAGS_CLARIFICATIONS
  console.log('[exportBOQPack] Creating tags tab...');
  createTagsTab(workbook, tags || [], boqLines || []);

  // Tab 6: FIRE_ENGINEER_SCHEDULE (passive fire only)
  if (options.module_key === 'passive_fire') {
    console.log('[exportBOQPack] Creating fire schedule tab...');
    createFireScheduleTab(workbook, fireScheduleItems || []);
  }

  // Generate buffer
  console.log('[exportBOQPack] Generating Excel buffer...');
  const buffer = await workbook.xlsx.writeBuffer();
  console.log('[exportBOQPack] Export complete!');
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function createREADMETab(
  workbook: ExcelJS.Workbook,
  project: any,
  options: ExportOptions,
  tenderers: any[]
): void {
  const sheet = workbook.addWorksheet('README_CONTROLS');

  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 50;

  const headerStyle = {
    font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0F172A' } },
    alignment: { vertical: 'middle' as const, horizontal: 'left' as const }
  };

  const labelStyle = {
    font: { bold: true, size: 11 },
    alignment: { vertical: 'middle' as const, horizontal: 'left' as const }
  };

  let row = 1;

  // Header
  sheet.mergeCells(`A${row}:B${row}`);
  const headerCell = sheet.getCell(`A${row}`);
  headerCell.value = 'BOQ PACK - README & CONTROLS';
  headerCell.style = headerStyle;
  sheet.getRow(row).height = 25;
  row += 2;

  // Project details
  sheet.getCell(`A${row}`).value = 'Project Name:';
  sheet.getCell(`A${row}`).style = labelStyle;
  sheet.getCell(`B${row}`).value = project?.name || '';
  row++;

  sheet.getCell(`A${row}`).value = 'Organisation:';
  sheet.getCell(`A${row}`).style = labelStyle;
  sheet.getCell(`B${row}`).value = project?.organisations?.name || '';
  row++;

  sheet.getCell(`A${row}`).value = 'Module:';
  sheet.getCell(`A${row}`).style = labelStyle;
  sheet.getCell(`B${row}`).value = options.module_key.toUpperCase().replace('_', ' ');
  row++;

  sheet.getCell(`A${row}`).value = 'Export Type:';
  sheet.getCell(`A${row}`).style = labelStyle;
  sheet.getCell(`B${row}`).value = options.export_type.toUpperCase().replace('_', ' ');
  row++;

  sheet.getCell(`A${row}`).value = 'Generated Date:';
  sheet.getCell(`A${row}`).style = labelStyle;
  sheet.getCell(`B${row}`).value = new Date().toLocaleDateString();
  row++;

  sheet.getCell(`A${row}`).value = 'Version:';
  sheet.getCell(`A${row}`).style = labelStyle;
  sheet.getCell(`B${row}`).value = '1.0';
  row += 2;

  // Tenderers
  sheet.getCell(`A${row}`).value = 'Tenderers Included:';
  sheet.getCell(`A${row}`).style = labelStyle;
  row++;
  tenderers.forEach(t => {
    sheet.getCell(`B${row}`).value = t.name;
    row++;
  });
  row++;

  // Legend
  sheet.getCell(`A${row}`).value = 'Included Status Legend:';
  sheet.getCell(`A${row}`).style = labelStyle;
  row++;
  sheet.getCell(`B${row}`).value = 'Included - Item fully priced and included in tender';
  row++;
  sheet.getCell(`B${row}`).value = 'Excluded - Item explicitly excluded from tender';
  row++;
  sheet.getCell(`B${row}`).value = 'Unclear - Item partially included or unclear specifications';
  row++;
  sheet.getCell(`B${row}`).value = 'Missing - Item not found in tender';
  row += 2;

  // Tab Guide
  sheet.getCell(`A${row}`).value = 'Tab Guide:';
  sheet.getCell(`A${row}`).style = labelStyle;
  row++;
  sheet.getCell(`B${row}`).value = 'BASELINE_BOQ_LINES - Normalized baseline BOQ with unique items and coverage';
  row++;
  sheet.getCell(`B${row}`).value = 'TENDERER_MAPPING - All actual line items from supplier quotes mapped to baseline';
  row++;
  sheet.getCell(`B${row}`).value = 'SCOPE_GAPS_REGISTER - Identified scope gaps and missing items';
  row++;
  sheet.getCell(`B${row}`).value = 'TAGS_CLARIFICATIONS - Tags and clarifications for discussion with tenderers';
  row++;
  sheet.getCell(`B${row}`).value = 'FIRE_ENGINEER_SCHEDULE - Fire engineer schedule items and requirements';
  row++;
}

function createBOQBaselineTab(
  workbook: ExcelJS.Workbook,
  boqLines: BOQLine[],
  mappings: any[],
  tenderers: any[],
  options: ExportOptions
): void {
  const sheet = workbook.addWorksheet('BOQ_OWNER_BASELINE');
  const isPassiveFire = options.module_key === 'passive_fire';

  // Define columns
  const baseColumns: any[] = [
    { header: 'Trade', key: 'trade', width: 15 },
    { header: 'System Group', key: 'system_group', width: 20 },
    { header: 'System', key: 'system_name', width: 30 },
    { header: 'BOQ Line ID', key: 'boq_line_id', width: 12 },
    { header: 'Drawing / Spec Ref', key: 'drawing_spec_ref', width: 20 },
    { header: 'Location / Zone', key: 'location_zone', width: 20 },
    { header: 'Element / Asset', key: 'element_asset', width: 20 },
    ...(isPassiveFire ? [{ header: 'FRR / Rating', key: 'frr_rating', width: 15 }] : []),
    { header: 'Substrate', key: 'substrate', width: 15 },
    { header: 'Service Type', key: 'service_type', width: 15 },
    { header: 'Penetration Size / Opening', key: 'penetration_size_opening', width: 20 },
    { header: 'Quantity', key: 'quantity', width: 12 },
    { header: 'Unit', key: 'unit', width: 12 },
    { header: 'System Variant / Product', key: 'system_variant_product', width: 25 },
    { header: 'Install Method / Build-up', key: 'install_method_buildup', width: 25 },
    { header: 'Access / Constraints', key: 'constraints_access', width: 25 },
    { header: 'Baseline Included?', key: 'baseline_included', width: 15 },
    { header: 'Baseline Scope Notes', key: 'baseline_scope_notes', width: 30 },
    { header: 'Baseline Measure Rule', key: 'baseline_measure_rule', width: 25 },
    { header: 'Baseline Allowance Type', key: 'baseline_allowance_type', width: 20 },
    { header: 'Baseline Allowance Value', key: 'baseline_allowance_value', width: 20 }
  ];

  // Add tenderer columns dynamically
  const columns = [...baseColumns];
  tenderers.forEach(tenderer => {
    columns.push(
      { header: `${tenderer.name} Included?`, key: `${tenderer.id}_included`, width: 15 },
      { header: `${tenderer.name} Qty`, key: `${tenderer.id}_qty`, width: 12 },
      { header: `${tenderer.name} Rate`, key: `${tenderer.id}_rate`, width: 15 },
      { header: `${tenderer.name} Amount`, key: `${tenderer.id}_amount`, width: 15 },
      { header: `${tenderer.name} Notes`, key: `${tenderer.id}_notes`, width: 30 },
      { header: `${tenderer.name} Tag IDs`, key: `${tenderer.id}_tags`, width: 20 }
    );
  });

  // Add comparison columns
  columns.push(
    { header: 'Variance vs Baseline', key: 'variance', width: 20 },
    { header: 'Scope Gap Flag', key: 'gap_flag', width: 15 },
    { header: 'Commercial Risk', key: 'commercial_risk', width: 20 },
    { header: 'Engineer Risk', key: 'engineer_risk', width: 20 },
    { header: 'Recommended Action', key: 'recommended_action', width: 30 }
  );

  sheet.columns = columns;

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 40;

  // Add data rows
  boqLines.forEach((line, index) => {
    const rowData: any = {
      trade: line.trade,
      system_group: line.system_group,
      system_name: line.system_name,
      boq_line_id: line.boq_line_id,
      drawing_spec_ref: line.drawing_spec_ref,
      location_zone: line.location_zone,
      element_asset: line.element_asset,
      ...(isPassiveFire ? { frr_rating: line.frr_rating } : {}),
      substrate: line.substrate,
      service_type: line.service_type,
      penetration_size_opening: line.penetration_size_opening,
      quantity: line.quantity,
      unit: line.unit,
      system_variant_product: line.system_variant_product,
      install_method_buildup: line.install_method_buildup,
      constraints_access: line.constraints_access,
      baseline_included: line.baseline_included ? 'Yes' : 'No',
      baseline_scope_notes: line.baseline_scope_notes,
      baseline_measure_rule: line.baseline_measure_rule,
      baseline_allowance_type: line.baseline_allowance_type,
      baseline_allowance_value: line.baseline_allowance_value
    };

    // Add tenderer data
    tenderers.forEach(tenderer => {
      const mapping = mappings.find(m => m.boq_line_id === line.id && m.tenderer_id === tenderer.id);
      if (mapping) {
        rowData[`${tenderer.id}_included`] = mapping.included_status;
        rowData[`${tenderer.id}_qty`] = mapping.tenderer_qty;
        rowData[`${tenderer.id}_rate`] = mapping.tenderer_rate;
        rowData[`${tenderer.id}_amount`] = mapping.tenderer_amount;
        rowData[`${tenderer.id}_notes`] = mapping.tenderer_notes;
        rowData[`${tenderer.id}_tags`] = (mapping.clarification_tag_ids || []).join(', ');
      }
    });

    // Add comparison data
    const allIncluded = tenderers.every(t => {
      const mapping = mappings.find(m => m.boq_line_id === line.id && m.tenderer_id === t.id);
      return mapping?.included_status === 'included';
    });

    rowData.gap_flag = allIncluded ? 'No' : 'Yes';
    rowData.commercial_risk = allIncluded ? 'Low' : 'Medium';
    rowData.recommended_action = allIncluded ? 'Proceed' : 'Request clarification';

    sheet.addRow(rowData);

    // Alternate row colors
    if (index % 2 === 1) {
      const row = sheet.getRow(index + 2);
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    }
  });

  // Freeze header row
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function createBaselineFromQuotesTab(
  workbook: ExcelJS.Workbook,
  allQuoteItems: any[],
  tenderers: any[],
  options: ExportOptions
): void {
  const sheet = workbook.addWorksheet('BASELINE_BOQ_LINES');
  const isPassiveFire = options.module_key === 'passive_fire';

  sheet.columns = [
    { header: 'BOQ Line ID', key: 'boq_line_id', width: 12 },
    { header: 'System', key: 'system_name', width: 40 },
    { header: 'Location', key: 'location', width: 20 },
    ...(isPassiveFire ? [{ header: 'FRR Rating', key: 'frr_rating', width: 12 }] : []),
    { header: 'Substrate', key: 'substrate', width: 15 },
    { header: 'Service Type', key: 'service_type', width: 15 },
    { header: 'Size/Opening', key: 'size_opening', width: 15 },
    { header: 'Quantity', key: 'quantity', width: 12 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Product', key: 'product', width: 25 },
    { header: 'Install Method', key: 'install_method', width: 25 },
    { header: 'Tenderer Coverage', key: 'coverage', width: 15 },
    { header: 'Notes', key: 'notes', width: 30 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 40;

  // Group items by unique system/location/attributes
  const uniqueItems = new Map<string, any>();
  allQuoteItems.forEach(item => {
    const key = [
      item.system_name,
      item.location,
      item.frr_rating,
      item.substrate,
      item.service_type,
      item.size_opening
    ].join('|').toLowerCase();

    if (!uniqueItems.has(key)) {
      uniqueItems.set(key, {
        ...item,
        coverage_count: 1,
        tenderers: [item.quote_id]
      });
    } else {
      const existing = uniqueItems.get(key)!;
      if (!existing.tenderers.includes(item.quote_id)) {
        existing.coverage_count++;
        existing.tenderers.push(item.quote_id);
      }
    }
  });

  let lineNumber = 1;
  uniqueItems.forEach((item, index) => {
    sheet.addRow({
      boq_line_id: `BOQ-${String(lineNumber).padStart(4, '0')}`,
      system_name: item.system_name || '',
      location: item.location || '',
      ...(isPassiveFire ? { frr_rating: item.frr_rating || '' } : {}),
      substrate: item.substrate || '',
      service_type: item.service_type || '',
      size_opening: item.size_opening || '',
      quantity: item.quantity || 0,
      unit: item.unit || '',
      product: item.product || '',
      install_method: item.install_method || '',
      coverage: `${item.coverage_count}/${tenderers.length}`,
      notes: item.notes || ''
    });

    if (index % 2 === 1) {
      const row = sheet.getRow(index + 2);
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    }

    lineNumber++;
  });

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

async function createTendererMappingTab(
  workbook: ExcelJS.Workbook,
  tenderers: any[],
  allQuoteItems: any[],
  boqLines: BOQLine[],
  mappings: any[],
  options: ExportOptions
): Promise<void> {
  const sheet = workbook.addWorksheet('TENDERER_MAPPING');
  const isPassiveFire = options.module_key === 'passive_fire';

  sheet.columns = [
    { header: 'Tenderer', key: 'tenderer', width: 25 },
    { header: 'BOQ Line ID', key: 'boq_line_id', width: 15 },
    { header: 'System Name', key: 'system_name', width: 40 },
    { header: 'Location / Zone', key: 'location', width: 20 },
    { header: 'Baseline Qty', key: 'baseline_qty', width: 12 },
    { header: 'Tenderer Qty', key: 'tenderer_qty', width: 12 },
    { header: 'Variance', key: 'variance', width: 12 },
    { header: 'Variance %', key: 'variance_percent', width: 12 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Tenderer Rate', key: 'tenderer_rate', width: 15 },
    { header: 'Tenderer Amount', key: 'tenderer_amount', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
    ...(isPassiveFire ? [{ header: 'FRR Rating', key: 'frr_rating', width: 12 }] : []),
    { header: 'Substrate', key: 'substrate', width: 15 },
    { header: 'Service Type', key: 'service_type', width: 15 },
    { header: 'Product / System Variant', key: 'product', width: 30 },
    { header: 'Tenderer Notes', key: 'notes', width: 35 },
    { header: 'Tag IDs', key: 'tag_ids', width: 20 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0891B2' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 40;

  console.log('[createTendererMappingTab] BOQ Lines:', boqLines.length);
  console.log('[createTendererMappingTab] Mappings:', mappings.length);
  console.log('[createTendererMappingTab] Tenderers:', tenderers.length);

  if (boqLines.length === 0) {
    // Show placeholder if no BOQ generated yet
    sheet.addRow({
      tenderer: '',
      boq_line_id: '',
      system_name: 'BOQ not generated yet',
      location: '',
      baseline_qty: '',
      tenderer_qty: '',
      variance: '',
      variance_percent: '',
      unit: '',
      tenderer_rate: '',
      tenderer_amount: '',
      status: '',
      ...(isPassiveFire ? { frr_rating: '' } : {}),
      substrate: '',
      service_type: '',
      product: 'Generate baseline BOQ to see tenderer mapping',
      notes: '',
      tag_ids: ''
    });
  } else if (mappings.length === 0) {
    // Show message if no mappings exist
    sheet.addRow({
      tenderer: '',
      boq_line_id: '',
      system_name: 'No tenderer mappings found',
      location: '',
      baseline_qty: '',
      tenderer_qty: '',
      variance: '',
      variance_percent: '',
      unit: '',
      tenderer_rate: '',
      tenderer_amount: '',
      status: '',
      ...(isPassiveFire ? { frr_rating: '' } : {}),
      substrate: '',
      service_type: '',
      product: 'Mappings are created when BOQ is generated',
      notes: '',
      tag_ids: ''
    });
  } else {
    let rowIndex = 0;

    console.log('[createTendererMappingTab] Tenderers:', tenderers.map(t => ({ id: t.id, name: t.name })));
    console.log('[createTendererMappingTab] Sample mappings:', mappings.slice(0, 2).map(m => ({
      tenderer_id: m.tenderer_id,
      boq_line_id: m.boq_line_id,
      included_status: m.included_status
    })));

    // Group by tenderer for better organization
    tenderers.forEach(tenderer => {
      // The mapping uses tenderer_id which refers to supplier_id
      const tendererMappings = mappings.filter(m => m.tenderer_id === tenderer.id);

      console.log(`[createTendererMappingTab] ${tenderer.name} (${tenderer.id}): ${tendererMappings.length} mappings`);

      tendererMappings.forEach(mapping => {
        const boqLine = boqLines.find(l => l.id === mapping.boq_line_id);
        if (!boqLine) {
          console.warn(`[createTendererMappingTab] BOQ line not found for mapping:`, mapping.boq_line_id);
          return;
        }

        const baselineQty = parseFloat(boqLine.quantity?.toString() || '0');
        const tendererQty = parseFloat(mapping.tenderer_qty?.toString() || '0');
        const variance = tendererQty - baselineQty;
        const variancePercent = baselineQty > 0 ? ((variance / baselineQty) * 100) : 0;

        const rowData = {
          tenderer: tenderer.name,
          boq_line_id: boqLine.boq_line_id || '',
          system_name: boqLine.system_name || '',
          location: boqLine.location_zone || '',
          baseline_qty: baselineQty,
          tenderer_qty: tendererQty,
          variance: variance !== 0 ? variance : 0,
          variance_percent: variance !== 0 ? variancePercent.toFixed(1) + '%' : '0%',
          unit: boqLine.unit || '',
          tenderer_rate: mapping.tenderer_rate || '',
          tenderer_amount: mapping.tenderer_amount || '',
          status: mapping.included_status || 'missing',
          ...(isPassiveFire ? { frr_rating: boqLine.frr_rating || '' } : {}),
          substrate: boqLine.substrate || '',
          service_type: boqLine.service_type || '',
          product: boqLine.system_variant_product || '',
          notes: mapping.tenderer_notes || '',
          tag_ids: (mapping.clarification_tag_ids || []).join(', ')
        };

        const row = sheet.addRow(rowData);

        // Color code by status
        if (mapping.included_status === 'included') {
          row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
          row.getCell('status').font = { color: { argb: 'FF065F46' } };
        } else if (mapping.included_status === 'missing') {
          row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } };
          row.getCell('status').font = { color: { argb: 'FF991B1B' } };
        }

        // Color code variance
        if (variance > 0) {
          row.getCell('variance').font = { color: { argb: 'FF065F46' } };
          row.getCell('variance_percent').font = { color: { argb: 'FF065F46' } };
        } else if (variance < 0) {
          row.getCell('variance').font = { color: { argb: 'FF991B1B' } };
          row.getCell('variance_percent').font = { color: { argb: 'FF991B1B' } };
        }

        // Alternate row colors
        if (rowIndex % 2 === 1) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
        }

        rowIndex++;
      });
    });

    console.log(`[createTendererMappingTab] Added ${rowIndex} rows to export`);
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}


function findBestMatchingBOQLine(item: any, boqLines: BOQLine[]): BOQLine | null {
  // Try to find best match based on system name and attributes
  for (const boqLine of boqLines) {
    const itemKey = createItemKey(item);
    const boqKey = createBOQKey(boqLine);

    if (itemKey === boqKey) {
      return boqLine;
    }
  }

  // Try fuzzy match on system name
  for (const boqLine of boqLines) {
    if (fuzzyMatchSystem(item.system_name, boqLine.system_name)) {
      return boqLine;
    }
  }

  return null;
}

function createItemKey(item: any): string {
  const parts = [
    item.system_name || '',
    item.location || '',
    item.frr_rating || '',
    item.substrate || '',
    item.service_type || '',
    item.size_opening || ''
  ];
  return parts.join('|').toLowerCase().trim();
}

function createBOQKey(boqLine: BOQLine): string {
  const parts = [
    boqLine.system_name || '',
    boqLine.location_zone || '',
    boqLine.frr_rating || '',
    boqLine.substrate || '',
    boqLine.service_type || '',
    boqLine.penetration_size_opening || ''
  ];
  return parts.join('|').toLowerCase().trim();
}

function fuzzyMatchSystem(str1: string, str2: string): boolean {
  if (!str1 || !str2) return false;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) return true;

  // Check for high word overlap
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const commonWords = words1.filter(w => words2.includes(w) && w.length > 3);

  return commonWords.length >= Math.min(words1.length, words2.length) * 0.5;
}

function createScopeGapsTab(workbook: ExcelJS.Workbook, gaps: ScopeGap[], tenderers: any[], boqLines?: BOQLine[]): void {
  const sheet = workbook.addWorksheet('SCOPE_GAPS_REGISTER');

  sheet.columns = [
    { header: 'Gap ID', key: 'gap_id', width: 15 },
    { header: 'BOQ Line ID', key: 'boq_line_id', width: 15 },
    { header: 'System', key: 'system', width: 30 },
    { header: 'Location', key: 'location', width: 20 },
    { header: 'Description of Gap', key: 'description', width: 40 },
    { header: 'Affected Tenderers', key: 'affected_tenderers', width: 25 },
    { header: 'Coverage', key: 'coverage', width: 12 },
    { header: 'Gap Type', key: 'gap_type', width: 20 },
    { header: 'Severity', key: 'severity', width: 12 },
    { header: 'Value Impact', key: 'value_impact', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Assigned To', key: 'assigned_to', width: 20 },
    { header: 'Resolution Notes', key: 'resolution_notes', width: 35 },
    { header: 'Date Identified', key: 'date_identified', width: 15 },
    { header: 'Date Resolved', key: 'date_resolved', width: 15 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 40;

  console.log('[createScopeGapsTab] Received gaps:', gaps?.length, 'gaps');

  if (gaps.length === 0) {
    console.warn('[createScopeGapsTab] No gaps to display - showing placeholder');
    // Add placeholder row
    sheet.addRow({
      gap_id: '',
      boq_line_id: '',
      system: 'No scope gaps identified yet',
      location: '',
      description: 'Scope gaps will appear here after analyzing tenderer coverage',
      affected_tenderers: '',
      coverage: '',
      gap_type: '',
      severity: '',
      value_impact: '',
      status: '',
      assigned_to: '',
      resolution_notes: '',
      date_identified: '',
      date_resolved: ''
    });
  } else {
    gaps.forEach((gap: any, index) => {
      // Extract BOQ line details from the joined table (if available)
      const boqLine = gap.boq_lines;

      // Get supplier name
      const supplierName = gap.suppliers?.name || '';

      // If no BOQ line linked, try to infer from description or expected_requirement
      let inferredBoqLineId = '';
      let inferredSystem = '';

      if (!boqLine) {
        // Try to extract baseline quantity from description
        const baselineMatch = gap.description?.match(/baseline \(([0-9]+)\)/);
        if (baselineMatch) {
          const baselineQty = parseFloat(baselineMatch[1]);
          // Find matching BOQ line by quantity (first match)
          const matchingBoqLine = (boqLines || []).find(
            (bl: any) => bl.quantity === baselineQty
          );
          if (matchingBoqLine) {
            inferredBoqLineId = matchingBoqLine.boq_line_id;
            inferredSystem = matchingBoqLine.system_name;
          }
        }
      }

      sheet.addRow({
        gap_id: gap.gap_id || `GAP-${index + 1}`,
        boq_line_id: boqLine?.boq_line_id || inferredBoqLineId,
        system: boqLine?.system_name || inferredSystem,
        location: boqLine?.location_zone || '',
        description: gap.description || '',
        affected_tenderers: supplierName,
        coverage: gap.coverage_count || '0/' + tenderers.length,
        gap_type: gap.gap_type || 'under_measured',
        severity: gap.severity || 'Medium',
        value_impact: gap.value_impact || '',
        status: gap.status || 'open',
        assigned_to: gap.assigned_to || '',
        resolution_notes: gap.resolution_notes || '',
        date_identified: gap.created_at ? new Date(gap.created_at).toLocaleDateString() : '',
        date_resolved: gap.resolved_at ? new Date(gap.resolved_at).toLocaleDateString() : ''
      });

      if (index % 2 === 1) {
        const row = sheet.getRow(index + 2);
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
      }
    });
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function createTagsTab(workbook: ExcelJS.Workbook, tags: ProjectTag[], boqLines: BOQLine[]): void {
  const sheet = workbook.addWorksheet('TAGS_CLARIFICATIONS');

  sheet.columns = [
    { header: 'Tag ID', key: 'tag_id', width: 12 },
    { header: 'Category', key: 'category', width: 15 },
    { header: 'Trade', key: 'trade', width: 15 },
    { header: 'BOQ Line ID', key: 'boq_line_id', width: 15 },
    { header: 'Title', key: 'title', width: 30 },
    { header: 'Clarification Statement', key: 'statement', width: 50 },
    { header: 'Risk if not Agreed', key: 'risk', width: 30 },
    { header: 'Default Position', key: 'default_position', width: 15 },
    { header: 'Cost Impact Type', key: 'cost_impact', width: 15 },
    { header: 'Estimate Allowance', key: 'allowance', width: 15 },
    { header: 'Evidence/Ref', key: 'evidence', width: 20 },
    { header: 'Contractor Comment', key: 'contractor_comment', width: 40 },
    { header: 'Supplier Comment', key: 'supplier_comment', width: 40 },
    { header: 'Agreement Status', key: 'agreement_status', width: 15 },
    { header: 'Contract Clause Ref', key: 'contract_ref', width: 20 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 40;

  if (tags.length === 0) {
    sheet.addRow({
      tag_id: '',
      category: '',
      trade: '',
      boq_line_id: '',
      title: 'No tags or clarifications yet',
      statement: 'Tags and clarifications will appear here as they are created',
      risk: '',
      default_position: '',
      cost_impact: '',
      allowance: '',
      evidence: '',
      contractor_comment: '',
      supplier_comment: '',
      agreement_status: '',
      contract_ref: ''
    });
  } else {
    tags.forEach((tag, index) => {
      sheet.addRow({
        tag_id: tag.tag_id || `TAG-${index + 1}`,
        category: tag.category || '',
        trade: tag.trade || '',
        boq_line_id: tag.linked_boq_line_id || '',
        title: tag.title || '',
        statement: tag.statement || '',
        risk: tag.risk_if_not_agreed || '',
        default_position: tag.default_position || '',
        cost_impact: tag.cost_impact_type || '',
        allowance: tag.estimate_allowance || '',
        evidence: tag.evidence_ref || '',
        contractor_comment: tag.main_contractor_comment || '',
        supplier_comment: tag.supplier_comment || '',
        agreement_status: tag.agreement_status || 'Pending',
        contract_ref: tag.final_contract_clause_ref || ''
      });

      if (index % 2 === 1) {
        const row = sheet.getRow(index + 2);
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      }
    });
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function createFireScheduleTab(workbook: ExcelJS.Workbook, fireItems: any[]): void {
  const sheet = workbook.addWorksheet('FIRE_ENGINEER_SCHEDULE');

  sheet.columns = [
    { header: 'Schedule Item ID', key: 'item_id', width: 15 },
    { header: 'BOQ Line ID', key: 'boq_line_id', width: 15 },
    { header: 'System', key: 'system', width: 30 },
    { header: 'Location/Zone', key: 'location', width: 20 },
    { header: 'Fire Rating Required', key: 'frr', width: 15 },
    { header: 'Product Type', key: 'product_type', width: 25 },
    { header: 'Application Method', key: 'application', width: 25 },
    { header: 'Substrate', key: 'substrate', width: 15 },
    { header: 'Area/Length', key: 'dimension', width: 12 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Spec Reference', key: 'spec_ref', width: 20 },
    { header: 'Compliance Standard', key: 'standard', width: 20 },
    { header: 'Test Report Ref', key: 'test_report', width: 20 },
    { header: 'Inspector Notes', key: 'notes', width: 35 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Date Scheduled', key: 'date_scheduled', width: 15 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 40;

  if (fireItems.length === 0) {
    sheet.addRow({
      item_id: '',
      boq_line_id: '',
      system: 'No fire engineer schedule items yet',
      location: '',
      frr: '',
      product_type: 'Fire schedule items will appear here after import',
      application: '',
      substrate: '',
      dimension: '',
      unit: '',
      spec_ref: '',
      standard: '',
      test_report: '',
      notes: '',
      status: '',
      date_scheduled: ''
    });
  } else {
    fireItems.forEach((item, index) => {
      sheet.addRow({
        item_id: item.item_id || `FS-${index + 1}`,
        boq_line_id: item.boq_line_id || '',
        system: item.system_name || '',
        location: item.location || '',
        frr: item.frr_rating || '',
        product_type: item.product_type || '',
        application: item.application_method || '',
        substrate: item.substrate || '',
        dimension: item.area || item.length || '',
        unit: item.unit || '',
        spec_ref: item.specification_reference || '',
        standard: item.compliance_standard || '',
        test_report: item.test_report_reference || '',
        notes: item.inspector_notes || '',
        status: item.status || 'Scheduled',
        date_scheduled: item.date_scheduled ? new Date(item.date_scheduled).toLocaleDateString() : ''
      });

      if (index % 2 === 1) {
        const row = sheet.getRow(index + 2);
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      }
    });
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}


export async function exportTagsClarifications(
  projectId: string,
  moduleKey: string
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VerifyTrade';
  workbook.created = new Date();

  // Get project tags
  const { data: tags } = await supabase
    .from('project_tags')
    .select('*')
    .eq('project_id', projectId)
    .eq('module_key', moduleKey)
    .order('tag_id');

  const sheet = workbook.addWorksheet('TAGS_CLARIFICATIONS');

  sheet.columns = [
    { header: 'Tag ID', key: 'tag_id', width: 12 },
    { header: 'Category', key: 'category', width: 15 },
    { header: 'Trade', key: 'trade', width: 15 },
    { header: 'System / BOQ Line ID Link', key: 'linked_boq_line_id', width: 20 },
    { header: 'Tag / Clarification Title', key: 'title', width: 30 },
    { header: 'Clarification Statement', key: 'statement', width: 50 },
    { header: 'Risk if not Agreed', key: 'risk_if_not_agreed', width: 30 },
    { header: 'Default Position', key: 'default_position', width: 15 },
    { header: 'Cost Impact Type', key: 'cost_impact_type', width: 15 },
    { header: 'Estimate Allowance', key: 'estimate_allowance', width: 15 },
    { header: 'Evidence / Ref', key: 'evidence_ref', width: 20 },
    { header: 'Main Contractor Name', key: 'main_contractor_name', width: 25 },
    { header: 'Main Contractor Comment', key: 'main_contractor_comment', width: 40 },
    { header: 'Supplier Name', key: 'supplier_name', width: 25 },
    { header: 'Supplier Comment', key: 'supplier_comment', width: 40 },
    { header: 'Agreement Status', key: 'agreement_status', width: 15 },
    { header: 'Final Contract Clause Ref', key: 'final_contract_clause_ref', width: 25 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 40;

  (tags || []).forEach((tag, index) => {
    sheet.addRow({
      tag_id: tag.tag_id,
      category: tag.category,
      trade: tag.trade,
      linked_boq_line_id: tag.linked_boq_line_id,
      title: tag.title,
      statement: tag.statement,
      risk_if_not_agreed: tag.risk_if_not_agreed,
      default_position: tag.default_position,
      cost_impact_type: tag.cost_impact_type,
      estimate_allowance: tag.estimate_allowance,
      evidence_ref: tag.evidence_ref,
      main_contractor_name: tag.main_contractor_name,
      main_contractor_comment: tag.main_contractor_comment,
      supplier_name: tag.supplier_name,
      supplier_comment: tag.supplier_comment,
      agreement_status: tag.agreement_status,
      final_contract_clause_ref: tag.final_contract_clause_ref
    });

    if (index % 2 === 1) {
      const row = sheet.getRow(index + 2);
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    }
  });

  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
