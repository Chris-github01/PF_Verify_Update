/*
  # Add Supplier Contact Details

  1. Updates
    - Add supplier_phone to letters_of_intent table
    - Add supplier_address to letters_of_intent table
    - Add contact_name to suppliers table for storing primary contact person name

  2. Notes
    - These fields help capture complete supplier contact information
    - Used in subcontractor onboarding and Letter of Intent generation
    - All fields are optional to maintain backward compatibility
*/

-- Add phone and address to letters_of_intent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'letters_of_intent' AND column_name = 'supplier_phone'
  ) THEN
    ALTER TABLE letters_of_intent ADD COLUMN supplier_phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'letters_of_intent' AND column_name = 'supplier_address'
  ) THEN
    ALTER TABLE letters_of_intent ADD COLUMN supplier_address text;
  END IF;
END $$;

-- Add contact_name to suppliers table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'contact_name'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN contact_name text;
  END IF;
END $$;

-- Add helpful comments
COMMENT ON COLUMN letters_of_intent.supplier_phone IS 'Supplier contact phone number for Letter of Intent';
COMMENT ON COLUMN letters_of_intent.supplier_address IS 'Supplier address for Letter of Intent';
COMMENT ON COLUMN suppliers.contact_name IS 'Primary contact person name at the supplier';
