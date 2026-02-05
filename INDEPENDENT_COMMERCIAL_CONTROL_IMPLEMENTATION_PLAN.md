# INDEPENDENT COMMERCIAL CONTROL SYSTEM - IMPLEMENTATION PLAN

**Date:** 2026-02-05
**Status:** 📋 PLANNING PHASE
**Objective:** Create fully independent Commercial Control system without BOQ Builder dependencies

---

## EXECUTIVE SUMMARY

This document provides a detailed implementation plan for an **Independent Commercial Control System** that operates completely separately from the BOQ Builder. The system will use awarded quote data (Schedule of Rates) as its foundation, with architectural provisions for optional future BOQ Builder integration.

### Key Principles
1. **Zero BOQ Builder Dependencies** - System must function entirely without BOQ Builder
2. **Schedule of Rates as Source of Truth** - Use `quote_items` from awarded quotes
3. **Structural Enhancement Framework** - Support for allowances, retention, claims tracking
4. **Future-Ready Architecture** - Clean integration points for optional BOQ workflow
5. **Production-Ready from Day One** - Fully functional independent system

---

## CURRENT STATE ANALYSIS

### Existing Dependencies (To Remove)

| Component | Current Dependency | Impact |
|-----------|-------------------|--------|
| Base Tracker Export | Queries `boq_lines` table | ❌ BOQ Builder dependency |
| Commercial Dashboard | References `boq_lines.module_key` | ⚠️ Minor coupling |
| Award Reports | May reference BOQ structure | ⚠️ Check needed |

### Independent Components (Already Working)

| Component | Data Source | Status |
|-----------|-------------|--------|
| Award Approvals | `award_approvals` table | ✅ Independent |
| Quote Items | `quote_items` table | ✅ Independent |
| Schedule of Rates Export | `quote_items` | ✅ Independent |
| Variation Register | `variation_register` | ✅ Independent |
| Base Tracker Claims | `base_tracker_claims` | ✅ Independent |
| Commercial Dashboard | Awards + Quotes | ✅ Recently fixed |

### Data Flow Architecture

**CURRENT (With BOQ Dependency):**
```
Award Supplier
  ↓
Award Approvals (links to quote_id)
  ↓
❌ Base Tracker queries boq_lines
  ↓
Export Base Tracker
```

**TARGET (Fully Independent):**
```
Award Supplier
  ↓
Award Approvals (links to quote_id)
  ↓
✅ Base Tracker queries quote_items (Schedule of Rates)
  ↓
Apply structural enhancements (allowances, retention, etc.)
  ↓
Export Enhanced Base Tracker
```

---

## IMPLEMENTATION PLAN

### PHASE 1: DATA ARCHITECTURE INDEPENDENCE
**Duration:** 2-3 hours
**Priority:** CRITICAL

#### 1.1 Create Commercial Baseline Table

**Purpose:** Store the commercial baseline independently from BOQ Builder

```sql
-- New table: commercial_baseline_items
-- Replaces dependency on boq_lines with independent structure
CREATE TABLE commercial_baseline_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  award_approval_id uuid NOT NULL REFERENCES award_approvals(id) ON DELETE CASCADE,
  trade_key text NOT NULL,

  -- Source reference
  source_quote_id uuid NOT NULL REFERENCES quotes(id),
  source_quote_item_id uuid REFERENCES quote_items(id),

  -- Line identification
  line_number text NOT NULL, -- Auto-generated: BT-001, BT-002, etc.
  line_type text NOT NULL CHECK (line_type IN ('awarded_item', 'allowance', 'retention', 'provisional_sum')),

  -- Description
  description text NOT NULL,
  system_category text, -- Fire Protection, Electrical, etc.
  scope_category text, -- Included, Excluded, Clarification
  location_zone text,

  -- Commercial details
  unit text NOT NULL,
  quantity numeric NOT NULL,
  unit_rate numeric NOT NULL,
  line_amount numeric NOT NULL,

  -- Tracking
  is_active boolean DEFAULT true,
  baseline_locked boolean DEFAULT false,
  baseline_locked_at timestamptz,

  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(project_id, award_approval_id, line_number)
);

-- Index for performance
CREATE INDEX idx_commercial_baseline_project ON commercial_baseline_items(project_id);
CREATE INDEX idx_commercial_baseline_award ON commercial_baseline_items(award_approval_id);
CREATE INDEX idx_commercial_baseline_quote ON commercial_baseline_items(source_quote_id);
CREATE INDEX idx_commercial_baseline_type ON commercial_baseline_items(line_type);
```

