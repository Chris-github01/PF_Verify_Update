# Copilot Data Access - Complete Fix & Diagnostic System

## Problem
The AI Copilot was showing "Context: Harbour Tower Commercial Fit-Out (0 quotes, 0 items)" when there were actually 2 quotes imported in the project.

## Root Causes Identified

### 1. `is_latest` Flag Not Set
- The `quotes` table has an `is_latest` boolean column that should mark the current version of each quote
- The copilot queries only fetch quotes with `is_latest = true`
- If this flag is not set during import, no quotes will appear

### 2. Row Level Security (RLS) Policies
- RLS policies on the `quotes` and `quote_items` tables use `check_project_access()` function
- If user is not properly authenticated or not a member of the project's organisation, queries will return empty

### 3. Silent Failures
- Previous implementation had minimal logging, making it hard to diagnose issues
- No feedback to users when data access fails

## Solutions Implemented

### 1. Enhanced Logging System

**File:** `src/lib/copilot/copilotDataProvider.ts`

Added comprehensive logging throughout the data fetching pipeline:

```typescript
console.log(`[Copilot] Fetching data for project ID: ${projectId}`);
console.log(`[Copilot] Current user:`, user?.id, user?.email);
console.log(`[Copilot] Project found: ${project.name} (org: ${project.organisation_id})`);
console.log(`Found ${quotes.length} quotes with is_latest=true`);
console.log(`Quote ${quote.supplier_name}: ${items?.length || 0} items`);
console.log(`[Copilot] Data summary: ${quotesWithItems.length} quotes, ${totalItems} total items`);
```

### 2. Fallback Query Logic

If no quotes are found with `is_latest = true`, the system now automatically falls back to fetching ALL quotes:

```typescript
if (!quotes || quotes.length === 0) {
  console.log('No quotes found with is_latest=true, trying without filter...');
  const { data: allQuotes, error: allQuotesError } = await supabase
    .from('quotes')
    .select('...')
    .eq('project_id', projectId);

  quotes = allQuotes;
}
```

### 3. Diagnostic Tool

**New Edge Function:** `supabase/functions/verify_copilot_data/index.ts`

A comprehensive diagnostic endpoint that checks:

1. **User Authentication** - Is the user logged in?
2. **Project Access** - Can the user access this project?
3. **Organisation Membership** - Is the user an active member?
4. **Quotes with is_latest** - How many quotes have the flag set?
5. **Total Quotes** - How many quotes exist in total?
6. **Service Role Count** - What does the database actually contain?
7. **RLS Function Test** - Does `check_project_access()` return true?
8. **Quote Items** - Can quote items be accessed?

Returns actionable recommendations based on findings.

### 4. UI Diagnostic Button

**File:** `src/components/CopilotDrawer.tsx`

Added a bug icon button (🐛) in the copilot header that runs diagnostics and displays results directly in the chat:

```
🔍 Diagnostics Results

Project: Harbour Tower Commercial Fit-Out
User: user@example.com
Membership: active

Quotes with is_latest=true: 2
Total quotes in project: 2
Service role sees: 2 quotes

Can access project: ✅ Yes

Everything looks good!
```

### 5. Enhanced AI Context

The AI copilot now receives much more detailed context:

- Complete project overview
- Workflow status with actionable insights
- Detailed quote summaries with totals
- Line items analysis with service types, systems, and categories
- Sample line items (first 10) with pricing details
- Award report summaries if available
- Clear messaging when data is missing vs when data exists but isn't visible

### 6. Better Error Handling

All data fetching operations now include detailed error logging:

```typescript
if (itemsError) {
  console.error(`Error fetching items for quote ${quote.id}:`, itemsError);
}
```

## How to Use

### Step 1: Check Browser Console

Open the Copilot drawer and look for logs:

```
[CopilotDrawer] Loading project data for: <project-id>
[Copilot] Fetching data for project ID: <project-id>
[Copilot] Current user: <user-id> user@example.com
[Copilot] Project found: Project Name (org: <org-id>)
Found 2 quotes with is_latest=true
Quote Supplier A: 145 items
Quote Supplier B: 132 items
[Copilot] Data summary: 2 quotes, 277 total items
```

### Step 2: Run Diagnostics

Click the bug icon (🐛) in the copilot header to run a comprehensive diagnostic check. Results will appear in the chat window.

### Step 3: Interpret Results

The diagnostic tool will show you:

- **If `is_latest` needs to be set:**
  ```
  Recommendations:
  - Quotes exist but is_latest flag is not set. Run: UPDATE quotes SET is_latest = true WHERE project_id = '<id>'
  ```

- **If there's a membership issue:**
  ```
  Recommendations:
  - User is not an active member of the project's organisation
  ```

- **If RLS is blocking access:**
  ```
  Recommendations:
  - check_project_access function returned false. Check RLS policies
  ```

### Step 4: Fix Issues

#### Fix 1: Set is_latest Flag

If the diagnostic shows quotes exist but `is_latest` is not set:

```sql
-- Set is_latest for all quotes in a project
UPDATE quotes
SET is_latest = true
WHERE project_id = 'your-project-id';
```

Or for projects using revision system:

```sql
-- Set is_latest only for the most recent revision of each supplier
WITH latest_quotes AS (
  SELECT DISTINCT ON (supplier_name)
    id
  FROM quotes
  WHERE project_id = 'your-project-id'
  ORDER BY supplier_name, revision_number DESC NULLS LAST, created_at DESC
)
UPDATE quotes
SET is_latest = CASE
  WHEN id IN (SELECT id FROM latest_quotes) THEN true
  ELSE false
END
WHERE project_id = 'your-project-id';
```

