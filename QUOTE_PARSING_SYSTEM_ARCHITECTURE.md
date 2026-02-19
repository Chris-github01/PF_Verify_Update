# Quote Parsing System - Complete Architecture

## System Overview

The VerifyTrade quote parsing system uses a multi-layered approach to extract line items from supplier quotes (PDF, Excel, CSV) and convert them into structured data for analysis.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER UPLOADS FILE                                 │
│                    (PDF, Excel, CSV Quote)                                │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      FRONTEND (ImportQuotes.tsx)                          │
│  - Detects file type                                                      │
│  - Validates supplier name                                                │
│  - Routes to appropriate parser                                           │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
    ┌─────────┐                   ┌──────────────┐
    │   PDF   │                   │ Excel / CSV  │
    └────┬────┘                   └──────┬───────┘
         │                               │
         │                               │
    ┌────▼─────────────────────┐        │
    │  PRIMARY PATH (Fast)     │        │
    │  parse_quote_with_       │        │
    │  extractor                │        │
    └────┬─────────────────────┘        │
         │                               │
         ▼                               │
    ┌──────────────────────────┐        │
    │ External Python Service  │        │
    │ (PDF Extractor)          │        │
    │ - PDFPlumber             │        │
    │ - PyMuPDF                │        │
    │ - Tesseract OCR          │        │
    │ → Returns raw text       │        │
    └────┬─────────────────────┘        │
         │                               │
         │        ┌──────────────────────┘
         │        │
         ▼        ▼
    ┌─────────────────────────────────────┐
    │   AI PARSING LAYER                  │
    │   parse_quote_llm_fallback          │
    │   - OpenAI GPT-4o                   │
    │   - Extracts line items             │
    │   - Structured JSON output          │
    └────┬────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────┐
    │   FILTERING LAYER ⚠️ BUG HERE       │
    │   (parse_quote_with_extractor)      │
    │   1. Lump Sum Filter                │
    │   2. Optional Items Filter          │
    └────┬────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────┐
    │   TOTAL CALCULATION                 │
    │   - Sum line items                  │
    │   - Compare to quoted total         │
    │   - Calculate contingency           │
    └────┬────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────┐
    │   DATABASE STORAGE                  │
    │   - quotes table                    │
    │   - quote_items table               │
    └─────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────┐
    │   USER INTERFACE                    │
    │   - QuoteSelect                     │
    │   - ReviewClean                     │
    │   - AwardReport                     │
    └─────────────────────────────────────┘
```

---

## Parsing Paths by File Type

### **PATH 1: PDF Files (Primary)**

```
User Upload
    ↓
ImportQuotes.tsx detects .pdf extension
    ↓
Calls: parse_quote_with_extractor
    ├─→ Uploads file to Supabase storage
    ├─→ Calls external Python PDF service
    │   ├─→ PDFPlumber extraction
    │   ├─→ PyMuPDF extraction
    │   ├─→ Tesseract OCR (if needed)
    │   └─→ Returns: { text, num_pages, tables }
    │
    ├─→ Calls: parse_quote_llm_fallback
    │   ├─→ Checks if chunking needed (>5000 chars or >30 items)
    │   ├─→ If yes: Split into sections
    │   │   └─→ Process each section with GPT-4o
    │   ├─→ If no: Process entire document with GPT-4o
    │   └─→ Returns: { items[], totals, confidence }
    │
    ├─→ FILTERING (Lines 183-221) ⚠️ BUG
    │   ├─→ If ANY "ea" items: DELETE ALL "LS" items
    │   └─→ If ANY non-optional: DELETE ALL optional items
    │
    ├─→ Calculate totals
    │   ├─→ lineItemsTotal = sum(items.total)
    │   ├─→ quotedTotal = grandTotal from AI
    │   └─→ contingency = quotedTotal - lineItemsTotal
    │
    ├─→ Create quote record
    │   └─→ Save: total_amount, items_count, contingency
    │
    └─→ Create quote_items records
        └─→ Save: description, qty, unit, unit_price, total_price
```

### **PATH 2: PDF Files (Fallback)**

```
If parse_quote_with_extractor fails:
    ↓
