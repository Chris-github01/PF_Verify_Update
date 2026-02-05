# COMMERCIAL CONTROL SYSTEM - QUICK START GUIDE

**For:** Product Owners, Project Managers, Developers
**Purpose:** Quick reference for independent Commercial Control implementation

---

## 🎯 WHAT IS THIS?

The **Independent Commercial Control System** manages all post-award contract administration **without requiring BOQ Builder**. It uses the **Schedule of Rates** (awarded quote data) as the foundation.

---

## 🏗️ ARCHITECTURE AT A GLANCE

```
Award Supplier
    ↓
Quote Items (Schedule of Rates) ← SOURCE OF TRUTH
    ↓
Commercial Baseline (with enhancements)
    ↓
┌────────────┬──────────────┬─────────────────┐
│ Base       │ Variation    │ Commercial      │
│ Tracker    │ Register     │ Dashboard       │
└────────────┴──────────────┴─────────────────┘
```

**Key Principle:** Everything derives from the awarded quote, not from BOQ Builder.

---

## ⚡ CORE COMPONENTS

### 1. Commercial Baseline
**Purpose:** Independent storage of awarded contract items + enhancements

**What It Contains:**
- All items from awarded quote
- Allowances (site establishment, PM, risk)
- Retention deduction
- Provisional sums (when needed)

**Data Source:** `quote_items` table (from awarded quote)

### 2. Base Tracker
**Purpose:** Monthly progress claim tracking

**Features:**
- Locks commercial baseline
- Tracks claimed quantities period-by-period
- Calculates % complete and remaining value
- Exportable to Excel for supplier completion

### 3. Variation Register
**Purpose:** Track scope changes separately from baseline

**Features:**
- Separate VO numbering
- Approval workflow
- Link to payment periods
- Impact tracking

### 4. Commercial Dashboard
**Purpose:** Real-time visibility of contract performance

**Metrics:**
- Contract value
- Certified to date
- Remaining exposure
- Variations approved/pending
- Risk indicators

---

## 🚀 IMPLEMENTATION PHASES

### Phase 1: Data Independence (3 hours)
**Goal:** Remove all BOQ Builder dependencies

**Tasks:**
1. Create `commercial_baseline_items` table
2. Build baseline generation function
3. Add structural enhancement logic

**Key Files:**
- `supabase/migrations/add_commercial_baseline.sql`
- `src/lib/commercial/baselineGenerator.ts`

### Phase 2: Base Tracker Refactor (3 hours)
**Goal:** Make Base Tracker use independent baseline

**Tasks:**
1. Update export to query `commercial_baseline_items`
2. Remove `boq_lines` references
3. Test export generation

**Key Files:**
- `src/lib/export/baseTrackerExport.ts`

### Phase 3: Dashboard Update (2 hours)
**Goal:** Update Commercial Dashboard queries

**Tasks:**
1. Replace BOQ queries with baseline queries
2. Update metrics calculations
3. Test dashboard display

**Key Files:**
- `src/pages/CommercialControlDashboard.tsx`

### Phase 4: Testing & Migration (2 hours)
**Goal:** Validate and migrate existing data

**Tasks:**
1. Backfill baselines for existing awards
2. Run independence tests
3. Performance validation

---

## 📋 WORKFLOW: AWARD TO BASE TRACKER

### Step 1: Award Supplier
```typescript
// User selects winning supplier in Award Report
// System creates award_approvals record
```

### Step 2: Generate Commercial Baseline
```typescript
// Automatically triggered on award approval
await generateCommercialBaseline({
  projectId: '...',
  awardApprovalId: '...',
  quoteId: awardedQuoteId,
  includeAllowances: true,      // Adds allowances
  includeRetention: true,        // Adds retention line
  retentionPercentage: 5         // 5% retention
});

// Result: commercial_baseline_items table populated
```

### Step 3: Export Base Tracker
```typescript
// User clicks "Export Base Tracker" button
await exportBaseTracker({
  projectId: '...',
  awardApprovalId: '...',
  supplierName: 'ABC Contractors',
  period: '2026-02'               // Current month
});

// Result: Excel file downloaded with locked baseline
```

