/*
  # Add Awarded Quote Overview to Pre-let Appendix

  1. Changes
    - Add award overview snapshot fields (immutable after finalization)
    - Convert inclusions/exclusions/assumptions/clarifications/risks to structured JSONB with references
    - Capture complete award context at finalization time

  2. Award Overview Fields
    - awarded_subcontractor: Legal entity name
    - awarded_total_ex_gst: Total excluding GST
    - awarded_total_inc_gst: Total including GST
    - awarded_pricing_basis: Pricing methodology
    - award_date: Date of award
    - award_status: Status at finalization
    - quote_reference: Supplier quote reference
    - quote_revision: Revision/version number
    - quote_id: VerifyTrade quote ID (FK)
    - award_report_id: VerifyTrade award report ID (FK)
    - scope_summary_snapshot: High-level scope from Award Report
    - systems_snapshot: Systems/categories included (JSONB array)
    - attachments_snapshot: Attachments list (JSONB array)

  3. Reference Linking
    - Each item can link to Award line ID or Tag ID
    - Items structure: {text: string, reference?: string, reference_type?: 'award_line' | 'tag'}

  4. Notes
    - Award overview is read-only, auto-populated from approved quote
    - Snapshot is taken at finalization to preserve immutable record
    - References are optional but recommended for traceability
*/

-- Add award overview snapshot fields
ALTER TABLE prelet_appendix
ADD COLUMN IF NOT EXISTS awarded_subcontractor text,
ADD COLUMN IF NOT EXISTS awarded_total_ex_gst numeric,
ADD COLUMN IF NOT EXISTS awarded_total_inc_gst numeric,
ADD COLUMN IF NOT EXISTS awarded_pricing_basis text,
ADD COLUMN IF NOT EXISTS award_date timestamptz,
ADD COLUMN IF NOT EXISTS award_status text,
ADD COLUMN IF NOT EXISTS quote_reference text,
ADD COLUMN IF NOT EXISTS quote_revision text,
ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES quotes(id),
ADD COLUMN IF NOT EXISTS award_report_id uuid REFERENCES award_reports(id),
ADD COLUMN IF NOT EXISTS scope_summary_snapshot text,
ADD COLUMN IF NOT EXISTS systems_snapshot jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS attachments_snapshot jsonb DEFAULT '[]'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN prelet_appendix.awarded_subcontractor IS 'Legal entity name of awarded subcontractor (snapshot at finalization)';
COMMENT ON COLUMN prelet_appendix.awarded_total_ex_gst IS 'Total contract value excluding GST (snapshot)';
COMMENT ON COLUMN prelet_appendix.awarded_total_inc_gst IS 'Total contract value including GST (snapshot)';
COMMENT ON COLUMN prelet_appendix.awarded_pricing_basis IS 'Pricing methodology (lump_sum, re_measurable, schedule_based)';
COMMENT ON COLUMN prelet_appendix.award_date IS 'Date and time of contract award';
COMMENT ON COLUMN prelet_appendix.award_status IS 'Award status at finalization';
COMMENT ON COLUMN prelet_appendix.quote_reference IS 'Supplier quote reference number';
COMMENT ON COLUMN prelet_appendix.quote_revision IS 'Quote revision or version identifier';
COMMENT ON COLUMN prelet_appendix.quote_id IS 'Reference to awarded quote in VerifyTrade';
COMMENT ON COLUMN prelet_appendix.award_report_id IS 'Reference to award report in VerifyTrade';
COMMENT ON COLUMN prelet_appendix.scope_summary_snapshot IS 'High-level scope summary from Award Report (snapshot)';
COMMENT ON COLUMN prelet_appendix.systems_snapshot IS 'Systems/categories included in scope (JSONB array snapshot)';
COMMENT ON COLUMN prelet_appendix.attachments_snapshot IS 'List of attachments (quote PDF, award report) (JSONB array)';

-- Update existing JSONB arrays to support reference linking
-- Structure: [{text: string, reference?: string, reference_type?: 'award_line' | 'tag'}]
COMMENT ON COLUMN prelet_appendix.inclusions IS 'Inclusions with optional references to Award lines or Tags';
COMMENT ON COLUMN prelet_appendix.exclusions IS 'Exclusions with optional references to Award lines or Tags';
COMMENT ON COLUMN prelet_appendix.commercial_assumptions IS 'Commercial assumptions with optional references';
COMMENT ON COLUMN prelet_appendix.clarifications IS 'Clarifications with optional references to Tags';
COMMENT ON COLUMN prelet_appendix.known_risks IS 'Known risks with optional references';

-- Add indexes for foreign key lookups
CREATE INDEX IF NOT EXISTS idx_prelet_appendix_quote_id ON prelet_appendix(quote_id);
CREATE INDEX IF NOT EXISTS idx_prelet_appendix_award_report_id ON prelet_appendix(award_report_id);

-- Add check constraint for pricing basis
ALTER TABLE prelet_appendix
DROP CONSTRAINT IF EXISTS prelet_appendix_pricing_basis_check;

ALTER TABLE prelet_appendix
ADD CONSTRAINT prelet_appendix_pricing_basis_check
CHECK (awarded_pricing_basis IS NULL OR awarded_pricing_basis IN ('lump_sum', 're_measurable', 'schedule_based', 'schedule_of_rates', 'cost_plus', 'unit_rates'));