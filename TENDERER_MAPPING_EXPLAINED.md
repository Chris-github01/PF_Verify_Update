# TENDERER MAPPING EXPLAINED

## 🎯 What Is Tenderer Mapping?

**Tenderer Mapping** is a core feature of the BOQ Builder that creates a **line-by-line link** between your baseline Bill of Quantities (BOQ) and what each supplier/tenderer actually quoted.

Think of it as a **"who-quoted-what" matrix** that shows exactly which suppliers included each line item and which didn't.

---

## 📊 THE PROBLEM IT SOLVES

### Without Tenderer Mapping:
When you receive quotes from 5 different suppliers:
- **Supplier A** quotes 120 line items
- **Supplier B** quotes 85 line items
- **Supplier C** quotes 110 line items
- **Supplier D** quotes 95 line items
- **Supplier E** quotes 130 line items

**How do you know:**
- ❓ Which items are missing from each quote?
- ❓ Which items have quantity mismatches?
- ❓ Which suppliers are under-scoping?
- ❓ How to compare pricing fairly?

**Manual Process:** You'd spend days cross-checking every line item across 5 spreadsheets.

### With Tenderer Mapping:
The system automatically:
- ✅ Creates a **master baseline BOQ** with all unique items
- ✅ Maps each supplier's quote items to baseline BOQ lines
- ✅ Shows **included/missing/unclear status** for each supplier
- ✅ Highlights **quantity variances** and **scope gaps**
- ✅ Enables **apples-to-apples comparison**

---

## 🔄 HOW IT WORKS (8-STEP PROCESS)

### Step 1: Import Quotes
You upload quotes from all suppliers (PDF or Excel). AI extracts all line items.

**Result:**
- Supplier A: 120 items extracted
- Supplier B: 85 items extracted
- Supplier C: 110 items extracted
- Supplier D: 95 items extracted
- Supplier E: 130 items extracted

---

### Step 2: Normalize Items
The system standardizes all quote items:
- Fixes units (m → m², lm → m)
- Corrects typos
- Groups similar items
- Extracts specifications

**Example:**
```
Supplier A: "Fire Door 90min FD90 2100x900mm"
Supplier B: "FD90 Door 2.1m x 900mm"
Supplier C: "90/60min Fire Rated Door 2100x900"
```

All normalized to:
```
Fire Door | FRR: 90min | Size: 2100x900mm
```

---

### Step 3: Create Baseline BOQ
The system creates a **master baseline BOQ** with all unique line items found across ALL suppliers.

**Example Baseline BOQ:**
```
BOQ-0001: Fire Door FD90 2100x900mm | Qty: 12 Each
BOQ-0002: Penetration Sealing <150mm | Qty: 45 Each
BOQ-0003: Acoustic Sealing | Qty: 120 m
BOQ-0004: Fire Collar 100mm PVC | Qty: 8 Each
BOQ-0005: Fire Door Hardware Set | Qty: 12 Each
... (150+ more items)
```

**Quantity Logic:** Uses the **maximum quantity** found across all suppliers for each item.

---

### Step 4: Create Tenderer Mappings
For **each BOQ line**, the system creates a mapping record for **each supplier** showing:

#### Mapping Structure:
```typescript
interface BOQTendererMap {
  boq_line_id: string;        // e.g., "BOQ-0001"
  tenderer_id: string;         // Supplier ID

  // Status
  included_status: 'included' | 'missing' | 'excluded' | 'unclear';

  // Pricing from this supplier
  tenderer_qty: number | null;
  tenderer_rate: number | null;
  tenderer_amount: number | null;
  tenderer_notes: string | null;

  // Tags/clarifications needed
  clarification_tag_ids: string[];
}
```

