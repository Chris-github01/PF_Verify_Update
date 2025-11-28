# Quote Revision System - Demo Script

## 🎯 Demo Scenario: "RFI Response Tracking"

**Story**: A construction client has awarded the project but needs to issue an RFI to the winning supplier requesting a specification upgrade. We need to track the revised quote while preserving the original tender for audit purposes.

## Pre-Demo Setup (5 minutes)

1. **Ensure test project exists** with:
   - Project name: "Melbourne Tower Construction"
   - At least 3 suppliers with original quotes (v1)
   - Sample supplier: "Global Fire Protection Ltd" with $850,000 original quote

2. **Apply database migration**:
   ```sql
   -- Copy from /tmp/quote_versioning_migration.sql
   -- Execute in Supabase SQL Editor
   ```

3. **Verify setup**:
   ```sql
   SELECT supplier_name, revision_number, total_price
   FROM quotes
   WHERE project_id = 'your-project-id';
   ```

## Demo Flow (10 minutes)

### Act 1: The Original Tender (Baseline)

**SHOW**: Project Dashboard in "Original Quote Comparison" mode

> "Here's our completed tender analysis. We have 3 suppliers:
> - Global Fire Protection: $850,000
> - Precision Fire Systems: $920,000
> - FireSafe Solutions: $885,000
>
> Global Fire won the tender. This data is locked in forever for audit purposes."

**HIGHLIGHT**:
- Clean tender comparison
- All quotes are version 1 (v1)
- Clear pricing difference
- Original workflow intact

---

### Act 2: The RFI (Change Request)

**SHOW**: Toggle to "Quote Revisions & RFIs" mode

> "Two weeks into the project, the client issues RFI-2024-012 requesting an upgrade
> from standard fire-rated boards to premium intumescent panels. We need Global Fire
> to re-quote, but we can't lose the original tender data."

**ACTION**: Click "Import Updated Quote / RFI"

**WALK THROUGH**:
1. Select "Global Fire Protection Ltd" from dropdown
   - Shows: "Current version: v1 • Last updated: Nov 10, 2024"

2. Upload revised quote PDF
   - Drag and drop or click to upload
   - Shows file name and size

3. Fill in RFI details:
   ```
   RFI Reference: RFI-2024-012
   Reason: Premium intumescent panel upgrade per client specification change
   Notes: Material spec changed from Class B to Class A fire rating
   ```

4. Check "Use in comparison" (enabled by default)

5. Click "Import Revision"

**RESULT**:
> "The system now processes this exactly like the original import - same parsing,
> same AI extraction, same workflow - but creates it as v2 instead of overwriting v1."

---

### Act 3: The Analysis (Intelligent Diff)

**SHOW**: Revision successfully imported → Auto-redirect to diff view

**HIGHLIGHT**: Summary statistics
```
┌─────────────────────────────────────────────┐
│ Global Fire Protection Ltd - v1 → v2       │
│                                             │
│ Total Price Change: +$68,500 (+8.1%) 📈   │
│                                             │
│ Added: 12 | Removed: 3 | Modified: 28      │
└─────────────────────────────────────────────┘
```

**WALK THROUGH**: Color-coded diff table

1. **GREEN (Added Items)**:
   ```
   🟢 Premium intumescent panels - 850 m²
      Rate: $125/m² | Total: $106,250
      Reason: New specification requirement
   ```

2. **RED (Removed Items)**:
   ```
   🔴 Standard fire-rated boards - 850 m²
      Rate: $45/m² | Total: $38,250
      Reason: Replaced by premium panels
   ```

3. **YELLOW (Modified Items)**:
   ```
   🟡 Fire-rated door seals
      Original: 50 units @ $85 = $4,250
      Revised:  65 units @ $92 = $5,980
      Change: +15 units, +$8.24/unit (+$1,730, +40.7%)
   ```

**EXPLAIN**:
> "The AI diff engine automatically matches line items between versions, even if
> descriptions are slightly different. It highlights every change - quantity, rate,
> specifications, totals - with percentage calculations."

