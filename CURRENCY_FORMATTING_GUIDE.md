# Currency Formatting Developer Guide

## Quick Reference

### ✅ Correct Pattern (Always Use This)

```typescript
// For displaying currency in components
const amount = 1200.32;
const formatted = new Intl.NumberFormat('en-NZ', {
  style: 'currency',
  currency: 'NZD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(amount);
// Output: "$1,200.32"
```

### ❌ Wrong Patterns (Never Use These)

```typescript
// ❌ DON'T: Missing decimal specification
amount.toLocaleString()  // May show "$1,200" instead of "$1,200.32"

// ❌ DON'T: No decimals
new Intl.NumberFormat('en-NZ', {
  style: 'currency',
  currency: 'NZD',
  minimumFractionDigits: 0,  // Wrong!
  maximumFractionDigits: 0,  // Wrong!
})

// ❌ DON'T: Simple string concatenation
`$${amount}`  // No formatting, no decimals

// ❌ DON'T: Only minimum without maximum
new Intl.NumberFormat('en-NZ', {
  style: 'currency',
  currency: 'NZD',
  minimumFractionDigits: 2,
  // Missing maximumFractionDigits!
})
```

---

## Standard Formatter Function

Use the existing `formatCurrency()` from `awardReportEnhancements.ts`:

```typescript
import { formatCurrency } from '@/lib/reports/awardReportEnhancements';

// In your component
const displayAmount = formatCurrency(1200.32);
// Output: "$1,200.32"
```

---

## Creating Local Formatters

If you need a local formatter in a component:

```typescript
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    minimumFractionDigits: 2,  // ✅ Always 2
    maximumFractionDigits: 2,  // ✅ Always 2
  }).format(amount);
};
```

For nullable amounts:

```typescript
const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return '-';
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};
```

---

## Excel/CSV Export Formatting

For Excel exports using ExcelJS:

```typescript
// Set cell number format
cell.numFmt = '$#,##0.00';  // ✅ Correct Excel format

// Example
rateCell.value = quote.unit_rate;
rateCell.numFmt = '$#,##0.00';
```

---

## PDF Generation Formatting

In PDF templates (HTML strings):

