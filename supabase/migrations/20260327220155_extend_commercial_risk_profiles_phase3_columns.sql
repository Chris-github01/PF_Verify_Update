/*
  # Extend commercial_risk_profiles for Phase 3

  The table exists but is missing columns written by the Phase 3 engine:
  - risk_level (text: low | medium | high | critical)
  - scope_risk_score (integer) — already exists under a different name, adding our canonical column
  - rate_risk_score (integer)
  - leakage_risk_score (integer)
  - recommendation (text)

  We add only missing columns. Existing columns are left intact.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commercial_risk_profiles' AND column_name = 'risk_level'
  ) THEN
    ALTER TABLE commercial_risk_profiles ADD COLUMN risk_level text NOT NULL DEFAULT 'low';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commercial_risk_profiles' AND column_name = 'scope_risk_score'
  ) THEN
    ALTER TABLE commercial_risk_profiles ADD COLUMN scope_risk_score integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commercial_risk_profiles' AND column_name = 'rate_risk_score'
  ) THEN
    ALTER TABLE commercial_risk_profiles ADD COLUMN rate_risk_score integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commercial_risk_profiles' AND column_name = 'leakage_risk_score'
  ) THEN
    ALTER TABLE commercial_risk_profiles ADD COLUMN leakage_risk_score integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commercial_risk_profiles' AND column_name = 'recommendation'
  ) THEN
    ALTER TABLE commercial_risk_profiles ADD COLUMN recommendation text NOT NULL DEFAULT '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commercial_risk_profiles_risk_level
  ON commercial_risk_profiles (risk_level);

CREATE INDEX IF NOT EXISTS idx_commercial_risk_profiles_module_key
  ON commercial_risk_profiles (module_key);
