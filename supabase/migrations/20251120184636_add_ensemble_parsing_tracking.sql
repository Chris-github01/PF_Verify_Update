/*
  # Add Ensemble Parsing Tracking

  1. New Tables
    - `parsing_ensemble_runs`
      - Tracks multi-parser extraction attempts
      - Stores confidence scores, parser results, and consensus items
      - Links to quotes table
    
    - `parser_performance_metrics`
      - Aggregate metrics for each parser type
      - Success rates, average confidence, timing data
      - Auto-updated via trigger

  2. Changes
    - Add ensemble tracking columns to `quotes` table
    - Add indexes for performance optimization

  3. Security
    - Enable RLS on new tables
    - Policies allow users to read their organization's data
    - Service role has full access for background processing
*/

-- Create parsing_ensemble_runs table
CREATE TABLE IF NOT EXISTS parsing_ensemble_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid REFERENCES quotes(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  parsers_attempted integer NOT NULL DEFAULT 0,
  parsers_succeeded integer NOT NULL DEFAULT 0,
  best_parser text,
  confidence_score numeric(5,4) DEFAULT 0,
  cross_model_agreement numeric(5,4) DEFAULT 0,
  recommendation text,
  extraction_time_ms integer DEFAULT 0,
  results_json jsonb DEFAULT '[]'::jsonb,
  consensus_items_json jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE parsing_ensemble_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read ensemble runs for their org"
  ON parsing_ensemble_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      INNER JOIN projects p ON q.project_id = p.id
      INNER JOIN organisation_members om ON p.organisation_id = om.organisation_id
      WHERE q.id = parsing_ensemble_runs.quote_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Service role can manage ensemble runs"
  ON parsing_ensemble_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create parser_performance_metrics table
CREATE TABLE IF NOT EXISTS parser_performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parser_name text UNIQUE NOT NULL,
  success_rate numeric(5,4) DEFAULT 0,
  avg_confidence numeric(5,4) DEFAULT 0,
  avg_extraction_time_ms integer DEFAULT 0,
  total_runs integer DEFAULT 0,
  successful_runs integer DEFAULT 0,
  failed_runs integer DEFAULT 0,
  last_updated timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE parser_performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read parser metrics"
  ON parser_performance_metrics
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage parser metrics"
  ON parser_performance_metrics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add columns to quotes table for ensemble tracking
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'ensemble_run_id'
  ) THEN
    ALTER TABLE quotes ADD COLUMN ensemble_run_id uuid REFERENCES parsing_ensemble_runs(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'parser_confidence_scores'
  ) THEN
    ALTER TABLE quotes ADD COLUMN parser_confidence_scores jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'extraction_method'
  ) THEN
    ALTER TABLE quotes ADD COLUMN extraction_method text DEFAULT 'single_parser';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'extraction_confidence'
  ) THEN
    ALTER TABLE quotes ADD COLUMN extraction_confidence numeric(5,4) DEFAULT 0;
  END IF;
END $$;

-- Create function to update parser performance metrics
CREATE OR REPLACE FUNCTION update_parser_metrics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO parser_performance_metrics (
    parser_name,
    success_rate,
    avg_confidence,
    avg_extraction_time_ms,
    total_runs,
    successful_runs,
    failed_runs,
    last_updated
  )
  SELECT
    result->>'parser_name' as parser_name,
    ROUND(
      COUNT(*) FILTER (WHERE (result->>'success')::boolean = true)::numeric / 
      NULLIF(COUNT(*), 0)::numeric,
      4
    ) as success_rate,
    ROUND(COALESCE(AVG((result->>'confidence_score')::numeric), 0), 4) as avg_confidence,
    ROUND(COALESCE(AVG((result->>'extraction_time_ms')::integer), 0)) as avg_extraction_time_ms,
    COUNT(*) as total_runs,
    COUNT(*) FILTER (WHERE (result->>'success')::boolean = true) as successful_runs,
    COUNT(*) FILTER (WHERE (result->>'success')::boolean = false) as failed_runs,
    now() as last_updated
  FROM parsing_ensemble_runs,
  LATERAL jsonb_array_elements(results_json) as result
  WHERE parsing_ensemble_runs.id = NEW.id
  GROUP BY result->>'parser_name'
  ON CONFLICT (parser_name) 
  DO UPDATE SET
    success_rate = ROUND(
      (parser_performance_metrics.successful_runs + EXCLUDED.successful_runs)::numeric /
      NULLIF((parser_performance_metrics.total_runs + EXCLUDED.total_runs), 0)::numeric,
      4
    ),
    avg_confidence = ROUND(
      (parser_performance_metrics.avg_confidence * parser_performance_metrics.total_runs +
       EXCLUDED.avg_confidence * EXCLUDED.total_runs) /
      NULLIF((parser_performance_metrics.total_runs + EXCLUDED.total_runs), 0),
      4
    ),
    avg_extraction_time_ms = ROUND(
      (parser_performance_metrics.avg_extraction_time_ms * parser_performance_metrics.total_runs +
       EXCLUDED.avg_extraction_time_ms * EXCLUDED.total_runs) /
      NULLIF((parser_performance_metrics.total_runs + EXCLUDED.total_runs), 0)
    ),
    total_runs = parser_performance_metrics.total_runs + EXCLUDED.total_runs,
    successful_runs = parser_performance_metrics.successful_runs + EXCLUDED.successful_runs,
    failed_runs = parser_performance_metrics.failed_runs + EXCLUDED.failed_runs,
    last_updated = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update metrics
DROP TRIGGER IF EXISTS update_parser_metrics_trigger ON parsing_ensemble_runs;
CREATE TRIGGER update_parser_metrics_trigger
  AFTER INSERT ON parsing_ensemble_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_parser_metrics();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ensemble_runs_quote_id ON parsing_ensemble_runs(quote_id);
CREATE INDEX IF NOT EXISTS idx_ensemble_runs_created_at ON parsing_ensemble_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ensemble_runs_confidence ON parsing_ensemble_runs(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_parser_metrics_name ON parser_performance_metrics(parser_name);
CREATE INDEX IF NOT EXISTS idx_quotes_ensemble_run ON quotes(ensemble_run_id);
CREATE INDEX IF NOT EXISTS idx_quotes_extraction_method ON quotes(extraction_method);
