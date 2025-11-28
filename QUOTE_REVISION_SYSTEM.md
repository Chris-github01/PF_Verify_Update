# Quote Revision & RFI Tracking System

## Overview

The Quote Revision System transforms Verify+ from a tender comparison tool into a full contract lifecycle management platform. It enables non-destructive tracking of quote updates, RFI responses, and price negotiations while preserving the original tender comparison.

## Key Features

### 1. Non-Destructive Versioning
- Original quotes (v1) are **never modified**
- Each revision creates a new quote record
- Complete version history is preserved
- Can roll back to any previous version

### 2. Parallel Workflows
Two independent workflows run simultaneously:
- **Original Quote Comparison**: Cross-supplier tender analysis (v1 quotes)
- **Quote Revisions & RFIs**: Track updates from same supplier over time

### 3. Intelligent Diff Engine
- Line-by-line comparison between versions
- Highlights:
  - Added items (green)
  - Removed items (red)
  - Modified items (yellow)
  - Price changes with percentages
  - Specification changes

### 4. RFI Management
- Link revisions to RFI reference numbers
- Track reasons for each revision
- Maintain audit trail of all changes
- Timeline view of revision history

## Database Schema

### New Columns on `quotes` Table

```sql
-- Version tracking
original_quote_id    uuid        -- Links to v1 quote
parent_quote_id      uuid        -- Links to previous version
revision_number      integer     -- 1, 2, 3...
is_latest            boolean     -- Only true for most recent version
revision_date        timestamptz -- When this revision was created

-- RFI tracking
rfi_reference        text        -- RFI number (e.g., "RFI-2024-001")
rfi_reason           text        -- Reason for revision
revision_notes       text        -- Additional context

-- Comparison control
use_in_comparison    boolean     -- Include in cross-supplier comparison
```

### New Table: `quote_revisions_diff`

Stores detailed change tracking between versions:

```sql
CREATE TABLE quote_revisions_diff (
  id                          uuid PRIMARY KEY,
  project_id                  uuid NOT NULL,
  supplier_name               text NOT NULL,
  original_quote_id           uuid NOT NULL,
  new_quote_id                uuid NOT NULL,

  -- Summary statistics
  total_price_change          numeric,
  total_price_change_percent  numeric,
  items_added_count           integer,
  items_removed_count         integer,
  items_modified_count        integer,

  -- Detailed diff data (JSONB)
  diff_data                   jsonb,

  created_at                  timestamptz,
  created_by                  uuid
);
```

### New Table: `quote_revision_timeline`

Timeline of all revision events:

```sql
CREATE TABLE quote_revision_timeline (
  id                  uuid PRIMARY KEY,
  project_id          uuid NOT NULL,
  supplier_name       text NOT NULL,
  quote_id            uuid NOT NULL,
  revision_number     integer NOT NULL,

  -- Event details
  event_type          text NOT NULL,  -- 'import', 'revision', 'rfi', 'promotion', 'note'
  event_description   text,

  created_by          uuid,
  created_at          timestamptz
);
```

## User Interface

### 1. Project Dashboard Toggle

On the main Project Dashboard:

```
[Original Quote Comparison] ↔ [Quote Revisions & RFIs]
```

Users can switch between:
- **Original view**: Cross-supplier comparison using v1 quotes
- **Revisions view**: Track changes from each supplier over time

### 2. Import Revised Quote Button

Next to "Import Quotes" button:

```
[Import Quotes]  [Import Updated Quote / RFI]
```

Workflow:
1. Click "Import Updated Quote / RFI"
2. Select existing supplier from dropdown
3. Upload PDF/Excel (same formats as original)
4. Enter RFI reference (optional)
5. Add revision notes
6. System processes using same pipeline
7. Auto-generates diff report

### 3. Quote Revisions Hub

New page showing all suppliers with revisions:

**Features:**
- Card view of each supplier
- Shows: Original price, Latest price, Total change, Version count
- RFI badge if revision linked to RFI
- "View Diff" button to see detailed changes
- Timeline of all revisions

### 4. Revision Diff View

Color-coded table showing:

| Change | Description | Original Qty | New Qty | Original Rate | New Rate | Original Total | New Total | Change |
|--------|-------------|--------------|---------|---------------|----------|----------------|-----------|--------|
| 🟢 Added | New fireproof board | - | 100 m² | - | $45.00 | - | $4,500 | +$4,500 |
| 🔴 Removed | Old sealant type | 50 tubes | - | $12.00 | - | $600 | - | -$600 |
| 🟡 Modified | Fire-rated door | 10 units | 12 units | $850 | $820 | $8,500 | $9,840 | +$1,340 |

**Summary Statistics:**
- Total price change: +$12,500 (+8.3%)
- Items added: 15
- Items removed: 3
- Items modified: 42
- Items unchanged: 187

### 5. Revision Timeline

Chronological view of all changes:

```
🔵 Version 3 (RFI-2024-003)
   Price update following clarification
   +$12,500 | 42 items changed
   Nov 25, 2025 2:30 PM

🟠 Version 2 (RFI-2024-001)
   Specification change for fire-rated boards
   +$8,200 | 28 items changed
   Nov 18, 2025 10:15 AM

📄 Version 1
   Original quote imported
   Nov 10, 2025 9:00 AM
```

## Workflow Examples

### Example 1: RFI Response

**Scenario**: Client issues RFI asking supplier to quote premium fire-rated materials

1. Navigate to project
2. Click "Import Updated Quote / RFI"
3. Select "ABC Fire Protection Ltd"
4. Upload revised PDF quote
5. Enter RFI reference: "RFI-2024-008"
6. Enter reason: "Premium fire-rated material upgrade per client request"
7. Click "Import Revision"

**Result:**
- New quote created as v2
- Previous v1 marked as `is_latest = false`
- Diff auto-generated showing:
  - Material specifications changed
  - Prices increased 12%
  - 8 items affected
- Timeline updated with RFI event
- v1 quote still intact for tender comparison

### Example 2: Price Negotiation

**Scenario**: Supplier submits revised pricing after negotiation

1. Import revised quote (v3)
2. System detects:
  - Total price decreased 5%
  - Rates reduced on 42 items
  - No specification changes
3. Diff shows all rate reductions in green
4. Can promote v3 to "Current Preferred Quote" for final reporting

### Example 3: Specification Change

**Scenario**: Design team changes fire rating requirements

1. Issue RFI to all suppliers
2. Import revised quotes from each (v2, v3, v4...)
3. Compare how each supplier responded:
  - Supplier A: +15% price increase
  - Supplier B: +8% price increase
  - Supplier C: +22% price increase
4. Generate "RFI Response Comparison" report
5. Original v1 comparison still available for tender audit

## API Integration

### Creating a Revision

```typescript
const { data: newQuote, error } = await supabase
  .from('quotes')
  .insert({
    project_id: projectId,
    supplier_name: 'ABC Fire Protection Ltd',
    revision_number: 3,
    is_latest: true,
    original_quote_id: originalQuoteId,
    parent_quote_id: previousQuoteId,
    revision_date: new Date().toISOString(),
    rfi_reference: 'RFI-2024-008',
    rfi_reason: 'Premium materials upgrade',
    use_in_comparison: true,
    file_url: uploadedFileUrl,
    total_price: 125000,
    status: 'active'
  })
  .select()
  .single();

// Previous version automatically marked as not latest (via trigger)
```

### Generating Diff

```typescript
import { generateQuoteDiff } from './lib/revision/revisionDiffEngine';

const diff = await generateQuoteDiff(
  originalQuote,  // v1 or any previous version
  newQuote,       // latest version
  projectId
);

// diff contains:
// - Line-by-line comparison
// - Summary statistics
// - Price change calculations
// - Percentage changes
```

