# Quantity Logic: Before vs After

## Scenario 1: Perfect Agreement
**Suppliers quote exactly the same**

| Supplier | Quoted Qty |
|----------|-----------|
| FireSafe | 100 ea |
| ProShield | 100 ea |

**OLD LOGIC:**
- Method: MAX
- Result: 100 ea
- Confidence: Unknown

**NEW LOGIC:**
- Spread: 0%
- Method: Average
- Result: 100 ea
- Confidence: **High** ✅
- Explanation: "Strong market consensus (spread 0%)"

**Outcome:** Same result, but now with confidence score

---

## Scenario 2: Tight Agreement (Low Spread)
**Suppliers are close, within 15%**

| Supplier | Quoted Qty |
|----------|-----------|
| FireSafe | 100 ea |
| ProShield | 110 ea |
| SecureTech | 105 ea |

**OLD LOGIC:**
- Method: MAX
- Result: 110 ea
- Confidence: Unknown

**NEW LOGIC:**
- Spread: 9% (10/110)
- Method: Average
- Result: 105 ea
- Confidence: **High** ✅
- Explanation: "Strong market consensus (spread 9%)"

**Outcome:** Changed from 110 to 105 (more representative)

---

## Scenario 3: One Outlier (Medium Spread)
**One supplier significantly different**

| Supplier | Quoted Qty |
|----------|-----------|
| FireSafe | 100 ea |
| ProShield | 120 ea |
| SecureTech | 200 ea |

**OLD LOGIC:**
- Method: MAX
- Result: 200 ea
- Confidence: Unknown
- **Problem:** Takes the outlier!

**NEW LOGIC:**
- Spread: 50% (100/200)
- Method: **Median** (ignores outlier)
- Result: 120 ea
- Confidence: **Low** ❗
- Explanation: "High variation (spread 50%) - 10% allowance applied for scope interpretation risk"
- **With allowance:** 120 × 1.10 = 132 ea

**Outcome:** 200 → 132 ea (removed outlier, added risk buffer)

---

## Scenario 4: Major Disagreement (High Spread)
**Suppliers wildly different**

| Supplier | Quoted Qty |
|----------|-----------|
| FireSafe | 20 ea |
| ProShield | 55 ea |
| SecureTech | 60 ea |

**OLD LOGIC:**
- Method: MAX
- Result: 60 ea
- Confidence: Unknown

**NEW LOGIC:**
- Spread: 67% (40/60)
- Method: **Median + 10% Allowance**
- Median: 55 ea
- Allowance: 10% = 5.5 ea
- Result: 61 ea (rounded up)
- Confidence: **Low** ❗
- Explanation: "High variation (spread 67%) - 10% allowance applied for scope interpretation risk"

**Outcome:** 60 → 61 ea (more conservative with risk buffer)

---

## Scenario 5: Breakdown by Location
**Same supplier, multiple line items**

| Supplier | Line | Qty |
|----------|------|-----|
| FireSafe | Level 1 | 6380 ea |
| FireSafe | Level 2 | 1682 ea |
| FireSafe | Roof | 14 ea |

**OLD LOGIC:**
- Method: MAX across all items
- Result: 6380 ea
- **Problem:** Doesn't sum the breakdown!

**NEW LOGIC:**
- Step 1: Sum per supplier = 6380 + 1682 + 14 = **8076 ea**
- Step 2: Compare across suppliers
- Result: 8076 ea
- **Fixed:** Correctly aggregates the breakdown

**Outcome:** 6380 → 8076 ea (MAJOR FIX!)

---

## Summary Table

| Scenario | Old Result | New Result | Method | Confidence | Better? |
|----------|-----------|-----------|---------|------------|---------|
| Perfect agreement | 100 | 100 | Average | High ✅ | Same qty, added confidence |
| Tight agreement (9%) | 110 | 105 | Average | High ✅ | More representative |
| One outlier (50%) | 200 | 132 | Median + Allow | Low ❗ | Removed outlier, added buffer |
| Major disagreement (67%) | 60 | 61 | Median + Allow | Low ❗ | Added risk protection |
| Location breakdown | 6380 | 8076 | Average | High ✅ | **MAJOR FIX** - now sums correctly |

