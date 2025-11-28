export interface PassiveFireSystem {
  id: string;
  label: string;
  category: 'penetration' | 'joint' | 'coating' | 'door' | 'duct' | 'curtain' | 'other';
  serviceType?: 'electrical' | 'mechanical' | 'plumbing' | 'hvac' | 'mixed' | 'blank';
  frr?: number;
  sizeMin?: number;
  sizeMax?: number;
  material?: string;
  substrate?: string;
  keywords: string[];
  riskLevel?: 'low' | 'medium' | 'high';
}

export const PASSIVE_FIRE_ONTOLOGY: PassiveFireSystem[] = [
  // PENETRATION SEALS - Cable/Electrical
  {
    id: 'PE_CABLE_30',
    label: '30min Cable Penetration',
    category: 'penetration',
    serviceType: 'electrical',
    frr: 30,
    sizeMin: 0,
    sizeMax: 100,
    material: 'intumescent',
    keywords: ['cable', 'electrical', '30min', 'half hour']
  },
  {
    id: 'PE_CABLE_60',
    label: '60min Cable Penetration',
    category: 'penetration',
    serviceType: 'electrical',
    frr: 60,
    sizeMin: 0,
    sizeMax: 100,
    material: 'intumescent',
    keywords: ['cable', 'electrical', '60min', 'one hour', '1hr']
  },
  {
    id: 'PE_CABLE_90',
    label: '90min Cable Penetration',
    category: 'penetration',
    serviceType: 'electrical',
    frr: 90,
    sizeMin: 0,
    sizeMax: 100,
    material: 'intumescent',
    keywords: ['cable', 'electrical', '90min', '1.5hr']
  },
  {
    id: 'PE_CABLE_120',
    label: '120min Cable Penetration',
    category: 'penetration',
    serviceType: 'electrical',
    frr: 120,
    sizeMin: 0,
    sizeMax: 100,
    material: 'intumescent',
    keywords: ['cable', 'electrical', '120min', 'two hour', '2hr']
  },
  {
    id: 'PE_CABLE_TRAY_60',
    label: '60min Cable Tray Penetration',
    category: 'penetration',
    serviceType: 'electrical',
    frr: 60,
    material: 'batt',
    keywords: ['cable tray', 'tray', 'electrical', '60min', 'ryanfire', 'batt']
  },
  {
    id: 'PE_CABLE_TRAY_120',
    label: '120min Cable Tray Penetration',
    category: 'penetration',
    serviceType: 'electrical',
    frr: 120,
    material: 'batt',
    keywords: ['cable tray', 'tray', 'electrical', '120min', 'ryanfire', 'batt']
  },

  // PENETRATION SEALS - Pipe/Plumbing
  {
    id: 'PE_PIPE_50_60',
    label: '60min Pipe Penetration (50mm)',
    category: 'penetration',
    serviceType: 'plumbing',
    frr: 60,
    sizeMin: 0,
    sizeMax: 75,
    material: 'collar',
    keywords: ['pipe', 'plumbing', '50mm', '60min', 'collar']
  },
  {
    id: 'PE_PIPE_100_60',
    label: '60min Pipe Penetration (100mm)',
    category: 'penetration',
    serviceType: 'plumbing',
    frr: 60,
    sizeMin: 76,
    sizeMax: 150,
    material: 'collar',
    keywords: ['pipe', 'plumbing', '100mm', '60min', 'collar']
  },
  {
    id: 'PE_PIPE_150_60',
    label: '60min Pipe Penetration (150mm)',
    category: 'penetration',
    serviceType: 'plumbing',
    frr: 60,
    sizeMin: 151,
    sizeMax: 200,
    material: 'collar',
    keywords: ['pipe', 'plumbing', '150mm', '60min', 'collar']
  },
  {
    id: 'PE_PIPE_300_60',
    label: '60min Pipe Penetration (300mm)',
    category: 'penetration',
    serviceType: 'plumbing',
    frr: 60,
    sizeMin: 201,
    sizeMax: 400,
    material: 'collar',
    keywords: ['pipe', 'plumbing', '300mm', '60min', 'collar']
  },
  {
    id: 'PE_PIPE_50_120',
    label: '120min Pipe Penetration (50mm)',
    category: 'penetration',
    serviceType: 'plumbing',
    frr: 120,
    sizeMin: 0,
    sizeMax: 75,
    material: 'collar',
    keywords: ['pipe', 'plumbing', '50mm', '120min', 'collar', '2hr']
  },
  {
    id: 'PE_PIPE_100_120',
    label: '120min Pipe Penetration (100mm)',
    category: 'penetration',
    serviceType: 'plumbing',
    frr: 120,
    sizeMin: 76,
    sizeMax: 150,
    material: 'collar',
    keywords: ['pipe', 'plumbing', '100mm', '120min', 'collar', '2hr']
  },
  {
    id: 'PE_PIPE_150_120',
    label: '120min Pipe Penetration (150mm)',
    category: 'penetration',
    serviceType: 'plumbing',
    frr: 120,
    sizeMin: 151,
    sizeMax: 200,
    material: 'collar',
    keywords: ['pipe', 'plumbing', '150mm', '120min', 'collar', '2hr']
  },

  // PENETRATION SEALS - HVAC/Duct
  {
    id: 'PE_DUCT_300_60',
    label: '60min Duct Penetration (300mm)',
    category: 'penetration',
    serviceType: 'hvac',
    frr: 60,
    sizeMin: 0,
    sizeMax: 400,
    material: 'intumescent',
    keywords: ['duct', 'hvac', 'ventilation', '300mm', '60min']
  },
  {
    id: 'PE_DUCT_600_60',
    label: '60min Duct Penetration (600mm)',
    category: 'penetration',
    serviceType: 'hvac',
    frr: 60,
    sizeMin: 401,
    sizeMax: 800,
    material: 'intumescent',
    keywords: ['duct', 'hvac', 'ventilation', '600mm', '60min']
  },
  {
    id: 'PE_DUCT_300_120',
    label: '120min Duct Penetration (300mm)',
    category: 'penetration',
    serviceType: 'hvac',
    frr: 120,
    sizeMin: 0,
    sizeMax: 400,
    material: 'intumescent',
    keywords: ['duct', 'hvac', 'ventilation', '300mm', '120min', '2hr']
  },
  {
    id: 'PE_DUCT_600_120',
    label: '120min Duct Penetration (600mm)',
    category: 'penetration',
    serviceType: 'hvac',
    frr: 120,
    sizeMin: 401,
    sizeMax: 800,
    material: 'intumescent',
    keywords: ['duct', 'hvac', 'ventilation', '600mm', '120min', '2hr']
  },

  // PENETRATION SEALS - Mixed Services
  {
    id: 'PE_MIXED_SMALL_60',
    label: '60min Mixed Services (Small)',
    category: 'penetration',
    serviceType: 'mixed',
    frr: 60,
    sizeMin: 0,
    sizeMax: 200,
    material: 'intumescent',
    keywords: ['mixed', 'services', 'multiple', 'small', '60min']
  },
  {
    id: 'PE_MIXED_LARGE_60',
    label: '60min Mixed Services (Large)',
    category: 'penetration',
    serviceType: 'mixed',
    frr: 60,
    sizeMin: 201,
    sizeMax: 500,
    material: 'intumescent',
    keywords: ['mixed', 'services', 'multiple', 'large', '60min']
  },
  {
    id: 'PE_MIXED_SMALL_120',
    label: '120min Mixed Services (Small)',
    category: 'penetration',
    serviceType: 'mixed',
    frr: 120,
    sizeMin: 0,
    sizeMax: 200,
    material: 'intumescent',
    keywords: ['mixed', 'services', 'multiple', 'small', '120min', '2hr']
  },
  {
    id: 'PE_MIXED_LARGE_120',
    label: '120min Mixed Services (Large)',
    category: 'penetration',
    serviceType: 'mixed',
    frr: 120,
    sizeMin: 201,
    sizeMax: 500,
    material: 'intumescent',
    keywords: ['mixed', 'services', 'multiple', 'large', '120min', '2hr']
  },

  // PENETRATION SEALS - Blank/Openings
  {
    id: 'PE_BLANK_SMALL_60',
    label: '60min Blank Opening (Small)',
    category: 'penetration',
    serviceType: 'blank',
    frr: 60,
    sizeMin: 0,
    sizeMax: 200,
    material: 'board',
    keywords: ['blank', 'opening', 'hole', 'small', '60min']
  },
  {
    id: 'PE_BLANK_LARGE_60',
    label: '60min Blank Opening (Large)',
    category: 'penetration',
    serviceType: 'blank',
    frr: 60,
    sizeMin: 201,
    sizeMax: 1000,
    material: 'board',
    keywords: ['blank', 'opening', 'hole', 'large', '60min']
  },
  {
    id: 'PE_BLANK_SMALL_120',
    label: '120min Blank Opening (Small)',
    category: 'penetration',
    serviceType: 'blank',
    frr: 120,
    sizeMin: 0,
    sizeMax: 200,
    material: 'board',
    keywords: ['blank', 'opening', 'hole', 'small', '120min', '2hr']
  },
  {
    id: 'PE_BLANK_LARGE_120',
    label: '120min Blank Opening (Large)',
    category: 'penetration',
    serviceType: 'blank',
    frr: 120,
    sizeMin: 201,
    sizeMax: 1000,
    material: 'board',
    keywords: ['blank', 'opening', 'hole', 'large', '120min', '2hr']
  },

  // LINEAR JOINTS
  {
    id: 'LJ_10_PERIMETER',
    label: '10mm Perimeter Joint',
    category: 'joint',
    frr: 60,
    sizeMin: 0,
    sizeMax: 15,
    material: 'mastic',
    keywords: ['joint', 'perimeter', 'linear', '10mm', 'mastic', 'sealant']
  },
  {
    id: 'LJ_25_PERIMETER',
    label: '25mm Perimeter Joint',
    category: 'joint',
    frr: 60,
    sizeMin: 16,
    sizeMax: 35,
    material: 'mastic',
    keywords: ['joint', 'perimeter', 'linear', '25mm', 'mastic', 'sealant']
  },
  {
    id: 'LJ_50_PERIMETER',
    label: '50mm Perimeter Joint',
    category: 'joint',
    frr: 60,
    sizeMin: 36,
    sizeMax: 75,
    material: 'mastic',
    keywords: ['joint', 'perimeter', 'linear', '50mm', 'mastic', 'sealant']
  },
  {
    id: 'LJ_10_FLOOR',
    label: '10mm Floor Joint',
    category: 'joint',
    frr: 120,
    sizeMin: 0,
    sizeMax: 15,
    material: 'mastic',
    keywords: ['joint', 'floor', 'horizontal', '10mm', 'mastic']
  },
  {
    id: 'LJ_25_FLOOR',
    label: '25mm Floor Joint',
    category: 'joint',
    frr: 120,
    sizeMin: 16,
    sizeMax: 35,
    material: 'mastic',
    keywords: ['joint', 'floor', 'horizontal', '25mm', 'mastic']
  },
  {
    id: 'LJ_50_FLOOR',
    label: '50mm Floor Joint',
    category: 'joint',
    frr: 120,
    sizeMin: 36,
    sizeMax: 75,
    material: 'mastic',
    keywords: ['joint', 'floor', 'horizontal', '50mm', 'mastic']
  },

  // INTUMESCENT COATINGS - Structural Steel
  {
    id: 'IC_UC_30',
    label: '30min Intumescent on UC Columns',
    category: 'coating',
    frr: 30,
    substrate: 'steel',
    material: 'intumescent paint',
    keywords: ['intumescent', 'coating', 'uc', 'column', 'steel', '30min', 'sc902']
  },
  {
    id: 'IC_UC_60',
    label: '60min Intumescent on UC Columns',
    category: 'coating',
    frr: 60,
    substrate: 'steel',
    material: 'intumescent paint',
    keywords: ['intumescent', 'coating', 'uc', 'column', 'steel', '60min', 'sc902']
  },
  {
    id: 'IC_UC_90',
    label: '90min Intumescent on UC Columns',
    category: 'coating',
    frr: 90,
    substrate: 'steel',
    material: 'intumescent paint',
    keywords: ['intumescent', 'coating', 'uc', 'column', 'steel', '90min', 'sc902']
  },
  {
    id: 'IC_UC_120',
    label: '120min Intumescent on UC Columns',
    category: 'coating',
    frr: 120,
    substrate: 'steel',
    material: 'intumescent paint',
    keywords: ['intumescent', 'coating', 'uc', 'column', 'steel', '120min', '2hr', 'sc902']
  },
  {
    id: 'IC_UB_30',
    label: '30min Intumescent on UB Beams',
    category: 'coating',
    frr: 30,
    substrate: 'steel',
    material: 'intumescent paint',
    keywords: ['intumescent', 'coating', 'ub', 'beam', 'steel', '30min', 'sc902']
  },
  {
    id: 'IC_UB_60',
    label: '60min Intumescent on UB Beams',
    category: 'coating',
    frr: 60,
    substrate: 'steel',
    material: 'intumescent paint',
    keywords: ['intumescent', 'coating', 'ub', 'beam', 'steel', '60min', 'sc902']
  },
  {
    id: 'IC_UB_90',
    label: '90min Intumescent on UB Beams',
    category: 'coating',
    frr: 90,
    substrate: 'steel',
    material: 'intumescent paint',
    keywords: ['intumescent', 'coating', 'ub', 'beam', 'steel', '90min', 'sc902']
  },
  {
    id: 'IC_UB_120',
    label: '120min Intumescent on UB Beams',
    category: 'coating',
    frr: 120,
    substrate: 'steel',
    material: 'intumescent paint',
    keywords: ['intumescent', 'coating', 'ub', 'beam', 'steel', '120min', '2hr', 'sc902']
  },
  {
    id: 'IC_HOLLOW_60',
    label: '60min Intumescent on Hollow Sections',
    category: 'coating',
    frr: 60,
    substrate: 'steel',
    material: 'intumescent paint',
    keywords: ['intumescent', 'coating', 'hollow', 'rhs', 'shs', 'steel', '60min']
  },
  {
    id: 'IC_HOLLOW_120',
    label: '120min Intumescent on Hollow Sections',
    category: 'coating',
    frr: 120,
    substrate: 'steel',
    material: 'intumescent paint',
    keywords: ['intumescent', 'coating', 'hollow', 'rhs', 'shs', 'steel', '120min', '2hr']
  },

  // FIRE DOORS
  {
    id: 'FD_30',
    label: '30min Fire Door',
    category: 'door',
    frr: 30,
    keywords: ['door', 'fire door', '30min', 'fd30', 'half hour']
  },
  {
    id: 'FD_60',
    label: '60min Fire Door',
    category: 'door',
    frr: 60,
    keywords: ['door', 'fire door', '60min', 'fd60', 'one hour']
  },
  {
    id: 'FD_120',
    label: '120min Fire Door',
    category: 'door',
    frr: 120,
    keywords: ['door', 'fire door', '120min', 'fd120', 'two hour', '2hr']
  },
  {
    id: 'FD_SMOKE',
    label: 'Smoke Door',
    category: 'door',
    keywords: ['door', 'smoke door', 'smoke seal']
  },

  // FIRE CURTAINS
  {
    id: 'FC_60',
    label: '60min Fire Curtain',
    category: 'curtain',
    frr: 60,
    keywords: ['curtain', 'fire curtain', '60min']
  },
  {
    id: 'FC_120',
    label: '120min Fire Curtain',
    category: 'curtain',
    frr: 120,
    keywords: ['curtain', 'fire curtain', '120min', '2hr']
  },
  {
    id: 'FC_240',
    label: '240min Fire Curtain',
    category: 'curtain',
    frr: 240,
    keywords: ['curtain', 'fire curtain', '240min', '4hr']
  },

  // FIRE DAMPERS
  {
    id: 'DAMP_60',
    label: '60min Fire Damper',
    category: 'duct',
    frr: 60,
    keywords: ['damper', 'fire damper', '60min', 'hvac']
  },
  {
    id: 'DAMP_120',
    label: '120min Fire Damper',
    category: 'duct',
    frr: 120,
    keywords: ['damper', 'fire damper', '120min', '2hr', 'hvac']
  },
  {
    id: 'DAMP_SMOKE',
    label: 'Smoke Damper',
    category: 'duct',
    keywords: ['damper', 'smoke damper', 'hvac']
  },

  // SPECIALTY SYSTEMS
  {
    id: 'SL_COLLAR',
    label: 'SL Collar (Multi-purpose)',
    category: 'penetration',
    serviceType: 'mixed',
    frr: 60,
    material: 'collar',
    keywords: ['sl collar', 'ryanfire', 'multi', 'versatile']
  },
  {
    id: 'HP_X_MASTIC',
    label: 'HP-X Mastic Cone',
    category: 'penetration',
    serviceType: 'electrical',
    frr: 60,
    material: 'mastic',
    keywords: ['hp-x', 'mastic', 'cone', 'cable']
  },
  {
    id: 'BATT_WRAP',
    label: 'Batt Wrap System',
    category: 'penetration',
    serviceType: 'mixed',
    frr: 60,
    material: 'batt',
    keywords: ['batt', 'wrap', 'insulation', 'ryanfire']
  },
  {
    id: 'BOARD_SEAL',
    label: 'Board Seal System',
    category: 'penetration',
    serviceType: 'blank',
    frr: 60,
    material: 'board',
    keywords: ['board', 'seal', 'gypsum', 'calcium silicate']
  },

  // ADDITIONAL & ANCILLARY
  {
    id: 'SEISMIC',
    label: 'Seismic Restraint',
    category: 'other',
    riskLevel: 'high',
    keywords: ['seismic', 'restraint', 'seismic restraint', 'earthquake']
  },
  {
    id: 'MEWP_ACCESS',
    label: 'MEWP/Access Equipment',
    category: 'other',
    keywords: ['mewp', 'ewp', 'access', 'scaffold', 'elevated work platform']
  },
  {
    id: 'PG_MARGIN',
    label: 'Preliminaries & General',
    category: 'other',
    keywords: ['p&g', 'preliminaries', 'general', 'margin']
  },
  {
    id: 'QA_PS3',
    label: 'QA & PS3 Documentation',
    category: 'other',
    keywords: ['qa', 'ps3', 'documentation', 'quality assurance']
  },
  {
    id: 'CONTINGENCY',
    label: 'Contingency Allowance',
    category: 'other',
    riskLevel: 'medium',
    keywords: ['contingency', 'allowance', 'provisional']
  },
  {
    id: 'SITE_SETUP',
    label: 'Site Setup & Mobilisation',
    category: 'other',
    keywords: ['site setup', 'mobilisation', 'establishment']
  }
];