```typescript
// ✅ Correct
`<td>$${amount.toLocaleString('en-NZ', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}</td>`

// ❌ Wrong
`<td>$${amount.toLocaleString()}</td>`
```

---

## Database Storage

Always store monetary values as:

```sql
-- ✅ Correct: NUMERIC with precision
amount NUMERIC(12, 2)

-- ❌ Wrong: FLOAT (loses precision)
amount FLOAT
```

TypeScript types:

```typescript
interface Quote {
  total: number;  // Will be NUMERIC in DB
  unit_rate: number;  // Will be NUMERIC in DB
}
```

---

## Calculations

When calculating with monetary values:

```typescript
// ✅ Correct: Round to 2 decimals after calculation
const total = quantity * rate;
const roundedTotal = Math.round(total * 100) / 100;

// Or use toFixed and convert back
const roundedTotal = parseFloat((quantity * rate).toFixed(2));

// For variance percentages
const variance = ((left - right) / right) * 100;
const roundedVariance = parseFloat(variance.toFixed(2));
```

---

## Common Use Cases

### 1. Display in React Component

```tsx
function SupplierCard({ supplier }: { supplier: Supplier }) {
  return (
    <div>
      <h3>{supplier.name}</h3>
      <p>Total: {formatCurrency(supplier.total)}</p>
      <p>Unit Rate: {formatCurrency(supplier.unitRate)}</p>
    </div>
  );
}
```

### 2. Table Cell

```tsx
<td className="text-right">
  {formatCurrency(item.amount)}
</td>
```

### 3. Conditional Display

```tsx
{item.amount > 0 ? (
  <span className="text-green-600">
    {formatCurrency(item.amount)}
  </span>
) : (
  <span className="text-gray-400">-</span>
)}
```

### 4. Comparison Display

```tsx
<div>
  <span>Left: {formatCurrency(leftAmount)}</span>
  <span>Right: {formatCurrency(rightAmount)}</span>
  <span>Variance: {formatCurrency(Math.abs(leftAmount - rightAmount))}</span>
</div>
```

### 5. Summary Cards

```tsx
<div className="stat-card">
  <div className="stat-label">Total Contract Value</div>
  <div className="stat-value">{formatCurrency(totalValue)}</div>
</div>
```

---

## Testing Currency Display

### Manual Testing Checklist

Test with these values to verify formatting:

```typescript
const testValues = [
  0,           // Should show: $0.00
  0.01,        // Should show: $0.01
  0.1,         // Should show: $0.10
  1,           // Should show: $1.00
  10,          // Should show: $10.00
  100,         // Should show: $100.00
  1000,        // Should show: $1,000.00
  1234.56,     // Should show: $1,234.56
  1234567.89,  // Should show: $1,234,567.89
  999999999.99 // Should show: $999,999,999.99
];

testValues.forEach(value => {
  console.log(`${value} → ${formatCurrency(value)}`);
});
```

### Edge Cases

```typescript
// Fractional cents (should round)
formatCurrency(1.234)   // → "$1.23"
formatCurrency(1.235)   // → "$1.24" (banker's rounding)
formatCurrency(1.999)   // → "$2.00"

// Negative amounts
formatCurrency(-100.50) // → "-$100.50"

// Very large amounts
formatCurrency(1e10)    // → "$10,000,000,000.00"
```

---

## Debugging Currency Issues

### Issue: Showing no decimals

```typescript
// Check 1: Verify formatter configuration
console.log(new Intl.NumberFormat('en-NZ', {
  style: 'currency',
  currency: 'NZD',
  minimumFractionDigits: 2,  // Must be 2
  maximumFractionDigits: 2,  // Must be 2
}).format(1234.56));

// Should output: "$1,234.56"
```

### Issue: Inconsistent decimals

```typescript
// Check 2: Verify data type
console.log(typeof amount);  // Should be "number"
console.log(amount);          // Should be numeric value

// If string, convert first
const numericAmount = parseFloat(amount);
```

### Issue: Lost precision in calculations

```typescript
// Check 3: JavaScript floating point
const result = 0.1 + 0.2;
console.log(result);  // 0.30000000000000004 ⚠️

// Solution: Round after calculation
const rounded = Math.round(result * 100) / 100;
console.log(rounded);  // 0.3 ✅
```

---

## Migration Checklist

When adding new currency displays:

- [ ] Use `formatCurrency()` from awardReportEnhancements.ts
- [ ] If local formatter needed, include both min and max fraction digits
- [ ] Test with whole dollars and cents
- [ ] Verify in PDF exports
- [ ] Check Excel exports use `'$#,##0.00'` format
- [ ] Ensure database stores as NUMERIC(12, 2)
- [ ] Add null/undefined handling if needed
- [ ] Test negative amounts
- [ ] Verify thousand separators appear correctly

---

## Common Mistakes to Avoid

1. **Using `.toFixed()` for display**
   ```typescript
   // ❌ Wrong: toFixed returns string, no locale formatting
   `$${amount.toFixed(2)}`  // "$1234.56" (no comma)

   // ✅ Right: Use NumberFormat
   formatCurrency(amount)   // "$1,234.56" (with comma)
   ```

2. **Forgetting maximumFractionDigits**
   ```typescript
   // ❌ Wrong: May show more than 2 decimals
   new Intl.NumberFormat('en-NZ', {
     style: 'currency',
     currency: 'NZD',
     minimumFractionDigits: 2,
   })

   // ✅ Right: Limit to 2 decimals
   new Intl.NumberFormat('en-NZ', {
     style: 'currency',
     currency: 'NZD',
     minimumFractionDigits: 2,
     maximumFractionDigits: 2,
   })
   ```

3. **Calculating with formatted strings**
   ```typescript
   // ❌ Wrong: Can't calculate with formatted strings
   const formatted = formatCurrency(100);
   const result = formatted * 2;  // NaN!

   // ✅ Right: Calculate first, format last
   const result = 100 * 2;
   const formatted = formatCurrency(result);
   ```

4. **Inconsistent rounding**
   ```typescript
   // ❌ Wrong: Inconsistent precision
   const rate = 123.456;
   const qty = 10;
   const total = rate * qty;  // 1234.56 (lucky!)

   // ✅ Right: Always round
   const total = Math.round(rate * qty * 100) / 100;
   ```

---

## Quick Reference Table

| Scenario | Code | Output |
|----------|------|--------|
| Basic display | `formatCurrency(1234.56)` | `$1,234.56` |
| Zero | `formatCurrency(0)` | `$0.00` |
| Cents only | `formatCurrency(0.50)` | `$0.50` |
| Large amount | `formatCurrency(1000000)` | `$1,000,000.00` |
| Negative | `formatCurrency(-100)` | `-$100.00` |
| Excel cell | `cell.numFmt = '$#,##0.00'` | Excel format |
| Calculation | `Math.round(a * b * 100) / 100` | Rounded result |
| Nullable | Check null first, then format | `$X.XX` or `-` |

---

## Resources

- **MDN Intl.NumberFormat:** https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
- **Excel Number Formats:** https://support.microsoft.com/en-us/office/number-format-codes-5026bbd6-04bc-48cd-bf33-80f18b4eae68
- **Currency Formatting Best Practices:** CURRENCY_FORMATTING_FIXES_COMPLETE.md

---

**Last Updated:** December 27, 2025
**Standard:** All monetary values display with 2 decimal places
**Status:** Production Standard ✅
