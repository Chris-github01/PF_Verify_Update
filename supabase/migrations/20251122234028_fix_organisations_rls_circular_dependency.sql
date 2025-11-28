/*
  # Fix organisations table RLS circular dependency
  
  1. Problem
    - organisations SELECT policy queries organisation_members
    - organisation_members has RLS that may block the query
    - Creates potential circular dependency issues
  
  2. Solution
    - Create helper function to check membership that bypasses RLS
    - Simplify organisations SELECT policy to use the helper
  
  3. Security
    - Platform admins can see all organisations
    - Users can see organisations they're active members of
*/

-- Create helper function to check if user is member of an org (bypasses RLS)
CREATE OR REPLACE FUNCTION is_org_member(org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM organisation_members
    WHERE organisation_id = org_id
      AND user_id = p_user_id
      AND status = 'active'
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Drop and recreate organisations SELECT policy
DROP POLICY IF EXISTS "Users can view accessible organisations" ON organisations;

CREATE POLICY "Users can view accessible organisations"
  ON organisations
  FOR SELECT
  TO authenticated
  USING (
    is_active_platform_admin()
    OR is_org_member(id, auth.uid())
  );
