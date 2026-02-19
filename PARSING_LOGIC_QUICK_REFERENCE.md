# Parsing Logic - Quick Reference

## The Golden Rule

**Document total (from PDF) is always the source of truth. Items are best-effort extraction. If they don't match, we add an explicit adjustment item.**

## How Parsing Works Now (3 Steps)

### Step 1: Extract Document Total (Deterministic)
```typescript
// Use regex to find the actual total in the PDF
"Grand Total (excluding GST): $1,608,077.50"
                              ^^^^^^^^^^^^^^^^ <- This is the truth
```

### Step 2: Extract Line Items (Best Effort)
- Use LLM + parsers to extract all line items
- Keep LS items UNLESS they're clearly summary duplicates
- Flag optional items instead of deleting them
- Preserve all legitimate work items

### Step 3: Reconcile (Make Totals Match)
```typescript
if (document_total !== sum(items)) {
  // Add adjustment item for the difference
  items.push({
    description: "Unparsed remainder (auto-adjustment)",
    total: difference
  })
}
```

## Decision Trees

### Should I Keep This LS Item?

```
Is it LS/LUMP SUM?
  ↓ YES
  Does description contain "Total", "Subtotal", "P&G", "Summary"?
    ↓ YES → DELETE (it's a summary)
    ↓ NO
    Does it look like "Electrical $12,345"?
      ↓ YES → DELETE (section header)
      ↓ NO
      Does LS total ≈ sum(itemized items) within 2%?
        ↓ YES → DELETE (roll-up duplicate)
        ↓ NO → KEEP (legitimate LS work)
```

### Should I Include Optional Items?

```
Do we have optional items?
  ↓ YES
  Is document total available?
    ↓ YES
    Which is closer?
      |sum(base)| vs |sum(base + optional)|
      ↓ sum(base + optional) is closer
      INCLUDE optional items
    ↓ NO
    Use LLM total as fallback
  ↓ NO
  Use base items only
```

## What Gets Stored

### In `quotes` table:
```typescript
{
  total_amount: 1608077.50,              // Final total (source of truth)
  quoted_total: 1608077.50,              // Same as total_amount
  document_total_excl_gst: 1608077.50,   // From PDF regex (NEW)
  items_total: 1605123.45,               // Sum of line items (NEW)
  reconciliation_applied: true,          // Did we add adjustment? (NEW)
  has_adjustment_item: true,             // Explicit remainder item (NEW)
  optional_items_included: false,        // Are optionals in total? (NEW)
  contingency_amount: 0                  // User-defined only (not auto)
}
```

### In `quote_items` table:
```typescript
{
  description: "Fire stopping to penetrations",
  quantity: 145,
  unit: "ea",
  unit_price: 35.50,
  total_price: 5147.50,
  metadata: {
    is_optional: false,      // Flagged, not deleted (NEW)
    is_adjustment: false,    // Auto-adjustment item (NEW)
    section: "Electrical"    // From chunking
  }
}
```

## Red Flags to Monitor

### High Reconciliation Rate
```sql
-- If > 20% of quotes need reconciliation, investigate
SELECT
  COUNT(*) FILTER (WHERE reconciliation_applied) * 100.0 / COUNT(*) as reconciliation_rate
FROM quotes
WHERE created_at > NOW() - INTERVAL '7 days';
```

### Large Adjustment Items
```sql
-- Find quotes with adjustment > 5% of total
SELECT
  q.supplier_name,
  q.document_total_excl_gst,
  q.items_total,
  q.document_total_excl_gst - q.items_total as adjustment,
  (q.document_total_excl_gst - q.items_total) / q.document_total_excl_gst * 100 as adjustment_pct
FROM quotes q
WHERE q.has_adjustment_item = true
  AND ABS(q.document_total_excl_gst - q.items_total) / q.document_total_excl_gst > 0.05
ORDER BY adjustment_pct DESC;
```

## Common Scenarios

### Scenario 1: Quote with Summary Page + Detail Schedule
**PDF Structure:**
```
Page 1: Summary
- Electrical LS $50,000

Page 2: Detail
- Fire stopping 100 ea @ $350 = $35,000
- Penetrations 50 ea @ $300 = $15,000
Total: $50,000
```

**Old Logic:** Deleted detail, kept LS → **Lost $50k detail**
**New Logic:** Detects LS = sum(detail), deletes LS, keeps detail → **Correct**

### Scenario 2: Quote with Optional Extras
**PDF Structure:**
```
Base Scope: $100,000
Optional Extras: $20,000
Grand Total (excluding GST): $120,000
```

**Old Logic:** Deleted optional → **Shows $100k (wrong)**
**New Logic:** Checks which matches $120k, includes optional → **Correct**

### Scenario 3: Quote with Missed Items
**PDF Structure:**
```
Grand Total: $200,000
Parsed Items: $195,000 (missed some complex tables)
```

**Old Logic:** Shows $195k, silently wrong
**New Logic:** Shows $200k with "$5,000 Unparsed remainder" → **Transparent**

## Debugging Parsing Issues

### Check Logs for:
```
"Document totals extracted: { grand_total_excl_gst: 1608077.50 }"
"LS filtering: keeping 3 of 5 LS items"
"Including optional items (closer match to document total)"
"RECONCILIATION: Adding adjustment item for remainder: 2954.05"
```

### SQL Queries:
```sql
-- Find quotes that needed reconciliation
SELECT * FROM quotes
WHERE reconciliation_applied = true
ORDER BY created_at DESC;

-- Check adjustment items
SELECT qi.*
FROM quote_items qi
WHERE qi.metadata->>'is_adjustment' = 'true'
ORDER BY qi.created_at DESC;

-- Compare document vs items totals
SELECT
  supplier_name,
  document_total_excl_gst,
  items_total,
  document_total_excl_gst - items_total as difference
FROM quotes
WHERE document_total_excl_gst IS NOT NULL
  AND ABS(document_total_excl_gst - items_total) > 10
ORDER BY ABS(difference) DESC;
```

## Key Principles

1. **Never delete money silently** - If we can't parse it, add an adjustment item
2. **Document total is king** - Regex extraction beats LLM inference
3. **Make problems visible** - Use flags and adjustment items to expose issues
4. **Preserve context** - Keep optional/adjustment flags in metadata
5. **Trust but verify** - Always reconcile parsed items against document total

## Emergency Rollback

If parsing breaks completely:
```sql
-- Check recent quotes
SELECT
  COUNT(*) as total_quotes,
  COUNT(*) FILTER (WHERE has_adjustment_item) as with_adjustments,
  AVG(ABS(document_total_excl_gst - items_total)) as avg_difference
FROM quotes
WHERE created_at > NOW() - INTERVAL '1 hour';
```

If issues found, edge functions can be rolled back via Supabase dashboard.

---

**Remember:** The goal is transparency. We'd rather show "$5,000 unparsed remainder" than silently get the total wrong.
