/*
  # Demo Account System

  1. New Tables
    - `demo_accounts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `organisation_id` (uuid, references organisations)
      - `email` (text)
      - `full_name` (text)
      - `phone` (text)
      - `company_name` (text)
      - `role` (text)
      - `quotes_processed` (integer) - tracks how many quotes uploaded
      - `quote_limit` (integer) - max quotes allowed (default 2)
      - `access_token` (text) - magic link token
      - `token_expires_at` (timestamptz) - token expiration
      - `status` (text) - active, expired, upgraded
      - `created_at` (timestamptz)
      - `last_accessed_at` (timestamptz)

  2. Changes to Existing Tables
    - Add `is_demo` boolean to organisations table
    - Add `demo_account_id` reference to organisations table

  3. Security
    - Enable RLS on demo_accounts table
    - Add policies for demo account access
    - Add function to validate demo limits

  4. Functions
    - `check_demo_limit` - validates if demo can upload more quotes
    - `increment_demo_usage` - increments quote counter
    - `validate_demo_token` - validates magic link token
*/

-- Create demo_accounts table
CREATE TABLE IF NOT EXISTS demo_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  company_name text NOT NULL,
  role text,
  quotes_processed integer DEFAULT 0,
  quote_limit integer DEFAULT 2,
  access_token text UNIQUE,
  token_expires_at timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'upgraded')),
  created_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz,
  CONSTRAINT valid_quotes_processed CHECK (quotes_processed >= 0),
  CONSTRAINT valid_quote_limit CHECK (quote_limit > 0)
);

-- Add demo columns to organisations if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'is_demo'
  ) THEN
    ALTER TABLE organisations ADD COLUMN is_demo boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'demo_account_id'
  ) THEN
    ALTER TABLE organisations ADD COLUMN demo_account_id uuid REFERENCES demo_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_demo_accounts_user_id ON demo_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_demo_accounts_organisation_id ON demo_accounts(organisation_id);
CREATE INDEX IF NOT EXISTS idx_demo_accounts_email ON demo_accounts(email);
CREATE INDEX IF NOT EXISTS idx_demo_accounts_access_token ON demo_accounts(access_token);
CREATE INDEX IF NOT EXISTS idx_demo_accounts_status ON demo_accounts(status);
CREATE INDEX IF NOT EXISTS idx_organisations_is_demo ON organisations(is_demo) WHERE is_demo = true;

-- Enable RLS
ALTER TABLE demo_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for demo_accounts
CREATE POLICY "Demo accounts viewable by owner or platform admin"
  ON demo_accounts FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Service role can manage demo accounts"
  ON demo_accounts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to check if demo account can upload more quotes
CREATE OR REPLACE FUNCTION check_demo_limit(p_organisation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_demo boolean;
  v_demo_account_id uuid;
  v_quotes_processed integer;
  v_quote_limit integer;
BEGIN
  -- Check if organisation is demo
  SELECT is_demo, demo_account_id
  INTO v_is_demo, v_demo_account_id
  FROM organisations
  WHERE id = p_organisation_id;

  -- If not a demo org, allow unlimited
  IF v_is_demo IS FALSE OR v_is_demo IS NULL THEN
    RETURN true;
  END IF;

  -- Get demo account limits
  SELECT quotes_processed, quote_limit
  INTO v_quotes_processed, v_quote_limit
  FROM demo_accounts
  WHERE id = v_demo_account_id AND status = 'active';

  -- Check if under limit
  RETURN COALESCE(v_quotes_processed, 0) < COALESCE(v_quote_limit, 2);
END;
$$;

-- Function to increment demo usage
CREATE OR REPLACE FUNCTION increment_demo_usage(p_organisation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_demo_account_id uuid;
BEGIN
  -- Get demo account id
  SELECT demo_account_id
  INTO v_demo_account_id
  FROM organisations
  WHERE id = p_organisation_id AND is_demo = true;

  -- Increment counter if demo account exists
  IF v_demo_account_id IS NOT NULL THEN
    UPDATE demo_accounts
    SET 
      quotes_processed = quotes_processed + 1,
      last_accessed_at = now()
    WHERE id = v_demo_account_id;
  END IF;
END;
$$;

-- Function to validate demo token
CREATE OR REPLACE FUNCTION validate_demo_token(p_token text)
RETURNS TABLE (
  valid boolean,
  user_id uuid,
  email text,
  organisation_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (da.token_expires_at > now() AND da.status = 'active')::boolean as valid,
    da.user_id,
    da.email,
    da.organisation_id
  FROM demo_accounts da
  WHERE da.access_token = p_token;
END;
$$;

-- Trigger to auto-expire demo accounts
CREATE OR REPLACE FUNCTION auto_expire_demo_accounts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE demo_accounts
  SET status = 'expired'
  WHERE status = 'active'
    AND token_expires_at < now();
END;
$$;