/*
  # Add Subcontract Agreement Versions

  1. New Tables
    - `subcontract_agreement_versions`
      - `id` (uuid, primary key)
      - `agreement_id` (uuid, FK to subcontract_agreements)
      - `revision_number` (integer) - e.g. 1, 2, 3
      - `revision_label` (text) - e.g. "Revision 1"
      - `completed_at` (timestamptz) - when Complete was clicked
      - `completed_by` (uuid) - user who clicked Complete
      - `field_snapshot` (jsonb) - snapshot of all field values at time of completion
      - `notes` (text, nullable)
      - `created_at` (timestamptz)

  2. Changes to subcontract_agreements
    - Add `current_revision` (integer) to track latest revision number

  3. Security
    - Enable RLS on new table
    - Policies matching existing subcontract patterns
*/

CREATE TABLE IF NOT EXISTS subcontract_agreement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES subcontract_agreements(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  revision_label text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid REFERENCES auth.users(id),
  field_snapshot jsonb DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE subcontract_agreement_versions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subcontract_agreements' AND column_name = 'current_revision'
  ) THEN
    ALTER TABLE subcontract_agreements ADD COLUMN current_revision integer DEFAULT 0;
  END IF;
END $$;

CREATE POLICY "Users can view versions of their agreements"
  ON subcontract_agreement_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subcontract_agreements sa
      JOIN projects p ON p.id = sa.project_id
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE sa.id = subcontract_agreement_versions.agreement_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert versions for their agreements"
  ON subcontract_agreement_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM subcontract_agreements sa
      JOIN projects p ON p.id = sa.project_id
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE sa.id = subcontract_agreement_versions.agreement_id
        AND om.user_id = auth.uid()
    )
  );