**Why This Works:**
- ✅ Zero dependency on `boq_lines`
- ✅ Links directly to awarded quotes
- ✅ Supports additional line types (allowances, retention)
- ✅ Can be populated entirely from `quote_items`
- ✅ Provides clean integration point for future BOQ workflow

#### 1.2 Baseline Population Function

```typescript
// src/lib/commercial/baselineGenerator.ts

interface BaselineGenerationOptions {
  projectId: string;
  awardApprovalId: string;
  quoteId: string;
  includeAllowances: boolean;
  includeRetention: boolean;
  retentionPercentage?: number;
}

async function generateCommercialBaseline(options: BaselineGenerationOptions) {
  const { projectId, awardApprovalId, quoteId, includeAllowances, includeRetention, retentionPercentage = 5 } = options;

  // Step 1: Get all quote items from awarded quote
  const { data: quoteItems } = await supabase
    .from('quote_items')
    .select('*')
    .eq('quote_id', quoteId)
    .order('line_number');

  const baselineItems = [];

  // Step 2: Convert quote items to baseline items
  for (const [index, item] of quoteItems.entries()) {
    baselineItems.push({
      project_id: projectId,
      award_approval_id: awardApprovalId,
      trade_key: item.trade || 'general',
      source_quote_id: quoteId,
      source_quote_item_id: item.id,
      line_number: `BT-${String(index + 1).padStart(4, '0')}`,
      line_type: 'awarded_item',
      description: item.description,
      system_category: item.service_type,
      scope_category: item.scope_category,
      location_zone: item.location,
      unit: item.unit,
      quantity: item.quantity,
      unit_rate: item.unit_price,
      line_amount: item.quantity * item.unit_price,
      is_active: true
    });
  }

  // Step 3: Add allowances (if enabled)
  if (includeAllowances) {
    const allowances = await generateAllowanceLines(projectId, quoteItems);
    baselineItems.push(...allowances);
  }

  // Step 4: Add retention line (if enabled)
  if (includeRetention) {
    const subtotal = baselineItems.reduce((sum, item) => sum + item.line_amount, 0);
    const retentionAmount = subtotal * (retentionPercentage / 100);

    baselineItems.push({
      project_id: projectId,
      award_approval_id: awardApprovalId,
      trade_key: 'general',
      source_quote_id: quoteId,
      source_quote_item_id: null,
      line_number: 'BT-RET',
      line_type: 'retention',
      description: `Retention @ ${retentionPercentage}%`,
      system_category: 'Commercial',
      scope_category: 'Included',
      unit: '%',
      quantity: retentionPercentage,
      unit_rate: -retentionAmount / retentionPercentage,
      line_amount: -retentionAmount, // Negative to deduct
      is_active: true
    });
  }

  // Step 5: Insert all baseline items
  const { error } = await supabase
    .from('commercial_baseline_items')
    .insert(baselineItems);

  if (error) throw error;

  return { success: true, itemCount: baselineItems.length };
}
```

#### 1.3 Structural Enhancement Functions

