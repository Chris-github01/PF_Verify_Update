# Trade Isolation Verification Guide

## Overview

This document explains how trade isolation is implemented in the VerifyTrade multi-module system and how to verify it's working correctly.

## Database Architecture

### Trade Isolation Strategy

The system uses **hierarchical isolation** where data is isolated through the project-trade relationship:

```
Trade (passive_fire, electrical, hvac, plumbing, active_fire)
    ↓
Projects (filtered by trade)
    ↓
Quotes (filtered by project_id → inherits trade isolation)
    ↓
Quote Items (filtered by quote_id → inherits trade isolation)
    ↓
All Related Data (inherits through relationships)
```

### Key Tables and Fields

#### 1. Projects Table
```sql
projects (
  id uuid PRIMARY KEY,
  organisation_id uuid REFERENCES organisations,
  name text,
  trade text NOT NULL DEFAULT 'passive_fire',
  ...
)
```

**Trade Isolation**: Projects are tagged with a `trade` field and filtered by the current trade in all queries.

#### 2. Quotes Table
```sql
quotes (
  id uuid PRIMARY KEY,
  project_id uuid REFERENCES projects,
  supplier_name text,
  ...
)
```

**Trade Isolation**: Quotes are filtered by `project_id`. Since projects are filtered by trade, quotes inherit trade isolation automatically.

#### 3. Quote Items Table
```sql
quote_items (
  id uuid PRIMARY KEY,
  quote_id uuid REFERENCES quotes,
  description text,
  ...
)
```

**Trade Isolation**: Quote items are filtered by `quote_id`. Since quotes are filtered by project (which is filtered by trade), items inherit trade isolation automatically.

## Implementation Details

### 1. Trade Context (`src/lib/tradeContext.tsx`)

The Trade Context manages the currently selected trade across the entire application:

```typescript
const { currentTrade, setCurrentTrade } = useTrade();
// currentTrade: 'passive_fire' | 'electrical' | 'hvac' | 'plumbing' | 'active_fire'
```

**Key Features**:
- Tracks selected trade in state
- Persists selection to database (`user_preferences.selected_trade`)
- Triggers page reload when trade changes to ensure clean state
- Provides helper functions to get trade display information

### 2. Project Filtering (`src/App.tsx`)

Projects are automatically filtered by the current trade:

```typescript
const { data: projects } = await supabase
  .from('projects')
  .select('*')
  .eq('organisation_id', currentOrganisation.id)
  .eq('trade', currentTrade)  // ← Trade filtering happens here
  .order('updated_at', { ascending: false });
```

**Result**: Only projects for the selected trade are visible.

### 3. Project Creation (`src/App.tsx`)

New projects are automatically tagged with the current trade:

```typescript
const { data: project } = await supabase
  .from('projects')
  .insert({
    organisation_id: currentOrganisation.id,
    name,
    trade: currentTrade,  // ← Trade is set automatically
    ...
  });
```

**Result**: All new projects belong to the current trade module.

### 4. Quote Isolation (Automatic via Project)

Quotes are always filtered by `project_id`, which means they're automatically isolated by trade:

```typescript
// Example from ImportQuotes.tsx
const { data: quotes } = await supabase
  .from('quotes')
  .select('*')
  .eq('project_id', projectId);  // ← Project already filtered by trade
```

**Result**: Quotes only appear for projects in the current trade.

### 5. Admin Center - Global PDF Vault

The admin center can view quotes across all projects, but with trade filtering:

```typescript
// In GlobalPDFVault.tsx
const filteredQuotes = quotes.filter(quote => {
  if (tradeFilter !== 'all' && quote.trade_type !== tradeFilter) {
    return false;  // ← Trade filtering
  }
  return true;
});
```

**Database Function** (`get_admin_quotes`):
```sql
SELECT
  q.id,
  q.supplier_name,
  p.trade,  -- ← Trade comes from project
  ...
FROM quotes q
LEFT JOIN projects p ON q.project_id = p.id
```

**Result**: Admins can filter and view quotes by trade across all organizations.

## Verification Checklist

### Test 1: Project Isolation

**Steps**:
1. Select "Verify+ Electrical" trade
2. Create a project named "Electrical Test Project"
3. Switch to "Verify+ HVAC" trade
4. Verify "Electrical Test Project" is NOT visible
5. Create a project named "HVAC Test Project"
6. Verify only "HVAC Test Project" is visible
7. Switch back to "Verify+ Electrical"
8. Verify only "Electrical Test Project" is visible

**Expected Result**: ✅ Projects are completely isolated by trade

### Test 2: Quote Isolation

**Steps**:
1. Select "Verify+ Passive Fire" trade
2. Create a project
3. Import a quote into the project
4. Verify the quote is visible
5. Switch to "Verify+ Electrical" trade
6. Verify the Passive Fire quote is NOT visible anywhere
7. Import a quote into an Electrical project
8. Verify only the Electrical quote is visible
9. Switch back to "Verify+ Passive Fire"
10. Verify only the Passive Fire quote is visible

**Expected Result**: ✅ Quotes are completely isolated by trade

### Test 3: Quote Items Isolation

**Steps**:
1. Select any trade
2. Create a project and import quotes with items
3. View quote items in Review & Clean page
4. Note the number of items
5. Switch to a different trade
6. Verify the previous trade's items are NOT visible
7. Import quotes in the new trade
8. Verify only items from the current trade are visible

**Expected Result**: ✅ Quote items are completely isolated by trade

### Test 4: Report Isolation

**Steps**:
1. Select "Verify+ HVAC" trade
2. Create a project with quotes
3. Generate an award report
4. Note the report data
5. Switch to "Verify+ Plumbing" trade
6. Verify the HVAC report is NOT accessible
7. Generate a report for a Plumbing project
8. Verify only Plumbing data is in the report