#### Fix 2: Check Organisation Membership

If user is not a member:

```sql
-- Check current membership
SELECT * FROM organisation_members
WHERE user_id = auth.uid();

-- If needed, add user to organisation (as admin)
INSERT INTO organisation_members (organisation_id, user_id, role, status)
VALUES ('org-id', 'user-id', 'member', 'active');
```

#### Fix 3: Verify Project Organisation

Make sure the project belongs to the right organisation:

```sql
SELECT p.id, p.name, p.organisation_id, o.name as org_name
FROM projects p
JOIN organisations o ON o.id = p.organisation_id
WHERE p.id = 'project-id';
```

### Step 5: Verify Fix

After making changes:
1. Refresh the page
2. Open the Copilot drawer
3. Check the context line shows the correct number of quotes and items
4. Run diagnostics again to confirm everything is working

## Testing Checklist

- [ ] Browser console shows detailed logs when opening copilot
- [ ] Copilot context line shows correct number of quotes and items
- [ ] Diagnostic button returns accurate results
- [ ] AI can answer questions about quote data
- [ ] Fallback query works when is_latest is not set
- [ ] Diagnostics provide actionable recommendations

## Common Scenarios

### Scenario 1: New Project with Imported Quotes

**Symptoms:**
- Quotes imported successfully
- Copilot shows "0 quotes, 0 items"

**Solution:**
The import process should set `is_latest = true` automatically. If not, run:
```sql
UPDATE quotes SET is_latest = true WHERE project_id = 'your-project-id';
```

### Scenario 2: Revised Quotes

**Symptoms:**
- Multiple versions of quotes exist
- Copilot shows old data or no data

**Solution:**
The trigger `update_quote_latest_flag()` should handle this automatically. If issues persist, manually set is_latest for the correct versions.

### Scenario 3: User Can't See Any Data

**Symptoms:**
- Diagnostic shows "User is not an active member"
- All queries return empty

**Solution:**
User needs to be added to the project's organisation with `status = 'active'`.

### Scenario 4: Data Visible in Database but Not in Copilot

**Symptoms:**
- Diagnostic shows service role sees quotes
- User queries return empty
- `check_project_access` returns false

**Solution:**
RLS policies are blocking access. Check that:
1. User is authenticated
2. User is active member of correct organisation
3. Project belongs to that organisation
4. RLS policies allow access

## Architecture

```
User Opens Copilot
       ↓
CopilotDrawer.loadProjectData()
       ↓
fetchProjectDataForCopilot(projectId)
       ↓
[Check User] → [Check Project] → [Check Membership]
       ↓
[Query Quotes with is_latest=true]
       ↓
[If empty, query all quotes]
       ↓
[For each quote, query quote_items]
       ↓
[Return CopilotProjectData]
       ↓
formatProjectDataForAI(data)
       ↓
[Send to LLM with system context]
       ↓
Display in Chat

Diagnostic Flow:
User Clicks Bug Icon
       ↓
runDiagnostics()
       ↓
verify_copilot_data Edge Function
       ↓
[Run 8 different checks]
       ↓
[Generate recommendations]
       ↓
Display results in chat
```

## Files Modified

1. **src/lib/copilot/copilotDataProvider.ts**
   - Added comprehensive logging
   - Added fallback query logic
   - Enhanced AI context formatting
   - Added user authentication check

2. **src/components/CopilotDrawer.tsx**
   - Added diagnostic button
   - Added runDiagnostics() function
   - Enhanced error logging

3. **supabase/functions/verify_copilot_data/index.ts** (NEW)
   - Complete diagnostic edge function
   - Checks authentication, access, RLS, and data
   - Provides actionable recommendations

4. **COPILOT_DEBUG_GUIDE.md** (UPDATED)
   - Comprehensive troubleshooting guide
   - SQL queries for fixing common issues
   - Step-by-step diagnostic instructions

## Future Enhancements

1. **Auto-fix Function**: Add a "Fix" button that automatically sets is_latest flags
2. **Real-time Monitoring**: Add webhook to detect when quotes are imported without is_latest
3. **Admin Dashboard**: Show copilot health metrics across all projects
4. **Cache Layer**: Cache project data to reduce database queries
5. **Progressive Loading**: Load quotes first, then items asynchronously

## Support

If issues persist after following this guide:

1. Run diagnostics and copy the full output
2. Check browser console for all `[Copilot]` logs
3. Run the SQL queries in the guide to check database state
4. Verify RLS policies are correct
5. Check that the edge function is deployed: `verify_copilot_data`

## LLM Integration

The copilot uses:
- **Model**: GPT-4 Turbo Preview
- **Temperature**: 0.7
- **Max Tokens**: 1000
- **System Context**: Full project data, organisation context, and capability list
- **Conversation History**: All previous messages in the session

The LLM receives comprehensive context about:
- Project details (name, client, reference, trade, status)
- All quotes with pricing and item counts
- Detailed line item analysis (services, systems, categories)
- Sample line items with pricing
- Award report summaries
- Workflow progress
- Copilot capabilities

This enables the AI to:
- Answer specific questions about quotes and pricing
- Compare suppliers
- Identify coverage gaps
- Recommend next steps
- Navigate to relevant sections
- Troubleshoot issues
- Provide insights and analysis

## Conclusion

The copilot now has:
✅ Comprehensive logging for troubleshooting
✅ Fallback queries to handle missing is_latest flags
✅ Built-in diagnostic tool accessible from UI
✅ Enhanced AI context with detailed project data
✅ Better error handling and user feedback
✅ Clear recommendations when issues are detected

This makes it much easier to diagnose and fix data access issues, and ensures the AI copilot always has access to the project data it needs to assist users effectively.