```typescript
// src/lib/commercial/structuralEnhancements.ts

async function generateAllowanceLines(projectId: string, quoteItems: any[]) {
  // Get project-specific allowance configuration
  const { data: project } = await supabase
    .from('projects')
    .select('allowance_config')
    .eq('id', projectId)
    .single();

  const allowances = [];
  const subtotal = quoteItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  // Default allowances if not configured
  const allowanceConfig = project?.allowance_config || {
    site_establishment: { percentage: 2.5, description: 'Site Establishment & Preliminaries' },
    project_management: { percentage: 5.0, description: 'Project Management & Coordination' },
    risk_contingency: { percentage: 3.0, description: 'Risk & Contingency Allowance' }
  };

  let allowanceIndex = 9000; // Start allowances at BT-9000

  for (const [key, config] of Object.entries(allowanceConfig)) {
    const amount = subtotal * (config.percentage / 100);

    allowances.push({
      line_number: `BT-${allowanceIndex}`,
      line_type: 'allowance',
      description: config.description,
      system_category: 'Allowances',
      scope_category: 'Included',
      unit: '%',
      quantity: config.percentage,
      unit_rate: amount / config.percentage,
      line_amount: amount,
      notes: `Calculated as ${config.percentage}% of base contract value`
    });

    allowanceIndex++;
  }

  return allowances;
}

async function addProvisionalSum(
  projectId: string,
  awardApprovalId: string,
  description: string,
  amount: number
) {
  const lineNumber = await getNextProvisionalSumNumber(projectId, awardApprovalId);

  return {
    project_id: projectId,
    award_approval_id: awardApprovalId,
    line_number: lineNumber,
    line_type: 'provisional_sum',
    description: description,
    system_category: 'Provisional Sums',
    scope_category: 'Included',
    unit: 'sum',
    quantity: 1,
    unit_rate: amount,
    line_amount: amount,
    is_active: true
  };
}
```

---

### PHASE 2: BASE TRACKER REFACTORING
**Duration:** 3-4 hours
**Priority:** HIGH

#### 2.1 Remove BOQ Dependencies

**Files to Update:**
1. `src/lib/export/baseTrackerExport.ts` - Primary export function
2. `src/pages/CommercialControlDashboard.tsx` - Dashboard queries
3. `src/lib/commercial/baselineGenerator.ts` - New baseline generator

**Changes Required:**

```typescript
// BEFORE (Current - with BOQ dependency)
const { data: awardedBOQ } = await supabase
  .from('boq_lines')  // ❌ BOQ Builder dependency
  .select('*')
  .eq('project_id', projectId);

// AFTER (Target - independent)
const { data: baselineItems } = await supabase
  .from('commercial_baseline_items')  // ✅ Independent
  .select('*')
  .eq('project_id', projectId)
  .eq('award_approval_id', awardApprovalId)
  .eq('is_active', true)
  .order('line_number');
```

#### 2.2 Updated Base Tracker Export Function

