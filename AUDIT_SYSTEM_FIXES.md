# Audit System Diagnostic and Fixes

## Problem Summary
The Executive Dashboard was showing "No Data Available" despite Optimal Fire having 20 quotes in the system.

## Root Causes Identified

### 1. Quote Parse Status Issue
- **Problem**: All 14 latest quotes had `parse_status = 'pending'` despite having successfully parsed line items (1,221 total)
- **Impact**: The `calculate_quote_stats()` function only counted quotes with `parse_status = 'success'`, showing 0 success rate
- **Why**: Quotes were imported and line items created, but the parse_status field was never updated from 'pending' to 'success'

### 2. Missing Audit Records
- **Problem**: The `audits` table was completely empty for Optimal Fire organization
- **Impact**: All audit-related KPIs showed 0 (total audits, risk distribution, gap types)
- **Why**: Audits are created separately from quote imports and none had been generated yet

### 3. Dashboard Display Logic
- **Problem**: Dashboard didn't gracefully handle the scenario where quotes exist but audits don't
- **Impact**: Some UI elements tried to divide by zero or show NaN values
- **Why**: The original design assumed audits would always exist alongside quotes

## Fixes Applied

### Database Fixes

#### 1. Updated Existing Quotes (Immediate Fix)
```sql
UPDATE quotes
SET parse_status = 'success',
    parsed_at = COALESCE(parsed_at, updated_at)
WHERE organisation_id = '1133b7a9-811d-41b4-b34f-cad5f8f88ce9'
  AND line_item_count > 0
  AND parse_status = 'pending';
```
- Result: Updated 19 quotes to 'success' status

#### 2. Created Automation (Migration: `fix_quote_parse_status_automation`)
- Added trigger `trigger_auto_update_quote_parse_status` on `quote_items` table
- Automatically sets parent quote's `parse_status = 'success'` when line items are inserted
- Updates `line_item_count` dynamically
- Ensures all future quotes will have correct status

### Frontend Fixes

#### 1. Executive Dashboard (`src/pages/admin/ExecutiveDashboard.tsx`)

**Changes Made:**
- Updated "Avg Confidence" KPI to show 'N/A' when confidence is 0/null instead of trying to format
- Updated "Audits Completed" subtitle to show "No audits yet" when count is 0
- Added conditional rendering for Risk Distribution chart:
  - Shows chart when audits exist
  - Shows friendly empty state when no audits: "No audit risk data available yet"
- Added `Math.max()` to bar heights to ensure minimum 5% visibility even when values are 0

**Code Changes:**
```typescript
// Before
subtitle={`Avg ${Math.round(kpis.avgTimeToAudit / 60)}m per audit`}
value={`${kpis.avgParseConfidence.toFixed(1)}%`}
height: `${(kpis.riskDistribution.low / kpis.totalAuditsCompleted) * 100}%`

// After
subtitle={kpis.totalAuditsCompleted > 0 ? `Avg ${Math.round(kpis.avgTimeToAudit / 60)}m per audit` : 'No audits yet'}
value={kpis.avgParseConfidence > 0 ? `${kpis.avgParseConfidence.toFixed(1)}%` : 'N/A'}
height: `${Math.max((kpis.riskDistribution.low / kpis.totalAuditsCompleted) * 100, 5)}%`
```

## Current System State

### Optimal Fire Organization
- **ID**: `1133b7a9-811d-41b4-b34f-cad5f8f88ce9`
- **Total Quotes**: 14 (is_latest = true)
- **Parse Status**: All 14 now showing 'success'
- **Total Line Items**: 1,221
- **Success Rate**: 100%
- **Total Audits**: 0 (audits are created separately)

## Expected Dashboard Behavior Now

### What You Should See:
1. **Total Quotes**: 14
2. **Parse Success Rate**: 100.0%
3. **Total Line Items**: 1,221
4. **Audits Completed**: 0 with subtitle "No audits yet"
5. **Avg Confidence**: "N/A" (confidence field not populated on quote_items)
6. **Time Savings**: Calculated based on 14 quotes × 2.5 hours = 35 hours saved
7. **Risk Distribution**: Empty state message "No audit risk data available yet"
8. **Top Gap Types**: "No gap data available"
9. **Top Manufacturers**: "No manufacturer data available"

## Data Quality Notes

### Fields Not Populated
1. **quote_items.confidence**: All NULL - This affects the "Avg Confidence" KPI
2. **quote_items.manufacturer_detected**: All NULL - This affects "Top Manufacturers"
3. **audits table**: Empty - This affects all audit-related metrics

### To Populate These Fields
- **Confidence**: Requires running the AI extraction/confidence scoring process on quote items
- **Manufacturers**: Requires running manufacturer detection AI on item descriptions
- **Audits**: Created when users run the Scope Matrix or Award Report features

## Testing Verification

### Database Query Results
```sql
-- Before Fix
total_quotes: 14, success_quotes: 0, success_rate: 0.00%

-- After Fix
total_quotes: 14, success_quotes: 14, success_rate: 100.00%
```

### Expected RPC Call Results
```javascript
// calculate_quote_stats()
{
  total_quotes: 14,
  success_quotes: 14,
  success_rate: 100.00,
  total_line_items: 1221,
  avg_confidence: null,
  top_manufacturers: []
}

// calculate_audit_stats()
{
  total_audits: 0,
  avg_duration_seconds: null,
  avg_risk_score: null,
  avg_coverage_score: null,
  risk_distribution: { low: 0, medium: 0, high: 0, critical: 0 },
  top_gap_types: [],
  estimated_cost_avoided: 0
}
```

## Recommendations

### For Admin Users
1. The dashboard now correctly shows quote data even without audits
2. To see audit metrics, create audits by running analysis on projects with multiple quotes
3. The system will automatically track all audit events going forward

### For Development
1. Consider populating confidence and manufacturer fields during quote import
2. Add data validation to ensure parse_status stays in sync with line_item_count
3. Consider showing progress indicators for quotes being parsed vs. completed

## Files Modified
1. `src/pages/admin/ExecutiveDashboard.tsx` - UI improvements for zero-audit state
2. `supabase/migrations/fix_quote_parse_status_automation.sql` - Database trigger automation

## Database Objects Created
- Function: `auto_update_quote_parse_status()`
- Trigger: `trigger_auto_update_quote_parse_status` on `quote_items`
