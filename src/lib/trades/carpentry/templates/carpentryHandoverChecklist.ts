export interface HandoverChecklistItem {
  id: string;
  category: string;
  item: string;
  mandatory: boolean;
  notes?: string;
}

export const carpentryHandoverChecklist: HandoverChecklistItem[] = [
  {
    id: 'hc-carp-001',
    category: 'Framing',
    item: 'All wall framing complete and inspected (plumb, level, and true to specified wall types)',
    mandatory: true,
  },
  {
    id: 'hc-carp-002',
    category: 'Framing',
    item: 'Ceiling framing complete and inspected at all levels',
    mandatory: true,
  },
  {
    id: 'hc-carp-003',
    category: 'Framing',
    item: 'Door frames installed, plumb, and square to all openings',
    mandatory: true,
  },
  {
    id: 'hc-carp-004',
    category: 'Framing',
    item: 'Canopy and balcony framing complete as per drawings',
    mandatory: false,
  },
  {
    id: 'hc-carp-005',
    category: 'Framing',
    item: 'All blocking, nogs, and backing installed for fixtures (handrails, kitchens, bathrooms)',
    mandatory: true,
  },
  {
    id: 'hc-carp-006',
    category: 'Insulation',
    item: 'Wall insulation (Pink Batts R2.2 or specified equivalent) installed to all external and intertenancy walls',
    mandatory: true,
  },
  {
    id: 'hc-carp-007',
    category: 'Insulation',
    item: 'Mid-floor acoustic insulation (Silencer or specified equivalent) installed at all intertenancy floors',
    mandatory: true,
  },
  {
    id: 'hc-carp-008',
    category: 'Insulation',
    item: 'Ceiling insulation installed at top-floor ceiling level',
    mandatory: false,
  },
  {
    id: 'hc-carp-009',
    category: 'Insulation',
    item: 'Insulation inspection sign-off obtained prior to close-in',
    mandatory: true,
    notes: 'Council or third-party inspection may be required',
  },
  {
    id: 'hc-carp-010',
    category: 'Plasterboard',
    item: 'All GIB board fixed to walls and ceilings — correct board type per location (Aqualine, Fyreline, Standard)',
    mandatory: true,
  },
  {
    id: 'hc-carp-011',
    category: 'Plasterboard',
    item: 'All fire-rated assemblies completed using correct Fyreline boards and tested assembly details',
    mandatory: true,
  },
  {
    id: 'hc-carp-012',
    category: 'Plasterboard',
    item: 'GIB stopping complete to specified level (minimum Level 4 unless noted otherwise)',
    mandatory: true,
  },
  {
    id: 'hc-carp-013',
    category: 'Plasterboard',
    item: 'All GIB corners, reveals, and architraves installed and stopped',
    mandatory: true,
  },
  {
    id: 'hc-carp-014',
    category: 'Plasterboard',
    item: 'Wet area GIB (Aqualine) installed and sealed at wall-to-floor junctions prior to waterproofing',
    mandatory: true,
  },
  {
    id: 'hc-carp-015',
    category: 'Doors and Finishing',
    item: 'All interior timber doors hung, adjusted, and hardware fitted',
    mandatory: true,
  },
  {
    id: 'hc-carp-016',
    category: 'Doors and Finishing',
    item: 'All skirting, architraves, and trims installed and fixed',
    mandatory: true,
  },
  {
    id: 'hc-carp-017',
    category: 'Doors and Finishing',
    item: 'All doors operate correctly without binding',
    mandatory: true,
  },
  {
    id: 'hc-carp-018',
    category: 'Documentation',
    item: 'As-built mark-ups provided for all wall type changes or deviations',
    mandatory: true,
  },
  {
    id: 'hc-carp-019',
    category: 'Documentation',
    item: 'Manufacturer\'s data sheets and installation certificates provided for all insulation products',
    mandatory: true,
  },
  {
    id: 'hc-carp-020',
    category: 'Documentation',
    item: 'GIB system certificates (Gib EzyBrace, Fyreline assembly records) provided',
    mandatory: false,
  },
  {
    id: 'hc-carp-021',
    category: 'Quality',
    item: 'All trade penetrations through fire walls correctly sealed in coordination with passive fire subcontractor',
    mandatory: true,
  },
  {
    id: 'hc-carp-022',
    category: 'Quality',
    item: 'Defects register reviewed and all defects rectified prior to handover',
    mandatory: true,
  },
  {
    id: 'hc-carp-023',
    category: 'Quality',
    item: 'Site clean — all off-cuts, waste, and packaging removed from all levels',
    mandatory: true,
  },
];
