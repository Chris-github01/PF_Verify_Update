# Tier-1 BOQ Builder Implementation Plan

## PHASE 0 - DISCOVERY RESULTS

### ✅ WHAT ALREADY EXISTS

#### 1. BOQ Builder System (Complete)
- **Database Tables** (Created in migration `20260203215309_20260203215000_add_boq_builder_system.sql`):
  - `boq_lines` - Owner baseline BOQ lines with full attributes
  - `boq_tenderer_map` - Supplier mappings per line
  - `scope_gaps` - Gap register for missing/unclear scope
  - `tag_library` - Standard tag templates (30 tags preloaded)
  - `project_tags` - Project-specific tag instances with dual-party columns
  - `boq_exports` - Export audit trail

- **Services**:
  - `src/lib/boq/boqGenerator.ts` - Generates baseline BOQ from quotes
  - `src/lib/boq/boqExporter.ts` - Exports to Excel (6 tabs)
  - `src/lib/import/boqSaver.ts` - Saves BOQ data

- **UI Components**:
  - `src/pages/BOQBuilder.tsx` - Main BOQ Builder page
  - `src/pages/ExcelBOQImport.tsx` - Excel BOQ import workflow
  - `src/components/TagLibraryModal.tsx` - Tag library management

- **Types**: `src/types/boq.types.ts` - Complete type definitions

- **Workflow**: BOQ Builder step exists in sidebar (step 7 Pre-Award)

#### 2. Related Existing Features
- **Scope Matrix**: `src/pages/ScopeMatrix.tsx`
- **Excel Parsing**: `src/lib/parsers/excelParser.ts`
- **PDF Parsing**:
  - `src/lib/parsers/pdfParser.ts`
  - Python PDF service with multiple parsers
- **Schedule of Rates Export**: `src/lib/export/scheduleOfRatesExport.ts`

### ❌ WHAT'S MISSING

#### 1. Fire Engineer Schedule System (NEW - Phase 1)
- Database tables:
  - `fire_engineer_schedules` - Schedule metadata
  - `fire_engineer_schedule_rows` - Parsed schedule rows
- Fire schedule PDF parser (Passive Fire specific)
- Fire schedule import UI
- Fire schedule preview & confirmation workflow
- Fire schedule export

#### 2. Intelligent Matching System (NEW - Phase 3)
- Database table:
  - `schedule_boq_links` - Manual/auto link mappings
- Two-stage matching algorithm:
  - Stage A: Deterministic hard key matching
  - Stage B: Fuzzy text matching with confidence scores
- Manual override UI for linking
- Synonym dictionary for firestop terms

#### 3. Enhanced BOQ Exports (Phase 4)
- Master BOQ with EXACT headers per specification
- Awarded Supplier BOQ view (post-award)
- Tags & Clarifications with EXACT format
- Full Pack export option
- Normalization Map export

#### 4. Issued BOQ Import Enhancement (Phase 5)
- Connect existing Excel import to new boq_lines structure
- Source tracking (Issued BOQ vs Quotes vs Fire Schedule)

### 🔧 EXTEND VS ADD NEW

#### EXTEND EXISTING:
1. **BOQ Builder Page** - Add Fire Engineer Schedule import panel
2. **BOQ Exporter** - Add new export types, adjust to exact spec
3. **Excel BOQ Import** - Map to boq_lines with Source field
4. **Tag Library** - Already complete, just verify usage

#### ADD NEW:
1. Fire Engineer Schedule parser
2. Schedule-BOQ matching engine
3. Schedule comparison UI panel
4. New database tables for schedules
5. Manual linking UI
6. Additional export formats

---

## IMPLEMENTATION PHASES

### PHASE 1 - Fire Engineer Schedule Import (Passive Fire Only)

#### 1.1 Database Migration
**File**: `supabase/migrations/YYYYMMDD_add_fire_engineer_schedule_system.sql`

Create tables:
```sql
-- fire_engineer_schedules
- id, projectId, moduleKey, scheduleName, revisionLabel
- sourceFileName, sourceStorageKey
- importedByUserId, importedAt
- isActive, notes

-- fire_engineer_schedule_rows
- id, scheduleId, pageNumber, rowIndex
- solutionId, systemClassification, substrate, orientation
- frrRating, serviceType
- serviceSizeText, serviceSizeMinMm, serviceSizeMaxMm
- insulationType, insulationThicknessMm
- testReference, notes
- rawText (required), parseConfidence (required)
```

#### 1.2 Fire Schedule Parser Service
**File**: `src/lib/parsers/fireScheduleParser.ts`

