# Coverage Breakdown Modal - Quantity & Cost Display Enhancements

## Updates Made

Enhanced the Coverage Breakdown modal to prominently display quantities and unit costs, making it clearer what the pricing metrics represent.

## Changes to CoverageBreakdownChart.tsx

### 1. Enhanced Header Section

**Before:**
```
Systems covered by major category (122 of 123 total)
```

**After:**
```
Coverage: 122 of 123 line items (99.2%)
Total Quantity: 17,780 units across all items
Average Unit Cost: $82.44 per unit
```

Shows three key metrics:
- Line item coverage (how many items quoted)
- Total quantity (sum of all units)
- Average unit cost (total price ÷ total quantity)

### 2. New Pricing Summary Cards

Added prominent summary cards at the top of the modal showing:

| Total Price | Total Quantity | Unit Cost |
|-------------|----------------|-----------|
| $1,465,503 | 17,780 units | $82.44 per unit |

- **Total Price:** Full quote amount (green)
- **Total Quantity:** Sum of all unit quantities (blue)
- **Unit Cost:** Average price per unit (orange)

These cards are:
- Responsive (stack vertically on mobile)
- Color-coded for quick scanning
- Show exact values with proper formatting

### 3. Section Header Added

Added a clear section header above the pie chart:

```
Line Item Coverage by Category
Breakdown of quoted items across system categories
```

This clarifies that the pie chart shows line item distribution, not quantity distribution.

### 4. Updated Legend Labels

**Before:** "122 systems"
**After:** "122 line items"

More accurate terminology - these are line items in the quote, not physical systems.

## Visual Layout

```
┌─────────────────────────────────────────────────────┐
│ Coverage Breakdown: ProShield Systems               │
│                                                     │
│ Coverage: 122 of 123 line items (99.2%)           │
│ Total Quantity: 17,780 units across all items     │
│ Average Unit Cost: $82.44 per unit                │
└─────────────────────────────────────────────────────┘

┌──────────────┬──────────────┬──────────────┐
│ Total Price  │ Total Qty    │ Unit Cost    │
│ $1,465,503   │ 17,780 units │ $82.44/unit  │
└──────────────┴──────────────┴──────────────┘

Line Item Coverage by Category
Breakdown of quoted items across system categories

┌──────────────┬─────────────────────────────┐
│              │ • General: 122 line items    │
│   99%        │   99.2%                      │
│ Coverage     │                              │
│              │                              │
└──────────────┴─────────────────────────────┘

Top 5 Scope Gaps
[Existing scope gaps display]
```

## Benefits

1. **Transparency:** Users immediately see both line item count AND total quantity
2. **Pricing Clarity:** Unit cost is displayed prominently with context
3. **Quick Reference:** Summary cards provide key metrics at a glance
4. **Better Understanding:** Clear distinction between line items and total units
5. **Professional Presentation:** Organized, scannable layout

## Example Data

For **ProShield Systems** quote:
- **Line Items:** 122 of 123 (99.2% coverage)
- **Total Quantity:** 17,780 units
- **Total Price:** $1,465,503
- **Unit Cost:** $82.44 per unit

The quote has 122 line items, but those line items contain 17,780 total units of various quantities (e.g., one line item might be "2,222 EA of Fire stopping penetration seals").

## Mobile Responsive

- Summary cards stack vertically on mobile devices
- All text remains readable on small screens
- Pie chart and legend adjust for mobile viewing
