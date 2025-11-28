/*
  # Add function to create organisation with owner by email

  1. Function
    - `create_organisation_with_owner_by_email` - Creates organisation and adds owner by email
    - Looks up existing user by email or creates invitation
    - Only callable by platform admins
    - Returns created organisation details

  2. Security
    - Function uses SECURITY DEFINER to bypass RLS for creation
    - Only platform admins can call this function
    - Creates organisation_member record for owner
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS create_organisation_with_owner_by_email(text, text, int, text, text);

-- Create function to create organisation with owner by email
CREATE OR REPLACE FUNCTION create_organisation_with_owner_by_email(
  p_name text,
  p_status text,
  p_seat_limit int,
  p_pricing_tier text,
  p_owner_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_owner_user_id uuid;
  v_result jsonb;
BEGIN
  -- Check if caller is an active platform admin
  IF NOT is_active_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can create organisations';
  END IF;

  -- Look up user by email in auth.users
  SELECT id INTO v_owner_user_id
  FROM auth.users
  WHERE email = LOWER(TRIM(p_owner_email))
  LIMIT 1;

  -- If user doesn't exist, we'll create the org anyway and the owner can be added later
  -- This is better than trying to create users from the client side
  IF v_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % does not exist. Please ensure the user has signed up first.', p_owner_email;
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
    v_owner_user_id,
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
GRANT EXECUTE ON FUNCTION create_organisation_with_owner_by_email(text, text, int, text, text) TO authenticated;