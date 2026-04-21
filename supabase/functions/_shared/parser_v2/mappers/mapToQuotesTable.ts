/**
 * mapToQuotesTable — shapes parser_v2 output into the existing `quotes` row
 * shape so downstream consumers (award reports, commercial control, UI) see
 * no difference from the legacy parser.
 */

import type { TotalsValidation } from "../validation/validateTotals.ts";

export type QuotesTableRow = {
  id?: string;
  project_id: string;
  organisation_id: string;
  supplier_name: string;
  trade: string;
  total_amount: number;
  total_price: number;
  resolved_total: number;
  resolution_source: string;
  resolution_confidence: "HIGH" | "MEDIUM" | "LOW";
  totals_confidence: "HIGH" | "MEDIUM" | "LOW";
  totals_evidence: Record<string, unknown>;
  document_sub_total: number | null;
  optional_scope_total: number | null;
  document_grand_total: number | null;
  parse_anomalies: string[];
  has_variants: boolean;
  requires_review: boolean;
  parser_version: string;
};

export function mapToQuotesTable(ctx: {
  projectId: string;
  organisationId: string;
  quoteId?: string;
  supplier: string;
  trade: string;
  totals: TotalsValidation;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  requires_review: boolean;
}): QuotesTableRow {
  const row: QuotesTableRow = {
    project_id: ctx.projectId,
    organisation_id: ctx.organisationId,
    supplier_name: ctx.supplier,
    trade: ctx.trade,
    total_amount: ctx.totals.grand_total,
    total_price: ctx.totals.grand_total,
    resolved_total: ctx.totals.grand_total,
    resolution_source: ctx.totals.resolution_source,
    resolution_confidence: ctx.confidence,
    totals_confidence: ctx.confidence,
    totals_evidence: {
      labelled: ctx.totals.labelled,
      resolution_source: ctx.totals.resolution_source,
      main_total: ctx.totals.main_total,
      optional_total: ctx.totals.optional_total,
      excluded_total: ctx.totals.excluded_total,
      parser_version: "v2",
    },
    document_sub_total: ctx.totals.main_total > 0 ? ctx.totals.main_total : null,
    optional_scope_total: ctx.totals.optional_total > 0 ? ctx.totals.optional_total : null,
    document_grand_total: ctx.totals.grand_total > 0 ? ctx.totals.grand_total : null,
    parse_anomalies: ctx.totals.anomalies,
    has_variants: false,
    requires_review: ctx.requires_review,
    parser_version: "v2",
  };
  if (ctx.quoteId) row.id = ctx.quoteId;
  return row;
}
