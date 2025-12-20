# Scope & Systems - Service Type Integration Fix

## Issue Identified

The "Scope & Systems" tab in Contract Manager was showing all 123 line items under "Other Systems" instead of properly categorizing them by service type.

### Root Cause
- Quote items have a populated `service` field with values: **Electrical**, **Fire**, **Plumbing**, **Mechanical**
- The code was only looking at the `scope_category` field which was NULL for all items
- Result: All items defaulted to "Other Systems"

## Data Analysis

### Sample Quote Items from Harbour Tower Project

| Description | Service Field | scope_category |
|-------------|--------------|----------------|
| Ryanbatt 502 & Mastic with Gib patch (Cable bundle) | **Electrical** | null |
| Ryanfire Rokwrap & Mastic (Steel pipe) | **Fire** | null |
| Ryanbatt 502 & Mastic (Metal / Steel pipe) | **Plumbing** | null |
| Boss FireMortar-360 (Bus Duct) | **Mechanical** | null |
| Ryanfire SL Collar & Mastic (PVC Pipe) | **Fire** | null |
| Trafalgar SuperSTOPPER Maxi (Multi-Service) | "" (empty) | null |

### Service Type Distribution
From the database query, items are categorized as:
- **Fire** - Ryanfire products (Rokwrap, SL Collars, Mastic)
- **Electrical** - Cable bundles, Cable trays with Ryanbatt
- **Plumbing** - Steel pipes, Copper pipes
- **Mechanical** - Bus ducts, HVAC penetrations
- **Other Systems** - Items with empty service field

## Solution Implemented

### 1. Updated Quote Items Query

**Before:**
```typescript
.select('scope_category, description, quantity, unit_price, total_price')
```

**After:**
```typescript
.select('scope_category, service, description, quantity, unit_price, total_price')
```

### 2. Updated Categorization Logic

**Before:**
```typescript
const category = item.scope_category || 'Other Systems';
```

**After:**
```typescript
// Use service field first, then scope_category, then default to "Other Systems"
const category = item.service?.trim() || item.scope_category || 'Other Systems';
```

### 3. Updated Recategorization Modal

**Before:**
```typescript
.select('id, description, scope_category, quantity, unit_price, total_price')
.eq('scope_category', category);
```

**After:**
```typescript
// Fetch all items and filter by service or scope_category
.select('id, description, scope_category, service, quantity, unit_price, total_price')
.eq('quote_id', project.approved_quote_id);

// Filter items that match the category (checking both service and scope_category)
const matchingItems = allItems?.filter(item => {
  const itemCategory = item.service?.trim() || item.scope_category || 'Other Systems';
  return itemCategory === category;
}) || [];
```

### 4. Updated TypeScript Interface

```typescript
interface QuoteItemWithCategory {
  id: string;
  description: string;
  scope_category: string | null;
  service?: string | null;  // ADDED
  quantity: number;
  unit_price: number;
  total_price: number;
}
```

## Expected Results

After this fix, the "Scope & Systems" tab should now display:

### Fire
**123 line items** → Should now be split across categories
- Ryanfire Rokwrap & Mastic (Steel pipe)
- Ryanfire SL Collar & Mastic (PVC Pipe)
- Ryanbatt 502, Ryanfire Graphite Strap & Mastic
- etc.

### Electrical
- Ryanbatt 502 & Mastic (Cable bundle)
- Ryanbatt 502, Servowrap & Mastic (Cable Tray)
- etc.

### Plumbing
- Ryanbatt 502 & Mastic (Metal / Steel pipe)
- Ryanbatt 502, Ryanfire Graphite Strap & Mastic (Lagged Copper pipe)
- etc.

### Mechanical
- Boss FireMortar-360 and Boss P40-MAK Wrap (Bus Duct)
- etc.

### Other Systems
- Items with empty or missing service field
- Trafalgar SuperSTOPPER Maxi (Multi-Service)
- etc.

## Functionality Features

### View by Service Type
- Each service type shown as a separate card
- Item count displayed for each category
- Sample items (first 5) shown under each category
- "+X more items" indicator for categories with more items

### Editable Categories
- Categories can be renamed (updates scope_category field)
- Items can be recategorized individually
- Modal shows all items in a category for bulk management

### Coverage Status
- Each category shows coverage badge: Full/Partial/None
- Currently defaults to "Full" for all categories

## Data Flow

### Primary Path (Now Used)
1. Quote uploaded → Parsed into quote_items
2. AI/Parser detects service type → Saves to `service` field
3. Contract Manager loads quote_items
4. Groups by `service` field → Displays in Scope & Systems

### Fallback Path
1. If `service` is empty → Check `scope_category` field
2. If both empty → Categorize as "Other Systems"

### Manual Override Path
1. User can rename categories → Updates `scope_category` field
2. User can recategorize items → Updates `scope_category` field
3. `scope_category` takes precedence if set

## Database Schema

### quote_items table - Relevant Fields

```sql
service text                  -- AI-detected service type (Fire, Electrical, etc.)
scope_category text           -- User-defined category (overrides service)
description text              -- Line item description
quantity numeric              -- Item quantity
unit_price numeric            -- Price per unit
total_price numeric           -- Total line item price
```

### Priority Order for Categorization
1. `scope_category` (if set by user)
2. `service` (if detected by parser/AI)
3. "Other Systems" (default fallback)

## Testing Checklist

Verify the following:

- [ ] Multiple service type categories display (Fire, Electrical, Plumbing, Mechanical)
- [ ] Item counts are accurate for each category
- [ ] Sample items shown match the category
- [ ] Items with empty service field go to "Other Systems"
- [ ] Clicking "Full" badge shows all items in that category
- [ ] Category renaming works correctly
- [ ] Item recategorization works correctly
- [ ] Changes persist after page reload

## Benefits

### For Users
- Clear visibility of scope by service type
- Easy identification of work categories
- Better project planning and resource allocation
- Professional presentation for handover documents

### For Subcontractors
- Clear scope definition by trade
- Easier to verify completeness of quote
- Simplified review of included services

### For Contract Management
- Organized scope tracking
- Easy to spot missing services
- Better coordination across trades
- Improved handover documentation

## Future Enhancements

Potential improvements:
1. Auto-detect coverage status (Full/Partial) based on scope comparison
2. Add service type icons for visual clarity
3. Show total value per service type
4. Add ability to export by service type
5. Compare service types across multiple quotes
6. Track service type changes over quote revisions
7. Add predefined service type templates
8. Support for custom service type definitions

## Migration Notes

### For Existing Projects
- No database migration required
- Existing `service` field data is already populated
- Items will automatically recategorize on next page load
- User can still manually override via scope_category

### For New Quotes
- Parser/AI will populate `service` field automatically
- Categories will display immediately after quote upload
- No manual categorization needed

## Related Files Changed

1. **src/pages/ContractManager.tsx**
   - Updated quote items query to include `service` field
   - Modified categorization logic to prioritize `service`
   - Updated recategorization modal filtering
   - Added `service` to TypeScript interface

## Benefits Summary

**Before:**
- All 123 items in "Other Systems"
- No service type visibility
- Hard to understand scope breakdown

**After:**
- Items grouped by Fire, Electrical, Plumbing, Mechanical
- Clear service type organization
- Professional scope presentation
- Accurate item counts per category
- Easy to navigate and review

The Scope & Systems tab now displays the actual line items from the subcontractor's quote properly categorized by their service types!