```typescript
// src/lib/export/baseTrackerExport.ts (refactored)

export async function exportBaseTracker(options: BaseTrackerExportOptions): Promise<Blob> {
  const { projectId, awardApprovalId, supplierName, period } = options;

  // Step 1: Get commercial baseline (NOT from boq_lines!)
  const { data: baselineItems, error } = await supabase
    .from('commercial_baseline_items')
    .select('*')
    .eq('project_id', projectId)
    .eq('award_approval_id', awardApprovalId)
    .eq('is_active', true)
    .order('line_number');

  if (error || !baselineItems || baselineItems.length === 0) {
    throw new Error('No commercial baseline found. Generate baseline first.');
  }

  // Step 2: Get previous period claims
  const { data: previousClaims } = await supabase
    .from('base_tracker_claims')
    .select('line_items')
    .eq('project_id', projectId)
    .eq('period', getPreviousPeriod(period))
    .single();

  // Step 3: Generate Excel with enhanced structure
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Base Tracker');

  // Header rows
  worksheet.addRow(['PROJECT:', projectName]);
  worksheet.addRow(['CONTRACTOR:', supplierName]);
  worksheet.addRow(['PERIOD:', period]);
  worksheet.addRow([]);

  // Column headers (as per specification)
  const headerRow = worksheet.addRow([
    'Line No',
    'Description',
    'Location',
    'Unit',
    'Contract Qty',
    'Rate',
    'Contract Amount',
    'Qty Claimed Previous',
    'Qty Claimed This Period',
    'Qty Claimed To Date',
    '% Complete',
    'Amount This Period',
    'Amount To Date',
    'Remaining',
    'Notes'
  ]);

  // Format headers
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4788' } };

  // Data rows - INCLUDING STRUCTURAL ENHANCEMENTS
  for (const item of baselineItems) {
    const previousQty = getPreviousClaimedQty(item.line_number, previousClaims);

    worksheet.addRow([
      item.line_number,
      item.description,
      item.location_zone || '',
      item.unit,
      item.quantity,
      item.unit_rate,
      item.line_amount,
      previousQty,
      '', // To be filled by supplier
      `=H${worksheet.lastRow.number}+I${worksheet.lastRow.number}`, // Formula
      `=J${worksheet.lastRow.number}/E${worksheet.lastRow.number}`, // Formula
      `=I${worksheet.lastRow.number}*F${worksheet.lastRow.number}`, // Formula
      `=L${worksheet.lastRow.number}+G${worksheet.lastRow.number}`, // Formula
      `=G${worksheet.lastRow.number}-M${worksheet.lastRow.number}`, // Formula
      item.notes || ''
    ]);
  }

  // Totals row
  const lastDataRow = worksheet.lastRow.number;
  const totalRow = worksheet.addRow([
    '',
    'TOTAL',
    '', '', '', '',
    `=SUM(G6:G${lastDataRow})`,
    '',
    '',
    '',
    '',
    `=SUM(L6:L${lastDataRow})`,
    `=SUM(M6:M${lastDataRow})`,
    `=SUM(N6:N${lastDataRow})`,
    ''
  ]);

  totalRow.font = { bold: true };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E7E7' } };

  // Apply column widths and formatting
  worksheet.columns = [
    { key: 'line_no', width: 12 },
    { key: 'description', width: 40 },
    { key: 'location', width: 15 },
    { key: 'unit', width: 8 },
    { key: 'contract_qty', width: 12 },
    { key: 'rate', width: 12 },
    { key: 'contract_amount', width: 15 },
    { key: 'prev_qty', width: 12 },
    { key: 'this_qty', width: 12 },
    { key: 'total_qty', width: 12 },
    { key: 'percent', width: 10 },
    { key: 'this_amount', width: 15 },
    { key: 'total_amount', width: 15 },
    { key: 'remaining', width: 15 },
    { key: 'notes', width: 30 }
  ];

  // Lock columns except 'Qty Claimed This Period' and 'Notes'
  await worksheet.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    deleteColumns: false,
    deleteRows: false
  });

  // Unlock editable columns
  worksheet.getColumn('I').eachCell((cell, rowNumber) => {
    if (rowNumber > 5) cell.protection = { locked: false };
  });
  worksheet.getColumn('O').eachCell((cell, rowNumber) => {
    if (rowNumber > 5) cell.protection = { locked: false };
  });

  // Generate blob
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}
```

#### 2.3 Baseline Generation Trigger

**When to generate commercial baseline:**
1. Immediately after award approval
2. User manually initiates from Commercial Dashboard
3. Before first Base Tracker export

```typescript
// Hook into award approval workflow
async function onAwardApproved(awardApprovalId: string) {
  const { data: award } = await supabase
    .from('award_approvals')
    .select('*, quotes(*)')
    .eq('id', awardApprovalId)
    .single();

  // Auto-generate commercial baseline
  await generateCommercialBaseline({
    projectId: award.project_id,
    awardApprovalId: award.id,
    quoteId: award.final_approved_quote_id,
    includeAllowances: true,
    includeRetention: true,
    retentionPercentage: 5
  });

  console.log('[Commercial Control] Baseline generated for award:', awardApprovalId);
}
```

---

### PHASE 3: COMMERCIAL DASHBOARD UPDATES
**Duration:** 2 hours
**Priority:** MEDIUM

#### 3.1 Dashboard Data Sources

**Update queries to use independent tables:**

