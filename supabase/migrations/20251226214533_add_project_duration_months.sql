/*
  # Add Project Duration Field

  1. Changes
    - Add `project_duration_months` column to `projects` table
      - Default value: 6 (typical project duration in months)
      - Used for calculating cashflow projections in Senior Management Pack

  2. Purpose
    - Allows users to specify realistic project durations
    - Enables accurate cashflow breakdown over the correct period
    - Supports flexible S-curve distribution based on actual project timeline
*/

-- Add project_duration_months column to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS project_duration_months integer DEFAULT 6 CHECK (project_duration_months >= 1 AND project_duration_months <= 60);

-- Add comment for documentation
COMMENT ON COLUMN projects.project_duration_months IS 'Project duration in months for cashflow projections (default: 6 months, range: 1-60 months)';