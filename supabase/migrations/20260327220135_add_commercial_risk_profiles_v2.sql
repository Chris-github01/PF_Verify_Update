/*
  # Add commercial_risk_profiles table (v2)

  Persists the Phase 3 commercial risk profile for each shadow run.
  Written by the engine immediately after each run. UI reads from DB.

  Table: commercial_risk_profiles
  - id, run_id (unique fk), module_key, total/scope/rate/leakage risk scores,
    risk_level, risk_flags_json (array of factor objects), recommendation, created_at

  RLS: authenticated users may select/insert/update.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'commercial_risk_profiles'
  ) THEN
    CREATE TABLE commercial_risk_profiles (
      id                 uuid DEFAULT gen_random_uuid(),
      run_id             uuid NOT NULL,
      module_key         text NOT NULL DEFAULT '',
      total_risk_score   integer NOT NULL DEFAULT 0,
      scope_risk_score   integer NOT NULL DEFAULT 0,
      rate_risk_score    integer NOT NULL DEFAULT 0,
      leakage_risk_score integer NOT NULL DEFAULT 0,
      risk_level         text NOT NULL DEFAULT 'low',
      risk_flags_json    jsonb NOT NULL DEFAULT '[]',
      recommendation     text NOT NULL DEFAULT '',
      created_at         timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE commercial_risk_profiles ADD CONSTRAINT commercial_risk_profiles_pkey PRIMARY KEY (id);
    ALTER TABLE commercial_risk_profiles ADD CONSTRAINT commercial_risk_profiles_run_id_key UNIQUE (run_id);
    ALTER TABLE commercial_risk_profiles ADD CONSTRAINT commercial_risk_profiles_run_id_fkey
      FOREIGN KEY (run_id) REFERENCES shadow_runs(id) ON DELETE CASCADE;

    CREATE INDEX idx_commercial_risk_profiles_run_id ON commercial_risk_profiles (run_id);
    CREATE INDEX idx_commercial_risk_profiles_risk_level ON commercial_risk_profiles (risk_level);
    CREATE INDEX idx_commercial_risk_profiles_module_key ON commercial_risk_profiles (module_key);

    ALTER TABLE commercial_risk_profiles ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "crp_select" ON commercial_risk_profiles
      FOR SELECT TO authenticated USING (true);

    CREATE POLICY "crp_insert" ON commercial_risk_profiles
      FOR INSERT TO authenticated WITH CHECK (true);

    CREATE POLICY "crp_update" ON commercial_risk_profiles
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
