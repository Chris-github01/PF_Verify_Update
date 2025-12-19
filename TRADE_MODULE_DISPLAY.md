# Trade-Specific Module Display Implementation

## Overview
Added dynamic trade-specific module badges that display at the top of the application, showing which specialized module the user is currently working with.

## What Was Implemented

### 1. Database Schema Update
**Migration:** `20251219211804_add_trade_to_projects`

- Added `trade` column to the `projects` table
- Defaults to `'passive_fire'` for all projects
- Supports multiple trade types:
  - `passive_fire` - Passive Fire Protection
  - `electrical` - Electrical Systems
  - `plumbing` - Plumbing Systems
  - `hvac` - HVAC Systems
  - `mechanical` - Mechanical Systems
  - `general` - General Construction
- Added database index for efficient filtering
- All existing projects automatically set to `'passive_fire'`

### 2. Trade Module Badge Component
**File:** `src/components/TradeModuleBadge.tsx`

A new reusable component that displays:
- **Trade-Specific Module**: The specialized module name with appropriate icon and color
  - Example: "Verify+ Passive Fire" (orange theme with shield icon)
- **General Platform Module**: "VerifyTrade Quote Audit Engine" (blue theme with chart icon)

**Features:**
- Compact mode for narrow spaces (AppBar)
- Full mode for wider spaces (DashboardHeader)
- Color-coded by trade:
  - Passive Fire: Orange
  - Electrical: Yellow
  - Plumbing: Blue
  - HVAC: Cyan
  - Mechanical: Gray
  - General: Slate
- Unique icon for each trade

### 3. UI Integration

#### AppBar (Main Navigation)
- Displays compact trade badge between Organization and Project selectors
- Only visible on extra-large screens (xl breakpoint)
- Automatically updates when switching projects
- Shows single badge with trade-specific module name

#### DashboardHeader (Alternative Header)
- Displays full trade badge with both modules
- Shows: Trade Module + General Platform Module
- Separated by visual divider
- Visible on large screens and up (lg breakpoint)

## How It Works

1. **On Page Load:**
   - When a project is selected, the system queries the project's `trade` field
   - The `TradeModuleBadge` component receives the trade value
   - Appropriate module names, colors, and icons are displayed

2. **On Project Switch:**
   - When user switches to a different project
   - The trade information is reloaded from the database
   - The badge automatically updates to show the new project's trade
   - This happens seamlessly without page refresh

3. **Dynamic Trade Support:**
   - When new trades (Electrical, HVAC, etc.) go live:
   - Simply update the project's `trade` field in the database
   - The UI automatically displays the correct module badge
   - No code changes required

## Module Display Examples

### Current (Passive Fire):
```
Organization: [Demo Org] → [Verify+ Passive Fire] → [Project Name]
                           [VerifyTrade Quote Audit Engine]
```

### Future (Electrical):
```
Organization: [Demo Org] → [Verify+ Electrical] → [Project Name]
                           [VerifyTrade Quote Audit Engine]
```

## Visual Design

### Compact Mode (AppBar):
- Single pill-shaped badge
- Icon + Module name
- Color-coded border and background
- Minimal spacing

### Full Mode (DashboardHeader):
- Two connected badges
- Trade-specific module (left)
- Plus sign separator
- General platform module (right)
- Both with appropriate theming

## Benefits

1. **Clear Visual Identity**: Users immediately know which trade-specific module they're using
2. **Scalable**: Easy to add new trades without code changes
3. **Responsive**: Adapts to different screen sizes
4. **Automatic**: Updates dynamically when switching projects
5. **Future-Proof**: Ready for Electrical, HVAC, Plumbing, and other trades

## Technical Details

### State Management:
- Trade information stored in `currentProjectTrade` state
- Loaded via `loadCurrentProjectTrade()` function
- Automatically updates on `currentProjectId` change

### Database Query:
```typescript
const { data } = await supabase
  .from('projects')
  .select('trade')
  .eq('id', currentProjectId)
  .maybeSingle();
```

### Responsive Display:
- AppBar: `hidden xl:flex` (only on extra-large screens)
- DashboardHeader: `hidden lg:flex` (only on large+ screens)

## Next Steps

When new trades go live:

1. **Backend**: No changes needed (already supported)
2. **Database**: Simply set `trade` field on projects:
   ```sql
   UPDATE projects
   SET trade = 'electrical'
   WHERE id = 'project-uuid';
   ```
3. **Frontend**: Automatically displays correct badge
4. **Customization**: All trade configs already defined in `TradeModuleBadge.tsx`

## Testing

All 8 existing projects now have `trade = 'passive_fire'` and will display:
- **Verify+ Passive Fire** (orange shield icon)
- **VerifyTrade Quote Audit Engine** (blue chart icon)

The system is ready for multi-trade support.