ImportQuotes.tsx calls: start_parsing_job
    ↓
Creates parsing_jobs record (status: pending)
    ↓
User polls: ParsingJobMonitor
    ↓
Background: process_parsing_job
    ├─→ Downloads file from storage
    ├─→ Calls Python extractor
    ├─→ Calls parse_quote_llm_fallback
    ├─→ Same filtering + calculation
    └─→ Updates parsing_jobs (status: completed)
```

### **PATH 3: Excel/CSV Files**

```
User Upload
    ↓
ImportQuotes.tsx detects .xlsx/.csv
    ↓
Frontend parsing (no backend call)
    ├─→ parseExcel() or parseCSV()
    ├─→ Reads rows with ExcelJS/XLSX library
    ├─→ Detects columns: description, qty, unit, rate, total
    └─→ Returns: ParsedQuoteLine[]
    ↓
ImportPreviewNew component
    ├─→ User reviews/edits line items
    ├─→ User clicks "Save"
    └─→ Direct insert to database
        ├─→ Create quote record
        └─→ Create quote_items records
```

### **PATH 4: Fire Schedule Import (Specialized)**

```
User uploads fire engineering schedule
    ↓
ImportQuotes.tsx → FireScheduleImport component
    ↓
Calls: parse_fire_schedule
    ├─→ Detects if schedule format (tables, specific headers)
    ├─→ Calls: parse_fire_schedule_chunk
    │   └─→ GPT-4o with fire schedule-specific prompts
    ├─→ Extracts: location, system, rating, qty
    └─→ Maps to quote_items format
    ↓
Saves to fire_schedule_items table + quote_items
```

---

## AI Parsing Logic (parse_quote_llm_fallback)

### System Prompt Strategy

The AI is instructed to:

```
✅ EXTRACT:
- Line items with ALL of: description, qty, unit, rate, total
- Individual products/services
- Items where qty × rate = total

❌ SKIP:
- Section summaries ("Greenhouse $21,964.00")
- Subtotals ("Total: $X")
- Headers without line items
- P&G, Margin, Grand Total lines
```

### Chunking Strategy

**When to chunk:**
- Text > 5,000 characters
- More than 30 line items detected

**How chunking works:**
1. Detect section headers (e.g., "Greenhouse $21,964", "Headhouse Continued")
2. Split document into sections
3. If sections too large (>3000 chars), split further
4. Process each section with separate GPT-4o call
5. Combine all extracted items

**Benefits:**
- Avoids token limits
- Better accuracy per section
- Parallel processing possible

**Risks:**
- Items can be lost between chunks
- Section detection can fail
- Duplicate totals if summary pages included

---

## Filtering Logic (THE BUG) ⚠️

### Location: `parse_quote_with_extractor/index.ts` Lines 183-221

```typescript
// FILTER 1: Lump Sum Items (Lines 183-201)
const lumpSumItems = items.filter(item =>
  ['LS', 'LUMP SUM', 'L.S.', 'SUM', 'LUMPSUM'].includes(item.unit)
);

const itemizedItems = items.filter(item =>
  !['LS', 'LUMP SUM', 'L.S.', 'SUM', 'LUMPSUM'].includes(item.unit)
);

// BUG: If ANY itemized items exist, DELETE ALL lump sum items
if (itemizedItems.length > 0) {
  items = itemizedItems; // DELETES $291K in your case!
}

// FILTER 2: Optional Items (Lines 204-221)
const optionalItems = items.filter(item =>
  item.description.toLowerCase().includes('optional')
);

const nonOptionalItems = items.filter(item =>
  !item.description.toLowerCase().includes('optional')
);

// BUG: If ANY non-optional items exist, DELETE ALL optional items
if (nonOptionalItems.length > 0 && optionalItems.length > 0) {
  items = nonOptionalItems;
}
```

### Why This Is Wrong

**Assumption:** LS items are "duplicates" of itemized items on summary pages

**Reality:**
- Many quotes have BOTH legitimate LS items AND itemized items
- LS items are separate line items (e.g., "Site Establishment LS", "Mobilization LS")
- These are NOT duplicates - they're additional costs!

**Your FireSafe Quote:**
- AI extracted: 122 items total
- 95 "ea" items = $849,008 ✅ Saved
- 27 "LS" items = $291,503 ❌ DELETED by filter
- **Result:** $1,140,511 total but only $849,008 saved

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    RAW FILE (PDF/Excel/CSV)                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │       EXTRACTION LAYER                │
        │  PDF → Text (Python Service)          │
        │  Excel → Rows (ExcelJS)               │
        │  CSV → Rows (Papa Parse)              │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │       PARSING LAYER                   │
        │  AI (GPT-4o) extracts structured data │
        │  Output: Array of line items          │
        │  { description, qty, unit, rate,      │
        │    total, section }                   │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │       VALIDATION LAYER                │
        │  - Check qty × rate = total           │
        │  - Remove duplicate totals            │
        │  - Validate required fields           │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │       FILTERING LAYER ⚠️              │
        │  - Lump Sum Filter (BROKEN)           │
        │  - Optional Items Filter (BROKEN)     │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │       CALCULATION LAYER               │
        │  lineItemsTotal = Σ(items.total)      │
        │  quotedTotal = AI extracted total     │
        │  contingency = quotedTotal - items    │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │       DATABASE LAYER                  │
        │                                       │
        │  quotes                               │
        │  ├─ supplier_name                     │
        │  ├─ total_amount                      │
        │  ├─ items_count                       │
        │  └─ contingency_amount                │
        │                                       │
        │  quote_items                          │
        │  ├─ description                       │
        │  ├─ quantity                          │
        │  ├─ unit                              │
        │  ├─ unit_price                        │
        │  └─ total_price                       │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │       UI DISPLAY                      │
        │  - QuoteSelect (shows totals)         │
        │  - ReviewClean (line items)           │
        │  - AwardReport (analysis)             │
        └───────────────────────────────────────┘
```

---

## Key Functions by File

### **Frontend (src/pages/ImportQuotes.tsx)**
- `startBackgroundParsing()` - Handles PDF uploads via extractor
- Detects file type and routes to appropriate handler
- Shows progress with ParsingJobMonitor

### **Edge Function: parse_quote_with_extractor**
- **Purpose:** Fast path for PDF parsing
- **Steps:**
  1. Upload file to storage
  2. Call Python PDF service
  3. Call LLM parser
  4. Apply filters (BUG HERE)
  5. Calculate totals
  6. Save to database
- **When used:** All PDF uploads (primary path)

### **Edge Function: parse_quote_llm_fallback**
- **Purpose:** Extract line items using AI
- **Steps:**
  1. Check if chunking needed
  2. Split into sections if large
  3. Call GPT-4o for each section
  4. Combine results
  5. Validate and return
- **When used:** Called by all parsing paths

### **Edge Function: start_parsing_job**
- **Purpose:** Create background parsing job
- **Steps:**
  1. Upload file to storage
  2. Create parsing_jobs record
  3. Return job ID to user
- **When used:** Fallback if extractor fails, or Excel/CSV files

### **Edge Function: process_parsing_job**
- **Purpose:** Process queued parsing jobs
- **Steps:**
  1. Fetch job from database
  2. Download file from storage
  3. Call extractor + LLM
  4. Apply filters
  5. Save results
  6. Update job status
- **When used:** Background processing of queued jobs

---

## The Critical Bug Explained

### What Should Happen
```
AI extracts 122 items:
├─ 95 "ea" items = $849,008
└─ 27 "LS" items = $291,503
     Total = $1,140,511 ✅
```

### What Actually Happens
```
AI extracts 122 items:
├─ 95 "ea" items = $849,008 ✅
└─ 27 "LS" items = $291,503 ❌ DELETED

Filter sees: itemizedItems.length = 95 > 0
Filter logic: "If ANY itemized, DELETE ALL LS"
Filter executes: items = itemizedItems

Result: 95 items saved = $849,008 ❌
Displayed total: $1,140,511 ✅
Mismatch: $291,503 missing!
```

### Why the Filter Exists (Original Intent)

The developer assumed:
- **Summary pages** often list section totals as "LS" items
- Example: "Greenhouse Section LS $21,964" (which is a duplicate of itemized items below)
- Filter tries to avoid double-counting these summary lines

