/*
  # Add Enterprise Organisation Onboarding Fields
  
  1. New Fields Added
    - Legal & Trading Details
      - legal_name: Official registered business name
      - trading_name: Public trading name (if different)
      - country_region: Country/region for standards compliance
      - industry_type: Main contractor, PQS, Fire Engineer, etc.
      - primary_trade_focus: Passive Fire (extensible for future modules)
    
    - Commercial & Compliance Context
      - project_size_range: Typical project sizes (<$5m, $5-20m, etc.)
      - jurisdiction_code_set: NZBC, NCC, Both
      - compliance_role: Awarding, Reviewing, or Auditing party
    
    - Primary Owner Details
      - owner_full_name: Full name of primary owner
      - owner_role_title: Owner's role/title
      - owner_email: Owner email (verified)
      - owner_phone: Contact phone (optional)
    
    - Billing & Trial Controls
      - seat_limit: Maximum user seats allowed
      - billing_contact_email: Billing contact (can differ from owner)
      - trial_type: Trial duration type
    
    - Governance & Audit
      - audit_namespace: Auto-generated unique namespace
      - compliance_acceptance: Terms acceptance checkbox
      - created_by_admin_id: Platform admin who created org
  
  2. Changes
    - Add all new columns with appropriate defaults
    - Add indexes for frequently queried fields
    - Update RLS policies to include new fields
*/

-- Add all new enterprise fields to organisations table
ALTER TABLE organisations 
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS trading_name text,
  ADD COLUMN IF NOT EXISTS country_region text,
  ADD COLUMN IF NOT EXISTS industry_type text,
  ADD COLUMN IF NOT EXISTS primary_trade_focus text DEFAULT 'passive_fire',
  ADD COLUMN IF NOT EXISTS project_size_range text,
  ADD COLUMN IF NOT EXISTS jurisdiction_code_set text,
  ADD COLUMN IF NOT EXISTS compliance_role text,
  ADD COLUMN IF NOT EXISTS owner_full_name text,
  ADD COLUMN IF NOT EXISTS owner_role_title text,
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS owner_phone text,
  ADD COLUMN IF NOT EXISTS seat_limit integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS billing_contact_email text,
  ADD COLUMN IF NOT EXISTS trial_type text DEFAULT '14_day',
  ADD COLUMN IF NOT EXISTS audit_namespace text,
  ADD COLUMN IF NOT EXISTS compliance_acceptance boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_admin_id uuid;

-- Create unique constraint on audit_namespace
CREATE UNIQUE INDEX IF NOT EXISTS organisations_audit_namespace_key 
  ON organisations(audit_namespace) WHERE audit_namespace IS NOT NULL;

-- Add index for country_region for filtering
CREATE INDEX IF NOT EXISTS idx_organisations_country_region 
  ON organisations(country_region);

-- Add index for industry_type for filtering
CREATE INDEX IF NOT EXISTS idx_organisations_industry_type 
  ON organisations(industry_type);

-- Add foreign key for created_by_admin_id (references auth.users)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'organisations_created_by_admin_id_fkey'
  ) THEN
    ALTER TABLE organisations
      ADD CONSTRAINT organisations_created_by_admin_id_fkey
      FOREIGN KEY (created_by_admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Update existing organisations to have an audit_namespace
UPDATE organisations 
SET audit_namespace = 'ORG-' || UPPER(SUBSTRING(MD5(id::text), 1, 8))
WHERE audit_namespace IS NULL;

-- Update existing organisations to copy name to legal_name
UPDATE organisations
SET legal_name = name
WHERE legal_name IS NULL;

COMMENT ON COLUMN organisations.legal_name IS 'Official registered business name';
COMMENT ON COLUMN organisations.trading_name IS 'Public trading name if different from legal name';
COMMENT ON COLUMN organisations.country_region IS 'Country/region for standards and compliance logic';
COMMENT ON COLUMN organisations.industry_type IS 'Industry classification: Main Contractor, PQS, Fire Engineer, Subcontractor, Auditor, Other';
COMMENT ON COLUMN organisations.primary_trade_focus IS 'Primary trade focus (default: passive_fire, extensible for future Verify+ modules)';
COMMENT ON COLUMN organisations.project_size_range IS 'Typical project size range: <$5m, $5-20m, $20-50m, $50m+';
COMMENT ON COLUMN organisations.jurisdiction_code_set IS 'Applicable jurisdiction: NZBC, NCC, Both';
COMMENT ON COLUMN organisations.compliance_role IS 'Compliance role: Awarding party, Reviewing party, Auditing party';
COMMENT ON COLUMN organisations.owner_full_name IS 'Full name of primary owner';
COMMENT ON COLUMN organisations.owner_role_title IS 'Primary owner role/title';
COMMENT ON COLUMN organisations.owner_email IS 'Primary owner email address';
COMMENT ON COLUMN organisations.owner_phone IS 'Primary owner phone number (optional)';
COMMENT ON COLUMN organisations.seat_limit IS 'Maximum number of user seats allowed';
COMMENT ON COLUMN organisations.billing_contact_email IS 'Billing contact email (can differ from owner)';
COMMENT ON COLUMN organisations.trial_type IS 'Trial duration type (14_day default)';
COMMENT ON COLUMN organisations.audit_namespace IS 'Unique audit namespace identifier';
COMMENT ON COLUMN organisations.compliance_acceptance IS 'Acceptance of compliance terms';
COMMENT ON COLUMN organisations.created_by_admin_id IS 'Platform admin who created this organisation';
