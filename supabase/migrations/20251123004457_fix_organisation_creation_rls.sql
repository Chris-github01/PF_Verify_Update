/*
  # Fix Organisation Creation RLS Issue

  1. Changes
    - Create a secure function that allows platform admins to create organisations with initial owners
    - This function runs with SECURITY DEFINER to bypass RLS during the creation process
    - Only platform admins can call this function

  2. Security
    - Function checks caller is an active platform admin
    - Uses SECURITY DEFINER to bypass RLS only for this specific operation
    - Returns the created organisation details
*/

-- Drop the function if it exists
DROP FUNCTION IF EXISTS create_organisation_with_owner(text, text, int, text, uuid);

-- Create a secure function to create organisation with owner
CREATE OR REPLACE FUNCTION create_organisation_with_owner(
  p_name text,
  p_status text,
  p_seat_limit int,
  p_pricing_tier text,
  p_owner_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_result jsonb;
BEGIN
  -- Check if caller is an active platform admin
  IF NOT is_active_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can create organisations';
  END IF;

  -- Insert the organisation
  INSERT INTO organisations (
    name,
    status,
    subscription_status,
    seat_limit,
    pricing_tier,
    created_by_user_id
  ) VALUES (
    p_name,
    p_status,
    p_status,
    p_seat_limit,
    p_pricing_tier,
    auth.uid()
  )
  RETURNING id INTO v_org_id;

  -- Insert the owner member
  INSERT INTO organisation_members (
    organisation_id,
    user_id,
    role,
    status,
    invited_by_user_id,
    activated_at
  ) VALUES (
    v_org_id,
    p_owner_user_id,
    'owner',
    'active',
    auth.uid(),
    now()
  );

  -- Return the created organisation
  SELECT jsonb_build_object(
    'id', id,
    'name', name,
    'status', status,
    'subscription_status', subscription_status,
    'seat_limit', seat_limit,
    'pricing_tier', pricing_tier,
    'created_at', created_at
  )
  INTO v_result
  FROM organisations
  WHERE id = v_org_id;

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users (function will check if they're platform admin)
GRANT EXECUTE ON FUNCTION create_organisation_with_owner(text, text, int, text, uuid) TO authenticated;
