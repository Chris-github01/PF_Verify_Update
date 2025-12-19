/*
  # Restore Suppliers INSERT/UPDATE/DELETE Policies

  ## Summary
  Restores the missing INSERT/UPDATE/DELETE policies for the suppliers table that were accidentally removed during consolidation.

  1. Changes
    - Add back INSERT policy for suppliers (org admins and owners)
    - Add back UPDATE policy for suppliers (org admins and owners)
    - Add back DELETE policy for suppliers (org admins and owners)
    
  2. Security
    - Only org admins and owners can modify suppliers
    - All org members can view suppliers
    - Maintains original security model
*/

-- Restore INSERT policy for suppliers
CREATE POLICY "Org admins can insert suppliers"
  ON public.suppliers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = suppliers.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  );

-- Restore UPDATE policy for suppliers
CREATE POLICY "Org admins can update suppliers"
  ON public.suppliers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = suppliers.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = suppliers.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  );

-- Restore DELETE policy for suppliers
CREATE POLICY "Org admins can delete suppliers"
  ON public.suppliers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = suppliers.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  );
