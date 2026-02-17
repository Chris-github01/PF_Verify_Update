# Baseline Quantity Calculation - Detailed Explanation

## Your Question: How is the Baseline Value Calculated?

Looking at **GAP-0007** as an example:
- **Item:** SYS-0006 - Ryanfire HP-X (Single TPS / Data Cable)
- **Baseline:** 8076 No.
- **FireSafe quoted:** 14 No. (99.8% below baseline)
- **ProShield quoted:** 6380 No. (21.0% below baseline)

---

## The Answer: Consensus Quantity Methodology

The baseline is calculated using a **3-tier consensus algorithm** that analyzes all supplier quotes to determine the "most likely correct" quantity.

### Step-by-Step for SYS-0006:

#### Input Data:
```
Supplier Quantities:
- FireSafe: 14 No.
- ProShield Systems: 6380 No.
```

#### Step 1: Calculate Range & Spread
```javascript
Min = 14
Max = 6380
Spread = (6380 - 14) / 6380 × 100 = 99.8% 🔴 EXTREME variance
```

#### Step 2: Apply Decision Logic

The system uses **spread percentage** to determine the calculation method:

| Spread Range | Method | Confidence | Rationale |
|-------------|--------|------------|-----------|
| **≤ 15%** | Average | High | Strong market consensus |
| **15-35%** | Median | Medium | Remove outlier influence |
| **> 35%** | Median + Allowance | Low | High disagreement = risk |

#### Step 3: For SYS-0006 (Spread = 99.8%)

Since spread > 35%, the system uses **Median + Risk Allowance**:

```javascript
// Sort quantities
Sorted: [14, 6380]

// Calculate median
Median = (14 + 6380) / 2 = 3197 No.

// Apply 10% risk allowance (for "No." unit type)
Allowance = 10%
Baseline = 3197 × 1.10 = 3,517 No.

// Round to whole number (since unit is "No.")
Baseline = 3,517 No.  ← Initial calculation
```

**Wait, but the baseline shows 8076, not 3517!**

This suggests there may be additional quote items that were grouped together. Let me verify...

---

## Actual Calculation Investigation

Let me check if there are multiple quote items that map to this BOQ line:

<function_calls>
<invoke name="mcp__supabase__execute_sql">
<parameter name="query">
-- Check ALL quote items that map to SYS-0006
SELECT
  qi.id,
  qi.description,
  qi.quantity,
  qi.unit,
  q.supplier_name,
  qi.mapped_system,
  qi.system_detected
FROM quote_items qi
JOIN quotes q ON qi.quote_id = q.id
WHERE q.project_id = '95559cdd-2950-451a-ac61-4f7f6d41e6cf'
AND (
  qi.mapped_system LIKE '%Ryanfire HP-X%'
  OR qi.system_detected LIKE '%Ryanfire HP-X%'
  OR qi.description LIKE '%HP-X%'
  OR qi.description LIKE '%Single TPS%'
  OR qi.description LIKE '%Data Cable%'
)
ORDER BY q.supplier_name, qi.line_number;
