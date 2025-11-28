/*
  # Add Contingency Amount to Quotes

  1. Schema Changes
    - Add `contingency_amount` column to `quotes` table
      - Stores the difference between the actual quote total and the sum of line items
      - Defaults to 0
    - Add `quoted_total` column to `quotes` table
      - Stores the actual total from the quote document (if provided)
      - May be null if not explicitly provided
  
  2. Purpose
    - When a quote document shows a higher total than the sum of line items, 
      the difference represents contingency, margin, or other costs
    - This ensures the displayed quote total matches the actual quoted amount
    - Preserves financial accuracy and prevents under-reporting of quote values
  
  3. Calculation
    - quoted_total = User-provided or extracted total from quote document
    - contingency_amount = quoted_total - SUM(line_item.total_price)
    - total_amount = SUM(line_item.total_price) + contingency_amount
*/

-- Add quoted_total column (nullable, as it may not always be provided)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'quoted_total'
  ) THEN
    ALTER TABLE quotes ADD COLUMN quoted_total numeric DEFAULT NULL;
  END IF;
END $$;

-- Add contingency_amount column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'contingency_amount'
  ) THEN
    ALTER TABLE quotes ADD COLUMN contingency_amount numeric DEFAULT 0;
  END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_quotes_quoted_total ON quotes(quoted_total) WHERE quoted_total IS NOT NULL;

-- Add check constraint to ensure contingency_amount is never negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_contingency_positive'
  ) THEN
    ALTER TABLE quotes ADD CONSTRAINT quotes_contingency_positive CHECK (contingency_amount >= 0);
  END IF;
END $$;

-- Update existing quotes to set contingency_amount = total_amount - line_items_sum where applicable
-- This is a data migration for existing records
UPDATE quotes q
SET contingency_amount = GREATEST(0, q.total_amount - COALESCE((
  SELECT SUM(qi.total_price)
  FROM quote_items qi
  WHERE qi.quote_id = q.id
), 0))
WHERE EXISTS (
  SELECT 1 FROM quote_items WHERE quote_id = q.id
);
