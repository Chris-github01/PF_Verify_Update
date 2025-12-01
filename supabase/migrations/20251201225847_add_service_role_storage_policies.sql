/*
  # Add Service Role Storage Policies for Quotes Bucket

  1. Changes
    - Add service_role policies to allow edge functions to upload/access files in the quotes bucket
    - Service role needs full access to manage quote file uploads from edge functions
  
  2. Security
    - Only service_role can use these policies
    - User access still controlled by existing authenticated user policies
*/

-- Drop existing service role policy if it exists
DROP POLICY IF EXISTS "Service role can manage quotes bucket" ON storage.objects;

-- Create service role policy for all operations on quotes bucket
CREATE POLICY "Service role can manage quotes bucket"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'quotes')
  WITH CHECK (bucket_id = 'quotes');