---

### Act 4: The Timeline (Audit Trail)

**SHOW**: Revision Timeline below the diff

```
┌───────────────────────────────────────────────────────────┐
│ 🟠 Version 2 (RFI-2024-012)                Nov 25, 2:30 PM│
│    Premium intumescent panel upgrade                       │
│    +$68,500 | 43 items changed                            │
│                                                            │
│ 📄 Version 1                                Nov 10, 9:00 AM│
│    Original tender quote                                   │
└───────────────────────────────────────────────────────────┘
```

**EXPLAIN**:
> "Complete audit trail. Every change is logged with:
> - Who made it
> - When they made it
> - Why they made it (RFI reference)
> - What the financial impact was
> - Which items were affected
>
> This satisfies ISO 9001, government procurement standards, and client audit requirements."

---

### Act 5: The Power Move (Dual Workflows)

**SHOW**: Toggle back to "Original Quote Comparison"

**DEMONSTRATE**:
1. Original comparison still shows v1 data:
   - Global Fire: $850,000 (original)
   - Untouched, perfect for tender audit

2. Switch to "Quote Revisions & RFIs":
   - Global Fire: Now shows v2 at $918,500
   - With RFI badge and change indicator

**EXPLAIN**:
> "This is the game-changer. You can:
>
> 1. **Tender Team**: Use 'Original' mode to prove fair tender process
> 2. **Project Team**: Use 'Revisions' mode for current project status
> 3. **Finance**: Compare both to understand variation impact
> 4. **Auditors**: Access complete history without data loss
>
> Both workflows run in parallel. Neither interferes with the other."

---

### Act 6: The Scope Matrix (Choose Your View)

**SHOW**: Navigate to Scope Matrix

**DEMONSTRATE**: Filter dropdown
```
Quote Version Display:
[  ] Latest Revisions (Recommended) ✓
[ ] Original Quotes Only (Tender Audit)
```

**EXPLAIN**:
> "In reports like Scope Matrix, you choose:
> - 'Latest' for current project status (default)
> - 'Original' when auditors or lawyers need to see the tender
>
> Every report supports both views. One data model, infinite flexibility."

---

### Act 7: The Multi-RFI Scenario (Scale)

**SHOW**: Issue second RFI to same supplier

**QUICK DEMO**:
1. Import v3 with "RFI-2024-018: Labor rate adjustment"
2. Now timeline shows:
   ```
   v3 → v2 → v1
   ```
3. Can compare:
   - v1 vs v3 (original vs current)
   - v2 vs v3 (last RFI vs current)
   - Any version vs any version

**EXPLAIN**:
> "Unlimited revisions per supplier. Track months or years of:
> - Price negotiations
> - Specification changes
> - Variation orders
> - Design updates
> - Market adjustments
>
> Original always preserved. Current always accessible."

---

### Act 8: The RFI Report (Executive Summary)

**SHOW**: Click "Export RFI & Revision Summary"

**PREVIEW**: Auto-generated PDF with:
```
┌──────────────────────────────────────────────┐
│ RFI & REVISION SUMMARY REPORT                │
│ Melbourne Tower Construction                 │
│ Generated: November 25, 2025                 │
├──────────────────────────────────────────────┤
│ Project Overview                             │
│ • Total Suppliers: 3                         │
│ • Suppliers with Revisions: 1                │
│ • Total RFIs Issued: 2                       │
│ • Total Price Impact: +$78,200 (+9.2%)      │
├──────────────────────────────────────────────┤
│ Supplier Breakdown                           │
│                                              │
│ Global Fire Protection Ltd                   │
│ • Original (v1): $850,000                    │
│ • Current (v3): $928,200                     │
│ • Change: +$78,200 (+9.2%)                   │
│ • Revisions: 3                               │
│ • RFIs: 2 (RFI-2024-012, RFI-2024-018)      │
│                                              │
│ Revision Timeline:                           │
│ v1 → v2 (+$68,500): Material upgrade         │
│ v2 → v3 (+$9,700): Labor rate adjustment     │
└──────────────────────────────────────────────┘
```

