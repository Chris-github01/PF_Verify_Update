/**
 * mapToQuotesTable — shapes parser_v2 output into the existing `quotes` row
 * shape so downstream consumers (award reports, commercial control, UI) see
 * no difference from the legacy parser.
 *
 * Phase 5 changes:
 *   - Add exclusions_detected boolean (derived from items scope_category)
 *   - Populate document_sub_total with grand when optional is null/0 and
 *     grand is valid (main-only quotes shouldn't have a null subtotal)
 *   - Revise has_variants / requires_review to use the new
 *     variants_materially_different + reconciliation_confidence fields,
 *     not raw dual_option_suspected
 */

import type { ParsedLineItemV2 } from "../runParserV2.ts";
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
  exclusions_detected: boolean;
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
  items?: ParsedLineItemV2[];
}): QuotesTableRow {
  const exclusions_detected = !!ctx.items?.some(
    (it) => it.scope_category === "excluded",
  );

  const grandValid = ctx.totals.grand_total > 0;
  const optionalPresent = ctx.totals.optional_total > 0;
  const mainPresent = ctx.totals.main_total > 0;

  const document_sub_total = mainPresent
    ? ctx.totals.main_total
    : grandValid && !optionalPresent
    ? ctx.totals.grand_total
    : null;

  const has_variants = ctx.totals.variants_materially_different;

  const reviewFromTotals =
    ctx.totals.reconciliation_confidence === "LOW" &&
    ctx.totals.variants_materially_different;

  const requires_review = ctx.requires_review || reviewFromTotals;

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
      grand_candidates: ctx.totals.grand_candidates,
      variants: ctx.totals.variants,
      dual_option_suspected: ctx.totals.dual_option_suspected,
      variants_materially_different: ctx.totals.variants_materially_different,
      primary_variant_index: ctx.totals.primary_variant_index,
      reconciliation_confidence: ctx.totals.reconciliation_confidence,
      parser_version: "v2",
    },
    document_sub_total,
    optional_scope_total: optionalPresent ? ctx.totals.optional_total : null,
    document_grand_total: grandValid ? ctx.totals.grand_total : null,
    parse_anomalies: ctx.totals.anomalies,
    has_variants,
    exclusions_detected,
    requires_review,
    parser_version: "v2",
  };
  if (ctx.quoteId) row.id = ctx.quoteId;
  return row;
}