#### Example Mapping:
```
BOQ Line: BOQ-0001 (Fire Door FD90 2100x900mm | Qty: 12)

Supplier A Mapping:
  - included_status: "included"
  - tenderer_qty: 12
  - tenderer_rate: $1,200
  - tenderer_amount: $14,400

Supplier B Mapping:
  - included_status: "included"
  - tenderer_qty: 12
  - tenderer_rate: $1,450
  - tenderer_amount: $17,400

Supplier C Mapping:
  - included_status: "missing"
  - tenderer_qty: null
  - tenderer_rate: null
  - tenderer_amount: null

Supplier D Mapping:
  - included_status: "included"
  - tenderer_qty: 10  ← Under-measured!
  - tenderer_rate: $1,300
  - tenderer_amount: $13,000

Supplier E Mapping:
  - included_status: "unclear"  ← Has $0 amount
  - tenderer_qty: 12
  - tenderer_rate: $0
  - tenderer_amount: $0
```

---

### Step 5: Detect Status Types

#### 1. **INCLUDED** ✅
- Supplier quoted this item
- Has quantity > 0
- Has amount > 0
- **Result:** Fully priced and included

#### 2. **MISSING** ❌
- Supplier did NOT quote this item
- No matching line found in their quote
- **Result:** SCOPE GAP detected

#### 3. **UNCLEAR** ⚠️
- Supplier quoted this item BUT:
  - Quantity is 0, or
  - Amount is $0, or
  - Rate is $0
- **Result:** Needs clarification (RFI)

#### 4. **EXCLUDED** 🚫
- Supplier explicitly excluded this item
- Usually found in exclusions list
- **Result:** Confirmed scope gap

---

### Step 6: Detect Scope Gaps
The system automatically detects various gap types:

#### Gap Type 1: **Missing Items**
```
BOQ-0003: Acoustic Sealing | 120 m

Supplier C: MISSING
→ Creates GAP-0045: "Supplier C has not included Acoustic Sealing"
→ Risk: "Scope gap leading to variations post-award"
→ Treatment: "RFI required"
```

#### Gap Type 2: **Under-Measured**
```
BOQ-0001: Fire Door | Baseline: 12 Each

Supplier D: Only quoted 10 Each (83% of requirement)
→ Creates GAP-0046: "Supplier D under-measured Fire Doors by 2 units"
→ Risk: "Insufficient quantity, will cause variations"
→ Treatment: "Clarification required"
```

#### Gap Type 3: **Unpriced**
```
BOQ-0005: Fire Door Hardware Set | Baseline: 12 Each

Supplier E: Quantity 12, but Rate = $0
→ Creates GAP-0047: "Supplier E listed item but did not price it"
→ Risk: "Unclear commercial intent"
→ Treatment: "RFI for pricing"
```

---

### Step 7: Generate Comparison Matrix
The mappings create a visual **scope matrix** for export:

```
| BOQ ID   | Item Description          | Unit | Qty | Supplier A | Supplier B | Supplier C | Supplier D | Supplier E |
|----------|---------------------------|------|-----|------------|------------|------------|------------|------------|
| BOQ-0001 | Fire Door FD90 2100x900   | Each | 12  | ✅ $14,400 | ✅ $17,400 | ❌ Missing | ⚠️ $13,000 | ⚠️ $0      |
| BOQ-0002 | Penetration Seal <150mm   | Each | 45  | ✅ $4,500  | ✅ $5,400  | ✅ $4,950  | ✅ $5,100  | ✅ $4,725  |
| BOQ-0003 | Acoustic Sealing          | m    | 120 | ✅ $1,800  | ✅ $2,160  | ❌ Missing | ✅ $1,920  | ✅ $1,980  |
| BOQ-0004 | Fire Collar 100mm PVC     | Each | 8   | ✅ $720    | ⚠️ $0      | ✅ $800    | ❌ Missing | ✅ $760    |
| BOQ-0005 | Fire Door Hardware Set    | Each | 12  | ✅ $1,440  | ✅ $1,680  | ✅ $1,560  | ✅ $1,620  | ⚠️ $0      |
```

**Legend:**
- ✅ **Included** - Fully priced
- ❌ **Missing** - Not in quote
- ⚠️ **Unclear** - Needs clarification

---

### Step 8: Calculate Coverage Scores
Based on the mappings, the system calculates:

