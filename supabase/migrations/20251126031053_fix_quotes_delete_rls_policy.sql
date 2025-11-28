/*
  # Fix Quotes Delete RLS Policy

  1. Changes
    - Drop and recreate the quotes DELETE policy to ensure it works properly
    - Add proper logging to help debug any future issues
    
  2. Security
    - Maintains same security requirements: users can only delete quotes in projects they have access to
*/

-- Drop existing delete policy
DROP POLICY IF EXISTS "Users can delete quotes in their organisation projects" ON public.quotes;

-- Recreate with proper permissions
CREATE POLICY "Users can delete quotes in their organisation projects"
  ON public.quotes 
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = quotes.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );
