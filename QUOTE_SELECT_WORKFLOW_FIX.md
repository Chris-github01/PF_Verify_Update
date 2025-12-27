# Quote Select Workflow Fix - Complete

## Problem Identified
The Quote Select workflow step was not updating to "completed" (green) status when users selected quotes and clicked "Continue to Review & Clean". The workflow tracking was broken.

## Root Causes Found

### 1. Missing 'select' Step Handler
**File:** `src/pages/NewProjectDashboard.tsx`
- The `updateStepStatuses()` function was missing a case for the 'select' workflow step
- It handled 'import', 'review', 'matrix', 'intelligence', and 'reports' but skipped 'select'
- This caused the Quote Select step to never show as completed

### 2. Missing Selected Quote Count Tracking
**Files:**
- `src/pages/NewProjectDashboard.tsx`
- `src/pages/ProjectDashboard.tsx`

The dashboards were loading quotes but not tracking the `selectedQuoteCount`:
- Added `selectedQuoteCount` to ProjectStats interface
- Added `hasSelectedQuotes` boolean flag
- Now queries `is_selected` field from quotes table

### 3. Dashboard Not Refreshing on Navigation
When users navigated from Quote Select → Review & Clean or back to Dashboard, the workflow status didn't update because the dashboard wasn't reloading.

## Solutions Implemented

### ✅ Fix 1: Added 'select' Step to Workflow Logic
**File:** `src/pages/NewProjectDashboard.tsx` (lines 221-224)

```typescript
case 'select':
  // Completed if quotes have been selected
  status = projectStats.hasSelectedQuotes ? 'completed' : projectStats.hasQuotes ? 'in_progress' : 'not_started';
  break;
```

### ✅ Fix 2: Track Selected Quotes
**File:** `src/pages/NewProjectDashboard.tsx`

Added to ProjectStats:
```typescript
interface ProjectStats {
  quoteCount: number;
  selectedQuoteCount: number;  // NEW
  ...
  hasSelectedQuotes: boolean;  // NEW
}
```

Load selected quotes:
```typescript
const selectedQuoteCount = quotes?.filter(q => q.is_selected).length || 0;
...
hasSelectedQuotes: selectedQuoteCount > 0,
```

### ✅ Fix 3: Auto-Refresh Dashboards
**Files:**
- `src/pages/NewProjectDashboard.tsx`
- `src/pages/ProjectDashboard.tsx`

Added multiple refresh mechanisms:

1. **Visibility Change Listener** - Reloads when page becomes visible
```typescript
useEffect(() => {
  const handleVisibilityChange = () => {
    if (!document.hidden && projectId) {
      console.log('[Dashboard] Page visible, reloading...');
      loadProjectData();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [projectId]);
```

2. **Custom Refresh Event** - Manual trigger from navigation
```typescript
useEffect(() => {
  const handleRefresh = () => {
    console.log('[Dashboard] Manual refresh triggered');
    loadProjectData();
  };
  window.addEventListener('refresh-dashboard', handleRefresh);
  return () => window.removeEventListener('refresh-dashboard', handleRefresh);
}, [projectId]);
```

### ✅ Fix 4: Trigger Refresh on Navigation
**Files:**
- `src/pages/QuoteSelect.tsx`
- `src/components/WorkflowNav.tsx`

Added refresh triggers to navigation buttons:

**Quote Select "Continue" Button:**
```typescript
onClick={() => {
  // Trigger dashboard refresh when navigating
  window.dispatchEvent(new Event('refresh-dashboard'));
  onNavigateNext();
}}
```

**WorkflowNav Back Button:**
```typescript
onClick={() => {
  // Trigger dashboard refresh when navigating back
  window.dispatchEvent(new Event('refresh-dashboard'));
  handleBack();
}}
```

## Workflow Status Logic

The workflow now properly tracks these states:

| Step | Not Started | In Progress | Completed |
|------|------------|-------------|-----------|
| **Import** | No quotes | - | Quotes imported |
| **Select** | No quotes | Quotes exist but none selected | Quotes selected (is_selected = true) |
| **Review** | No selected quotes | Selected quotes exist | Items reviewed/cleaned |
| **Matrix** | No reviewed items | Reviewed items exist | Systems mapped |
| **Intelligence** | No system mapping | System mapping exists | Analysis complete |
| **Reports** | No system mapping | System mapping exists | Reports generated |

## Testing Checklist

- [x] Build completes without errors
- [x] TypeScript types updated correctly
- [x] Dashboard tracks selected quotes
- [x] Quote Select step shows "in progress" when quotes imported
- [x] Quote Select step shows "completed" when quotes selected
- [x] Dashboard auto-refreshes when returning from Quote Select
- [x] WorkflowNav back button triggers refresh
- [x] Continue button triggers refresh and navigation

## Files Modified

1. `src/pages/NewProjectDashboard.tsx`
   - Added selectedQuoteCount tracking
   - Added 'select' case to updateStepStatuses
   - Added visibility change and refresh event listeners

2. `src/pages/ProjectDashboard.tsx`
   - Added selectedQuoteCount logging
   - Added visibility change and refresh event listeners

3. `src/pages/QuoteSelect.tsx`
   - Added refresh event dispatch to Continue button

4. `src/components/WorkflowNav.tsx`
   - Updated props to accept string currentStep
   - Added refresh event dispatch to Back button
   - Improved step display logic

## Result

✅ **The workflow now correctly:**
1. Tracks when quotes are selected
2. Updates the Quote Select step to green (completed) when quotes are selected
3. Auto-refreshes the dashboard when navigating between pages
4. Maintains proper workflow progression through all steps

## How It Works

**User Flow:**
1. User imports quotes → "Import" step turns green
2. User goes to Quote Select page
3. User selects quotes → Database updates `is_selected = true`
4. User clicks "Continue to Review & Clean"
5. Custom event `refresh-dashboard` fires
6. Dashboard listens and reloads stats
7. Dashboard detects `selectedQuoteCount > 0`
8. "Quote Select" step turns green ✅
9. Workflow progression is now accurate across all pages
