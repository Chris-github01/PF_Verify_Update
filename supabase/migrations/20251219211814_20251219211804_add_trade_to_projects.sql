/*
  # Add Trade/Category Field to Projects

  ## Summary
  Adds a trade category field to projects to support trade-specific modules like Passive Fire, Electrical, etc.

  1. Changes
    - Add `trade` column to projects table (defaults to 'passive_fire')
    - Supports multiple trades: passive_fire, electrical, plumbing, hvac, mechanical
    - This enables dynamic trade-specific module display in the UI
    
  2. Security
    - No RLS changes needed (inherits existing project policies)
*/

-- Add trade column to projects
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS trade text DEFAULT 'passive_fire' NOT NULL;

-- Add check constraint for valid trade values
ALTER TABLE public.projects
ADD CONSTRAINT projects_trade_check 
CHECK (trade IN ('passive_fire', 'electrical', 'plumbing', 'hvac', 'mechanical', 'general'));

-- Create index for filtering by trade
CREATE INDEX IF NOT EXISTS idx_projects_trade ON public.projects(trade);

-- Add comment for documentation
COMMENT ON COLUMN public.projects.trade IS 'Trade category: passive_fire, electrical, plumbing, hvac, mechanical, general';
