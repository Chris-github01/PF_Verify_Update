/*
  # Fix Organisation Members Infinite Recursion + Project Cleanup

  1. Fix organisation_members UPDATE and DELETE policies
     - These policies use self-referential subqueries causing infinite recursion
     - Replace with is_platform_admin() function to avoid the recursion

  2. Delete duplicate/wrong projects in Leehan Construction
     - Keep only the first "Sero Apartments" project (db8ee823)
     - Delete second "Sero Apartments" (80871503) and "Sero Apartment" (de3c2f04)
*/

-- Fix UPDATE policy on organisation_members (was causing infinite recursion)
DROP POLICY IF EXISTS "Users can update memberships in their org" ON public.organisation_members;

CREATE POLICY "Users can update memberships in their org"
  ON public.organisation_members FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_platform_admin()
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.is_platform_admin()
  );

-- Fix DELETE policy on organisation_members (was causing infinite recursion)
DROP POLICY IF EXISTS "Users can delete memberships in their org" ON public.organisation_members;

CREATE POLICY "Users can delete memberships in their org"
  ON public.organisation_members FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_platform_admin()
  );

-- Fix INSERT policy on organisation_members
DROP POLICY IF EXISTS "Users can insert memberships in their org" ON public.organisation_members;

CREATE POLICY "Users can insert memberships in their org"
  ON public.organisation_members FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR user_id = (SELECT auth.uid())
  );

-- Delete duplicate/wrong projects from Leehan Construction
-- Keep: db8ee823-c13e-4a2e-850d-7806ada5fc5a (first "Sero Apartments")
-- Delete: 80871503-0693-4ac4-a422-42df86d983d0 (second "Sero Apartments")
-- Delete: de3c2f04-2008-4e7a-b509-2d68c9581f3c ("Sero Apartment" - wrong name)
DELETE FROM projects 
WHERE id IN (
  '80871503-0693-4ac4-a422-42df86d983d0',
  'de3c2f04-2008-4e7a-b509-2d68c9581f3c'
);
