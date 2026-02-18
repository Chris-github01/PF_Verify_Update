# Base Tracker Export - Usage Guide

## Quick Reference

### Dashboard Fix - Contract Value Calculation

**Issue**: Dashboard was showing $1,538,755.672 (including allowances and retention)
**Fix**: Now shows **$1,465,830.60** (base contract value only)

**What Changed:**
- Dashboard now filters to `line_type = 'awarded_item'` only
- Excludes allowances, retention, and provisional sums from the display
- Shows the pure contracted scope value

**Verification:**
```typescript
// Old (WRONG): Included all baseline items
const { data: baselineItems } = await supabase
  .from('commercial_baseline_items')
  .eq('is_active', true);

// New (CORRECT): Only awarded items
const { data: baselineItems } = await supabase
  .from('commercial_baseline_items')
  .eq('is_active', true)
  .eq('line_type', 'awarded_item'); // Filters out allowances
```

---

## Export Options

### 1. Supplier Export (External)

**Purpose**: Share with subcontractor for payment reconciliation

**File**: `src/lib/export/baseTrackerSupplierExport.ts`

**Usage:**
```typescript
import { downloadSupplierExport } from '../lib/export/baseTrackerSupplierExport';

// Download supplier-friendly export
await downloadSupplierExport({
  projectId: 'uuid',
  projectName: 'Summit Construction Project',
  awardApprovalId: 'uuid',
  format: 'excel' // or 'pdf', 'csv'
});
```

**What's Included:**
- ✅ Contract line items
- ✅ Contract quantities and rates
- ✅ Certified to date
- ✅ Remaining balance
- ✅ Payment summary with retention
- ✅ Professional formatting

**What's Excluded:**
- ❌ Internal risk flags
- ❌ Claimed vs. Certified variance
- ❌ Commercial notes
- ❌ Model rate comparisons
- ❌ Margin analysis

**Output Filename:**
`Contract_Statement_Summit_Construction_Project_2026-02-18.xlsx`

---

### 2. Internal Export (Commercial Management)

**Purpose**: Full commercial visibility for internal teams

**File**: `src/lib/export/baseTrackerInternalExport.ts`

**Usage:**
```typescript
import { downloadInternalExport } from '../lib/export/baseTrackerInternalExport';

// Download comprehensive internal export
await downloadInternalExport({
  projectId: 'uuid',
  projectName: 'Summit Construction Project',
  awardApprovalId: 'uuid',
  includeDashboard: true, // Executive summary
  includeRiskRegister: true, // Risk analysis
  includePaymentReconciliation: true // Payment tracking
});
```

**Excel Tabs:**

**Tab 1: Executive Dashboard**
- Total Contract Value (base + allowances)
- Claimed vs. Certified analysis
- Variance breakdown
- Retention tracking
- Net payment due
- Variations impact
- Forecast final cost

**Tab 2: Base Tracker (Full)**
- All contract line items
- Claimed quantities and values
- Certified quantities and values
- Variance column (Claimed - Certified)
- Risk flags (OVER-CLAIM, HIGH VARIANCE)
- Color-coded warnings

**Tab 3: Risk Register**
- Auto-identified risks
- Over-claim flags
- High variance items
- Severity ratings (HIGH/MEDIUM/LOW)
- Recommended actions

**Tab 4: Payment Reconciliation**
- Period-by-period breakdown
- Claimed vs. Certified per period
- Retention calculations
- Payment history
- Outstanding amounts
- Status tracking

**Tab 5: Allowances & Adjustments**
- Site establishment allowances
- Project management fees
- Risk contingency
- Retention details
- Calculation methodology

**Security:**
- Marked "COMMERCIAL IN CONFIDENCE"
- Red header warning
- Access controlled via RLS
- Audit trail logged

**Output Filename:**
`COMMERCIAL_INTERNAL_Summit_Construction_Project_2026-02-18.xlsx`

---

## Integration with Commercial Dashboard

### Export from Dashboard

Add export buttons to the Commercial Control Dashboard:

```typescript
// In CommercialControlDashboard.tsx
import { downloadSupplierExport } from '../lib/export/baseTrackerSupplierExport';
import { downloadInternalExport } from '../lib/export/baseTrackerInternalExport';

// Supplier export button
<button onClick={async () => {
  await downloadSupplierExport({
    projectId,
    projectName,
    awardApprovalId: tradeMetrics[0].awardApprovalId
  });
}}>
  Export for Supplier
</button>

// Internal export button
<button onClick={async () => {
  await downloadInternalExport({
    projectId,
    projectName,
    awardApprovalId: tradeMetrics[0].awardApprovalId,
    includeDashboard: true,
    includeRiskRegister: true,
    includePaymentReconciliation: true
  });
}}>
  Export Internal Report
</button>
```