### Step 4: Supplier Completes Tracker
```
Supplier fills in "Qty Claimed This Period" column in Excel
Excel auto-calculates totals, % complete, remaining
Supplier returns completed file
```

### Step 5: Import Claim
```typescript
// User uploads completed Base Tracker
await importBaseTrackerClaim({
  baseTrackerId: '...',
  period: '2026-02',
  excelFile: uploadedFile
});

// Result: base_tracker_claims record created
```

### Step 6: Certify & Pay
```typescript
// Main Contractor reviews claim
await certifyClaim({
  claimId: '...',
  certifiedAmount: 145000,
  assessmentNotes: 'Approved as submitted'
});

// Result: Payment application generated
```

---

## 🔧 STRUCTURAL ENHANCEMENTS

### Allowances

**What:** Additional line items for indirect costs

**Example Configuration:**
```typescript
{
  site_establishment: {
    percentage: 2.5,
    description: 'Site Establishment & Preliminaries'
  },
  project_management: {
    percentage: 5.0,
    description: 'Project Management & Coordination'
  },
  risk_contingency: {
    percentage: 3.0,
    description: 'Risk & Contingency Allowance'
  }
}
```

**Calculation:**
```
Base Contract Value: $1,000,000
Site Establishment (2.5%): $25,000
Project Management (5.0%): $50,000
Risk Contingency (3.0%): $30,000
Total with Allowances: $1,105,000
```

### Retention

**What:** Percentage held back until project completion

**Configuration:**
```typescript
{
  retentionPercentage: 5,  // 5%
  method: 'standard'       // or 'nil_retention'
}
```

**Calculation:**
```
Contract Value (incl allowances): $1,105,000
Retention @ 5%: -$55,250
Net Payable: $1,049,750
```

**Note:** Retention is released at practical completion.

### Provisional Sums

**What:** Allowances for unquantified work

**Usage:**
```typescript
await addProvisionalSum({
  projectId: '...',
  awardApprovalId: '...',
  description: 'Asbestos Removal (if encountered)',
  amount: 50000
});
```

**Line Type:** `provisional_sum`
**Status:** Converted to actual work via variations

---

## 📊 COMMERCIAL BASELINE STRUCTURE

### Table: commercial_baseline_items

```sql
CREATE TABLE commercial_baseline_items (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  award_approval_id uuid NOT NULL,

  -- Source
  source_quote_id uuid NOT NULL,
  source_quote_item_id uuid,

  -- Identification
  line_number text NOT NULL,        -- BT-0001, BT-0002, etc.
  line_type text NOT NULL,          -- awarded_item | allowance | retention | provisional_sum

  -- Description
  description text NOT NULL,
  system_category text,
  location_zone text,

  -- Commercial
  unit text NOT NULL,
  quantity numeric NOT NULL,
  unit_rate numeric NOT NULL,
  line_amount numeric NOT NULL,

  -- Tracking
  is_active boolean DEFAULT true,
  baseline_locked boolean DEFAULT false,

  -- Metadata
  notes text,
  created_at timestamptz,
  updated_at timestamptz
);
```

### Line Types

| Type | Description | Example |
|------|-------------|---------|
| `awarded_item` | Items from winning quote | Fire stopping systems |
| `allowance` | Calculated allowances | Site establishment @ 2.5% |
| `retention` | Retention deduction | Retention @ 5% |
| `provisional_sum` | Unquantified work | Asbestos removal allowance |

### Line Numbering

- **BT-0001 to BT-8999**: Awarded items (from quote)
- **BT-9000 to BT-9099**: Allowances
- **BT-9100 to BT-9199**: Provisional sums
- **BT-RET**: Retention line

---

## 🎨 KEY DIFFERENCES FROM BOQ BUILDER

