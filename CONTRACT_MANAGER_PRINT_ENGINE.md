# Contract Manager Unified Print Engine

## Overview

All Contract Manager PDF outputs now use a single, unified print engine that ensures:
- ✅ No blank pages
- ✅ Tables align correctly under headings
- ✅ Headers/footers never overlap content
- ✅ Long tables paginate cleanly without cutting rows
- ✅ Data is normalized BEFORE rendering (no inline parsing)

## Architecture

### Core Components

1. **ContractDataNormalizer**
   - Parses combined description strings into structured fields
   - Example: `"Wall penetration [Service: Sealing | Type: Service | Material: Intumescent | Qty: 50 No]"`
   - Becomes: `{ description, service, type, material, quantity, unit }`
   - Missing fields default to "—" (not blank)

2. **ContractPDFLayout**
   - Deterministic print CSS
   - A4 page size with proper margins: `16mm 12mm 18mm 12mm`
   - Table pagination rules:
     - `page-break-inside: auto` on tables
     - `page-break-inside: avoid` on rows
     - `display: table-header-group` on thead
   - NO `page-break-after: always` on last page

3. **ContractPackBuilder**
   - Standard structure for all packs:
     - A) Cover page + project summary
     - B) Scope/trade summary tables (normalized columns)
     - C) Compliance & documentation checklist
     - D) QA/inspections/photos
     - E) Risks, exclusions, actions, sign-offs
     - F) Appendices

4. **ContractPDFValidator**
   - Pre-generation validation:
     - Detects empty pages (no content)
     - Detects unparsed fields (still contains raw tokens)
     - Detects empty tables
   - Post-generation cleaning:
     - Removes empty sections automatically

## Pack Types

### 1. Site Team Pack (`site_team`)
**Audience:** Junior site personnel, installers, foremen

**Contains:**
- Cover page with project/supplier info
- Scope overview with normalized line item tables
- Safety & installation notes
- Site handover checklists (Pre-Start, Installation, QA)
- Inclusions/Exclusions

**Use Case:** On-site reference for practical installation work

### 2. Senior Management Pack (`senior_mgmt`)
**Audience:** Project managers, commercial managers, senior leadership

**Contains:**
- Executive cover page with financial summary
- Detailed scope breakdown
- Executive contract summary with contact details
- Commercial terms breakdown
- Risk assessment & recommendations
- Financial breakdown & cash flow forecast

**Use Case:** Commercial oversight and decision-making

### 3. Pre-let Appendix (`prelet_appendix`)
**Audience:** Legal, commercial, contracts team

**Contains:**
- Formal appendix cover
- Priced scope summary (plain English)
- Explicit inclusions/exclusions
- Commercial assumptions
- Subcontractor clarifications
- Known risks & hold points

**Use Case:** Attachment to pre-letting minutes and subcontract agreements

## Usage

### Edge Function (Deno)
```typescript
import { generateJuniorPackHTML, generateSeniorReportHTML, generatePreletAppendixHTML }
  from './generators.ts';

// Site Team Pack
const html = generateJuniorPackHTML(
  projectName,
  supplierName,
  scopeSystems,
  inclusions,
  exclusions,
  logoUrl
);

// Senior Management Pack
const html = generateSeniorReportHTML(
  projectName,
  supplierName,
  totalAmount,
  scopeSystems,
  inclusions,
  exclusions,
  logoUrl,
  additionalData
);

// Pre-let Appendix
const html = generatePreletAppendixHTML(
  projectName,
  supplierName,
  totalAmount,
  appendixData,
  logoUrl
);
```

### Direct Engine Access
```typescript
import { generateContractPDF } from '../lib/reports/contractPrintEngine';

const { html, validation } = generateContractPDF('site_team', {
  project: { name: 'Project Alpha' },
  supplier: { name: 'ABC Fire Protection' },
  financial: { totalAmount: 125000 },
  systems: normalizedSystems,
  inclusions: ['...'],
  exclusions: ['...'],
  allowances: [],
  organisationLogoUrl: 'https://...'
});

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
  console.warn('Validation warnings:', validation.warnings);
}
```

## Data Normalization Requirements

### Input Format (Raw)
Scope systems can contain combined strings:
```typescript
{
  service_type: "Penetration Sealing",
  coverage: "full",
  item_count: 25,
  details: [
    "Wall penetration [Service: Sealing | Type: Service | Material: Intumescent | Qty: 50 No]",
    "Floor penetration [FRR: -/120/120 | Service: Sealing | Size: 150mm | Type: Pipe | Material: Rockwool | Qty: 30 No]"
  ]
}
```

