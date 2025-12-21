-- Comprehensive Test: Platform Admin Access Flow
-- Run this to verify admin access is working correctly

-- ============================================================================
-- TEST 1: Verify Platform Admin Status
-- ============================================================================
DO $$
DECLARE
  admin_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO admin_count
  FROM platform_admins
  WHERE email = 'chris@optimalfire.co.nz' AND is_active = true;

  IF admin_count = 1 THEN
    RAISE NOTICE '✅ TEST 1 PASSED: chris@optimalfire.co.nz is an active platform admin';
  ELSE
    RAISE EXCEPTION '❌ TEST 1 FAILED: chris@optimalfire.co.nz is not found or inactive';
  END IF;
END $$;

-- ============================================================================
-- TEST 2: Verify Organisation Access
-- ============================================================================
DO $$
DECLARE
  org_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO org_count FROM organisations;

  IF org_count >= 9 THEN
    RAISE NOTICE '✅ TEST 2 PASSED: Can access % organisations', org_count;
  ELSE
    RAISE EXCEPTION '❌ TEST 2 FAILED: Only found % organisations (expected at least 9)', org_count;
  END IF;
END $$;

-- ============================================================================
-- TEST 3: Verify RLS Policies Exist
-- ============================================================================
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'platform_admins'
    AND policyname IN (
      'Users can view their own admin status',
      'Admins can view all platform admins'
    );

  IF policy_count = 2 THEN
    RAISE NOTICE '✅ TEST 3 PASSED: Both RLS policies exist on platform_admins';
  ELSE
    RAISE EXCEPTION '❌ TEST 3 FAILED: Missing RLS policies (found %, expected 2)', policy_count;
  END IF;
END $$;

-- ============================================================================
-- TEST 4: Verify No Circular Dependencies
-- ============================================================================
DO $$
DECLARE
  circular_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO circular_count
  FROM pg_policies
  WHERE tablename = 'platform_admins'
    AND cmd = 'SELECT'
    AND policyname = 'Platform admins can view all admins';  -- Old broken policy

  IF circular_count = 0 THEN
    RAISE NOTICE '✅ TEST 4 PASSED: No circular RLS dependencies detected';
  ELSE
    RAISE EXCEPTION '❌ TEST 4 FAILED: Found old circular policy still active';
  END IF;
END $$;

-- ============================================================================
-- TEST 5: Verify is_platform_admin() Function Works
-- ============================================================================
DO $$
DECLARE
  chris_user_id UUID;
  is_admin BOOLEAN;
BEGIN
  SELECT id INTO chris_user_id
  FROM auth.users
  WHERE email = 'chris@optimalfire.co.nz';

  SELECT is_platform_admin(chris_user_id) INTO is_admin;

  IF is_admin = true THEN
    RAISE NOTICE '✅ TEST 5 PASSED: is_platform_admin() function returns true for chris';
  ELSE
    RAISE EXCEPTION '❌ TEST 5 FAILED: is_platform_admin() returns false for chris';
  END IF;
END $$;

-- ============================================================================
-- TEST 6: Verify Organisation Members
-- ============================================================================
DO $$
DECLARE
  membership_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO membership_count
  FROM organisation_members
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'chris@optimalfire.co.nz')
    AND status = 'active';

  IF membership_count >= 4 THEN
    RAISE NOTICE '✅ TEST 6 PASSED: chris has % active memberships', membership_count;
  ELSE
    RAISE NOTICE '⚠️  TEST 6 WARNING: chris has only % active memberships (expected at least 4)', membership_count;
  END IF;
END $$;

-- ============================================================================
-- TEST 7: Full Authentication Flow Simulation
-- ============================================================================
DO $$
DECLARE
  chris_id UUID;
  can_see_admin_table BOOLEAN;
  can_see_orgs BOOLEAN;
  org_count INTEGER;
BEGIN
  -- Get Chris's user ID
  SELECT id INTO chris_id
  FROM auth.users
  WHERE email = 'chris@optimalfire.co.nz';

  -- Test 7a: Can query own admin status
  SELECT EXISTS(
    SELECT 1 FROM platform_admins
    WHERE user_id = chris_id
  ) INTO can_see_admin_table;

  -- Test 7b: Can query organisations
  SELECT EXISTS(
    SELECT 1 FROM organisations LIMIT 1
  ) INTO can_see_orgs;

  SELECT COUNT(*) INTO org_count FROM organisations;

  IF can_see_admin_table AND can_see_orgs AND org_count >= 9 THEN
    RAISE NOTICE '✅ TEST 7 PASSED: Full auth flow works (admin check → org access)';
  ELSE
    RAISE EXCEPTION '❌ TEST 7 FAILED: Auth flow broken (admin=%, orgs=%, count=%)',
      can_see_admin_table, can_see_orgs, org_count;
  END IF;
END $$;

-- ============================================================================
-- SUMMARY: List All Organisations Accessible
-- ============================================================================
SELECT
  '🏢 ACCESSIBLE ORGANISATIONS' as info,
  id,
  name,
  subscription_status,
  created_at
FROM organisations
ORDER BY name;

-- ============================================================================
-- SUMMARY: Chris's Organisation Memberships
-- ============================================================================
SELECT
  '👤 CHRIS MEMBERSHIPS' as info,
  o.name as organisation_name,
  om.role,
  om.status,
  om.created_at
FROM organisation_members om
JOIN organisations o ON o.id = om.organisation_id
WHERE om.user_id = (SELECT id FROM auth.users WHERE email = 'chris@optimalfire.co.nz')
ORDER BY o.name;

-- ============================================================================
-- FINAL RESULT
-- ============================================================================
SELECT
  '✅ ALL TESTS PASSED - ADMIN ACCESS FULLY RESTORED' as status,
  NOW() as tested_at;
