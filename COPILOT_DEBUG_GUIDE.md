# Copilot Debug Guide

## Issue
The Copilot is showing "Context: Harbour Tower Commercial Fit-Out (0 quotes, 0 items)" when there should be quotes and items available.

## Changes Made

### Enhanced Logging

Added comprehensive logging throughout the data fetching pipeline to diagnose the issue:

1. **`copilotDataProvider.ts`** - Added detailed logs:
   - Project ID being fetched
   - Project name found
   - Quotes query results (with and without `is_latest` filter)
   - Individual quote item counts
   - Final data summary

2. **`CopilotDrawer.tsx`** - Added component-level logs:
   - When data loading starts
   - Current project ID
   - Complete data object returned
   - Error handling

### Fallback Query Logic

Modified the quotes fetching to handle cases where `is_latest` flag might not be set:

1. First tries to fetch quotes with `is_latest = true`
2. If no quotes found, falls back to fetching all quotes for the project
3. Logs which approach was used

## How to Diagnose

### Step 1: Open Browser Console

1. Open your browser's Developer Tools (F12)
2. Go to the Console tab
3. Clear any existing logs

### Step 2: Open the Copilot

1. Make sure you have a project selected
2. Click the Copilot icon to open the drawer
3. Watch the console for log messages

### Expected Log Output

You should see logs like this:

```
[CopilotDrawer] Loading project data for: <project-id>
[Copilot] Fetching data for project ID: <project-id>
[Copilot] Project found: Harbour Tower Commercial Fit-Out
Found X quotes with is_latest=true
Quote Supplier A: 123 items
Quote Supplier B: 145 items
Quote Supplier C: 98 items
Total quotes with items: 3
[Copilot] Data summary: 3 quotes, 366 total items
[CopilotDrawer] Project data loaded: {project: {...}, quotes: [...], ...}
```

### Common Scenarios

#### Scenario 1: No quotes found with is_latest=true

```
[Copilot] Project found: Harbour Tower Commercial Fit-Out
No quotes found with is_latest=true, trying without filter...
Found 3 total quotes for project
```

**What this means**: The `is_latest` flag is not set on your quotes. The fallback will fetch all quotes anyway.

**Solution**: This is handled automatically by the fallback logic.

#### Scenario 2: RLS Policy Error

```
Error fetching quotes with is_latest filter: {code: "42501", message: "permission denied"}
```

**What this means**: Row Level Security policies are blocking access to the quotes table.

**Solution**: Check RLS policies on the `quotes` table. The user should be able to read quotes for projects in their organization.

#### Scenario 3: No items found for quotes

```
Found 3 quotes with is_latest=true
Quote Supplier A: 0 items
Quote Supplier B: 0 items
Quote Supplier C: 0 items
Total quotes with items: 3
[Copilot] Data summary: 3 quotes, 0 total items
```

**What this means**: Quotes exist but have no line items in the `quote_items` table.

**Solution**: Check if quote items were properly imported. May need to re-import quotes.

#### Scenario 4: Wrong Project ID

```
[CopilotDrawer] Loading project data for: undefined
[CopilotDrawer] No project ID, skipping data load
```

**What this means**: No project is currently selected.

**Solution**: Select a project before opening the Copilot.

## Troubleshooting Steps

### 1. Verify Project Selection

Check that a project is actually selected in the UI:
- Look at the project switcher/selector
- Verify the URL contains a valid project ID
- Check that `currentProjectId` is being passed to CopilotDrawer

### 2. Check Database Directly

Run these queries in Supabase SQL Editor:

```sql
-- Check if quotes exist for the project
SELECT id, supplier_name, is_latest, items_count
FROM quotes
WHERE project_id = 'your-project-id';

-- Check if quote items exist
SELECT q.supplier_name, COUNT(qi.id) as item_count
FROM quotes q
LEFT JOIN quote_items qi ON qi.quote_id = q.id
WHERE q.project_id = 'your-project-id'
GROUP BY q.id, q.supplier_name;

-- Check is_latest flag status
SELECT
  supplier_name,
  revision_number,
  is_latest,
  created_at
FROM quotes
WHERE project_id = 'your-project-id'
ORDER BY supplier_name, revision_number;
```

### 3. Fix is_latest Flag

If quotes exist but `is_latest` is not set, run:

```sql
-- Set is_latest for all quotes (if no revision system is in use)
UPDATE quotes
SET is_latest = true
WHERE project_id = 'your-project-id';
```

Or if using revision system:

```sql
-- Set is_latest only for the highest revision of each supplier
WITH latest_quotes AS (
  SELECT DISTINCT ON (supplier_name)
    id
  FROM quotes
  WHERE project_id = 'your-project-id'
  ORDER BY supplier_name, revision_number DESC NULLS LAST, created_at DESC
)
UPDATE quotes
SET is_latest = CASE WHEN id IN (SELECT id FROM latest_quotes) THEN true ELSE false END
WHERE project_id = 'your-project-id';
```

### 4. Check RLS Policies

Verify that RLS policies allow reading quotes and quote_items:

```sql
-- Check current user's access
SELECT
  auth.uid() as current_user_id,
  EXISTS(SELECT 1 FROM organisation_members WHERE user_id = auth.uid()) as is_member;

-- Test quote access
SELECT id, supplier_name FROM quotes WHERE project_id = 'your-project-id';

-- Test quote_items access
SELECT id, description FROM quote_items WHERE quote_id = 'any-quote-id' LIMIT 5;
```

### 5. Network Tab

Check the Network tab in Developer Tools:
- Look for failed Supabase API calls
- Check response status codes (should be 200)
- Look at response payloads to see if data is being returned

## Quick Fixes

### Fix 1: Force Refresh Data

Add this temporary button to force reload data:

```typescript
// In CopilotDrawer, add a refresh button
<button onClick={() => loadProjectData()}>Refresh Data</button>
```

### Fix 2: Clear Browser Cache

Sometimes stale authentication tokens cause issues:
1. Clear browser cache
2. Log out and log back in
3. Try opening Copilot again

### Fix 3: Check Organisation Context

Verify the organisation context is loaded:

```typescript
console.log('Current organisation:', currentOrganisation);
```

If `currentOrganisation` is null or undefined, the user might not be in an organisation.

## Next Steps

After reviewing the console logs:

1. **Share the logs** - Copy the console output and share it for further diagnosis
2. **Check the database** - Run the SQL queries above to verify data exists
3. **Fix data issues** - Use the SQL fixes above if needed
4. **Verify RLS policies** - Ensure proper access to quotes and quote_items tables

## Additional Debug Information

### Enable Verbose Supabase Logging

Add this to your code temporarily:

```typescript
import { supabase } from '../lib/supabase';

// Enable debug mode
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth event:', event);
  console.log('Session:', session);
});
```

### Test Queries Directly

Add a test function to verify data access:

```typescript
async function testDataAccess(projectId: string) {
  console.log('Testing data access...');

  const { data: quotes, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('project_id', projectId);

  console.log('Direct query result:', { quotes, error });
  return quotes;
}
```

## Contact Support

If issues persist after following this guide:
1. Provide console logs
2. Provide SQL query results
3. Specify which scenario above matches your situation
4. Include any error messages from the Network tab