Features:
- Detect schedule section (Appendix A, Passive Fire Schedule headers)
- Extract table rows only (exclude narrative)
- Parse into structured fields
- Calculate parse confidence per row
- Store raw text alongside structured data

#### 1.3 UI Components
**File**: `src/components/FireScheduleImport.tsx`
- Upload button
- PDF preview with schedule section highlighted
- Parsed rows table with confidence indicators
- Confirm/reject workflow

**Integration**: Add to BOQ Builder page (`src/pages/BOQBuilder.tsx`)

#### 1.4 Fire Schedule Export
Add to export dropdown:
- "Export Fire Engineer Schedule (Excel)"
- Tabs: SCHEDULE_ROWS, RAW_TEXT, PARSER_LOG

---

### PHASE 2 - BOQ Builder Enhancements

#### 2.1 Source Tracking
Add `source` field to boq_lines:
- 'quote' | 'issued_boq' | 'fire_schedule' | 'mixed'

#### 2.2 Fire Schedule Comparison Panel
**File**: `src/components/FireScheduleComparisonPanel.tsx`

Display side-by-side:
- Fire Engineer Schedule rows
- BOQ lines
- Match status & confidence
- Mismatch reasons

---

### PHASE 3 - Intelligent Matching Engine

#### 3.1 Database
**File**: Add to migration

Create `schedule_boq_links`:
```sql
- projectId, moduleKey, scheduleRowId, boqLineId
- linkType ('manual' | 'auto')
- matchType ('exact' | 'strong' | 'weak' | 'none')
- matchConfidence (0-1)
- mismatchReason
- createdAt, updatedAt
```

#### 3.2 Matching Service
**File**: `src/lib/matching/scheduleBoqMatcher.ts`

Two-stage algorithm:
1. **Stage A - Deterministic**:
   - systemClassification
   - serviceType + size (min/max)
   - frrRating + substrate
   - Result: exact | none

2. **Stage B - Fuzzy**:
   - Tokenized similarity
   - Synonym dictionary
   - Numeric extraction (Ø, WxH patterns)
   - Result: strong | weak | none

Per match produce:
- matchType, matchConfidence, mismatchReason

#### 3.3 Manual Override UI
**File**: `src/components/ManualScheduleLinking.tsx`
- Drag-drop or select to link
- Persist to schedule_boq_links
- Auto-match never overwrites manual links

---

### PHASE 4 - Commercial Export Packs

#### 4.1 Master BOQ Export (Exact Spec)
**File**: Update `src/lib/boq/boqExporter.ts`

**Workbook Tabs**:
1. README_CONTROLS
2. MASTER_BOQ (EXACT COLUMNS):
   - Identity: BOQ_Line_ID, Trade_Module, System, System_Code, Location_Zone, Level, Drawing_Ref, Spec_Ref, Source
   - Technical: Item_Description, Attributes_JSON, Size_Value, Size_Unit, Rating, Material, Install_Type, Compliance_Standard
   - Quantification: Quantity, Unit, Measure_Rule, Confidence
   - Supplier Pricing (dynamic): Supplier_<Name>_Rate, Supplier_<Name>_Total, Supplier_<Name>_Clarification_Flag, Supplier_<Name>_Exclusion_Flag
   - Commercial: Lowest_Rate, Lowest_Supplier, Highest_Rate, Pricing_Spread_%, Unpriced_By, Scope_Gap_Flag, Mismatch_Flag, Notes_Internal
   - Issue-ready: Main_Contractor_Comment, Supplier_Comment

3. SCOPE_GAPS (EXACT COLUMNS):
   - Gap_ID, Related_BOQ_Line_ID, Supplier, Gap_Type, Description, Expected_Requirement, Risk, Commercial_Treatment, Status, Evidence

4. NORMALIZATION_MAP (EXACT COLUMNS):
   - Supplier, Original_Line_Text, Mapped_BOQ_Line_ID, Mapping_Confidence, Reason

#### 4.2 Tags & Clarifications Export
**File**: Update `src/lib/boq/boqExporter.ts` - Add function `exportTagsClarifications()`

**Workbook**: `TAGS_CLARIFICATIONS_<Project>_<Module>_<Date>.xlsx`

**Sheet TAGS_CLARIFICATIONS (EXACT COLUMNS)**:
- Tag_ID, Module, Category, Tag_Title, Tag_Text, Default_Selected, Risk_Level, Applies_To
- Main_Contractor_Name, Main_Contractor_Comment
- Supplier_Name, Supplier_Comment
- Status, Owner, Date_Added

