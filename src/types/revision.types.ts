/**
 * Quote Revision & RFI Tracking Types
 *
 * Supports non-destructive quote versioning for contract negotiations
 * and RFI management throughout the project lifecycle.
 */

export interface QuoteRevision {
  id: string;
  project_id: string;
  supplier_name: string;

  // Version tracking
  revision_number: number;
  is_latest: boolean;
  original_quote_id: string | null;  // Links to v1
  parent_quote_id: string | null;    // Links to previous version

  // RFI tracking
  revision_date: string;
  rfi_reference?: string;
  rfi_reason?: string;
  revision_notes?: string;

  // Quote data (from existing quote structure)
  total_price: number;
  file_url?: string;
  filename?: string;
  status?: string;

  // Comparison control
  use_in_comparison: boolean;

  // Metadata
  created_at: string;
  created_by?: string;
}

export interface RevisionDiffItem {
  item_id?: string;
  description: string;
  change_type: 'added' | 'removed' | 'modified' | 'unchanged';

  // Original values (v1 or previous version)
  original_quantity?: number;
  original_unit?: string;
  original_rate?: number;
  original_total?: number;
  original_specifications?: string;

  // New values (current revision)
  new_quantity?: number;
  new_unit?: string;
  new_rate?: number;
  new_total?: number;
  new_specifications?: string;

  // Change metadata
  quantity_change?: number;
  quantity_change_percent?: number;
  rate_change?: number;
  rate_change_percent?: number;
  total_change?: number;
  total_change_percent?: number;
}

export interface QuoteRevisionDiff {
  id: string;
  project_id: string;
  supplier_name: string;

  // Quote references
  original_quote_id: string;
  new_quote_id: string;
  original_revision_number: number;
  new_revision_number: number;

  // Summary statistics
  total_price_change: number;
  total_price_change_percent: number;
  items_added_count: number;
  items_removed_count: number;
  items_modified_count: number;
  items_unchanged_count: number;

  // Detailed diff data
  diff_items: RevisionDiffItem[];

  // Metadata
  created_at: string;
  created_by?: string;
}

export interface RevisionTimelineEvent {
  id: string;
  project_id: string;
  supplier_name: string;
  quote_id: string;
  revision_number: number;

  // Event details
  event_type: 'import' | 'revision' | 'rfi' | 'promotion' | 'note';
  event_description: string;

  // Additional context
  rfi_reference?: string;
  price_change?: number;
  items_changed?: number;

  // Metadata
  created_by?: string;
  created_at: string;
}

export interface SupplierRevisionHistory {
  supplier_name: string;
  project_id: string;

  // All revisions for this supplier
  revisions: QuoteRevision[];

  // Latest revision
  latest_revision: QuoteRevision;

  // Original quote (v1)
  original_quote: QuoteRevision;

  // Timeline of events
  timeline: RevisionTimelineEvent[];

  // Aggregate statistics
  total_revisions: number;
  total_price_changes: number;
  latest_total_price: number;
  original_total_price: number;
}

export interface RevisionImportRequest {
  project_id: string;
  supplier_name: string;  // Must match existing supplier

  // File upload
  file: File;
  filename: string;

  // RFI details (optional)
  rfi_reference?: string;
  rfi_reason?: string;
  revision_notes?: string;

  // Comparison options
  use_in_comparison?: boolean;
}

export interface RevisionComparisonView {
  // View mode
  mode: 'original' | 'latest' | 'specific_version';

  // Filter options
  show_only_changes?: boolean;
  min_change_threshold?: number;  // % change threshold

  // Selected versions (for specific_version mode)
  selected_versions?: {
    supplier_name: string;
    revision_number: number;
  }[];
}

export interface RFISummaryReport {
  project_id: string;
  project_name: string;
  generated_at: string;

  // Suppliers with revisions
  suppliers_with_revisions: {
    supplier_name: string;
    total_revisions: number;
    latest_version: number;
    total_price_change: number;
    total_price_change_percent: number;
    rfis_count: number;
  }[];

  // Overall statistics
  total_suppliers_with_revisions: number;
  total_revisions_across_project: number;
  total_rfis_issued: number;
  average_revisions_per_supplier: number;

  // Price impact
  total_project_price_change: number;
  total_project_price_change_percent: number;

  // Timeline
  first_revision_date?: string;
  latest_revision_date?: string;
}

export type RevisionViewMode = 'original' | 'revisions';

export interface RevisionFilterOptions {
  view_mode: RevisionViewMode;
  suppliers?: string[];
  date_range?: {
    start: string;
    end: string;
  };
  rfi_reference?: string;
  min_price_change?: number;
}
