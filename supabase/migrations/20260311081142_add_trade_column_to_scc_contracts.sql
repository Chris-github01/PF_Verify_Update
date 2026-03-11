/*
  # Add trade column to scc_contracts and scc_claim_periods

  ## Problem
  The SCC module was not switching data when users changed trade (Passive Fire → Electrical etc.)
  because:
    1. scc_contracts had no trade column, so all trades shared the same contracts list
    2. SCCDashboard never read currentTrade from context
    3. There was no way to filter contracts / claims by trade

  ## Changes

  ### scc_contracts
  - Adds `trade` column (text, default 'passive_fire')
  - Backfills from the linked scc_quote_imports.trade_type where available

  ### scc_claim_periods
  - Adds `trade` column (text, default 'passive_fire')
  - Backfills by joining through scc_contracts → scc_quote_imports

  ### scc_early_warning_reports
  - Already has trade_type; no change needed (dashboard will join through contracts)

  ## Notes
  - Default is 'passive_fire' to match the original single-trade assumption
  - The application layer will write the correct trade on every new contract/claim
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scc_contracts' AND column_name = 'trade'
  ) THEN
    ALTER TABLE scc_contracts ADD COLUMN trade text NOT NULL DEFAULT 'passive_fire';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scc_claim_periods' AND column_name = 'trade'
  ) THEN
    ALTER TABLE scc_claim_periods ADD COLUMN trade text NOT NULL DEFAULT 'passive_fire';
  END IF;
END $$;

UPDATE scc_contracts c
SET trade = qi.trade_type
FROM scc_quote_imports qi
WHERE c.quote_import_id = qi.id
  AND qi.trade_type IS NOT NULL
  AND c.trade = 'passive_fire';

UPDATE scc_claim_periods cp
SET trade = c.trade
FROM scc_contracts c
WHERE cp.contract_id = c.id
  AND cp.trade = 'passive_fire';

CREATE INDEX IF NOT EXISTS scc_contracts_trade_idx
  ON scc_contracts (organisation_id, trade);

CREATE INDEX IF NOT EXISTS scc_claim_periods_trade_idx
  ON scc_claim_periods (organisation_id, trade);
