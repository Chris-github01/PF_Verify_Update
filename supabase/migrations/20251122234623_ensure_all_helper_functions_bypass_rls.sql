/*
  # Ensure all helper functions truly bypass RLS
  
  1. Problem
    - Helper functions may still respect RLS even with SECURITY DEFINER
    - Need to ensure they use PLPGSQL and grant proper permissions
  
  2. Solution
    - Recreate is_org_member and is_org_admin_or_owner with PLPGSQL
    - Grant execute permissions to authenticated and anon roles
    - Ensure consistent pattern across all helper functions
  
  3. Security
    - Functions only return boolean values
    - Check specific conditions for specific users
    - Do not expose sensitive data
*/

-- Update is_org_member function
CREATE OR REPLACE FUNCTION is_org_member(org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result boolean;
BEGIN
  -- Query runs with function owner privileges (bypasses RLS)
  SELECT EXISTS (
    SELECT 1
    FROM organisation_members
    WHERE organisation_id = org_id
      AND user_id = p_user_id
      AND status = 'active'
  ) INTO result;
  
  RETURN COALESCE(result, false);
END;
$$;

-- Update is_org_admin_or_owner function
CREATE OR REPLACE FUNCTION is_org_admin_or_owner(org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result boolean;
BEGIN
  -- Query runs with function owner privileges (bypasses RLS)
  SELECT EXISTS (
    SELECT 1
    FROM organisation_members
    WHERE organisation_id = org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND status = 'active'
  ) INTO result;
  
  RETURN COALESCE(result, false);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION is_org_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_org_member(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION is_org_admin_or_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_org_admin_or_owner(uuid) TO anon;
