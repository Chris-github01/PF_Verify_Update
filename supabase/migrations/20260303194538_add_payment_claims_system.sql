/*
  # Payment Claims System

  ## Overview
  Adds formal payment claim documents that match the Excel "Payment Claim" sheet layout.
  Each claim is a standalone document with payer/payee details, base contract lines,
  variation lines, tiered retention calculations, GST, and amount payable sections.

  ## New Tables

  ### payment_claims
  Master claim document. Stores all header fields (payer/payee snapshots), financial
  totals, retention rates, and status. Linked to an scc_contract.

  ### payment_claim_lines
  Individual line items within a claim. Covers both base contract lines and variation
  lines. Stores qty, rate, total, and claim-to-date % and amount.

  ## Security
  - RLS enabled on both tables
  - Authenticated users can only access their organisation's records
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- payment_claims
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_claims (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id             uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  contract_id                 uuid REFERENCES scc_contracts(id) ON DELETE SET NULL,
  claim_period_id             uuid REFERENCES scc_claim_periods(id) ON DELETE SET NULL,

  -- Claim numbering
  claim_number                text NOT NULL DEFAULT '',
  our_ref                     text NOT NULL DEFAULT '',

  -- Payer snapshot (TO block)
  payer_company               text NOT NULL DEFAULT '',
  payer_address               text NOT NULL DEFAULT '',
  payer_attention             text NOT NULL DEFAULT '',
  project_name                text NOT NULL DEFAULT '',
  site_location               text NOT NULL DEFAULT '',
  claim_period                text NOT NULL DEFAULT '',

  -- Payee snapshot (FROM block)
  payee_company               text NOT NULL DEFAULT '',
  payee_address               text NOT NULL DEFAULT '',
  payee_contact               text NOT NULL DEFAULT '',
  submission_date             date,
  due_date                    date,

  -- Logo
  logo_url                    text,

  -- Retention rates (tiered)
  retention_rate_tier1        numeric(6,4) NOT NULL DEFAULT 0.05,
  retention_rate_tier2        numeric(6,4) NOT NULL DEFAULT 0.025,
  retention_rate_tier3        numeric(6,4) NOT NULL DEFAULT 0.0,
  retention_released          numeric(15,2) NOT NULL DEFAULT 0,

  -- Previous claim carry-forward
  previous_net_claimed        numeric(15,2) NOT NULL DEFAULT 0,
  net_payment_certified       numeric(15,2) NOT NULL DEFAULT 0,

  -- Calculated totals (stored for list display)
  base_total                  numeric(15,2) NOT NULL DEFAULT 0,
  variations_total            numeric(15,2) NOT NULL DEFAULT 0,
  total_c                     numeric(15,2) NOT NULL DEFAULT 0,
  retention_amount            numeric(15,2) NOT NULL DEFAULT 0,
  net_claim_to_date_e         numeric(15,2) NOT NULL DEFAULT 0,
  claimed_this_period_ex_gst  numeric(15,2) NOT NULL DEFAULT 0,
  gst_amount                  numeric(15,2) NOT NULL DEFAULT 0,
  claimed_this_period_inc_gst numeric(15,2) NOT NULL DEFAULT 0,
  amount_payable_ex_gst       numeric(15,2) NOT NULL DEFAULT 0,
  amount_payable_inc_gst      numeric(15,2) NOT NULL DEFAULT 0,

  -- Workflow
  status                      text NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','submitted','approved','paid')),

  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

ALTER TABLE payment_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select payment claims"
  ON payment_claims FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can insert payment claims"
  ON payment_claims FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can update payment claims"
  ON payment_claims FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can delete payment claims"
  ON payment_claims FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- payment_claim_lines
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_claim_lines (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_claim_id     uuid NOT NULL REFERENCES payment_claims(id) ON DELETE CASCADE,
  organisation_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

  line_type            text NOT NULL DEFAULT 'base'
                       CHECK (line_type IN ('base','variation')),
  item_no              text NOT NULL DEFAULT '',
  description          text NOT NULL DEFAULT '',
  qty                  numeric(15,4),
  unit                 text,
  rate                 numeric(15,2),
  total                numeric(15,2) NOT NULL DEFAULT 0,
  claim_to_date_pct    numeric(6,2) NOT NULL DEFAULT 0,
  claim_to_date_amount numeric(15,2) NOT NULL DEFAULT 0,
  sort_order           integer NOT NULL DEFAULT 0,

  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

ALTER TABLE payment_claim_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select payment claim lines"
  ON payment_claim_lines FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can insert payment claim lines"
  ON payment_claim_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can update payment claim lines"
  ON payment_claim_lines FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Org members can delete payment claim lines"
  ON payment_claim_lines FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_claims_organisation ON payment_claims(organisation_id);
CREATE INDEX IF NOT EXISTS idx_payment_claims_contract ON payment_claims(contract_id);
CREATE INDEX IF NOT EXISTS idx_payment_claim_lines_claim ON payment_claim_lines(payment_claim_id);

-- Storage bucket for payment claim logos (public read, auth write)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-claim-logos', 'payment-claim-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload payment claim logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'payment-claim-logos');

CREATE POLICY "Public can read payment claim logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'payment-claim-logos');

CREATE POLICY "Authenticated users can update payment claim logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'payment-claim-logos');

CREATE POLICY "Authenticated users can delete payment claim logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'payment-claim-logos');
