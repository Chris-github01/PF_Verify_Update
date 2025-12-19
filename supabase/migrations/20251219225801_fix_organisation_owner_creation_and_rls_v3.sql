/*
  # Fix Organization Owner Creation and RLS Policies
  
  ## Changes
  
  1. New Function: `add_member_to_organisation_by_email`
    - Adds a user to an organization by their email
    - Can be called by platform admins or org admins
    - Assigns specified role (owner, admin, member)
    - Returns success status
  
  2. Fix RLS Policies
    - Ensure organization members can access quotes/projects
    - Fix circular dependency issues in RLS
    - Add proper service role bypass for imports
  
  3. Auto-add Creator as Owner
    - Trigger to automatically add organization creator as owner
    - Ensures proper access immediately after creation
*/

-- Function to add a member to an existing organisation by email
CREATE OR REPLACE FUNCTION add_member_to_organisation_by_email(
  p_organisation_id uuid,
  p_email text,
  p_role text DEFAULT 'member'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb;
  v_is_admin boolean := false;
BEGIN
  -- Check if caller is platform admin OR admin of this organisation
  v_is_admin := is_active_platform_admin();
  
  IF NOT v_is_admin THEN
    -- Check if user is admin of this organisation
    IF EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_id = p_organisation_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND status = 'active'
      AND archived_at IS NULL
    ) THEN
      v_is_admin := true;
    END IF;
  END IF;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  -- Look up user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = LOWER(TRIM(p_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found. They must sign up first.');
  END IF;

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM organisation_members
    WHERE organisation_id = p_organisation_id
    AND user_id = v_user_id
    AND archived_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is already a member');
  END IF;

  -- Check seat limit
  DECLARE
    v_seat_limit int;
    v_current_members int;
  BEGIN
    SELECT seat_limit INTO v_seat_limit
    FROM organisations
    WHERE id = p_organisation_id;

    SELECT COUNT(*) INTO v_current_members
    FROM organisation_members
    WHERE organisation_id = p_organisation_id
    AND status = 'active'
    AND archived_at IS NULL;

    IF v_current_members >= v_seat_limit THEN
      RETURN jsonb_build_object('success', false, 'error', 'Seat limit reached');
    END IF;
  END;

  -- Add member
  INSERT INTO organisation_members (
    organisation_id,
    user_id,
    role,
    status,
    invited_by_user_id,
    activated_at
  ) VALUES (
    p_organisation_id,
    v_user_id,
    p_role,
    'active',
    auth.uid(),
    now()
  );

  -- Log activity
  INSERT INTO user_activity_log (organisation_id, user_id, activity_type, metadata)
  VALUES (
    p_organisation_id,
    auth.uid(),
    'user_added',
    jsonb_build_object('added_user_id', v_user_id, 'role', p_role)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'role', p_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION add_member_to_organisation_by_email(uuid, text, text) TO authenticated;

-- Function to add organisation creator as owner automatically
CREATE OR REPLACE FUNCTION auto_add_organisation_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- If owner_email is specified, try to add them as owner
  IF NEW.owner_email IS NOT NULL THEN
    -- Look up user by owner email
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = LOWER(TRIM(NEW.owner_email))
    LIMIT 1;
    
    IF v_user_id IS NOT NULL THEN
      -- Add them as owner
      INSERT INTO organisation_members (
        organisation_id,
        user_id,
        role,
        status,
        invited_by_user_id,
        activated_at
      ) VALUES (
        NEW.id,
        v_user_id,
        'owner',
        'active',
        COALESCE(NEW.created_by_admin_id, v_user_id),
        now()
      )
      ON CONFLICT (organisation_id, user_id) 
      DO UPDATE SET
        role = 'owner',
        status = 'active',
        archived_at = NULL,
        updated_at = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS auto_add_organisation_owner_trigger ON organisations;

-- Create trigger to auto-add owner
CREATE TRIGGER auto_add_organisation_owner_trigger
AFTER INSERT ON organisations
FOR EACH ROW
EXECUTE FUNCTION auto_add_organisation_owner();

-- Fix RLS policies for quotes to allow org members to insert
DROP POLICY IF EXISTS "Service role can bypass for quote parsing and imports" ON quotes;
DROP POLICY IF EXISTS "Org members can insert quotes" ON quotes;
DROP POLICY IF EXISTS "Service role can manage all quotes" ON quotes;

CREATE POLICY "Org members can insert quotes"
ON quotes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organisation_members
    WHERE organisation_members.organisation_id = quotes.organisation_id
    AND organisation_members.user_id = auth.uid()
    AND organisation_members.status = 'active'
    AND organisation_members.archived_at IS NULL
  )
);

CREATE POLICY "Service role can manage all quotes"
ON quotes
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Fix RLS for projects
DROP POLICY IF EXISTS "Org members can insert projects" ON projects;

CREATE POLICY "Org members can insert projects"
ON projects
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organisation_members
    WHERE organisation_members.organisation_id = projects.organisation_id
    AND organisation_members.user_id = auth.uid()
    AND organisation_members.status = 'active'
    AND organisation_members.archived_at IS NULL
  )
);

-- Fix RLS for quote_items  
DROP POLICY IF EXISTS "Org members can insert quote items" ON quote_items;
DROP POLICY IF EXISTS "Service role can manage all quote items" ON quote_items;

CREATE POLICY "Org members can insert quote items"
ON quote_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM quotes q
    JOIN organisation_members om ON om.organisation_id = q.organisation_id
    WHERE q.id = quote_items.quote_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.archived_at IS NULL
  )
);

CREATE POLICY "Service role can manage all quote items"
ON quote_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Ensure parsing_jobs has proper RLS
DROP POLICY IF EXISTS "Service role can manage all parsing jobs" ON parsing_jobs;
DROP POLICY IF EXISTS "Users can manage their parsing jobs" ON parsing_jobs;

CREATE POLICY "Service role can manage all parsing jobs"
ON parsing_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can manage their parsing jobs"
ON parsing_jobs
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM quotes q
    JOIN organisation_members om ON om.organisation_id = q.organisation_id
    WHERE q.id = parsing_jobs.quote_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.archived_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM projects p
    JOIN organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = parsing_jobs.project_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.archived_at IS NULL
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM quotes q
    JOIN organisation_members om ON om.organisation_id = q.organisation_id
    WHERE q.id = parsing_jobs.quote_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.archived_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM projects p
    JOIN organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = parsing_jobs.project_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.archived_at IS NULL
  )
);

-- Fix parsing_chunks RLS if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'parsing_chunks') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Service role can manage all parsing chunks" ON parsing_chunks';
    EXECUTE 'CREATE POLICY "Service role can manage all parsing chunks" ON parsing_chunks FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMENT ON FUNCTION add_member_to_organisation_by_email IS 'Adds a user to an organisation by email - callable by platform admins or org admins';
COMMENT ON FUNCTION auto_add_organisation_owner IS 'Automatically adds organisation creator as owner when org is created';
