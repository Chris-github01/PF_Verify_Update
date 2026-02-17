export type ModuleKey = 'passive_fire' | 'active_fire' | 'electrical' | 'plumbing' | 'hvac';

export type IncludedStatus = 'included' | 'excluded' | 'unclear' | 'missing';

export type GapType = 'missing' | 'unclear' | 'excluded' | 'under_measured' | 'unpriced' | 'lump_sum_unallocated';

export type CommercialTreatment = 'include' | 'ps' | 'separate_price' | 'contingency' | 'rfi';

export type OwnerRole = 'qs' | 'engineer' | 'tenderer' | 'admin';

export type GapStatus = 'open' | 'closed';

export type TagCategory = 'commercial' | 'technical' | 'programme' | 'qa' | 'hse' | 'access' | 'design';

export type DefaultPosition = 'included' | 'excluded' | 'ps' | 'client_supply' | 'by_others';

export type CostImpactType = 'none' | 'ps' | 'dayworks' | 'vo_rate' | 'to_be_priced';

export type AgreementStatus = 'proposed' | 'accepted' | 'rejected' | 'needs_revision';

export type ExportType = 'baseline_boq' | 'awarded_boq' | 'tags_register' | 'full_pack';

export type BaselineAllowanceType = 'none' | 'ps' | 'pc' | 'contingency';

export interface BOQLine {
  id: string;
  project_id: string;
  module_key: ModuleKey;
  boq_line_id: string;

  // Identity
  trade: string | null;
  system_group: string | null;
  system_name: string;
  drawing_spec_ref: string | null;
  location_zone: string | null;
  element_asset: string | null;

  // Technical Attributes
  frr_rating: string | null;
  substrate: string | null;
  service_type: string | null;
  penetration_size_opening: string | null;
  quantity: number;
  unit: string;
  system_variant_product: string | null;
  install_method_buildup: string | null;
  constraints_access: string | null;

  // Baseline Commercial
  baseline_included: boolean;
  baseline_scope_notes: string | null;
  baseline_measure_rule: string | null;
  baseline_allowance_type: BaselineAllowanceType | null;
  baseline_allowance_value: number | null;

  // Consensus Quantity Metadata (for transparency and auditability)
  quantity_method?: string | null; // 'Average', 'Median', 'Median + Allowance'
  quantity_confidence?: 'High' | 'Medium' | 'Low' | null;
  quantity_spread_percent?: number | null;
  quantity_allowance_percent?: number | null;
  supplier_quantities?: number[] | null;

  // Version Control
  version: number;
  created_at: string;
  updated_at: string;
}

export interface BOQTendererMap {
  id: string;
  project_id: string;
  module_key: ModuleKey;
  boq_line_id: string;
  tenderer_id: string;

  // Mapping Status
  included_status: IncludedStatus;

  // Tenderer Pricing
  tenderer_qty: number | null;
  tenderer_rate: number | null;
  tenderer_amount: number | null;
  tenderer_notes: string | null;

  // Clarification Tags
  clarification_tag_ids: string[];

  created_at: string;
  updated_at: string;
}

export interface ScopeGap {
  id: string;
  project_id: string;
  module_key: ModuleKey;
  gap_id: string;
  boq_line_id: string | null;
  tenderer_id: string | null;

  // Gap Details
  gap_type: GapType;
  description: string;
  expected_requirement: string | null;
  risk_if_not_included: string | null;

  // Commercial Treatment
  commercial_treatment: CommercialTreatment | null;
  target_closeout_date: string | null;

  // Ownership & Status
  owner_role: OwnerRole | null;
  status: GapStatus;
  closure_evidence: string | null;

  created_at: string;
  updated_at: string;
}

export interface TagLibrary {
  id: string;
  module_key: ModuleKey | 'all';

  // Classification
  category: TagCategory;
  title: string;
  statement: string;
  risk_if_not_agreed: string | null;

  // Commercial Impact
  default_position: DefaultPosition | null;
  cost_impact_type: CostImpactType | null;
  estimate_allowance: number | null;
  evidence_ref: string | null;

  // System Flag
  is_system_default: boolean;

  created_at: string;
  updated_at: string;
}

