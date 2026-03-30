export type CarpentrySection = 'carpentry' | 'plasterboard' | 'insulation';

export type CarpentryWallType =
  | 'W30'
  | 'W31'
  | 'W32'
  | 'W33'
  | 'W34'
  | 'W35'
  | 'W36'
  | 'other';

export const CARPENTRY_WALL_TYPE_LABELS: Record<CarpentryWallType, string> = {
  W30: 'W30 — Intertenancy Wall',
  W31: 'W31 — Fire Wall',
  W32: 'W32 — Shaft Wall',
  W33: 'W33 — Apartment Internal Wall',
  W34: 'W34 — Concrete Lining',
  W35: 'W35 — External Wall Frame',
  W36: 'W36 — General Partition',
  other: 'Other / Unclassified',
};

export type GibType = 'standard' | 'aqualine' | 'fyreline' | 'other';
export type GibOperation = 'supply' | 'fixing' | 'stopping';

export const GIB_TYPE_LABELS: Record<GibType, string> = {
  standard: 'GIB Standard',
  aqualine: 'GIB Aqualine',
  fyreline: 'GIB Fyreline',
  other: 'Other GIB',
};

export type InsulationType =
  | 'pink_batts_wall'
  | 'pink_batts_ceiling'
  | 'silencer_mid_floor'
  | 'polyester_wall'
  | 'other';

export const INSULATION_TYPE_LABELS: Record<InsulationType, string> = {
  pink_batts_wall: 'Pink Batts R2.2 — Wall',
  pink_batts_ceiling: 'Pink Batts — Ceiling',
  silencer_mid_floor: 'Silencer Mid Floor',
  polyester_wall: 'Polyester Wall Batts',
  other: 'Other Insulation',
};

export interface CarpentryLineItem {
  id: string;
  section: CarpentrySection;
  description: string;
  wall_type?: CarpentryWallType;
  gib_type?: GibType;
  gib_operation?: GibOperation;
  insulation_type?: InsulationType;
  quantity: number;
  unit: string;
  labour_rate?: number;
  labour_constant?: number;
  hourly_rate?: number;
  labour_total?: number;
  material_rate?: number;
  material_total?: number;
  overall_rate?: number;
  overall_total: number;
  level?: string;
  notes?: string;
}

export interface CarpentrySectionSummary {
  section: CarpentrySection;
  subtotal: number;
  item_count: number;
  wall_types_included: CarpentryWallType[];
  gib_types_included?: GibType[];
  insulation_types_included?: InsulationType[];
}

export interface CarpentryQuoteSummary {
  total_ex_gst: number;
  total_inc_gst: number;
  sections: CarpentrySectionSummary[];
  carpentry_subtotal: number;
  plasterboard_subtotal: number;
  insulation_subtotal: number;
  pricing_model: 'lump_sum' | 'unit_rate' | 'hybrid';
  hourly_rate_carpentry?: number;
  hourly_rate_plasterboard?: number;
  floor_count?: number;
  wall_types_covered: CarpentryWallType[];
}

export interface CarpentryQuoteImport {
  quote_id: string;
  supplier_name: string;
  project_id: string;
  organisation_id: string;
  summary: CarpentryQuoteSummary;
  line_items: CarpentryLineItem[];
  imported_at: string;
  imported_by: string;
}

export const CARPENTRY_SECTION_LABELS: Record<CarpentrySection, string> = {
  carpentry: 'Carpentry',
  plasterboard: 'Plasterboard (GIB)',
  insulation: 'Insulation',
};

export const CARPENTRY_SECTION_COLORS: Record<CarpentrySection, { bg: string; text: string; border: string }> = {
  carpentry: { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/30' },
  plasterboard: { bg: 'bg-slate-500/10', text: 'text-slate-300', border: 'border-slate-500/30' },
  insulation: { bg: 'bg-teal-500/10', text: 'text-teal-300', border: 'border-teal-500/30' },
};
