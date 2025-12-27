/*
  # Add Scoring & Weighting Criteria to Projects

  1. Changes
    - Add `scoring_weights` JSONB column to projects table to store custom MCDA weights
    - Default weights: Price 40%, Technical Compliance 25%, Scope Coverage 20%, Risk Assessment 15%
    - Allows per-project customization of award decision criteria

  2. Structure
    ```json
    {
      "price": 40,
      "compliance": 25,
      "coverage": 20,
      "risk": 15
    }
    ```

  3. Notes
    - If null, system will use default weights (40/25/20/15)
    - Weights should sum to 100 for proper scoring
    - Applied across all award reports and recommendations
*/

-- Add scoring_weights column to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS scoring_weights JSONB DEFAULT NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN projects.scoring_weights IS 'Custom MCDA scoring weights for award decision analysis. Default: {price:40, compliance:25, coverage:20, risk:15}';

-- Create index for faster querying
CREATE INDEX IF NOT EXISTS idx_projects_scoring_weights ON projects USING GIN (scoring_weights);