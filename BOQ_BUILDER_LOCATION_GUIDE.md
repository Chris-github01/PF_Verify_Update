# BOQ Builder + Fire Schedule Location Guide

## 📍 Where is BOQ Builder in the App?

### Navigation Path

**Pre-Award Workflow → Step 7: BOQ Builder**

```
Project Dashboard
  → Import Quotes (Step 1)
  → Quote Select (Step 2)
  → Review & Clean (Step 3)
  → Quote Intelligence (Step 4)
  → Scope Matrix (Step 5)
  → Equalisation Analysis (Step 6)
  → 🎯 BOQ Builder (Step 7) ← YOU ARE HERE
  → Award Reports (Step 8)
```

### Accessing BOQ Builder

1. **From Sidebar:**
   - Click on "Pre-Award" section
   - Click on "BOQ Builder" (📊 FileSpreadsheet icon)

2. **From URL:**
   - Direct link: `/project/{projectId}/boq-builder`

3. **From Workflow:**
   - Complete steps 1-6 (or skip them)
   - Navigate to BOQ Builder step

---

## 🔥 Fire Engineer Schedule Import (NEW)

### Location in BOQ Builder

The Fire Schedule Import is a **new tab** in BOQ Builder:

**BOQ Builder → Fire Engineer Schedule Tab**

**Important:** This tab **only appears for Passive Fire** projects.

### Tabs in BOQ Builder

1. **Baseline BOQ Lines** - Shows normalized BOQ from quotes
2. **Tenderer Mapping** - How suppliers map to BOQ lines
3. **Scope Gaps Register** - Missing/unclear scope items
4. **Tags & Clarifications** - Dual-party comment system
5. **🔥 Fire Engineer Schedule** ← NEW (Passive Fire only)

---

## 🎬 How to Use Fire Schedule Import

### Step-by-Step Guide

#### 1. Navigate to BOQ Builder
- Go to your Passive Fire project
- Click "BOQ Builder" in the sidebar

#### 2. Open Fire Engineer Schedule Tab
- Click the "🔥 Fire Engineer Schedule" tab
- You'll see a green checkmark (✓) badge once a schedule is imported

#### 3. Upload PDF
- Click "Select PDF File" button
- Choose your fire engineer PDF (Appendix A, Fire Stopping Schedule, etc.)
- System automatically detects and extracts the schedule section

#### 4. Review Parsed Rows
After parsing, you'll see:
- **Total Rows** - Number of schedule rows detected
- **Average Confidence** - Overall parsing quality (0-100%)
- **Low Confidence** - Rows that need review
- **Missing Fields** - Count of incomplete rows

**Table Preview:**
- ✅ Green confidence badge (≥80%) - High quality
- ⚠️ Yellow confidence badge (60-79%) - Medium quality
- 🔴 Red confidence badge (<60%) - Low quality, needs review

#### 5. Confirm Import
- Review the parsed data
- Click "Confirm & Import X Rows"
- Schedule is saved to database
- Ready for BOQ comparison and matching

---

## 📊 What Happens After Import?

### Data Stored

The system stores:
1. **Schedule Metadata:**
   - File name
   - Upload date/time
   - Revision label
   - Active status

2. **Schedule Rows (for each row):**
   - Solution ID (Fire Stop Ref)
   - System Classification
   - FRR Rating
   - Service Type (Electrical, Plumbing, HVAC, etc.)
   - Service Size (Ø110, 750x200, 0-50mm, etc.)
   - Substrate (Concrete, Plasterboard, etc.)
   - Test Reference (WARRES, BRE, etc.)
   - **Raw Text** (original line for audit)
   - **Parse Confidence** (quality score 0-1)

3. **Workflow Tracking:**
   - Project is marked as "fire_schedule_imported = true"
   - Timestamp recorded

### Next Steps (Coming Soon)

Once imported, you'll be able to:
- ✅ Compare Fire Schedule vs BOQ lines
- ✅ Auto-match schedule rows to BOQ
- ✅ Manually link unclear items
- ✅ Export comprehensive comparison reports

---

## 🎨 Visual Indicators

### In BOQ Builder Header
- Fire Schedule tab shows green checkmark (✓) when schedule imported

### Confidence Color Coding
- **Green** (≥80%): High confidence, all critical fields detected
- **Yellow** (60-79%): Medium confidence, some fields may need review
- **Red** (<60%): Low confidence, manual review required

### Summary Cards
Four stat cards show:
1. **Total Rows** - Count of schedule entries
2. **Avg Confidence** - Overall parsing quality (color-coded)
3. **Low Confidence** - How many rows need attention
4. **Missing Fields** - Sum of missing critical data

---

## 🔍 What the Parser Detects

### Auto-Detection
The parser automatically identifies:
- **Schedule Headers:**
  - "Passive Fire Schedule"
  - "Appendix A – Passive Fire"
  - "Fire Stopping Schedule"
  - "Penetration Schedule"
  - "PFP Schedule"

