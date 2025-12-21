# Quote Deletion with Latest Flag Update

## Feature Implemented

When a quote is deleted in the "Review & Clean" page, the system now:
1. Removes it from the "Successfully Imported Quotes" section
2. Automatically marks the previously uploaded quote from the same supplier as the "Latest"

## Changes Made

### 1. ReviewClean.tsx - Enhanced deleteQuote Function

**Before:**
- Simply deleted the quote
- Did not update the `is_latest` flag
- Previous quotes remained unmarked

**After:**
- Fetches quote details before deletion (supplier_name, project_id, is_latest)
- If the deleted quote had `is_latest = true`:
  - Finds the previous quote from the same supplier in the same project
  - Updates that quote to set `is_latest = true`
- Then deletes the current quote
- Reloads the quotes list

**Logic Flow:**
```
1. Get quote details (supplier_name, project_id, is_latest)
2. If is_latest === true:
   - Query previous quote: same supplier + same project + different ID
   - Order by created_at DESC
   - Update previous quote: is_latest = true
3. Delete current quote
4. Refresh UI
```

### 2. ParsingJobMonitor.tsx - Updated Latest Badge Display

**Before:**
- Showed "Latest" badge only for the first item (index === 0)
- Did not use the `is_latest` flag from the database

**After:**
- Fetches `is_latest` flag from quotes table
- Maps the flag to parsing jobs
- Shows "Latest" badge only for jobs where `job.is_latest === true`
- Properly reflects database state

**Changes:**
- Added `is_latest?: boolean` to ParsingJob interface
- Updated query to fetch `is_latest` from quotes
- Created `quoteLatestMap` to track latest status
- Changed badge condition from `index === 0` to `job.is_latest`

## Benefits

✅ Accurate "Latest" badge display based on database state
✅ Proper quote version tracking after deletions
✅ Seamless user experience when managing quote revisions
✅ Maintains data integrity across quote lifecycle
✅ Works correctly for multiple suppliers in same project

## Testing Scenarios

1. **Delete latest quote with no previous quotes:**
   - Quote is deleted
   - No "Latest" badge shown for that supplier anymore

2. **Delete latest quote with previous quotes:**
   - Latest quote is deleted
   - Previous quote automatically gets "Latest" badge
   - Badge appears in "Successfully Imported Quotes" section

3. **Delete non-latest quote:**
   - Quote is deleted
   - Latest quote keeps its "Latest" badge
   - No changes to other quotes

4. **Multiple suppliers:**
   - Each supplier maintains its own "Latest" tracking
   - Deleting one supplier's quote doesn't affect others

## Database Structure

The feature relies on:
- `quotes.is_latest` (boolean) - Tracks which quote is the latest for each supplier
- `quotes.supplier_name` (text) - Groups quotes by supplier
- `quotes.project_id` (uuid) - Scopes quotes to projects
- `quotes.created_at` (timestamp) - Determines chronological order

## Status: ✅ Complete

Build passing. All functionality implemented and tested.
