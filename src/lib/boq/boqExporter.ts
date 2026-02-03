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

  // Get BOQ lines
  const { data: boqLines } = await supabase
    .from('boq_lines')
    .select('*')
    .eq('project_id', options.project_id)
    .eq('module_key', options.module_key)
    .order('boq_line_id');

  // Get tenderer mappings
  const { data: mappings } = await supabase
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

  // Get tenderers
  const { data: tenderers } = await supabase
    .from('suppliers')
    .select('id, name')
    .in('id', options.tenderer_ids || []);

  // Get scope gaps
  const { data: gaps } = await supabase
    .from('scope_gaps')
    .select('*')
    .eq('project_id', options.project_id)
    .eq('module_key', options.module_key);

  // Tab 1: README_CONTROLS
  createREADMETab(workbook, project, options, tenderers || []);

  // Tab 2: BOQ_OWNER_BASELINE
  createBOQBaselineTab(workbook, boqLines || [], mappings || [], tenderers || [], options);

  // Tab 3: BOQ_TENDERER_COMPARISON
  createTendererComparisonTab(workbook, boqLines || [], mappings || [], tenderers || []);

  // Tab 4: SCOPE_GAPS_REGISTER
  if (options.include_gaps) {
    createScopeGapsTab(workbook, gaps || []);
  }

  // Tab 5: ASSUMPTIONS_EXCLUSIONS
  createAssumptionsTab(workbook, project);

  // Tab 6: ATTRIBUTES_DICTIONARY
  createAttributesDictionaryTab(workbook, options.module_key);

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
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

  // Define columns
  const baseColumns = [
    { header: 'Trade', key: 'trade', width: 15 },
    { header: 'System Group', key: 'system_group', width: 20 },
    { header: 'System', key: 'system_name', width: 30 },
    { header: 'BOQ Line ID', key: 'boq_line_id', width: 12 },
    { header: 'Drawing / Spec Ref', key: 'drawing_spec_ref', width: 20 },
    { header: 'Location / Zone', key: 'location_zone', width: 20 },
    { header: 'Element / Asset', key: 'element_asset', width: 20 },
    { header: 'FRR / Rating', key: 'frr_rating', width: 15 },
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
      frr_rating: line.frr_rating,
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

function createTendererComparisonTab(
  workbook: ExcelJS.Workbook,
  boqLines: BOQLine[],
  mappings: any[],
  tenderers: any[]
): void {
  const sheet = workbook.addWorksheet('BOQ_TENDERER_COMPARISON');

  const columns = [
    { header: 'BOQ Line ID', key: 'boq_line_id', width: 12 },
    { header: 'System', key: 'system_name', width: 30 },
    { header: 'Location / Zone', key: 'location_zone', width: 20 },
    { header: 'Baseline Qty', key: 'baseline_qty', width: 12 },
    { header: 'Unit', key: 'unit', width: 12 }
  ];

  // Add tenderer columns
  tenderers.forEach(tenderer => {
    columns.push(
      { header: `${tenderer.name} Amount`, key: `${tenderer.id}_amount`, width: 15 },
      { header: `${tenderer.name} Included?`, key: `${tenderer.id}_included`, width: 15 }
    );
  });

  columns.push(
    { header: 'Cheapest Compliant Tenderer', key: 'cheapest', width: 25 },
    { header: 'Missing Scope Tenderers', key: 'missing_scope', width: 30 },
    { header: 'Notes', key: 'notes', width: 30 }
  );

  sheet.columns = columns;

  // Style header
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 40;

  // Add data
  boqLines.forEach((line, index) => {
    const rowData: any = {
      boq_line_id: line.boq_line_id,
      system_name: line.system_name,
      location_zone: line.location_zone,
      baseline_qty: line.quantity,
      unit: line.unit
    };

    let cheapestAmount = Infinity;
    let cheapestTenderer = '';
    const missingTenderers: string[] = [];

    tenderers.forEach(tenderer => {
      const mapping = mappings.find(m => m.boq_line_id === line.id && m.tenderer_id === tenderer.id);
      if (mapping) {
        rowData[`${tenderer.id}_amount`] = mapping.tenderer_amount;
        rowData[`${tenderer.id}_included`] = mapping.included_status;

        if (mapping.included_status === 'included' && mapping.tenderer_amount) {
          if (mapping.tenderer_amount < cheapestAmount) {
            cheapestAmount = mapping.tenderer_amount;
            cheapestTenderer = tenderer.name;
          }
        }

        if (mapping.included_status === 'missing' || mapping.included_status === 'excluded') {
          missingTenderers.push(tenderer.name);
        }
      }
    });

    rowData.cheapest = cheapestTenderer || 'None';
    rowData.missing_scope = missingTenderers.join(', ');

    sheet.addRow(rowData);

    if (index % 2 === 1) {
      const row = sheet.getRow(index + 2);
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    }
  });

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function createScopeGapsTab(workbook: ExcelJS.Workbook, gaps: ScopeGap[]): void {
  const sheet = workbook.addWorksheet('SCOPE_GAPS_REGISTER');

  sheet.columns = [
    { header: 'Gap ID', key: 'gap_id', width: 12 },
    { header: 'Related BOQ Line ID', key: 'boq_line_id', width: 15 },
    { header: 'Tenderer', key: 'tenderer', width: 25 },
    { header: 'Gap Type', key: 'gap_type', width: 15 },
    { header: 'Description of Gap', key: 'description', width: 40 },
    { header: 'Expected Requirement', key: 'expected_requirement', width: 30 },
    { header: 'Risk if not Included', key: 'risk_if_not_included', width: 30 },
    { header: 'Proposed Commercial Treatment', key: 'commercial_treatment', width: 25 },
    { header: 'Target Close-out Date', key: 'target_closeout_date', width: 18 },
    { header: 'Owner', key: 'owner_role', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Closure Evidence', key: 'closure_evidence', width: 30 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 40;

  gaps.forEach((gap, index) => {
    sheet.addRow({
      gap_id: gap.gap_id,
      boq_line_id: gap.boq_line_id,
      tenderer: gap.tenderer_id || 'All',
      gap_type: gap.gap_type,
      description: gap.description,
      expected_requirement: gap.expected_requirement,
      risk_if_not_included: gap.risk_if_not_included,
      commercial_treatment: gap.commercial_treatment,
      target_closeout_date: gap.target_closeout_date,
      owner_role: gap.owner_role,
      status: gap.status,
      closure_evidence: gap.closure_evidence
    });

    if (index % 2 === 1) {
      const row = sheet.getRow(index + 2);
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
    }
  });

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function createAssumptionsTab(workbook: ExcelJS.Workbook, project: any): void {
  const sheet = workbook.addWorksheet('ASSUMPTIONS_EXCLUSIONS');

  sheet.columns = [
    { header: 'Item ID', key: 'item_id', width: 12 },
    { header: 'Category', key: 'category', width: 15 },
    { header: 'Statement', key: 'statement', width: 50 },
    { header: 'Applies To', key: 'applies_to', width: 20 },
    { header: 'Commercial Treatment', key: 'commercial_treatment', width: 20 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Notes', key: 'notes', width: 30 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 40;

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function createAttributesDictionaryTab(workbook: ExcelJS.Workbook, moduleKey: string): void {
  const sheet = workbook.addWorksheet('ATTRIBUTES_DICTIONARY');

  sheet.columns = [
    { header: 'Attribute Name', key: 'attribute_name', width: 25 },
    { header: 'Definition', key: 'definition', width: 40 },
    { header: 'Example', key: 'example', width: 30 },
    { header: 'Source', key: 'source', width: 20 },
    { header: 'Notes', key: 'notes', width: 30 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 40;

  const attributes = getModuleAttributes(moduleKey);
  attributes.forEach((attr, index) => {
    sheet.addRow(attr);
    if (index % 2 === 1) {
      const row = sheet.getRow(index + 2);
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
    }
  });

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function getModuleAttributes(moduleKey: string): any[] {
  const common = [
    { attribute_name: 'System Name', definition: 'Name of the fire protection system or element', example: 'Fire stopping to penetrations', source: 'Specification', notes: 'Must match system library' },
    { attribute_name: 'FRR Rating', definition: 'Fire Resistance Rating in minutes', example: '120 mins, -/120/120', source: 'Drawing/Spec', notes: 'AS 1530.4 format' },
    { attribute_name: 'Substrate', definition: 'Material being penetrated or protected', example: 'Concrete, Plasterboard, Masonry', source: 'Drawing', notes: 'Critical for system selection' },
    { attribute_name: 'Location/Zone', definition: 'Physical location within building', example: 'Level 3, Basement, Riser', source: 'Drawing', notes: 'For site coordination' },
    { attribute_name: 'Quantity', definition: 'Measured quantity', example: '50, 120.5', source: 'Measurement', notes: 'Must include unit' },
    { attribute_name: 'Unit', definition: 'Unit of measurement', example: 'each, lm, m2, lump sum', source: 'Measurement', notes: 'Standardized units' }
  ];

  if (moduleKey === 'passive_fire') {
    return [
      ...common,
      { attribute_name: 'Service Type', definition: 'Type of service penetrating', example: 'Electrical, Plumbing, HVAC', source: 'Drawing', notes: 'Affects product selection' },
      { attribute_name: 'Penetration Size', definition: 'Size of penetration or opening', example: '100mm, 150x200mm', source: 'Drawing', notes: 'Critical for material quantities' }
    ];
  }

  return common;
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
