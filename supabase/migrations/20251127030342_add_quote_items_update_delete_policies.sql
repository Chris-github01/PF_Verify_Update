/*
  # Add UPDATE and DELETE policies for quote_items

  ## Changes
    - Add UPDATE policy for quote_items to allow authenticated users to update items in their organisation
    - Add DELETE policy for quote_items to allow authenticated users to delete items in their organisation

  ## Security
    - Policies check that the quote belongs to a project in the user's organisation
    - Users must have active membership status
*/

-- Add UPDATE policy for quote_items
CREATE POLICY "Users can update quote items in their organisation"
  ON quote_items
  FOR UPDATE
  TO authenticated
  USING (
    quote_id IN (
      SELECT q.id
      FROM quotes q
      JOIN projects p ON p.id = q.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id
        FROM organisation_members
        WHERE user_id = auth.uid()
        AND status = 'active'
      )
    )
  )
  WITH CHECK (
    quote_id IN (
      SELECT q.id
      FROM quotes q
      JOIN projects p ON p.id = q.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id
        FROM organisation_members
        WHERE user_id = auth.uid()
        AND status = 'active'
      )
    )
  );

-- Add DELETE policy for quote_items
CREATE POLICY "Users can delete quote items in their organisation"
  ON quote_items
  FOR DELETE
  TO authenticated
  USING (
    quote_id IN (
      SELECT q.id
      FROM quotes q
      JOIN projects p ON p.id = q.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id
        FROM organisation_members
        WHERE user_id = auth.uid()
        AND status = 'active'
      )
    )
  );