#### 4.3 Awarded Supplier BOQ Export
**File**: Add to `src/lib/boq/boqExporter.ts`

Export type: `awarded_boq`
- Filter/prioritize awarded supplier columns
- Highlight awarded supplier rates
- Show only relevant gaps for awarded supplier

#### 4.4 Export Dropdown Additions
**File**: Update `src/components/ExportDropdown.tsx` or BOQ Builder page

Add options:
- ✅ Export Master BOQ (Owner Baseline)
- ✅ Export Scope Gaps Register
- ✅ Export Normalisation Map
- ✅ Export Tags & Clarifications Register
- ✅ Export Full Pack (ZIP or single workbook)
- Post-award only:
  - ✅ Export Awarded Supplier BOQ

---

### PHASE 5 - Issued BOQ Import

#### 5.1 Enhance Existing Import
**File**: Update `src/pages/ExcelBOQImport.tsx`

Changes:
- Map imported rows to boq_lines with `source = 'issued_boq'`
- Simple column mapping UI (reuse existing)
- Store mapping config for reuse

---

### PHASE 6 - Acceptance Criteria

#### Pre-Award
- [ ] Fire Engineer Schedule Import (Passive Fire):
  - [ ] Upload PDF
  - [ ] Auto-detect schedule section
  - [ ] Parse rows with confidence scoring
  - [ ] Preview + confirm workflow
  - [ ] Store in database
  - [ ] Export schedule extract Excel

- [ ] BOQ Builder:
  - [ ] Generates Master BOQ from quotes
  - [ ] Can import issued BOQ
  - [ ] Compares against Fire Engineer Schedule
  - [ ] Shows match status & confidence
  - [ ] Manual override linking
  - [ ] Produces Scope Gaps register
  - [ ] Produces Normalization Map

- [ ] Matching Engine:
  - [ ] Two-stage matching (deterministic + fuzzy)
  - [ ] Confidence scoring
  - [ ] Mismatch reason detection
  - [ ] Manual links persist and are respected
  - [ ] Never overwrites manual links

- [ ] Exports (Exact Format):
  - [ ] Master BOQ Excel (exact tabs/headers)
  - [ ] Scope Gaps Excel (exact headers)
  - [ ] Normalization Map Excel (exact headers)
  - [ ] Tags & Clarifications Excel (exact headers)
  - [ ] Full Pack export

#### Post-Award
- [ ] Awarded Supplier BOQ export

#### No Regressions
- [ ] Existing quote parsing still works
- [ ] Existing award process unchanged
- [ ] Existing exports (Award Report, Supplier Comparison) work
- [ ] All modules supported (not just Passive Fire)

---

## MODULE SUPPORT

### Passive Fire (Full Support)
- Fire Engineer Schedule import ✓
- All BOQ features ✓
- All exports ✓

### Other Modules (BOQ Only)
- Electrical, HVAC, Plumbing, Active Fire:
  - Master BOQ generation ✓
  - Scope Gaps ✓
  - Tags & Clarifications ✓
  - Exports ✓
  - NO Fire Schedule import (Passive Fire specific)

---

## FILE STRUCTURE

### New Files to Create:
```
src/lib/parsers/fireScheduleParser.ts
src/lib/matching/scheduleBoqMatcher.ts
src/lib/matching/synonymDictionary.ts
src/components/FireScheduleImport.tsx
src/components/FireScheduleComparisonPanel.tsx
src/components/ManualScheduleLinking.tsx
supabase/migrations/YYYYMMDD_add_fire_engineer_schedule_system.sql
```

### Files to Modify:
```
src/pages/BOQBuilder.tsx - Add fire schedule panel
src/lib/boq/boqExporter.ts - Add exact format exports
src/pages/ExcelBOQImport.tsx - Connect to boq_lines
src/types/boq.types.ts - Add fire schedule types
```

---

## IMPLEMENTATION ORDER

1. ✅ Discovery Complete
2. 🔄 Create database migration for fire schedules
3. 🔄 Create fire schedule parser service
4. 🔄 Add fire schedule import UI
5. 🔄 Create matching engine
6. 🔄 Update BOQ exporter with exact formats
7. 🔄 Add awarded supplier export
8. 🔄 Test across all modules
9. 🔄 Document usage

---

## NOTES

- Reuse existing PDF parsing infrastructure
- Reuse existing Excel export patterns
- Keep all new logic in dedicated services
- No changes to legacy quote parsing
- No changes to existing award logic
- All features module-agnostic except Fire Schedule (Passive Fire only)
- Deterministic exports (same inputs → same output order)