**EXPLAIN**:
> "One-click executive report showing complete financial impact of all RFIs and
> revisions. Perfect for:
> - Board presentations
> - Client approvals
> - Variation order documentation
> - Post-project reviews"

---

## 💎 Key Demo Messages

### Message 1: Non-Destructive
> "Original tender data is **never touched**. It's preserved forever for audit,
> compliance, and legal purposes. No overwrites, no data loss, no risk."

### Message 2: Parallel Workflows
> "Two workflows, one system:
> - Original Quote Comparison (tender fairness)
> - Quote Revisions & RFIs (contract lifecycle)
>
> Switch between them instantly. Both always available."

### Message 3: Intelligent Automation
> "AI-powered diff engine automatically:
> - Matches similar items between versions
> - Calculates all percentage changes
> - Highlights modifications
> - Summarizes financial impact
>
> No manual comparison needed."

### Message 4: Complete Audit Trail
> "Every change tracked:
> - Who (user ID)
> - When (timestamp)
> - Why (RFI reference + reason)
> - What (detailed diff)
> - How much (price impact)
>
> Immutable audit trail. ISO 9001 compliant."

### Message 5: Scale & Flexibility
> "Unlimited:
> - Revisions per supplier (v1, v2, v3...v99)
> - Suppliers per project
> - Projects per organization
> - RFIs per project
>
> Compare any version against any other version."

---

## 🎬 Closing Statement

> "This transforms Verify+ from a tender tool into a **contract lifecycle platform**.
>
> You're not just comparing quotes anymore. You're:
> - Managing negotiations
> - Tracking variations
> - Resolving RFIs
> - Maintaining compliance
> - Supporting audits
> - Making data-driven decisions
>
> From tender to handover, one platform, complete visibility.
>
> That's the billion-dollar feature. That's why this changes everything."

---

## 📊 Demo Success Metrics

After the demo, stakeholders should understand:

✅ **Problem Solved**: How to track quote updates without losing original tender data
✅ **Key Benefit**: Parallel workflows for different stakeholder needs
✅ **Technical Innovation**: AI-powered diff engine with smart item matching
✅ **Compliance**: Complete audit trail for regulatory requirements
✅ **Scalability**: Handles unlimited revisions and RFIs
✅ **ROI**: Reduces manual comparison time from hours to seconds

---

## 🛠️ Demo Troubleshooting

### Issue: No suppliers showing in dropdown
**Fix**: Create at least one quote with `revision_number = 1` first

### Issue: Diff looks empty
**Fix**: Ensure both quotes have line_items populated

### Issue: Timeline not showing events
**Fix**: Check `quote_revision_timeline` table has records

### Issue: Colors not showing correctly
**Fix**: Verify change_type values: 'added', 'removed', 'modified', 'unchanged'

---

## 📝 Post-Demo Follow-Up

**Questions to ask:**
1. "How many RFIs does your team typically manage per project?"
2. "How do you currently track quote revisions?"
3. "What audit requirements do you have for tender data?"
4. "How long does manual quote comparison take currently?"
5. "Would this save you time on variations management?"

**Next Steps:**
1. Schedule pilot with one active project
2. Import historical revisions to show value
3. Train power users on the workflow
4. Generate sample RFI reports
5. Measure time savings vs manual process

---

## 🚀 Demo-Ready Checklist

Before presenting:

- [ ] Database migration applied
- [ ] Test project with 3+ suppliers created
- [ ] Sample revision uploaded and processed
- [ ] Diff generated and displaying correctly
- [ ] Timeline showing events
- [ ] Toggle working between Original/Revisions
- [ ] Colors rendering (green/red/yellow)
- [ ] Export buttons functioning
- [ ] Mobile responsive checked
- [ ] Load times acceptable (<2s)

**You're demo-ready when all boxes are checked!**

This is your **competitive advantage**. This is how you win enterprise deals.