#### Coverage Percentage:
```
Supplier A: 145/150 items included = 96.7% coverage ✅
Supplier B: 138/150 items included = 92.0% coverage ✅
Supplier C: 127/150 items included = 84.7% coverage ⚠️
Supplier D: 133/150 items included = 88.7% coverage ⚠️
Supplier E: 142/150 items included = 94.7% coverage ✅
```

#### Risk Score (0-100):
```
Supplier A: 12 points (Low Risk) 🟢
Supplier B: 28 points (Low Risk) 🟢
Supplier C: 67 points (High Risk) 🔴
Supplier D: 45 points (Medium Risk) 🟡
Supplier E: 38 points (Medium Risk) 🟡
```

---

## 🎯 WHAT YOU CAN DO WITH TENDERER MAPPINGS

### 1. **Identify Scope Gaps Before Award**
See exactly which suppliers are missing critical items.

**Example:**
```
Supplier C is missing:
- 23 penetration sealing items
- All acoustic sealing
- 8 fire collar items
Total Gap Value: $18,500
```

### 2. **Equalize Pricing for Fair Comparison**
Add back missing items at market rates to compare total project cost.

**Before Equalization:**
```
Supplier A: $245,000 (full scope)
Supplier C: $210,000 (missing $18,500 worth of items)
```

**After Equalization:**
```
Supplier A: $245,000
Supplier C: $228,500 (adjusted for gaps)
```

### 3. **Generate RFI Letters**
Automatically create Request for Information letters:

```
Dear Supplier C,

Re: Passive Fire Package - Scope Clarifications Required

We have identified the following items missing from your quote:

1. BOQ-0003: Acoustic Sealing (120m) - MISSING
2. BOQ-0047: Penetration Sealing <50mm (12 Each) - MISSING
3. BOQ-0089: Fire Collar 150mm Steel (6 Each) - MISSING

Please confirm whether these items are:
a) Included in your lump sum pricing
b) Excluded from your scope
c) Requires separate pricing

Total estimated value of clarifications: $18,500

Regards,
[Your QS Team]
```

### 4. **Track Clarification Responses**
Link supplier responses back to specific BOQ lines and update mappings.

### 5. **Export Professional BOQ Pack**
Generate Excel/PDF pack with:
- Baseline BOQ
- Tenderer Comparison Matrix
- Scope Gaps Register
- Tags & Clarifications
- Award Recommendation

---

## 📊 DATABASE STRUCTURE

### Core Tables:

#### 1. `boq_lines` (Master Baseline)
```sql
CREATE TABLE boq_lines (
  id UUID PRIMARY KEY,
  project_id UUID,
  module_key TEXT,
  boq_line_id TEXT,  -- "BOQ-0001"

  system_name TEXT,
  quantity NUMERIC,
  unit TEXT,
  frr_rating TEXT,
  substrate TEXT,
  service_type TEXT,
  location_zone TEXT,

  baseline_included BOOLEAN,
  ...
);
```

#### 2. `boq_tenderer_map` (Supplier Mappings)
```sql
CREATE TABLE boq_tenderer_map (
  id UUID PRIMARY KEY,
  project_id UUID,
  module_key TEXT,
  boq_line_id UUID REFERENCES boq_lines(id),
  tenderer_id UUID REFERENCES suppliers(id),

  -- Status
  included_status TEXT CHECK (included_status IN ('included', 'missing', 'excluded', 'unclear')),

  -- Supplier Pricing
  tenderer_qty NUMERIC,
  tenderer_rate NUMERIC,
  tenderer_amount NUMERIC,
  tenderer_notes TEXT,

  -- Tags
  clarification_tag_ids TEXT[],
  ...
);
```

#### 3. `scope_gaps` (Detected Gaps)
```sql
CREATE TABLE scope_gaps (
  id UUID PRIMARY KEY,
  project_id UUID,
  module_key TEXT,
  gap_id TEXT,  -- "GAP-0001"
  boq_line_id UUID,
  tenderer_id UUID,

  gap_type TEXT CHECK (gap_type IN ('missing', 'under_measured', 'unclear', 'excluded', 'unpriced')),
  description TEXT,
  risk_if_not_included TEXT,
  commercial_treatment TEXT,
  status TEXT CHECK (status IN ('open', 'closed')),
  ...
);
```

