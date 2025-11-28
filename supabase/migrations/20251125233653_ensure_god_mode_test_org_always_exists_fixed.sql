/*
  # Ensure God-Mode Test Organisation Always Exists

  1. Purpose
    - Creates a guaranteed test organisation for God-Mode users
    - Ensures both chris@optimalfire.co.nz and pieter@optimalfire.co.nz have access
    - Provides instant access on first login

  2. Actions
    - Create "Optimal Fire God-Mode Test Org" if it doesn't exist
    - Add both God-Mode users as owners
    - Ensure they have access to any existing orgs
    - Create initial test project in the test org

  3. Security
    - Only affects the two hard-coded God-Mode accounts
    - All RLS policies remain enforced
*/

-- Create the test organisation if it doesn't exist
DO $$
DECLARE
  test_org_id uuid;
  chris_user_id uuid;
  pieter_user_id uuid;
  test_project_id uuid;
BEGIN
  -- Get God-Mode user IDs
  SELECT id INTO chris_user_id FROM auth.users WHERE email = 'chris@optimalfire.co.nz';
  SELECT id INTO pieter_user_id FROM auth.users WHERE email = 'pieter@optimalfire.co.nz';

  -- Create test organisation if it doesn't exist
  INSERT INTO organisations (name)
  VALUES ('Optimal Fire God-Mode Test Org')
  ON CONFLICT DO NOTHING
  RETURNING id INTO test_org_id;

  -- If we didn't just create it, get its ID
  IF test_org_id IS NULL THEN
    SELECT id INTO test_org_id FROM organisations WHERE name = 'Optimal Fire God-Mode Test Org';
  END IF;

  -- Ensure both God-Mode users are owners of the test org
  IF chris_user_id IS NOT NULL AND test_org_id IS NOT NULL THEN
    INSERT INTO organisation_members (user_id, organisation_id, role, status)
    VALUES (chris_user_id, test_org_id, 'owner', 'active')
    ON CONFLICT (user_id, organisation_id) 
    DO UPDATE SET role = 'owner', status = 'active', updated_at = now();
  END IF;

  IF pieter_user_id IS NOT NULL AND test_org_id IS NOT NULL THEN
    INSERT INTO organisation_members (user_id, organisation_id, role, status)
    VALUES (pieter_user_id, test_org_id, 'owner', 'active')
    ON CONFLICT (user_id, organisation_id) 
    DO UPDATE SET role = 'owner', status = 'active', updated_at = now();
  END IF;

  -- Create initial test project if it doesn't exist
  IF test_org_id IS NOT NULL AND chris_user_id IS NOT NULL THEN
    INSERT INTO projects (organisation_id, name, description, status, created_by)
    VALUES (test_org_id, 'Test Project - Instant Access', 'Auto-created demo project for God-Mode access', 'active', chris_user_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Ensure both users are in existing orgs
  DECLARE
    org_record RECORD;
  BEGIN
    FOR org_record IN SELECT id FROM organisations WHERE id != test_org_id LOOP
      IF chris_user_id IS NOT NULL THEN
        INSERT INTO organisation_members (user_id, organisation_id, role, status)
        VALUES (chris_user_id, org_record.id, 'owner', 'active')
        ON CONFLICT (user_id, organisation_id) 
        DO UPDATE SET role = 'owner', status = 'active', updated_at = now();
      END IF;

      IF pieter_user_id IS NOT NULL THEN
        INSERT INTO organisation_members (user_id, organisation_id, role, status)
        VALUES (pieter_user_id, org_record.id, 'owner', 'active')
        ON CONFLICT (user_id, organisation_id) 
        DO UPDATE SET role = 'owner', status = 'active', updated_at = now();
      END IF;
    END LOOP;
  END;

END $$;

-- Create a function to auto-create test org for God-Mode users
CREATE OR REPLACE FUNCTION create_god_mode_test_org(for_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  test_org_id uuid;
  test_project_id uuid;
  user_email text;
BEGIN
  -- Get user email
  SELECT email INTO user_email FROM auth.users WHERE id = for_user_id;
  
  -- Verify user is God-Mode
  IF user_email NOT IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz') THEN
    RAISE EXCEPTION 'User is not authorized for auto-create';
  END IF;

  -- Check if test org already exists
  SELECT id INTO test_org_id FROM organisations WHERE name = 'Optimal Fire God-Mode Test Org';

  -- Create if doesn't exist
  IF test_org_id IS NULL THEN
    INSERT INTO organisations (name)
    VALUES ('Optimal Fire God-Mode Test Org')
    RETURNING id INTO test_org_id;
  END IF;

  -- Ensure user is an owner
  INSERT INTO organisation_members (user_id, organisation_id, role, status)
  VALUES (for_user_id, test_org_id, 'owner', 'active')
  ON CONFLICT (user_id, organisation_id) 
  DO UPDATE SET role = 'owner', status = 'active', updated_at = now();

  -- Create initial test project if none exists for this org
  SELECT id INTO test_project_id 
  FROM projects 
  WHERE organisation_id = test_org_id 
  LIMIT 1;

  IF test_project_id IS NULL THEN
    INSERT INTO projects (organisation_id, name, description, status, created_by)
    VALUES (test_org_id, 'Test Project - Instant Access', 'Auto-created demo project for God-Mode access', 'active', for_user_id)
    RETURNING id INTO test_project_id;
  END IF;

  RETURN test_org_id;
END;
$$;