export function findMatchingSystem(
  description: string,
  quantity?: number,
  unit?: string
): PassiveFireSystem[] {
  const desc = description.toLowerCase();
  const matches: Array<{ system: PassiveFireSystem; score: number }> = [];

  for (const system of PASSIVE_FIRE_ONTOLOGY) {
    let score = 0;

    for (const keyword of system.keywords) {
      if (desc.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    if (system.sizeMin !== undefined && system.sizeMax !== undefined) {
      const sizeMatch = desc.match(/(\d+)\s*mm/i);
      if (sizeMatch) {
        const size = parseInt(sizeMatch[1]);
        if (size >= system.sizeMin && size <= system.sizeMax) {
          score += 2;
        }
      }
    }

    if (system.frr) {
      const frrMatch = desc.match(/(\d+)\s*min/i) || desc.match(/(\d+)\s*hr/i);
      if (frrMatch) {
        const minutes = frrMatch[0].includes('hr')
          ? parseInt(frrMatch[1]) * 60
          : parseInt(frrMatch[1]);
        if (minutes === system.frr) {
          score += 3;
        }
      }
    }

    if (score > 0) {
      matches.push({ system, score });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 5).map(m => m.system);
}

export function getSystemById(id: string): PassiveFireSystem | undefined {
  return PASSIVE_FIRE_ONTOLOGY.find(s => s.id === id);
}

export function getSystemsByCategory(category: PassiveFireSystem['category']): PassiveFireSystem[] {
  return PASSIVE_FIRE_ONTOLOGY.filter(s => s.category === category);
}

export function getAllSystemIds(): string[] {
  return PASSIVE_FIRE_ONTOLOGY.map(s => s.id);
}

export function getAllSystemLabels(): Record<string, string> {
  return PASSIVE_FIRE_ONTOLOGY.reduce((acc, system) => {
    acc[system.id] = system.label;
    return acc;
  }, {} as Record<string, string>);
}