---

## Data Flow

```
Award Approval
    ↓
Commercial Baseline Generated
    ├── Awarded Items (base contract) → $1,465,830.60
    ├── Allowances (10.5%) → ~$153,912
    └── Retention (-5%) → ~$80,988

Base Tracker Claims
    ├── Supplier submits claims (quantities/values)
    ├── QS assesses and certifies
    └── Variance tracked (claimed - certified)

Exports
    ├── Supplier Export → Shows certified values only
    └── Internal Export → Shows claimed vs certified + risks
```

---

## Key Metrics Explained

### Original Contract Value
**Source**: Sum of `commercial_baseline_items` where `line_type = 'awarded_item'`
**Represents**: Pure contracted scope (no allowances)
**Display**: $1,465,830.60

### Total Contract Value (with Allowances)
**Source**: ALL active baseline items
**Represents**: Full contract including allowances
**Display**: ~$1,538,755.67

### Certified to Date
**Source**: Sum of `certified_amount` from `base_tracker_claims`
**Represents**: Money approved for payment
**Display**: Currently $0.00 (no claims yet)

### Retention
**Calculation**: Certified Value × 5%
**Released**: At Practical Completion (configurable)
**Purpose**: Security for defects period

### Net Payment
**Calculation**: Certified Value - Retention - Previous Payments
**Represents**: Amount due to supplier

### Remaining Exposure
**Calculation**: Original Contract Value - Certified to Date
**Represents**: Work still to be completed/certified
**Purpose**: Financial exposure visibility

---

## Common Scenarios

### Scenario 1: First Payment Claim
1. Supplier submits claim via Base Tracker
2. QS reviews and certifies (usually less than claimed)
3. System calculates retention (5%)
4. Net payment issued
5. Dashboard updates automatically

### Scenario 2: Variation Approved
1. Variation added to variation register
2. Status changed to "Approved"
3. Dashboard "Net Forecast Final Cost" increases
4. Next Base Tracker export includes VO reference
5. New baseline items created if scope changes

### Scenario 3: Over-Claim Detected
1. Supplier claims more than contract quantity
2. System flags in Risk Register
3. QS investigates:
   - Measurement error?
   - Variation required?
   - Supplier misunderstanding?
4. Issue resolved before certification

---

## Security & Permissions

| Export Type | Supplier | Site Team | Contracts Mgr | Finance Director | Platform Admin |
|-------------|----------|-----------|---------------|------------------|----------------|
| **Supplier Export** | ✅ Own only | ✅ All | ✅ All | ✅ All | ✅ All |
| **Internal Export** | ❌ No | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |

---

## Audit Trail

All exports are logged to `commercial_audit_log`:

```sql
{
  "action_type": "export_generated",
  "export_type": "supplier" | "internal",
  "project_id": "uuid",
  "award_approval_id": "uuid",
  "generated_by": "user_email",
  "timestamp": "2026-02-18T12:00:00Z",
  "included_sections": ["dashboard", "risk_register", "payments"]
}
```

---

## Troubleshooting

### Dashboard shows wrong value
**Check**: Are you filtering by `line_type = 'awarded_item'`?
**Fix**: Add `.eq('line_type', 'awarded_item')` to query

### Export is empty
**Cause**: No baseline generated yet
**Fix**: Run "Generate Baselines" button on Commercial Dashboard

### Supplier can't see export
**Cause**: RLS policies blocking access
**Fix**: Ensure supplier is linked to project via team membership

### Variance seems wrong
**Cause**: Claimed vs. Certified data not in sync
**Fix**: Check `base_tracker_claims.line_items` structure

---

## Next Steps

1. **Phase 1**: ✅ Dashboard value corrected to $1,465,830.60
2. **Phase 2**: ✅ Supplier and Internal exports created
3. **Phase 3**: 🔄 Integrate export buttons into UI
4. **Phase 4**: 📅 Add claims submission workflow
5. **Phase 5**: 📅 Implement certification approval process
6. **Phase 6**: 📅 Automated risk detection and alerting

---

## Support

For issues or questions:
- Check `BASE_TRACKER_DESIGN_SPEC.md` for detailed specifications
- Review console logs: `[Commercial Dashboard]` and `[Base Tracker]`
- Verify data in Supabase: `commercial_baseline_items`, `base_tracker_claims`
- Check RLS policies if access issues occur
