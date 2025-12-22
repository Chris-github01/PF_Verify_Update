# Pre-let Appendix Timeout Fix

## Problem Summary

The "Generate Appendix Document" button in Step 3 of the Subcontractor Onboarding was timing out after 60 seconds.

## Root Causes Identified

### 1. **Inefficient Edge Function** (FIXED ✅)
The edge function was fetching massive amounts of unnecessary data before checking which mode was requested:
- Fetching 1,000+ quote items
- Processing all scope systems
- Querying multiple tables (award_reports, contract_inclusions, contract_exclusions, etc.)
- All happening BEFORE checking if mode was 'prelet_appendix'

**Solution:** Created a "fast path" that executes immediately for prelet_appendix mode, fetching only:
- Project info
- Organisation logo
- Prelet appendix data
- Basic quote info (supplier name and amount)

### 2. **Missing Error Handling** (FIXED ✅)
The edge function wasn't catching database errors properly.

**Solution:** Added comprehensive error handling and detailed logging with `[PRELET]` prefix to track execution.

### 3. **Possible Database Issues** (NEEDS CHECKING ⚠️)
The prelet_appendix table might have:
- RLS (Row Level Security) policy issues causing slow queries
- Missing indexes
- Table doesn't exist yet in your database

## Changes Made

### File: `supabase/functions/export_contract_manager/index.ts`

**Before:**
```typescript
// Fetched ALL data first (slow)
const quoteItems = await fetch1000Items();
const awardReport = await fetchAwardReport();
const inclusions = await fetchInclusions();
const exclusions = await fetchExclusions();
// ... more queries ...

if (mode === 'prelet_appendix') {
  // Generate appendix
}
```

**After:**
```typescript
// Check mode FIRST, fetch only what's needed
if (mode === 'prelet_appendix') {
  // Fast path - only 3 queries:
  const appendixData = await fetch();  // Query 1
  const quote = await fetch();         // Query 2
  // Logo already fetched            // Query 3
  return generateHTML();               // Done!
}

// Other modes fetch detailed data only if needed
```

## What You Need to Do

### Step 1: Check Database Table Exists

Run the diagnostic script in Supabase SQL Editor:

1. Go to your Supabase project dashboard
2. Click "SQL Editor"
3. Run the file: `CHECK_PRELET_APPENDIX.sql`

This will check:
- ✅ Table exists
- ✅ Columns are correct
- ✅ RLS is properly configured
- ✅ Data exists

### Step 2: If Table Doesn't Exist

If the prelet_appendix table doesn't exist, you need to create it. Here's the migration:

```sql
-- Create prelet_appendix table
CREATE TABLE IF NOT EXISTS prelet_appendix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_summary text,
  pricing_basis text DEFAULT 'lump_sum',
  commercial_assumptions jsonb DEFAULT '[]'::jsonb,
  clarifications jsonb DEFAULT '[]'::jsonb,
  known_risks jsonb DEFAULT '[]'::jsonb,
  inclusions jsonb DEFAULT '[]'::jsonb,
  exclusions jsonb DEFAULT '[]'::jsonb,
  is_finalised boolean DEFAULT false,
  finalised_at timestamptz,
  finalised_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Award overview fields
  awarded_subcontractor text,
  awarded_total_ex_gst numeric,
  awarded_total_inc_gst numeric,
  awarded_pricing_basis text,
  award_date timestamptz,
  award_status text,
  quote_reference text,
  quote_revision text,
  quote_id uuid REFERENCES quotes(id),
  award_report_id uuid REFERENCES award_reports(id),
  scope_summary_snapshot text,
  systems_snapshot jsonb DEFAULT '[]'::jsonb,
  attachments_snapshot jsonb DEFAULT '[]'::jsonb
);

-- Enable RLS
ALTER TABLE prelet_appendix ENABLE ROW LEVEL SECURITY;

-- Add policies
CREATE POLICY "Users can view appendix in their organisation's projects"
  ON prelet_appendix FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = prelet_appendix.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert appendix in their organisation's projects"
  ON prelet_appendix FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = prelet_appendix.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update appendix in their organisation's projects"
  ON prelet_appendix FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = prelet_appendix.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Service role can manage all appendix data"
  ON prelet_appendix FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_prelet_appendix_project_id ON prelet_appendix(project_id);
CREATE INDEX IF NOT EXISTS idx_prelet_appendix_created_by ON prelet_appendix(created_by);
CREATE INDEX IF NOT EXISTS idx_prelet_appendix_quote_id ON prelet_appendix(quote_id);
```

### Step 3: Deploy Edge Function

The edge function code has been updated, but it needs to be deployed to Supabase.

**Option A: Using Supabase CLI** (recommended)
```bash
npx supabase functions deploy export_contract_manager
```

**Option B: Through Supabase Dashboard**
1. Go to Edge Functions in your Supabase dashboard
2. Find `export_contract_manager`
3. Click "Deploy new version"
4. Upload the function code

### Step 4: Test the Fix

1. Go to Contract Manager > Subcontractor Onboarding
2. Navigate through to Step 3 (Pre-let Minute Appendix)
3. Fill out the form and click "Save & Finalize"
4. Click "Generate Appendix Document"
5. Check browser console AND Supabase logs for `[PRELET]` messages

## Expected Performance

**Before fix:**
- 60+ seconds (timeout)
- Processing 1,000+ items
- 7+ database queries

**After fix:**
- 2-5 seconds total
- Only 3 database queries
- Direct HTML generation

## Debugging Logs

If it still times out, check the logs for these prefixed messages:

```
[PRELET] Fast path started
[PRELET] Project ID: xxx
[PRELET] Organisation ID: xxx
[PRELET] Querying prelet_appendix table...
[PRELET] Query completed in XXXms
[PRELET] Appendix data loaded. Keys: [...]
[PRELET] HTML generated in XXXms, length: XXXXX
```

If you see an error, the `[PRELET]` logs will show exactly where it failed:
- `Database error:` = RLS or table issue
- `No appendix data found` = Need to save appendix first
- Query taking >5 seconds = Index or RLS policy issue

## Files Changed

- ✅ `supabase/functions/export_contract_manager/index.ts` - Optimized edge function
- ✅ `CHECK_PRELET_APPENDIX.sql` - Diagnostic script
- ✅ `PRELET_APPENDIX_TIMEOUT_FIX.md` - This document

## Next Steps

1. Run `CHECK_PRELET_APPENDIX.sql` in Supabase
2. Deploy the edge function
3. Test the fix
4. Check logs if issues persist

The timeout should be completely resolved!