```typescript
// Commercial Control Dashboard (updated)

async function loadTradeMetrics(projId: string) {
  // Get awards
  const { data: awards } = await supabase
    .from('award_approvals')
    .select('*')
    .eq('project_id', projId);

  const tradeMetrics = [];

  for (const award of awards) {
    // Get commercial baseline total
    const { data: baselineItems } = await supabase
      .from('commercial_baseline_items')
      .select('line_amount')
      .eq('award_approval_id', award.id)
      .eq('is_active', true);

    const contractValue = baselineItems?.reduce((sum, item) => sum + item.line_amount, 0) || 0;

    // Get claims
    const { data: claims } = await supabase
      .from('base_tracker_claims')
      .select('total_claimed_to_date')
      .eq('project_id', projId)
      .eq('award_approval_id', award.id);

    const claimedToDate = claims?.reduce((sum, c) => sum + c.total_claimed_to_date, 0) || 0;

    // Get variations
    const { data: variations } = await supabase
      .from('variation_register')
      .select('amount, status')
      .eq('project_id', projId)
      .eq('award_approval_id', award.id);

    const approvedVOs = variations?.filter(v => v.status === 'Approved')
      .reduce((sum, v) => sum + v.amount, 0) || 0;

    tradeMetrics.push({
      awardId: award.id,
      supplierName: award.final_approved_supplier,
      contractValue,
      claimedToDate,
      percentComplete: (claimedToDate / contractValue) * 100,
      remaining: contractValue - claimedToDate,
      variationsApproved: approvedVOs
    });
  }

  return tradeMetrics;
}
```

---

### PHASE 4: FUTURE BOQ INTEGRATION ARCHITECTURE
**Duration:** 1 hour (planning only)
**Priority:** LOW (documentation for future)

#### 4.1 Integration Points

**Design clean interfaces for future BOQ Builder integration:**

```typescript
// src/lib/commercial/boqIntegration.ts (future)

interface BOQIntegrationAdapter {
  // Optional: Sync BOQ changes to commercial baseline
  syncBOQToBaseline?: (projectId: string, boqLineId: string) => Promise<void>;

  // Optional: Create BOQ from awarded quote
  createBOQFromQuote?: (quoteId: string) => Promise<void>;

  // Optional: Link commercial baseline to BOQ
  linkBaselineToBOQ?: (baselineItemId: string, boqLineId: string) => Promise<void>;
}

// Default implementation (no BOQ integration)
class IndependentCommercialControl implements BOQIntegrationAdapter {
  // No-op implementations - system works without BOQ
  async syncBOQToBaseline(projectId: string, boqLineId: string) {
    console.log('[Commercial] No BOQ integration enabled');
  }
}

// Future implementation (with BOQ integration)
class BOQIntegratedCommercialControl implements BOQIntegrationAdapter {
  async syncBOQToBaseline(projectId: string, boqLineId: string) {
    // Sync logic when BOQ Builder is enabled
  }

  async createBOQFromQuote(quoteId: string) {
    // Convert quote to BOQ format
  }

  async linkBaselineToBOQ(baselineItemId: string, boqLineId: string) {
    // Create linkage between systems
  }
}
```

#### 4.2 Feature Flag System

```typescript
// src/config/features.ts

interface FeatureFlags {
  commercialControl: {
    enabled: boolean;
    independentMode: boolean; // true = no BOQ dependency
    boqIntegration: boolean;  // false by default
  };
}

export const features: FeatureFlags = {
  commercialControl: {
    enabled: true,
    independentMode: true,   // ✅ Current state
    boqIntegration: false    // ❌ Future feature
  }
};

// Usage
if (features.commercialControl.boqIntegration) {
  // Use BOQ-integrated workflow
} else {
  // Use independent workflow (default)
}
```

#### 4.3 Optional Linkage Table (Future)

```sql
-- Future table for optional BOQ linkage
-- Only created if BOQ integration is enabled

CREATE TABLE IF NOT EXISTS commercial_boq_linkage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_baseline_item_id uuid REFERENCES commercial_baseline_items(id),
  boq_line_id uuid, -- Would reference boq_lines(id) when integrated
  sync_enabled boolean DEFAULT false,
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

---

### PHASE 5: DATA MIGRATION & TESTING
**Duration:** 2-3 hours
**Priority:** HIGH

#### 5.1 Migration Strategy

**For existing projects with awards:**

```typescript
// Migration script: Backfill commercial baselines from existing awards

