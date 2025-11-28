/*
  # Add service_role bypass policies for critical tables
  
  ## Problem
  Even though service_role should bypass RLS, the Supabase JS client
  may still trigger RLS policy evaluation in some cases. This causes
  the stack depth error when policies check organisation membership.
  
  ## Solution
  Add explicit policies for service_role that allow all operations
  without calling any helper functions. These policies use USING (true)
  which is safe for service_role since it's only used by trusted
  backend code.
  
  ## Changes
  - Add service_role policies to quotes table
  - Add service_role policies to quote_items table
  - Add service_role policies to parsing_jobs table
  - Add service_role policies to parsing_chunks table
*/

-- Add service_role policies for quotes table
CREATE POLICY "Service role can do anything with quotes"
  ON quotes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add service_role policies for quote_items table
CREATE POLICY "Service role can do anything with quote_items"
  ON quote_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add service_role policies for parsing_jobs table  
CREATE POLICY "Service role can do anything with parsing_jobs"
  ON parsing_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add service_role policies for parsing_chunks table
CREATE POLICY "Service role can do anything with parsing_chunks"
  ON parsing_chunks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add service_role policies for projects table (used by edge functions)
CREATE POLICY "Service role can do anything with projects"
  ON projects
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add service_role policies for organisation_members (queried during access checks)
CREATE POLICY "Service role can do anything with organisation_members"
  ON organisation_members
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
