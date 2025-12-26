import type { SupplierQuoteLine, ParsedQuoteLine, SectionType } from '../../types/import.types';

function detectSection(line: SupplierQuoteLine): SectionType {
  const desc = line.description?.toLowerCase() || '';
  const section = line.section?.toLowerCase() || '';

  if (section.includes('electrical') || desc.includes('cable') || desc.includes('conduit')) {
    return 'Electrical Services';
  }
  if (section.includes('fire') || desc.includes('collar') || desc.includes('firestop')) {
    return 'Fire Protection Services';
  }
  if (section.includes('hydraulic') || desc.includes('pipe') || desc.includes('plumbing')) {
    return 'Hydraulics Services';
  }
  if (section.includes('mechanical') || desc.includes('duct') || desc.includes('hvac')) {
    return 'Mechanical Services';
  }
  if (section.includes('structural')) {
    return 'Structural Penetrations';
  }

  return 'Passive Fire (General)';
}

export function convertLegacyToNewFormat(data: SupplierQuoteLine[]): ParsedQuoteLine[] {
  console.log('[Quote Adapter] Converting', data.length, 'lines to new format');

  return data.map((line): ParsedQuoteLine => {
    const flags: any[] = [];

    if (!line.unit) flags.push('MISSING UNIT');
    if (!line.qty || line.qty === 0) flags.push('MISSING QTY');
    if (!line.rate || line.rate === 0) flags.push('MISSING RATE');
    if (!line.total || line.total === 0) flags.push('MISSING TOTAL');

    return {
      id: line.id,
      supplier: line.supplierName,
      section: detectSection(line),
      service_type: line.section || undefined,
      description: line.description || '',
      size: undefined,
      substrate_frr: undefined,
      materials: undefined,
      reference: line.reference || undefined,
      qty: line.qty || 0,
      unit: line.unit || '',
      rate: line.rate || 0,
      total: line.total || 0,
      flags,
      source_line: line.raw || line.description || '',
      page_no: undefined,
      general: false,
    };
  });
}