### Querying Revisions

```typescript
// Get all revisions for a supplier
const { data: revisions } = await supabase
  .from('quotes')
  .select('*')
  .eq('project_id', projectId)
  .eq('supplier_name', supplierName)
  .order('revision_number');

// Get latest revisions for all suppliers
const { data: latestQuotes } = await supabase
  .from('quotes')
  .select('*')
  .eq('project_id', projectId)
  .eq('is_latest', true);

// Get original quotes only (for tender comparison)
const { data: originalQuotes } = await supabase
  .from('quotes')
  .select('*')
  .eq('project_id', projectId)
  .eq('revision_number', 1);
```

## Reports

### 1. RFI & Revision Summary Report

Auto-generated PDF containing:
- Project overview
- List of all RFIs issued
- Supplier response summary
- Price impact analysis
- Timeline of all revisions
- Comparison of RFI responses

### 2. Revision Impact Report

Shows financial impact of revisions:
- Original tender value
- Current value (with all revisions)
- Total value change
- Breakdown by supplier
- Breakdown by RFI

### 3. Audit Trail Report

Complete audit trail for compliance:
- All versions preserved
- User who made each change
- Timestamps of all uploads
- Reasons for each revision
- RFI references

## Scope Matrix Integration

The Scope Matrix supports filtering:

**Filter Options:**
1. **Original Quotes Only**: Show v1 from all suppliers (for tender fairness)
2. **Latest Revisions**: Show most recent version from each supplier (for final reporting)
3. **Specific Versions**: Choose exact version from each supplier
4. **Include/Exclude Suppliers**: Control which suppliers appear in comparison

## Benefits

### For Procurement Teams
- Track negotiation progress
- Maintain complete audit trail
- Compare multiple RFI responses
- Never lose original tender data
- Make data-driven award decisions

### For Contract Managers
- Monitor price trends over time
- Identify scope creep
- Track specification changes
- Manage variations efficiently
- Generate compliance reports

### For Project Teams
- Understand design change impacts
- Compare supplier responses to changes
- Track RFI resolution
- Maintain project history
- Support post-project review

## Migration Notes

### For Existing Projects

When the migration runs:
1. All existing quotes are marked as `revision_number = 1`
2. All set to `is_latest = true`
3. `original_quote_id` = NULL (they are the originals)
4. `parent_quote_id` = NULL (no previous version)
5. No existing data is modified or lost

### For New Projects

- First import: Creates v1 quotes
- Subsequent imports to same supplier: Creates v2, v3...
- Each supplier has independent version chain

## Security

### Row Level Security (RLS)

All new tables have RLS enabled:
- Users can only access data from their organization
- Proper authentication required for all operations
- Revision history protected per organization

### Audit Trail

Complete audit trail maintained:
- Who created each revision
- When it was created
- Why it was created (RFI reason)
- What changed (diff data)
- Cannot be deleted or modified (immutable)

## Future Enhancements

Potential additions:
1. **Automated RFI Issuance**: Send RFI requests directly to suppliers
2. **Email Notifications**: Alert users when suppliers submit revisions
3. **Approval Workflows**: Require manager approval for revisions
4. **Comparison Analytics**: ML-powered insights on price trends
5. **Mobile App**: Upload revisions from phone on site
6. **Variation Orders**: Link revisions to formal variation orders
7. **Contract Integration**: Sync with contract management systems

## Conclusion

The Quote Revision System transforms Verify+ into a comprehensive contract lifecycle platform. By maintaining separate workflows for original tender comparison and ongoing revisions, it provides:

- **Transparency**: Complete visibility into all changes
- **Compliance**: Immutable audit trail
- **Flexibility**: Non-destructive updates
- **Intelligence**: Automated diff analysis
- **Control**: Choose which versions to use in reporting

This positions Verify+ as the go-to platform for construction procurement from tender through contract execution and beyond.