### Extracted Fields
For each row, the parser extracts:
- **Solution ID** - Alphanumeric reference (e.g., "PFP-001")
- **FRR Rating** - Fire resistance (e.g., "120 mins", "-/120/120")
- **Service Size** - Dimensions:
  - Diameter: "Ø110" → min=110, max=110
  - Range: "0-50mm" → min=0, max=50
  - Dimensions: "750x200" → min=200, max=750
- **Substrate** - Material (concrete, plasterboard, masonry, etc.)
- **Service Type** - Penetration type (electrical, cable, plumbing, pipe, HVAC, duct)
- **Test Reference** - Certification (WARRES, BRE, etc.)

### Confidence Calculation
Each row gets a confidence score based on:
- Number of detected columns vs expected
- Presence of critical fields (Solution ID, FRR, Size)
- Data quality and completeness

**Penalties Applied:**
- Missing Solution ID: -30%
- Missing FRR Rating: -20%
- Missing Service Size: -20%
- Missing System/Substrate: -10%

---

## 🗂️ File Structure

### New Files Created

**UI Component:**
```
src/components/FireScheduleImport.tsx
```
- Upload interface
- PDF parsing workflow
- Preview table
- Import confirmation

**Parser Service:**
```
src/lib/parsers/fireScheduleParser.ts
```
- Schedule section detection
- Row extraction
- Field parsing
- Confidence scoring

**Database Migration:**
```
supabase/migrations/20260204000000_add_fire_engineer_schedule_system.sql
```
- fire_engineer_schedules table
- fire_engineer_schedule_rows table
- schedule_boq_links table (for matching)

**Type Definitions:**
```
src/types/boq.types.ts
```
- FireEngineerSchedule
- FireEngineerScheduleRow
- ScheduleBOQLink
- Supporting types

### Modified Files

**BOQ Builder Page:**
```
src/pages/BOQBuilder.tsx
```
- Added Fire Schedule tab (Passive Fire only)
- Integrated FireScheduleImport component
- Tab visibility logic

---

## 🔐 Security & Access

### Row Level Security (RLS)
All fire schedule data has RLS policies:
- Users can only see schedules for their organisation's projects
- Full CRUD access for organisation members
- Service role bypass for automated processes

### Module Restriction
Fire Engineer Schedule import is **Passive Fire only**:
- Tab doesn't appear for Electrical, HVAC, Plumbing, Active Fire
- Database constraint enforces `module_key = 'passive_fire'`
- All other BOQ features work across all modules

---

## 📈 Status & Next Steps

### ✅ Completed (Production Ready)
- Database schema with RLS
- Fire schedule PDF parser
- Import UI with preview
- Confidence scoring
- Data persistence
- Tab integration in BOQ Builder

### 🔄 In Progress
- Schedule-BOQ matching engine (two-stage: deterministic + fuzzy)
- Fire Schedule vs BOQ comparison panel
- Manual linking UI

### 📋 Planned
- Schedule export to Excel
- Auto-matching with confidence thresholds
- Mismatch reason reporting
- Full commercial pack exports

---

## 🚀 Quick Start

1. **Open Project:**
   - Navigate to a Passive Fire project

2. **Go to BOQ Builder:**
   - Sidebar → Pre-Award → BOQ Builder

3. **Import Schedule:**
   - Click "Fire Engineer Schedule" tab
   - Click "Select PDF File"
   - Choose fire engineer PDF
   - Review parsed rows
   - Click "Confirm & Import"

4. **Done!**
   - Schedule is saved
   - Ready for comparison (coming soon)

---

## 💡 Tips

### Best Results
- Use clear, structured PDFs (not scanned images)
- Ensure schedule section has table format
- PDFs with clear headers parse better
- Check confidence scores after parsing

### Low Confidence?
If you get low confidence scores:
- Review the parsed preview table
- Check if critical fields are detected
- Verify PDF has standard table structure
- Consider manual data entry for complex formats

### Module-Specific
Fire Schedule import is **Passive Fire specific**:
- Other modules use standard BOQ Builder features
- All modules share: Baseline BOQ, Gaps, Tags, Exports

---

## 📞 Support

### Build Status
✅ **All systems operational**
- Database: Deployed
- Parser: Functional
- UI: Integrated
- Types: Complete

### Documentation
- Implementation Plan: `TIER1_BOQ_IMPLEMENTATION_PLAN.md`
- Status Report: `TIER1_BOQ_IMPLEMENTATION_STATUS.md`
- This Guide: `BOQ_BUILDER_LOCATION_GUIDE.md`

---

## 🎯 Summary

**BOQ Builder Location:**
- **Sidebar:** Pre-Award → BOQ Builder
- **Workflow:** Step 7 (after Equalisation, before Award Reports)
- **URL:** `/project/{projectId}/boq-builder`

**Fire Schedule Import:**
- **Tab:** Fire Engineer Schedule (5th tab)
- **Visibility:** Passive Fire projects only
- **Status:** Production ready, fully functional

**Current Features:**
- ✅ PDF upload and parsing
- ✅ Automatic schedule detection
- ✅ Structured field extraction
- ✅ Confidence scoring
- ✅ Preview before import
- ✅ Database persistence with RLS

**Coming Soon:**
- 🔄 BOQ comparison and matching
- 🔄 Manual linking interface
- 🔄 Schedule exports
