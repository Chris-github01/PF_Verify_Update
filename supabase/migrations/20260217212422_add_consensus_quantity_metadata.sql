/*
  # Add Consensus Quantity Metadata to BOQ Lines

  1. New Columns
    - `quantity_method` (text) - Method used: Average, Median, or Median + Allowance
    - `quantity_confidence` (text) - Confidence level: High, Medium, Low
    - `quantity_spread_percent` (numeric) - Percentage spread across supplier quantities
    - `quantity_allowance_percent` (numeric) - Risk allowance applied (if any)
    - `supplier_quantities` (jsonb) - Array of quantities from each supplier for auditability

  2. Purpose
    - Provides transparency into how baseline quantities were calculated
    - Supports defensible commercial decision-making
    - Enables PQS/client to understand and validate the methodology
    - Maintains full audit trail of quantity consensus logic

  3. Notes
    - These fields are populated during BOQ generation
    - Values are stored in baseline_scope_notes and baseline_measure_rule for now
    - This migration adds dedicated fields for better reporting
*/

-- Add consensus quantity metadata columns
ALTER TABLE boq_lines 
ADD COLUMN IF NOT EXISTS quantity_method text,
ADD COLUMN IF NOT EXISTS quantity_confidence text CHECK (quantity_confidence IN ('High', 'Medium', 'Low')),
ADD COLUMN IF NOT EXISTS quantity_spread_percent numeric(5,2),
ADD COLUMN IF NOT EXISTS quantity_allowance_percent numeric(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS supplier_quantities jsonb;

-- Add helpful comments
COMMENT ON COLUMN boq_lines.quantity_method IS 'Method used to calculate consensus quantity: Average, Median, or Median + Allowance';
COMMENT ON COLUMN boq_lines.quantity_confidence IS 'Confidence level based on supplier agreement: High (≤15% spread), Medium (15-35%), Low (>35%)';
COMMENT ON COLUMN boq_lines.quantity_spread_percent IS 'Percentage spread between min and max supplier quantities';
COMMENT ON COLUMN boq_lines.quantity_allowance_percent IS 'Risk allowance percentage applied (only for high disagreement cases)';
COMMENT ON COLUMN boq_lines.supplier_quantities IS 'Array of quantities from each supplier for audit trail';