export interface ProjectTag {
  id: string;
  project_id: string;
  module_key: ModuleKey;
  tag_id: string;

  // Classification
  category: TagCategory;
  trade: string | null;
  linked_boq_line_id: string | null;

  // Tag Content
  title: string;
  statement: string;
  risk_if_not_agreed: string | null;

  // Commercial Impact
  default_position: DefaultPosition | null;
  cost_impact_type: CostImpactType | null;
  estimate_allowance: number | null;
  evidence_ref: string | null;

  // Dual-Party Collaboration
  main_contractor_name: string | null;
  main_contractor_comment: string | null;
  supplier_name: string | null;
  supplier_comment: string | null;
  agreement_status: AgreementStatus;
  final_contract_clause_ref: string | null;

  created_at: string;
  updated_at: string;
}

export interface BOQExport {
  id: string;
  project_id: string;
  module_key: ModuleKey;

  // Export Details
  export_type: ExportType;
  export_version: number;

  // Audit Trail
  generated_by_user_id: string | null;
  generated_at: string;

  // File Storage
  file_url: string | null;
  storage_key: string | null;

  // Metadata
  inputs_snapshot: Record<string, any> | null;

  created_at: string;
}

// Combined types for UI usage
export interface BOQLineWithMapping extends BOQLine {
  tenderer_maps: (BOQTendererMap & {
    tenderer_name?: string;
  })[];
  scope_gaps: ScopeGap[];
}

export interface BOQGenerationResult {
  lines_created: number;
  mappings_created: number;
  gaps_detected: number;
  completion_percentage: number;
}

export interface ExportOptions {
  project_id: string;
  module_key: ModuleKey;
  export_type: ExportType;
  tenderer_ids?: string[];
  awarded_supplier_id?: string;
  include_gaps?: boolean;
  include_tags?: boolean;
}

// Fire Engineer Schedule Types (Passive Fire Only)
export interface FireEngineerSchedule {
  id: string;
  project_id: string;
  module_key: 'passive_fire';

  schedule_name: string | null;
  revision_label: string | null;

  source_file_name: string;
  source_storage_key: string | null;

  imported_by_user_id: string | null;
  imported_at: string;

  is_active: boolean;
  notes: string | null;

  created_at: string;
  updated_at: string;
}

export interface FireEngineerScheduleRow {
  id: string;
  schedule_id: string;

  page_number: number | null;
  row_index: number;

  solution_id: string | null;
  system_classification: string | null;

  substrate: string | null;
  orientation: string | null;
  frr_rating: string | null;
  service_type: string | null;

  service_size_text: string | null;
  service_size_min_mm: number | null;
  service_size_max_mm: number | null;

  insulation_type: string | null;
  insulation_thickness_mm: number | null;
  test_reference: string | null;
  notes: string | null;

  raw_text: string;
  parse_confidence: number;

  created_at: string;
  updated_at: string;
}

export type LinkType = 'manual' | 'auto';
export type MatchType = 'exact' | 'strong' | 'weak' | 'none';

export interface ScheduleBOQLink {
  id: string;
  project_id: string;
  module_key: 'passive_fire';

  schedule_row_id: string;
  boq_line_id: string;

  link_type: LinkType;
  match_type: MatchType | null;
  match_confidence: number | null;
  mismatch_reason: string | null;

  created_at: string;
  updated_at: string;
}

export type BOQSource = 'quote' | 'issued_boq' | 'fire_schedule' | 'mixed';

// Extended BOQ Line with source tracking
export interface BOQLineExtended extends BOQLine {
  source?: BOQSource;
}

// Fire Schedule Import Result
export interface FireScheduleImportResult {
  schedule_id: string;
  rows_imported: number;
  average_confidence: number;
  low_confidence_count: number;
}

// Matching Result
export interface ScheduleMatchResult {
  schedule_row_id: string;
  boq_line_id: string | null;
  match_type: MatchType;
  match_confidence: number;
  mismatch_reason: string | null;
}

// Schedule comparison view
export interface ScheduleComparisonRow {
  schedule_row: FireEngineerScheduleRow;
  boq_line: BOQLine | null;
  link: ScheduleBOQLink | null;
  match_result: ScheduleMatchResult | null;
}
