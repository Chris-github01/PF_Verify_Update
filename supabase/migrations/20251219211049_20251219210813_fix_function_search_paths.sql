/*
  # Fix Function Search Paths

  ## Summary
  Sets explicit search_path for functions to prevent security vulnerabilities from role mutable search paths.

  1. Changes
    - Set search_path to 'public, pg_catalog' for check_close_scores function
    - Set search_path to 'public, pg_catalog' for update_award_approvals_updated_at function
    
  2. Security
    - Prevents search_path hijacking attacks
    - Ensures functions use intended schema
*/

-- Fix check_close_scores function
CREATE OR REPLACE FUNCTION public.check_close_scores()
RETURNS TABLE (
  project_id uuid,
  quote_id uuid,
  supplier_name text,
  total_amount numeric,
  close_competitors jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  WITH ranked_quotes AS (
    SELECT 
      q.project_id,
      q.id as quote_id,
      q.supplier_name,
      q.total_amount,
      RANK() OVER (PARTITION BY q.project_id ORDER BY q.total_amount ASC) as rank,
      LEAD(q.total_amount) OVER (PARTITION BY q.project_id ORDER BY q.total_amount ASC) as next_amount
    FROM public.quotes q
    WHERE q.total_amount IS NOT NULL
  )
  SELECT 
    rq.project_id,
    rq.quote_id,
    rq.supplier_name,
    rq.total_amount,
    jsonb_build_object(
      'next_lowest_amount', rq.next_amount,
      'difference', (rq.next_amount - rq.total_amount),
      'difference_percent', 
        CASE 
          WHEN rq.next_amount > 0 THEN 
            ROUND(((rq.next_amount - rq.total_amount) / rq.next_amount * 100)::numeric, 2)
          ELSE 0
        END
    ) as close_competitors
  FROM ranked_quotes rq
  WHERE rq.rank = 1 
    AND rq.next_amount IS NOT NULL
    AND ((rq.next_amount - rq.total_amount) / NULLIF(rq.next_amount, 0) * 100) < 5;
END;
$$;

-- Fix update_award_approvals_updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_award_approvals_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