async function migrateExistingAwards() {
  // Get all existing awards
  const { data: awards } = await supabase
    .from('award_approvals')
    .select('*')
    .order('approved_at', { ascending: false });

  console.log(`[Migration] Found ${awards.length} awards to migrate`);

  for (const award of awards) {
    // Check if baseline already exists
    const { data: existing } = await supabase
      .from('commercial_baseline_items')
      .select('id')
      .eq('award_approval_id', award.id)
      .limit(1)
      .single();

    if (existing) {
      console.log(`[Migration] Baseline already exists for award ${award.id}`);
      continue;
    }

    // Generate baseline from awarded quote
    try {
      await generateCommercialBaseline({
        projectId: award.project_id,
        awardApprovalId: award.id,
        quoteId: award.final_approved_quote_id,
        includeAllowances: true,
        includeRetention: true,
        retentionPercentage: 5
      });

      console.log(`[Migration] ✅ Generated baseline for award ${award.id}`);
    } catch (error) {
      console.error(`[Migration] ❌ Failed for award ${award.id}:`, error);
    }
  }

  console.log('[Migration] Complete');
}
```

#### 5.2 Testing Checklist

**Functional Tests:**
- [ ] Generate commercial baseline from awarded quote
- [ ] Export Base Tracker without BOQ Builder dependency
- [ ] Submit and certify claims through Base Tracker
- [ ] Create and approve variations
- [ ] View Commercial Dashboard metrics
- [ ] Generate reports and exports

**Data Integrity Tests:**
- [ ] Verify baseline totals match quote totals
- [ ] Confirm allowances calculated correctly
- [ ] Ensure retention applied properly
- [ ] Check claims累积 correctly across periods
- [ ] Validate variation amounts tracked separately

**Independence Tests:**
- [ ] Complete full workflow without BOQ Builder installed
- [ ] Verify no queries to `boq_lines` table
- [ ] Confirm system works on fresh project without BOQ
- [ ] Test with BOQ Builder disabled in features

**Performance Tests:**
- [ ] Dashboard loads in < 2 seconds
- [ ] Base Tracker export completes in < 5 seconds
- [ ] Queries optimized with proper indexes
- [ ] No N+1 query issues

---

## ARCHITECTURAL DIAGRAMS

### Independent System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    COMMERCIAL CONTROL SYSTEM                 │
│                      (Fully Independent)                      │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
         ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
         │  Award  │    │  Quote  │    │ Baseline│
         │Approvals│───▶│  Items  │───▶│Generator│
         └─────────┘    └─────────┘    └────┬────┘
                                             │
                                             ▼
                              ┌──────────────────────────┐
                              │ Commercial Baseline Items│
                              │  (Independent Storage)   │
                              └──────────┬───────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
              ┌─────▼─────┐      ┌──────▼──────┐    ┌───────▼───────┐
              │   Base    │      │  Variation  │    │  Commercial   │
              │  Tracker  │      │   Register  │    │   Dashboard   │
              │  Exports  │      │             │    │               │
              └───────────┘      └─────────────┘    └───────────────┘
```

### Future BOQ Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              COMMERCIAL CONTROL SYSTEM                       │
│           (With Optional BOQ Integration)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
         ┌──────────▼──────────┐ ┌─────▼──────────┐
         │   Independent Mode  │ │ BOQ Integration│
         │   (Default/Primary) │ │   (Optional)   │
         └──────────┬──────────┘ └─────┬──────────┘
                    │                   │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Feature Flags    │
                    │  & Adapters       │
                    └───────────────────┘
```

### Data Flow: Award to Base Tracker

```
┌──────────────┐
│ User Awards  │
│   Supplier   │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Award Approvals  │ stores: final_approved_quote_id
└──────┬───────────┘
       │
       │ triggers
       ▼
┌──────────────────────┐
│ Generate Baseline    │
│                      │
│ 1. Fetch quote_items │───────┐
│ 2. Add allowances    │       │
│ 3. Add retention     │       │
│ 4. Calculate totals  │       │
└──────┬───────────────┘       │
       │                        │
       ▼                        │
┌──────────────────────┐       │
│ Commercial Baseline  │◀──────┘
│      Items           │
└──────┬───────────────┘
       │
       │ used by
       ▼