| Aspect | BOQ Builder | Commercial Control (Independent) |
|--------|-------------|----------------------------------|
| **Purpose** | Pre-tender scope definition | Post-award contract admin |
| **Data Source** | Manual BOQ entry | Awarded quote items |
| **When Used** | Before quotes received | After supplier awarded |
| **Pricing** | Estimated or blank | Actual awarded rates |
| **Scope** | Defines what to quote | Defines what to build |
| **Changes** | Revisions & reissue | Variations (VOs) |
| **Output** | Tender BOQ | Base Tracker |

**Key Point:** Commercial Control can operate completely independently. BOQ Builder integration is optional for future workflows.

---

## 🔌 FUTURE BOQ INTEGRATION (OPTIONAL)

### Integration Points

When BOQ Builder integration is enabled (future feature):

```typescript
// Optional: Sync changes both ways
if (features.commercialControl.boqIntegration) {
  // BOQ change → Update commercial baseline
  await syncBOQToBaseline(boqLineId);

  // Variation → Update BOQ
  await syncVariationToBOQ(variationId);
}
```

### Feature Flag

```typescript
// src/config/features.ts
export const features = {
  commercialControl: {
    enabled: true,
    independentMode: true,   // Current state
    boqIntegration: false    // Future feature
  }
};
```

### Linkage Table (Future)

```sql
-- Optional table for BOQ integration
CREATE TABLE commercial_boq_linkage (
  commercial_baseline_item_id uuid,
  boq_line_id uuid,
  sync_enabled boolean,
  last_synced_at timestamptz
);
```

**Current State:** This table doesn't exist. System works without it.

---

## ✅ TESTING CHECKLIST

### Independence Tests
- [ ] Generate baseline without BOQ Builder
- [ ] Export Base Tracker on fresh project
- [ ] Complete full claim workflow
- [ ] View dashboard with no BOQ data
- [ ] Create and approve variations

### Data Integrity Tests
- [ ] Baseline total matches quote total
- [ ] Allowances calculated correctly
- [ ] Retention applied properly
- [ ] Claims accumulate correctly

### Performance Tests
- [ ] Dashboard loads < 2 seconds
- [ ] Export generates < 5 seconds
- [ ] No N+1 queries
- [ ] Handles 1000+ line items

---

## 🚨 TROUBLESHOOTING

### Issue: "No commercial baseline found"
**Cause:** Baseline not generated after award
**Fix:** Run baseline generation manually:
```typescript
await generateCommercialBaseline({...});
```

### Issue: "Quote items missing"
**Cause:** Quote has no items or wrong quote linked
**Fix:** Verify quote_items table has data for awarded quote

### Issue: "Totals don't match"
**Cause:** Allowances or retention misconfigured
**Fix:** Check allowance percentages and retention settings

### Issue: "Can't export Base Tracker"
**Cause:** Missing award approval or baseline
**Fix:** Ensure supplier is properly awarded first

---

## 📚 ADDITIONAL RESOURCES

### Documentation
- Full Implementation Plan: `INDEPENDENT_COMMERCIAL_CONTROL_IMPLEMENTATION_PLAN.md`
- Data Model: See migration files in `supabase/migrations/`
- API Reference: JSDoc in source files

### Code Locations
- Baseline Generation: `src/lib/commercial/baselineGenerator.ts`
- Base Tracker Export: `src/lib/export/baseTrackerExport.ts`
- Dashboard: `src/pages/CommercialControlDashboard.tsx`
- Database: `supabase/migrations/20260205005528_add_commercial_control_system.sql`

### Support
- Technical Questions: Development team
- Business Logic: Product owner
- Testing: QA team

---

## 🎯 SUCCESS METRICS

After implementation, you should see:
- ✅ Zero references to `boq_lines` in Commercial Control code
- ✅ Base Tracker exports in < 5 seconds
- ✅ Dashboard displays real-time metrics
- ✅ Claims workflow functional end-to-end
- ✅ Users can complete full workflow without BOQ Builder

---

**Version:** 1.0
**Last Updated:** 2026-02-05
**Status:** Implementation Ready