---

## Key Improvements

### 1. Outlier Protection
- OLD: Blindly takes max (including outliers)
- NEW: Uses median when variation is high

### 2. Risk Allowances
- OLD: No buffer for uncertainty
- NEW: Adds 5-15% buffer when disagreement is high

### 3. Transparency
- OLD: No explanation of why a quantity was chosen
- NEW: Full audit trail with method, confidence, and explanation

### 4. Location Aggregation
- OLD: Took max of individual items (WRONG!)
- NEW: Sums per supplier first, then applies consensus logic

### 5. Confidence Scoring
- OLD: All quantities treated equally
- NEW: Flags low-confidence items for review

---

## Expected Impact on Your Project

Based on the screenshots, here's what will likely change:

### Items with Perfect Agreement
- **No change in quantity**
- But now marked as "High Confidence" ✅

### Items with Location Breakdown
- **Ryanfire HP-X**: 6380 → **8076** ea
- **SNAP Collar H100FWS**: 2222 → **2229** ea (if breakdown exists)
- **Trafalgar SuperSTOPPER**: May increase if breakdown exists

### Items with High Variation
- Will show **Low Confidence** ❗
- May have risk allowance applied
- Flags for PQS review

---

## How to Interpret Console Output

```
Creating BOQ line: Ryanfire HP-X (Single TPS / Data Cable) x 8076 ea
  Method: Average | Confidence: High | Spread: 0.0%
  Supplier quantities: [8076.0, 8076.0] across 2 suppliers
```

**Reading this:**
- **8076 ea** = Final consensus quantity
- **Average** = Both suppliers agreed (tight spread)
- **High** = Very confident in this quantity
- **0.0% spread** = Perfect agreement
- **[8076, 8076]** = Each supplier's total (after summing breakdowns)

---

```
Creating BOQ line: SNAP Cast In Collar H100FWS (PVC Pipe) x 2442 ea
  Method: Median + Allowance | Confidence: Low | Spread: 45.3%
  Supplier quantities: [2229.0, 4000.0] across 2 suppliers
```

**Reading this:**
- **2442 ea** = Median (2229) + 10% allowance = 2442
- **Median + Allowance** = High variation detected
- **Low** = Not confident - needs review
- **45.3% spread** = Suppliers disagree significantly
- **[2229, 4000]** = Big difference between suppliers

---

## Action Items After Regeneration

### ✅ High Confidence Items
- Accept quantities as-is
- These are market consensus

### ⚠️ Medium Confidence Items
- Review for reasonableness
- May want to verify with drawings

### ❗ Low Confidence Items
- **Action required**
- Issue RFI to suppliers
- Consider getting independent measurement
- Document the uncertainty in award report

---

## Commercial Benefits

### For PQS Conversations:
"We used a consensus-based methodology with outlier protection. Items with high agreement are marked as High Confidence, while items with significant variation have been flagged and had risk allowances applied."

### For Client Reports:
"Reference quantities calculated using market consensus approach: Average for tight agreement (≤15% spread), Median for moderate variation (15-35%), and Median with risk allowance (10-15%) for high disagreement (>35%)."

### For Award Reports:
Can now include a "Quantity Confidence" column showing which items are reliable vs. which need attention.

---

## Testing the Change

1. **Open Console (F12)** before regenerating
2. **Click "Regenerate BOQ Builder"**
3. **Watch for log messages** showing Method/Confidence/Spread
4. **Review quantities** - look for changes
5. **Check confidence scores** - review LOW confidence items
6. **Verify against source quotes** - spot-check calculations

The console will show you exactly how each quantity was calculated!