┌──────────────────────┐
│  Export Base Tracker │
│  (Excel Generation)  │
└──────────────────────┘
```

---

## DELIVERABLES CHECKLIST

### Code Deliverables

- [ ] `commercial_baseline_items` table migration
- [ ] `src/lib/commercial/baselineGenerator.ts` - Baseline generation
- [ ] `src/lib/commercial/structuralEnhancements.ts` - Allowances, retention
- [ ] `src/lib/export/baseTrackerExport.ts` - Refactored export (no BOQ dependency)
- [ ] `src/pages/CommercialControlDashboard.tsx` - Updated queries
- [ ] `src/lib/commercial/boqIntegration.ts` - Future integration adapter
- [ ] `src/config/features.ts` - Feature flags
- [ ] Migration script for existing awards

### Documentation Deliverables

- [ ] This implementation plan
- [ ] API documentation for new functions
- [ ] User guide: Generating commercial baselines
- [ ] User guide: Base Tracker workflow
- [ ] Developer guide: Adding structural enhancements
- [ ] Architecture decision record (ADR)
- [ ] Integration guide for future BOQ workflow

### Testing Deliverables

- [ ] Unit tests for baseline generation
- [ ] Integration tests for full workflow
- [ ] Independence verification tests
- [ ] Performance benchmarks
- [ ] User acceptance test scripts

---

## ROLLOUT STRATEGY

### Stage 1: Development & Testing (Week 1)
- Implement Phase 1 (Data Architecture)
- Implement Phase 2 (Base Tracker Refactoring)
- Unit testing
- Integration testing

### Stage 2: Migration & Validation (Week 1-2)
- Run migration on development environment
- Validate all existing awards have baselines
- Test Base Tracker exports
- Verify dashboard metrics

### Stage 3: Pilot Deployment (Week 2)
- Deploy to staging environment
- Test with 2-3 pilot projects
- Gather user feedback
- Fix any issues

### Stage 4: Production Deployment (Week 2-3)
- Deploy to production
- Monitor for errors
- User training
- Documentation distribution

### Stage 5: Optimization (Week 3-4)
- Performance tuning
- User feedback incorporation
- Additional enhancements

---

## RISK ASSESSMENT & MITIGATION

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Data loss during migration | Low | High | Test migration on copy of production data first |
| Performance issues with large datasets | Medium | Medium | Implement pagination, indexes, caching |
| User confusion with new workflow | Medium | Low | Training materials, progressive rollout |
| Missing quote data | Low | Medium | Validation before baseline generation |
| Integration points unclear | Low | Low | Document architecture thoroughly |

---

## SUCCESS CRITERIA

### Technical Success
- ✅ Zero queries to `boq_lines` table
- ✅ Commercial Control works on fresh project without BOQ Builder
- ✅ All tests passing
- ✅ Performance within acceptable limits
- ✅ Data integrity validated

### Business Success
- ✅ Users can generate Base Trackers independently
- ✅ Claims workflow functions end-to-end
- ✅ Variations tracked accurately
- ✅ Dashboard provides real-time visibility
- ✅ System ready for production use

### Future-Readiness Success
- ✅ Clean integration points defined
- ✅ Feature flags in place
- ✅ Adapter pattern implemented
- ✅ Documentation complete

---

## CONCLUSION

This implementation plan provides a comprehensive roadmap for creating a **fully independent Commercial Control system** that:

1. **Operates without BOQ Builder** - Uses `quote_items` as the source of truth
2. **Includes structural enhancements** - Allowances, retention, provisional sums
3. **Is production-ready immediately** - Complete, tested, documented
4. **Supports future integration** - Clean architecture for optional BOQ workflow

**Estimated Total Effort:** 10-15 hours
**Estimated Timeline:** 2-3 weeks (with testing and rollout)
**Priority:** HIGH - Critical for commercial operations

---

**Next Steps:**
1. Review and approve this implementation plan
2. Schedule development sprint
3. Assign resources
4. Begin Phase 1 implementation

**Questions? Contact the development team.**