---

## 💡 REAL-WORLD EXAMPLE

### Project: "Harbour Tower Passive Fire"
**5 suppliers**, **150 BOQ line items**

### Mapping Results:

#### Supplier A (FirePro Ltd)
- **Coverage:** 148/150 items (98.7%)
- **Missing:** 2 items ($950)
- **Unclear:** 0 items
- **Total Quoted:** $245,000
- **Risk Score:** 8 points 🟢

#### Supplier B (Safe Fire Systems)
- **Coverage:** 138/150 items (92.0%)
- **Missing:** 10 items ($8,500)
- **Unclear:** 2 items ($1,200)
- **Total Quoted:** $228,000
- **Risk Score:** 35 points 🟡

#### Supplier C (Budget Fire Co)
- **Coverage:** 127/150 items (84.7%)
- **Missing:** 23 items ($18,500)
- **Unclear:** 0 items
- **Total Quoted:** $210,000
- **Risk Score:** 67 points 🔴

#### Supplier D (Mid-Range Fire)
- **Coverage:** 133/150 items (88.7%)
- **Missing:** 12 items ($11,200)
- **Unclear:** 5 items ($3,500)
- **Total Quoted:** $235,000
- **Risk Score:** 48 points 🟡

#### Supplier E (Premium Fire Protection)
- **Coverage:** 145/150 items (96.7%)
- **Missing:** 3 items ($1,800)
- **Unclear:** 2 items ($850)
- **Total Quoted:** $268,000
- **Risk Score:** 15 points 🟢

### Award Recommendation:
**Supplier A (FirePro Ltd)**
- Most complete scope (98.7% coverage)
- Competitive pricing
- Low risk (8 points)
- Only 2 minor clarifications needed

**Equalized Pricing:**
```
Supplier A: $245,000 + $950 = $245,950
Supplier B: $228,000 + $9,700 = $237,700
Supplier C: $210,000 + $18,500 = $228,500 (RISKY)
Supplier D: $235,000 + $14,700 = $249,700
Supplier E: $268,000 + $2,650 = $270,650
```

---

## ✅ KEY BENEFITS

### For Quantity Surveyors:
1. ✅ **Save 40+ hours** - No manual cross-checking
2. ✅ **Catch every gap** - Automated detection
3. ✅ **Fair comparison** - Equalized pricing
4. ✅ **Professional output** - Client-ready BOQ pack

### For Main Contractors:
1. ✅ **Avoid scope gaps** - Before contract signing
2. ✅ **Reduce variations** - By 60%+
3. ✅ **Defensible awards** - Data-driven decisions
4. ✅ **Commercial control** - Post-award baseline

### For Compliance Teams:
1. ✅ **Full audit trail** - Every mapping logged
2. ✅ **Gap tracking** - Open/closed status
3. ✅ **RFI management** - All clarifications tracked
4. ✅ **Transparency** - Complete visibility

---

## 🎯 SUMMARY

**Tenderer Mapping = Automated "Who Quoted What" Matrix**

It's the bridge between:
- Your **baseline scope** (what you need)
- Each **supplier's quote** (what they offered)

By creating a line-by-line link between BOQ and supplier quotes, you get:
- ✅ Instant scope gap visibility
- ✅ Fair pricing comparison
- ✅ Automated RFI generation
- ✅ Professional BOQ exports
- ✅ Post-award commercial baseline

**Bottom Line:** Tenderer Mapping transforms weeks of manual quote analysis into a **30-minute automated audit**.

---

## 📞 RELATED FEATURES

### Also Uses Tenderer Mapping:
1. **Scope Matrix** - Visual comparison table
2. **Award Report** - Recommendation with gap analysis
3. **RFI Generator** - Automated clarification letters
4. **Commercial Control** - Post-award baseline creation
5. **Tags & Clarifications** - Link supplier responses to BOQ lines

---

**Last Updated:** February 2026
**Version:** 1.0
