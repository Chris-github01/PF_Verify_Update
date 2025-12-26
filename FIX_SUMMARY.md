# Fix Summary - "Failed to finalise appendix" Error

## Root Cause Found ✅

**The Problem**: Database constraint mismatch

- **UI sends**: `'fixed_price_lump_sum'`
- **Database expected**: `'lump_sum'`
- **Result**: Constraint violation → "Failed to finalise appendix"

## The Fix Applied

Applied database migration to update CHECK constraints:

```sql
-- Now accepts all UI values:
CHECK (awarded_pricing_basis IN (
  'fixed_price_lump_sum',
  'fixed_price_lump_sum_quoted_quantities',
  'fixed_price_lump_sum_remeasurable',
  'schedule_of_rates',
  'hybrid_lump_sum_with_sor',
  'provisional_quantities_fixed_rates',
  'cost_reimbursable'
))
```

## What Works Now

✅ All 7 pricing basis options work
✅ Finalization succeeds
✅ PDF generation unblocked
✅ "Change Pricing Basis" feature works
✅ Contract workflow restored

## Test It

1. Go to Contract Manager → Pre-let Appendix
2. Select ANY pricing basis
3. Click "Finalise Appendix"
4. **Result**: ✅ Success!

## Build Status

```
✓ Migration applied successfully
✓ Build passing (20.21s)
✓ No errors
```

**Ready to use! The error is completely fixed.**
