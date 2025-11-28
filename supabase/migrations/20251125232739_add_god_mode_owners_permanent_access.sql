/*
  # God-Mode Owners Permanent Access Fix

  1. Purpose
    - Ensures chris@optimalfire.co.nz and pieter@optimalfire.co.nz have permanent access to ALL organisations
    - Creates a helper function to automatically grant access to all existing and future organisations
    - Runs one-time fix to create missing memberships

  2. God-Mode Accounts
    - chris@optimalfire.co.nz
    - pieter@optimalfire.co.nz

  3. Security
    - Hard-coded email list for God-Mode owners
    - Cannot be removed or modified without migration
    - All organisations accessible to these accounts
*/

-- Create a function to check if user is a God-Mode owner
CREATE OR REPLACE FUNCTION is_god_mode_owner(check_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT check_email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz');
$$;

-- Create a function to get God-Mode owner user IDs
CREATE OR REPLACE FUNCTION get_god_mode_owner_ids()
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, email
  FROM auth.users
  WHERE email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz');
$$;

-- Create a function to ensure God-Mode owners have access to ALL organisations
CREATE OR REPLACE FUNCTION ensure_god_mode_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  god_mode_user RECORD;
  org RECORD;
BEGIN
  -- Loop through each God-Mode owner
  FOR god_mode_user IN 
    SELECT id, email FROM auth.users 
    WHERE email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz')
  LOOP
    -- Loop through each organisation
    FOR org IN SELECT id FROM organisations LOOP
      -- Insert membership if it doesn't exist
      INSERT INTO organisation_members (user_id, organisation_id, role, status)
      VALUES (god_mode_user.id, org.id, 'owner', 'active')
      ON CONFLICT (user_id, organisation_id) 
      DO UPDATE SET 
        role = 'owner',
        status = 'active',
        updated_at = now();
    END LOOP;
  END LOOP;
END;
$$;

-- Run the function immediately to fix current state
SELECT ensure_god_mode_access();

-- Create a trigger to automatically grant God-Mode owners access to new organisations
CREATE OR REPLACE FUNCTION auto_grant_god_mode_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  god_mode_user RECORD;
BEGIN
  -- When a new organisation is created, grant access to all God-Mode owners
  FOR god_mode_user IN 
    SELECT id FROM auth.users 
    WHERE email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz')
  LOOP
    INSERT INTO organisation_members (user_id, organisation_id, role, status)
    VALUES (god_mode_user.id, NEW.id, 'owner', 'active')
    ON CONFLICT (user_id, organisation_id) 
    DO UPDATE SET 
      role = 'owner',
      status = 'active',
      updated_at = now();
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS ensure_god_mode_on_org_create ON organisations;
CREATE TRIGGER ensure_god_mode_on_org_create
  AFTER INSERT ON organisations
  FOR EACH ROW
  EXECUTE FUNCTION auto_grant_god_mode_access();

-- Update RLS policy to allow God-Mode owners to see all organisation members
DROP POLICY IF EXISTS "God-Mode owners can view all memberships" ON organisation_members;
CREATE POLICY "God-Mode owners can view all memberships"
  ON organisation_members
  FOR SELECT
  TO authenticated
  USING (
    -- God-Mode owners can see everything
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz')
    )
    -- Regular users see their own
    OR user_id = auth.uid()
  );
