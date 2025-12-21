# Organisation Access Fix - December 2025

## Problem
Users were unable to see their organisations on the Organisation Picker page. The page showed "No Organisations Found" even though users had valid memberships in the database.

## Root Cause
The issue was caused by **circular RLS (Row Level Security) policy dependencies** on two critical tables:

### 1. `organisation_members` Table
The SELECT policy had a circular dependency:
```sql
-- BROKEN POLICY (circular)
USING (
  EXISTS (
    SELECT 1 FROM organisation_members om  -- ❌ Queries same table!
    WHERE om.organisation_id = organisation_members.organisation_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
  )
)
```

When a user tried to query `organisation_members`, the policy tried to query `organisation_members` again to check permissions, creating an infinite loop that failed silently.

### 2. `organisations` Table
The SELECT policy depended on the broken `organisation_members` policy:
```sql
-- BROKEN POLICY (depends on broken table)
USING (
  id IN (
    SELECT organisation_id FROM organisation_members  -- ❌ Depends on broken policy!
    WHERE user_id = auth.uid() AND status = 'active'
  )
)
```

## Solution
Created helper functions with `SECURITY DEFINER` that bypass RLS to safely check permissions:

### Helper Functions Created
1. **`user_is_member_of_org(org_id, user_id)`**
   - Checks if a user is an active member of an organisation
   - Bypasses RLS using SECURITY DEFINER
   - Returns boolean

2. **`user_is_platform_admin(user_id)`**
   - Checks if a user is an active platform admin
   - Bypasses RLS using SECURITY DEFINER
   - Returns boolean

### Fixed Policies

#### `organisation_members` - New SELECT Policy
```sql
CREATE POLICY "Users can view their own memberships"
  ON organisation_members
  FOR SELECT
  TO authenticated
  USING (
    -- User can see their own membership record
    user_id = auth.uid()
    OR
    -- User can see memberships in orgs where they are a member
    user_is_member_of_org(organisation_id, auth.uid())
    OR
    -- Platform admins can see all memberships
    user_is_platform_admin(auth.uid())
  );
```

#### `organisations` - New SELECT Policy
```sql
CREATE POLICY "Users can view their member organisations"
  ON organisations
  FOR SELECT
  TO authenticated
  USING (
    -- User is a member of this organisation
    user_is_member_of_org(id, auth.uid())
    OR
    -- Platform admins can see all organisations
    user_is_platform_admin(auth.uid())
  );
```

## What Was Fixed
✅ Users can now see their organisations on the Organisation Picker page
✅ Both existing and new users will be able to access their organisations
✅ Platform admins retain god-mode access to all organisations
✅ No circular dependencies in RLS policies
✅ Secure implementation using SECURITY DEFINER functions

## Testing
Verified that:
- Chris (@optimalfire.co.nz) can see all 4 organisations
- Regular users can see their organisations
- Users without memberships see the "Create Trial Organization" option
- RLS is properly enabled on all tables
- Helper functions work correctly

## Files Modified
- Migration: `fix_organisation_members_rls_circular_dependency.sql`
- Migration: `fix_organisations_rls_circular_dependency.sql`

## Impact
This fix resolves the critical issue preventing users from accessing the application after login. All current users and new users will now be able to:
1. See their organisations immediately after login
2. Create new trial organisations if they don't have any
3. Switch between organisations if they're members of multiple ones
