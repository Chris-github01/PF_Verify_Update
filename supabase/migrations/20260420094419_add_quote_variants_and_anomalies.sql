/*
  # Phase 2 Trust Layer: quote variants and parse anomaly badges

  1. New Tables
    - `quote_variants` — stores each pricing option when a dual-option PDF is
      detected. A quote may have 0..N variants; items are never merged across
      variants.
      - `id` (uuid, pk)
      - `quote_id` (uuid, fk -> quotes.id, cascade delete)
      - `organisation_id` (uuid, fk -> organisations.id)
      - `variant_index` (int, 0-based ordering within the quote)
      - `variant_label` (text, e.g. "Option A", "Option 1")
      - `main_total` (numeric)
      - `optional_total` (numeric)
      - `grand_total` (numeric)
      - `is_primary` (boolean, marks the variant selected by the parser)
      - `source_evidence` (jsonb — labelled totals and positions that belong to
        this variant)
      - `created_at` (timestamptz)
  2. Changed Tables
    - `quotes`
      - `parse_anomalies` (text[], set of anomaly badges such as row_sum_only,
        multiple_grand_totals, subtotal_plus_qa_match, optional_detected,
        dual_option_detected, no_labelled_totals, outside_tolerance)
      - `has_variants` (boolean, default false)
  3. Security
    - RLS enabled on `quote_variants`
    - Select/insert/update/delete policies scoped to the owning organisation via
      `organisation_members`
*/

CREATE TABLE IF NOT EXISTS quote_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  variant_index integer NOT NULL DEFAULT 0,
  variant_label text NOT NULL DEFAULT 'Option 1',
  main_total numeric(14,2) NOT NULL DEFAULT 0,
  optional_total numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  source_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_variants_quote_id ON quote_variants(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_variants_organisation_id ON quote_variants(organisation_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_variants_quote_variant
  ON quote_variants(quote_id, variant_index);

ALTER TABLE quote_variants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quote_variants' AND policyname='Members can view org quote variants'
  ) THEN
    CREATE POLICY "Members can view org quote variants"
      ON quote_variants FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM organisation_members om
          WHERE om.organisation_id = quote_variants.organisation_id
            AND om.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quote_variants' AND policyname='Members can insert org quote variants'
  ) THEN
    CREATE POLICY "Members can insert org quote variants"
      ON quote_variants FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM organisation_members om
          WHERE om.organisation_id = quote_variants.organisation_id
            AND om.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quote_variants' AND policyname='Members can update org quote variants'
  ) THEN
    CREATE POLICY "Members can update org quote variants"
      ON quote_variants FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM organisation_members om
          WHERE om.organisation_id = quote_variants.organisation_id
            AND om.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM organisation_members om
          WHERE om.organisation_id = quote_variants.organisation_id
            AND om.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quote_variants' AND policyname='Members can delete org quote variants'
  ) THEN
    CREATE POLICY "Members can delete org quote variants"
      ON quote_variants FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM organisation_members om
          WHERE om.organisation_id = quote_variants.organisation_id
            AND om.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'parse_anomalies'
  ) THEN
    ALTER TABLE quotes ADD COLUMN parse_anomalies text[] NOT NULL DEFAULT ARRAY[]::text[];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'has_variants'
  ) THEN
    ALTER TABLE quotes ADD COLUMN has_variants boolean NOT NULL DEFAULT false;
  END IF;
END $$;