### Output Format (Normalized)
```typescript
{
  service_type: "Penetration Sealing",
  coverage: "full",
  item_count: 25,
  percentage: 35.7,
  items: [
    {
      description: "Wall penetration",
      service: "Sealing",
      type: "Service",
      material: "Intumescent",
      quantity: "50",
      unit: "No",
      notes: undefined
    },
    {
      description: "Floor penetration",
      service: "Sealing",
      type: "Pipe",
      material: "Rockwool",
      quantity: "30",
      unit: "No",
      notes: "FRR: -/120/120, Size: 150mm"
    }
  ]
}
```

## CSS Print Rules (Critical)

```css
@page {
  size: A4;
  margin: 16mm 12mm 18mm 12mm;
}

.page:not(:last-child) {
  page-break-after: always;
  break-after: page;
}

table {
  page-break-inside: auto;
}

tr, td, th {
  page-break-inside: avoid;
  break-inside: avoid;
}

thead {
  display: table-header-group;
}

.system-card {
  page-break-inside: avoid;
  break-inside: avoid;
}
```

## Validation Rules

### Errors (Build Fails)
- Empty pages detected
- Unparsed fields with raw attribute tokens

### Warnings (Build Succeeds)
- Empty tables
- Missing optional fields

### Auto-Corrections
- Empty sections are removed
- Last page never has `page-break-after`
- Empty system cards are filtered out

## Rollback Capability

### To Rollback to Original Implementation
```bash
bash rollback-contract-manager.sh
```

This restores:
- `supabase/functions/export_contract_manager/generators.ts` (original ~900 lines)
- `supabase/functions/export_contract_manager/index.ts` (original)

Backups remain at:
- `generators.ts.backup`
- `index.ts.backup`

### To Re-Apply Unified Engine
```bash
bash apply-contract-manager.sh
```

## File Locations

```
project/
├── src/lib/reports/
│   └── contractPrintEngine.ts          (NEW - Unified engine)
├── supabase/functions/export_contract_manager/
│   ├── index.ts                         (MODIFIED - Uses new engine)
│   ├── generators.ts                    (MODIFIED - Thin wrappers)
│   ├── generators.ts.backup            (BACKUP - Original 900 lines)
│   └── index.ts.backup                 (BACKUP - Original)
├── rollback-contract-manager.sh        (NEW - Rollback script)
├── apply-contract-manager.sh           (NEW - Re-apply script)
└── CONTRACT_MANAGER_PRINT_ENGINE.md   (THIS FILE)
```

## Benefits

1. **Single Source of Truth**
   - All 3 pack types use the same engine
   - CSS rules applied consistently
   - Validation runs on every generation

2. **Data Quality**
   - Parsing happens BEFORE rendering
   - No inline regex in templates
   - Missing fields show "—" not blank cells

3. **Pagination Control**
   - Deterministic page breaks
   - No blank pages
   - Tables split cleanly
   - Headers repeat on each page

4. **Maintainability**
   - ~1000 lines (engine) vs ~900 lines (each generator)
   - Add new pack types by implementing `buildXYZPack()`
   - CSS changes apply to all packs instantly

5. **Safety**
   - Full rollback capability
   - Original implementation preserved
   - Easy to switch between old/new

## Testing

### Manual Testing
1. Generate Site Team Pack
2. Generate Senior Management Pack
3. Generate Pre-let Appendix

### Validation Checks
- No blank pages in output
- Tables align under correct headings
- Headers/footers don't overlap content
- Long tables paginate without cutting rows
- All combined strings are parsed into columns

### Screenshot Tests (Recommended)
```bash
# Generate PDFs and visually inspect:
# - Page boundaries
# - Table pagination
# - Header/footer positioning
# - Data normalization quality
```

## Future Enhancements

### Potential Additions
- **Photo grid pagination** (D section)
- **QA inspection checklists** with checkboxes
- **Digital signatures section** (E section)
- **Custom appendices** from database

### Extension Points
```typescript
// Add new pack type
class ContractPackBuilder {
  buildCustomPack(data: ContractPackData): string {
    // Implement custom structure
  }
}

// Register in generateContractPDF()
case 'custom_pack':
  return this.buildCustomPack(data);
```

## Support

For issues or questions:
1. Check validation output in console
2. Review this documentation
3. Test rollback to verify original behavior
4. Compare HTML output before/after normalization

## Changelog

### 2025-12-21 - Initial Implementation
- Created unified print engine
- Migrated all 3 pack types
- Added rollback capability
- Added validation gates
- Fixed blank page issues
- Fixed table pagination
- Fixed data normalization