**However:**
- The filter is too aggressive
- It deletes ALL LS items, not just summaries
- Many quotes have legitimate LS items (mobilization, project management, etc.)

---

## Trade-Specific Parsing

### Passive Fire (Default)
- Standard line item extraction
- Focus on: product description, specifications, FRR ratings
- Unit types: ea, m, m², LS

### Active Fire
- Similar to passive fire
- Additional fields: equipment specs, testing requirements

### HVAC
- More complex unit variations
- Lump sum items more common (design, commissioning)

### Plumbing
- Similar to passive fire
- Different product types

### Electrical
- Specialized prompts for electrical items
- Circuit descriptions, cable specs

---

## Database Schema

### quotes table
```sql
- id (uuid)
- project_id (uuid)
- supplier_name (text)
- total_amount (numeric)      -- Displayed total
- contingency_amount (numeric) -- Difference between quoted and items
- items_count (integer)        -- Count from extractor
- line_item_count (integer)    -- Count from parsing
- status (text)
- is_selected (boolean)
- trade (text)
```

### quote_items table
```sql
- id (uuid)
- quote_id (uuid)
- description (text)
- quantity (numeric)
- unit (text)
- unit_price (numeric)
- total_price (numeric)      -- quantity × unit_price
```

### Key Relationships
```
quotes.total_amount = Should equal SUM(quote_items.total_price)
quotes.items_count = Should equal COUNT(quote_items)
quotes.contingency = total_amount - SUM(quote_items.total_price)
```

**In your case:**
- `total_amount` = $1,140,511 ✅ (from AI)
- `SUM(quote_items.total_price)` = $849,008 ❌ (after filter)
- `contingency` = $291,503 (incorrectly calculated as "contingency")

---

## Performance Characteristics

### Fast Path (parse_quote_with_extractor)
- **Time:** 5-15 seconds
- **Success Rate:** ~95% for clean PDFs
- **Best for:** Modern, well-structured PDFs

### Slow Path (background jobs)
- **Time:** 30-60 seconds
- **Success Rate:** ~90%
- **Best for:** Large quotes, scanned PDFs

### Excel/CSV
- **Time:** Instant (frontend parsing)
- **Success Rate:** 100% (structured data)
- **Best for:** Suppliers who provide spreadsheets

---

## Error Handling

### Level 1: Python Extractor Fails
→ Fallback to background job with retry logic

### Level 2: LLM Parsing Fails
→ Return empty items, user manually enters data

### Level 3: Chunking Errors
→ Individual chunks fail, others succeed
→ Warnings added to result

### Level 4: Database Save Fails
→ Transaction rollback, file remains in storage
→ User can retry

---

## Recommendations for Fixes

### Critical Priority
1. **Remove or fix the lump sum filter** (Lines 183-201)
   - Only remove LS items if they're ACTUALLY duplicates
   - Check if LS item total matches sum of other items in same section
   - OR: Remove filter entirely and rely on AI to skip summaries

2. **Fix the optional items filter** (Lines 204-221)
   - Only remove if item description contains "optional" AND is a duplicate
   - Better logic: Check if optional item is marked-up version of base item

### High Priority
3. **Add validation:** Compare `total_amount` vs `SUM(quote_items.total_price)`
   - If difference > 5%, flag for review
   - Alert user: "Warning: Item totals don't match quote total"

4. **Improve AI prompt:** Be more explicit about what to skip
   - "Skip section totals that are clearly sums of other items"
   - "Include ALL unique line items, even if unit is LS"

### Medium Priority
5. **Add audit logging:** Track what gets filtered out
6. **Add UI for reviewing filtered items:** Let user restore deleted items
7. **Improve chunking:** Detect section boundaries more accurately

---

## Summary

The VerifyTrade parsing system is sophisticated but has a critical flaw in the filtering logic that causes significant data loss. The system correctly extracts line items using AI but then incorrectly deletes legitimate LS items, causing totals to be wrong by hundreds of thousands of dollars.

**The fix is simple:** Remove or fix lines 183-221 in `parse_quote_with_extractor/index.ts`