**Expected Result**: ✅ Reports are completely isolated by trade

### Test 5: Admin Center Vault

**Steps** (requires admin access):
1. Go to Admin Center → Global PDF Vault
2. Select "All Trades" in the filter
3. Verify you see quotes from multiple trades
4. Select "Passive Fire" in the filter
5. Verify only Passive Fire quotes are visible
6. Select "Electrical" in the filter
7. Verify only Electrical quotes are visible
8. Verify trade badges show correct colors and icons

**Expected Result**: ✅ Admin vault correctly filters by trade

### Test 6: Search and Analysis Isolation

**Steps**:
1. Select "Verify+ Passive Fire" trade
2. Go to Quote Intelligence page
3. Note the analysis results
4. Switch to "Verify+ Active Fire" trade
5. Go to Quote Intelligence page
6. Verify the analysis is empty or shows different data
7. Verify no Passive Fire data appears in Active Fire analysis

**Expected Result**: ✅ AI analysis and insights are isolated by trade

## Data Flow Diagram

```
User Login
    ↓
Select Trade Module (saved to user_preferences)
    ↓
Trade Context Initialized
    ↓
[User Creates Project] → Project tagged with current trade
    ↓
[User Imports Quotes] → Quotes linked to project
    ↓
[System Loads Data] → Only current trade's projects shown
    ↓
[User Switches Trade] → Page reloads
    ↓
Different Trade Context
    ↓
Different Projects Shown
    ↓
No Cross-Contamination
```

## Query Patterns for Developers

### ✅ Correct: Filtering by Project

```typescript
// Good - Uses project filter
const { data: quotes } = await supabase
  .from('quotes')
  .select('*')
  .eq('project_id', projectId);
```

### ✅ Correct: Filtering Projects by Trade

```typescript
// Good - Filters projects by trade
const { data: projects } = await supabase
  .from('projects')
  .select('*')
  .eq('organisation_id', orgId)
  .eq('trade', currentTrade);
```

### ❌ Incorrect: No Project Filter

```typescript
// Bad - Missing project filter
const { data: allQuotes } = await supabase
  .from('quotes')
  .select('*')
  .eq('organisation_id', orgId);
// This would show quotes from ALL trades!
```

### ❌ Incorrect: Hardcoded Trade

```typescript
// Bad - Hardcoded trade value
const { data: projects } = await supabase
  .from('projects')
  .select('*')
  .eq('trade', 'passive_fire');
// Should use currentTrade instead
```

## Common Pitfalls

### 1. Forgetting to Use Trade Context

**Problem**: Code doesn't import or use `useTrade()` hook

**Solution**:
```typescript
import { useTrade } from '../lib/tradeContext';

function MyComponent() {
  const { currentTrade } = useTrade();
  // Use currentTrade in queries
}
```

### 2. Direct Database Queries Without Project Filter

**Problem**: Querying quotes directly without filtering by project

**Solution**: Always filter by project_id, which inherits trade isolation

### 3. Cached State After Trade Switch

**Problem**: Component state not clearing when trade changes

**Solution**: The page automatically reloads on trade switch to prevent this

### 4. Admin Queries Missing Trade Information

**Problem**: Admin functions not including trade field

**Solution**: Join with projects table to get trade information

## Database Migration for Trade Support

If adding a new table that needs trade isolation:

```sql
-- Example: Adding a new table
CREATE TABLE my_new_table (
  id uuid PRIMARY KEY,
  project_id uuid REFERENCES projects NOT NULL,  -- ← Link to project
  ...
);

-- Data is now isolated through project relationship
-- No need for explicit trade column!
```

## Monitoring Trade Isolation

### SQL Query to Verify Trade Distribution

```sql
-- Count projects per trade
SELECT
  trade,
  COUNT(*) as project_count
FROM projects
GROUP BY trade
ORDER BY trade;

-- Count quotes per trade (through project)
SELECT
  p.trade,
  COUNT(q.id) as quote_count
FROM quotes q
JOIN projects p ON q.project_id = p.id
GROUP BY p.trade
ORDER BY p.trade;
```

### Checking User Preferences

```sql
-- See what trade each user has selected
SELECT
  up.user_id,
  up.selected_trade,
  up.last_organisation_id
FROM user_preferences up
WHERE up.selected_trade IS NOT NULL;
```

## Troubleshooting

### Issue: Seeing data from wrong trade

**Check**:
1. Is `currentTrade` correct in Trade Context?
2. Are projects being filtered by `currentTrade`?
3. Did the page reload after switching trades?
4. Check browser console for errors

**Fix**: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### Issue: Can't create projects

**Check**:
1. Is Trade Context initialized?
2. Is `currentTrade` available?
3. Check if there are database errors

**Fix**: Verify Trade Provider is in App component tree

### Issue: Admin vault not showing trade

**Check**:
1. Is `get_admin_quotes` function updated?
2. Does it return `trade` column?
3. Is the function joining with projects table?

**Fix**: Re-run migration `add_trade_to_admin_quotes_function_v2.sql`

## Summary

Trade isolation is achieved through:

1. **Projects** are tagged with `trade` and filtered by `currentTrade`
2. **Quotes** inherit isolation through `project_id` foreign key
3. **Quote Items** inherit isolation through `quote_id` foreign key
4. **All related data** inherits isolation through the relationship chain
5. **Page reload** on trade switch ensures clean state
6. **Admin functions** include trade information from projects

This creates a **fully isolated multi-module system** where each trade module operates as a standalone application with zero cross-contamination.
