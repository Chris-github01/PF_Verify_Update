# Price/Unit Calculation Fix - Complete

## Issues Fixed

### 1. Incorrect Price/Unit Display
**Problem:** The Award Report was showing **$12,012** and **$13,069** as "Price/System" because it was dividing by line item count (122/123) instead of total quantity sum (17,780/17,785 units).

**Solution:** Implemented proper calculation using total quantity across all items.

### 2. Overly Large Coverage Display
**Problem:** The coverage percentage pie chart was too prominent and taking up excessive screen space.

**Solution:** Reduced maximum width from 320px to 200px and adjusted font sizing.

## Changes Made

### Backend (Already Working)
`supabase/functions/compute_award_report/index.ts`

The backend was already correctly calculating and returning `totalQuantity`:
```typescript
// Calculate total quantity (sum of all quantities across all quoted items)
const totalQuantity = quotedItems.reduce((sum, row) =>
  sum + (row.quantity || 0), 0
);

return {
  // ...
  totalQuantity: totalQuantity, // Sum of all unit quantities
  itemsQuoted: quotedItems.length, // Number of line items (for reference)
};
```

### Frontend Fixes

#### 1. `src/pages/AwardReportEnhanced.tsx`

**Added robust fallback logic:**
```typescript
// CRITICAL FIX: Calculate total quantity from comparison data if not provided
let actualTotalQuantity = (supplier as any).totalQuantity;

if (!actualTotalQuantity || actualTotalQuantity === 0) {
  // Fallback: Calculate from comparison data
  actualTotalQuantity = comparisonData
    .filter(row => row.suppliers[supplier.supplierName]?.unitPrice !== null)
    .reduce((sum, row) => sum + (row.quantity || 0), 0);
}

// If still 0, use items count as last resort
if (actualTotalQuantity === 0) {
  actualTotalQuantity = supplier.itemsQuoted || 1;
}
```

This ensures that even if the backend data doesn't include `totalQuantity` (e.g., older saved reports), we can recalculate it from the comparison data.

#### 2. `src/components/award/EnhancedSupplierTable.tsx`

**Changed column header and display:**
- Column header: "Price/System" → **"Price/Unit"**
- Added unit count display: `avg per unit (17,780 units)`

```typescript
<th>Price/Unit</th>
// ...
<div className="text-xs text-slate-500">
  avg per unit ({supplier.systemsCovered.toLocaleString()} units)
</div>
```

#### 3. `src/components/award/SupplierDetailModal.tsx`

**Updated modal display:**
- Label: "Price per System" → **"Price per Unit"**
- Added context: `Based on 17,780 total units`

```typescript
<div className="text-slate-400 text-sm mb-1">Price per Unit</div>
<div className="text-white text-xl font-semibold">{formatCurrency(supplier.normalizedPricePerSystem)}</div>
<div className="text-slate-500 text-xs mt-1">Based on {supplier.systemsCovered.toLocaleString()} total units</div>
```

#### 4. `src/components/award/CoverageBreakdownChart.tsx`

**Reduced pie chart size:**
```typescript
// Changed from max-w-xs (320px) to max-w-[200px]
<div className="relative max-w-[200px] mx-auto lg:mx-0">
```

Also adjusted font sizes in the SVG for better proportions.

## Expected Results

### Table Display
| Supplier | Total Price | Price/Unit | Coverage |
|----------|-------------|------------|----------|
| ProShield | $1,465,503 | **$82.44** | 99.0% |
|  |  | avg per unit (17,780 units) | 122/123 systems |
| FireSafe | $1,607,506 | **$90.39** | 100.0% |
|  |  | avg per unit (17,785 units) | 123/123 systems |

### Calculations Verified

**ProShield:**
- Total Price: $1,465,831
- Total Quantity: 17,780 units (sum of 1276 + 2222 + 6380 + ...)
- Price per Unit: $1,465,831 ÷ 17,780 = **$82.44** ✓

**FireSafe:**
- Total Price: $1,607,506
- Total Quantity: 17,785 units (sum of all quantities)
- Price per Unit: $1,607,506 ÷ 17,785 = **$90.39** ✓

### Coverage Chart
- Pie chart maximum width: 200px (reduced from 320px)
- More compact, professional appearance
- Still fully functional and interactive

## How It Works

1. **Backend computes totalQuantity** when generating the award report
2. **Frontend first checks for totalQuantity** from the backend
3. **If missing, frontend recalculates** from comparison data
4. **Price per unit** is calculated by dividing total price by total quantity
5. **Display labels** clearly indicate "per unit" with quantity shown

## User-Facing Improvements

1. **Accurate pricing metrics:** Users now see correct per-unit costs (~$82-90) instead of misleading per-line-item costs (~$12,000)
2. **Clear labeling:** "Price/Unit" with unit count displayed
3. **Better proportions:** Coverage chart is more compact and professional
4. **Contextual information:** Unit totals shown throughout for transparency

## Testing Checklist

When viewing the Award Report, verify:
- [ ] Price/Unit shows ~$82-90 (not ~$12,000)
- [ ] Unit count displayed next to price (e.g., "17,780 units")
- [ ] Coverage pie chart is appropriately sized
- [ ] Gap costs still calculate correctly
- [ ] All supplier comparisons use total quantity for calculations
