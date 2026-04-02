export interface CarpentrySystemTemplate {
  id: string;
  label: string;
  category: string;
  keywords: string[];
  unitTypes?: string[];
}

export const CARPENTRY_SYSTEM_TEMPLATES: CarpentrySystemTemplate[] = [
  // ── Wall Framing ──────────────────────────────────────────────────────────
  {
    id: 'CARP_WALL_FRAMING_EXTERNAL',
    label: 'Wall Framing - External',
    category: 'Wall Framing',
    keywords: ['external wall', 'external framing', 'exterior wall', 'exterior framing', 'rab board', 'wrap', 'strapping', 'external wall strapping'],
    unitTypes: ['m2', 'sum'],
  },
  {
    id: 'CARP_WALL_FRAMING_INTERNAL',
    label: 'Wall Framing - Internal',
    category: 'Wall Framing',
    keywords: ['internal wall', 'internal framing', 'interior wall', 'stud wall', 'steel stud', 'rondo', 'wall framing', 'partition'],
    unitTypes: ['m2', 'sum'],
  },
  {
    id: 'CARP_WALL_FRAMING_FIRE_RATED',
    label: 'Wall Framing - Fire Rated',
    category: 'Wall Framing',
    keywords: ['fire rated wall', 'fire wall', 'fire rated circulation', 'fyreline', 'fire rated framing'],
    unitTypes: ['m2', 'sum'],
  },
  {
    id: 'CARP_WALL_FRAMING_INTERTENANCY',
    label: 'Wall Framing - Intertenancy',
    category: 'Wall Framing',
    keywords: ['intertenancy', 'inter-tenancy', 'party wall', 'acoustic wall'],
    unitTypes: ['m2', 'sum'],
  },
  {
    id: 'CARP_WALL_FRAMING_SHAFT',
    label: 'Wall Framing - Shaft Wall',
    category: 'Wall Framing',
    keywords: ['shaft wall', 'shaft framing', 'services shaft'],
    unitTypes: ['m2', 'sum'],
  },
  {
    id: 'CARP_WALL_FRAMING_CONCRETE_LINING',
    label: 'Wall Framing - Concrete Wall Lining',
    category: 'Wall Framing',
    keywords: ['concrete wall lining', 'lining to concrete', 'internal wall lining to concrete', 'w34'],
    unitTypes: ['m2', 'sum'],
  },

  // ── Ceiling ───────────────────────────────────────────────────────────────
  {
    id: 'CARP_CEILING_SUSPENDED_RONDO',
    label: 'Ceiling - Suspended Rondo Grid',
    category: 'Ceiling',
    keywords: ['suspended ceiling', 'rondo ceiling', 'key-lock', 'concealed ceiling', 'ceiling grid', 'suspended grid', 'ceiling suspension'],
    unitTypes: ['m2', 'sum'],
  },
  {
    id: 'CARP_CEILING_BULKHEAD',
    label: 'Ceiling - Bulkhead',
    category: 'Ceiling',
    keywords: ['bulkhead', 'bulk head', 'ceiling bulkhead'],
    unitTypes: ['m2', 'm', 'lm', 'sum'],
  },
  {
    id: 'CARP_CEILING_SOFFIT',
    label: 'Ceiling - Soffit',
    category: 'Ceiling',
    keywords: ['soffit', 'underside', 'soffit lining'],
    unitTypes: ['m2', 'sum'],
  },

  // ── Plasterboard / GIB ───────────────────────────────────────────────────
  {
    id: 'CARP_GIB_SUPPLY',
    label: 'GIB - Plasterboard Supply',
    category: 'GIB Fixing',
    keywords: ['plasterboard supply', 'gib supply', 'gib plasterboard supply', 'board supply'],
    unitTypes: ['m2', 'sum'],
  },
  {
    id: 'CARP_GIB_INSTALL',
    label: 'GIB - Plasterboard Installation',
    category: 'GIB Fixing',
    keywords: ['plasterboard installation', 'gib installation', 'gib fixing', 'gib install', 'plasterboard fixing', 'gib board install'],
    unitTypes: ['m2', 'sum'],
  },
  {
    id: 'CARP_GIB_WALL_LINING',
    label: 'GIB - Wall Lining',
    category: 'GIB Fixing',
    keywords: ['wall lining', 'gib standard', 'gib aqualine', 'gib fyreline', '10mm gib', '13mm gib', 'plasterboard lining', 'gib board'],
    unitTypes: ['m2', 'sum'],
  },
  {
    id: 'CARP_GIB_CEILING_LINING',
    label: 'GIB - Ceiling Lining',
    category: 'GIB Fixing',
    keywords: ['ceiling lining', 'ceiling plasterboard', 'ceiling gib', 'ceiling board', 'gib ceiling'],
    unitTypes: ['m2', 'sum'],
  },

  // ── Insulation ────────────────────────────────────────────────────────────
  {
    id: 'CARP_INSULATION_PINK_BATT',
    label: 'Insulation - Pink Batts',
    category: 'Insulation',
    keywords: ['pink batt', 'pink batts', 'pink batt ultra', 'pink batt classic', 'r2.2', 'r3.2', 'glasswool', 'glass wool', 'bib insulation'],
    unitTypes: ['m2', 'sum'],
  },
  {
    id: 'CARP_INSULATION_KOOLTHERM',
    label: 'Insulation - Kooltherm / Rigid',
    category: 'Insulation',
    keywords: ['kooltherm', 'kingspan', 'rigid insulation', 'thermal insulation', 'greenstuf', 'greenstuff', 'soffit liner', 'acoustic soffit'],
    unitTypes: ['m2', 'sum'],
  },
  {
    id: 'CARP_INSULATION_WALL',
    label: 'Insulation - Wall Insulation',
    category: 'Insulation',
    keywords: ['wall insulation', 'insulation to wall', 'insulation to concrete wall'],
    unitTypes: ['m2', 'sum'],
  },

  // ── Interior & Fit-out ───────────────────────────────────────────────────
  {
    id: 'CARP_INTERIOR_DOORS',
    label: 'Interior - Door Installation',
    category: 'Interior',
    keywords: ['door installation', 'door install', 'door hanging', 'hang door', 'hung door', 'timber door', 'internal door', 'fire door install'],
    unitTypes: ['no', 'ea', 'sum'],
  },
  {
    id: 'CARP_INTERIOR_HARDWARE',
    label: 'Interior - Door Hardware / Fittings',
    category: 'Interior',
    keywords: ['door hardware', 'door handle', 'door fittings', 'hinges', 'locks', 'door set', 'internal fittings', 'hardware'],
    unitTypes: ['no', 'ea', 'sum'],
  },
  {
    id: 'CARP_INTERIOR_WARDROBE',
    label: 'Interior - Wardrobe Doors',
    category: 'Interior',
    keywords: ['wardrobe', 'sliding door', 'double sliding', 'wardrobe door', 'robe door'],
    unitTypes: ['no', 'ea', 'sum'],
  },
  {
    id: 'CARP_INTERIOR_VILLABOARD',
    label: 'Interior - Villaboard / Wet Areas',
    category: 'Interior',
    keywords: ['villaboard', 'villa board', '9mm villaboard', 'wet area', 'fibre cement'],
    unitTypes: ['m2', 'sum'],
  },
  {
    id: 'CARP_INTERIOR_TOILET_HARDWARE',
    label: 'Interior - Toilet / Bathroom Hardware',
    category: 'Interior',
    keywords: ['toilet hardware', 'vanity', 'mirror', 'toilet paper', 'towel rail', 'shower rail', 'bathroom hardware', 'sanitary hardware'],
    unitTypes: ['no', 'sum'],
  },

  // ── Miscellaneous / Nogging ──────────────────────────────────────────────
  {
    id: 'CARP_MISC_NOGGING',
    label: 'Miscellaneous - Nogging',
    category: 'Miscellaneous',
    keywords: ['nogging', 'nogg', 'service nogging', 'hardware nogging'],
    unitTypes: ['no', 'sum'],
  },
  {
    id: 'CARP_MISC_GUTTER',
    label: 'Miscellaneous - Internal Gutter',
    category: 'Miscellaneous',
    keywords: ['internal gutter', 'gutter', 'gutter lining'],
    unitTypes: ['m', 'lm', 'sum'],
  },
  {
    id: 'CARP_MISC_CANOPY',
    label: 'Miscellaneous - Canopy Framing',
    category: 'Miscellaneous',
    keywords: ['canopy framing', 'canopy', 'beam packing', 'canopy beam', 'entry canopy'],
    unitTypes: ['m', 'lm', 'sum'],
  },
  {
    id: 'CARP_MISC_WINDOW_JOINERY',
    label: 'Miscellaneous - Window Joinery / Timber Work',
    category: 'Miscellaneous',
    keywords: ['window joinery', 'timber work', 'timber along window', 'joinery', 'window framing'],
    unitTypes: ['m', 'lm', 'sum'],
  },
  {
    id: 'CARP_MISC_RAB',
    label: 'Miscellaneous - RAB Boards & Wraps',
    category: 'Miscellaneous',
    keywords: ['rab board', 'rab', 'wall wrap', 'building wrap', 'sarking'],
    unitTypes: ['m2', 'sum'],
  },
  {
    id: 'CARP_MISC_WINTERGARDEN',
    label: 'Miscellaneous - Wintergarden Wall Lining',
    category: 'Miscellaneous',
    keywords: ['wintergarden', 'winter garden', 'wintergarden wall'],
    unitTypes: ['m2', 'sum'],
  },

  // ── Finishing ─────────────────────────────────────────────────────────────
  {
    id: 'CARP_FINISH_ARCHITRAVE',
    label: 'Finishing - Architrave',
    category: 'Finishing',
    keywords: ['architrave', 'timber architrave', 'door architrave'],
    unitTypes: ['m', 'lm', 'sum'],
  },
  {
    id: 'CARP_FINISH_SKIRTING',
    label: 'Finishing - Skirting',
    category: 'Finishing',
    keywords: ['skirting', 'timber skirting', 'skirting board', 'skirting trim'],
    unitTypes: ['m', 'lm', 'sum'],
  },
  {
    id: 'CARP_FINISH_ARCHITRAVE_SKIRTING',
    label: 'Finishing - Architrave and Skirting',
    category: 'Finishing',
    keywords: ['architrave and skirting', 'skirting and architrave', 'timber trim', 'finishing trim'],
    unitTypes: ['m', 'lm', 'sum'],
  },

  // ── P&G ───────────────────────────────────────────────────────────────────
  {
    id: 'CARP_PG',
    label: 'P&G - Preliminaries and General',
    category: 'P&G',
    keywords: ['p&g', 'p & g', 'preliminaries', 'prelim', 'general conditions', 'site establishment', 'mobilisation'],
    unitTypes: ['sum'],
  },
];
