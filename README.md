# VerifyTrade — Construction Quote Intelligence Platform

> **Passive Solutions, Active Results.**
> VerifyTrade is a full-stack SaaS platform for construction procurement teams. It ingests subcontractor quotes (PDF and Excel), parses them into structured line items using a multi-stage AI pipeline, and provides scope comparison, equalisation, award reporting, contract management, and commercial control tooling.

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Getting Started](#getting-started)
5. [Environment Variables](#environment-variables)
6. [Architecture Overview](#architecture-overview)
7. [Quote Parsing System — Deep Dive](#quote-parsing-system--deep-dive)
   - [End-to-End Pipeline](#end-to-end-pipeline)
   - [Edge Functions](#edge-functions)
   - [Chunking Strategy](#chunking-strategy)
   - [LLM Extraction: Two-Phase Model](#llm-extraction-two-phase-model)
   - [Trade-Specific Parsing Behaviour](#trade-specific-parsing-behaviour)
   - [Deduplication & Normalization](#deduplication--normalization)
   - [Document Total Reconciliation](#document-total-reconciliation)
   - [LLM Prompts Reference](#llm-prompts-reference)
   - [Parsing File Reference](#parsing-file-reference)
8. [Supported Trade Modules](#supported-trade-modules)
9. [Application Workflow](#application-workflow)
10. [Database Schema Overview](#database-schema-overview)
11. [Shadow Admin System](#shadow-admin-system)
12. [Subcontractor Commercial Control (SCC)](#subcontractor-commercial-control-scc)
13. [Deployment](#deployment)
14. [Known Issues & Limitations](#known-issues--limitations)

---

## Platform Overview

VerifyTrade enables main contractors and quantity surveyors to:

- Upload subcontractor quotes (PDF or Excel) and have them automatically parsed into itemised line items
- Compare quotes across multiple suppliers side-by-side
- Identify scope gaps, price outliers, and coverage risks
- Equalise quotes against a common scope matrix
- Generate award reports and contract documentation
- Manage subcontractor commercial relationships post-award (claims, variations, retention)
- Track baselines and progress claims through a dedicated SCC (Subcontractor Commercial Control) module

Trades supported: Passive Fire, Plumbing, Electrical, HVAC/Mechanical, Active Fire, Carpentry.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| Backend / API | Supabase Edge Functions (Deno/TypeScript) |
| Database | Supabase (PostgreSQL) with Row Level Security |
| AI / LLM | OpenAI GPT-4o, Anthropic Claude 3.5 Sonnet |
| PDF Parsing | pdfjs-dist (client), Python ensemble service (pdfplumber, pymupdf, OCR) |
| Excel Parsing | xlsx, exceljs |
| File Storage | Supabase Storage |
| Auth | Supabase Auth (email/password) |
| Icons | Lucide React |
| Animations | Framer Motion |

---

## Project Structure

```
/
├── src/
│   ├── App.tsx                          # Root application + routing
│   ├── pages/                           # Page-level components
│   │   ├── ImportQuotes.tsx             # Legacy import page
│   │   ├── EnhancedImportQuotes.tsx     # Primary import UI
│   │   ├── ReviewClean.tsx              # Quote review/cleaning
│   │   ├── QuoteIntelligence.tsx        # Intelligence analysis
│   │   ├── ScopeMatrix.tsx              # Scope comparison matrix
│   │   ├── Equalisation.tsx             # Quote equalisation
│   │   ├── AwardReport.tsx              # Award report generation
│   │   ├── ContractManager.tsx          # Contract documentation
│   │   ├── scc/                         # Subcontractor Commercial Control
│   │   ├── shadow/                      # Internal admin/shadow system
│   │   └── admin/                       # Platform admin pages
│   ├── components/                      # Shared UI components
│   ├── lib/
│   │   ├── parsing/                     # Client-side parsing utilities
│   │   ├── tradeSpec/                   # Trade specification rules
│   │   ├── modules/parsers/             # Trade-specific module parsers
│   │   ├── reports/                     # Report generation engines
│   │   ├── comparison/                  # Quote comparison logic
│   │   ├── export/                      # Excel/PDF export utilities
│   │   └── supabase.ts                  # Supabase client singleton
│   ├── importer/                        # File importer utilities
│   └── types/                           # TypeScript type definitions
├── supabase/
│   ├── functions/                       # Edge Functions (Deno)
│   │   ├── start_parsing_job/           # Entry point: file upload
│   │   ├── process_parsing_job/         # Orchestrator: text extraction
│   │   ├── resume_parsing_job/          # Chunk aggregator & finalization
│   │   ├── parse_quote_llm_fallback_v2/ # Core two-phase LLM engine
│   │   ├── parse_quote_production/      # Multi-model extraction
│   │   ├── extract_quote_multi_model/   # OpenAI + Anthropic consensus
│   │   ├── chunk_pdf/                   # PDF page splitting
│   │   ├── chunk_xlsx/                  # Excel row splitting
│   │   ├── auto_retry_until_complete/   # Retry loop orchestrator
│   │   └── _shared/                     # Shared parsing utilities
│   └── migrations/                      # Database migration files
├── public/                              # Static assets & templates
├── python-pdf-service/                  # Optional Python ensemble parser
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Supabase project (database provisioned)

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Type check
npm run typecheck
```

---

## Environment Variables

Create a `.env` file at the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Edge Functions use the following environment variables (auto-populated by Supabase):

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
OPENAI_API_KEY
ANTHROPIC_API_KEY
PDF_EXTRACTOR_URL          # Optional: Python ensemble service URL
```

---

## Architecture Overview

```
Browser (React SPA)
       │
       ├── Supabase Auth (email/password)
       ├── Supabase Realtime (job status polling)
       └── Supabase Storage (file uploads)
               │
       Supabase Edge Functions (Deno)
               │
       ┌───────┴───────────────────┐
       │                           │
  OpenAI GPT-4o            Anthropic Claude
  (primary LLM)            (consensus/fallback)
               │
       PostgreSQL (Supabase)
       Row Level Security enforced on all tables
```

The application is a single-page app. All authentication, data, and file storage goes through Supabase. Heavy processing (PDF parsing, LLM calls) happens in Edge Functions running on Deno Deploy.

---

## Quote Parsing System — Deep Dive

The parsing system is the most complex part of the platform. It converts raw quote files (PDFs and Excel spreadsheets) into normalised, structured line items stored in the `quote_items` database table.

### End-to-End Pipeline

```
User uploads file via EnhancedImportQuotes.tsx
           │
           ▼
[1] start_parsing_job (Edge Function)
    - Validates auth + organisation membership
    - Sanitizes filename
    - Uploads file to Supabase Storage (quotes bucket)
    - Creates parsing_jobs record (status: "pending")
    - Fires process_parsing_job asynchronously
           │
           ▼
[2] process_parsing_job (Edge Function) — PRIMARY ORCHESTRATOR
    - Downloads file from storage
    - Detects file type: .pdf or .xlsx
    - Extracts raw text:
        PDF  → tries Python ensemble service (pdfplumber/pymupdf/OCR),
               confidence threshold: 0.7
               falls back to pdfjs if below threshold or service unavailable
        XLSX → uses xlsx library to convert rows to text
    - Measures document size

    IF document > 4,000 chars OR > 50 lines  (LARGE DOCUMENT PATH):
        → Splits into 2,500-char chunks with 3-line overlap
        → Saves chunks to parsing_chunks table (status: "pending")
        → Fires resume_parsing_job asynchronously
        → Returns early

    IF small document (FAST PATH):
        → Calls parse_quote_llm_fallback_v2 directly
        → Creates quote record + saves items
           │
           ▼
[3] resume_parsing_job (Edge Function) — CHUNK AGGREGATOR
    - Fetches all pending/failed chunks for this job
    - Processes up to 5 chunks in parallel
    - Calls parse_quote_llm_fallback_v2 on each chunk
    - Marks each chunk "completed" or "failed"
    - Aggregates all items from completed chunks

    TRADE-SPECIFIC OVERRIDES (applied after aggregation):

    If trade == "plumbing":
        → Runs extractPlumbingLevelTable() (regex) on full text
        → If regex finds >= 5 level-based rows, REPLACES all LLM level items
          with regex results (more accurate for structured plumbing tables)

    If trade == "carpentry":
        → Runs parseCarpentrySeraFormat() (deterministic parser)
        → If deterministic parser extracts >= 10 items, BYPASSES LLM entirely
        → Detects "x N levels" multiplier pattern in document
        → If found, adds synthetic "Levels Multiplier" item and adjusts total

    - Runs full deduplication pipeline
    - Reconciles sum of items against document total
    - Creates quote record in database
    - Deletes any old quote_items for this quote (prevents duplicates)
    - Inserts all final quote_items atomically
    - Updates parsing_job status to "completed"
           │
           ▼
[4] parse_quote_llm_fallback_v2 (Edge Function) — CORE LLM ENGINE
    Called per-chunk (or for full text on small documents).

    PHASE 1 — Row Detection (GPT-4o):
        Input:  raw text chunk
        Prompt: trade-specific row detection system prompt
        Output: {"rows": ["raw line 1", "raw line 2", ...]}

        The model identifies which lines are candidate line items.
        It does NOT yet extract structure — just filters out headers,
        summaries, contact details, payment terms, etc.

    PHASE 2 — Normalization (GPT-4o):
        Input:  raw candidate rows from Phase 1
        Prompt: trade-specific normalization system prompt
        Output: {"items": [{description, qty, unit, rate, total, confidence}]}

        The model extracts structured fields from each row:
        - description: clean item name
        - qty: numeric quantity (1 for lump sums)
        - unit: ea / m / m2 / lm / LS etc.
        - rate: unit price
        - total: line total
        - confidence: 0.0–1.0
           │
           ▼
[5] FINAL STORAGE
    - quotes table: metadata (supplier, total, items_count, trade, revision)
    - quote_items table: individual line items with all structured fields
    - parsing_jobs table: updated with status, timing, item counts
```

---

### Edge Functions

| Function | Role |
|---|---|
| `start_parsing_job` | Entry point. Handles file upload, creates job record, fires orchestrator. |
| `process_parsing_job` | Downloads file, extracts text, chunks if large, fires `resume_parsing_job`. |
| `resume_parsing_job` | Processes chunks in parallel, aggregates results, applies trade overrides, finalizes quote. |
| `parse_quote_llm_fallback_v2` | Two-phase LLM engine (detect rows → normalize). Primary parser for all trades. |
| `parse_quote_llm_fallback` | Legacy single-phase LLM parser. Used as fallback. |
| `parse_quote_production` | Multi-model extraction using OpenAI + Anthropic consensus. Used for complex documents. |
| `extract_quote_multi_model` | GPT-4o-mini primary, Claude 3.5 Sonnet secondary. Builds consensus from both models. |
| `parse_quote_ensemble` | Coordinates optional Python service (pdfplumber, pymupdf, Tesseract OCR). |
| `parse_quote_with_extractor` | Combines external PDF extractor with the v3 pipeline + plumbing sanitizer. |
| `chunk_pdf` | Splits PDFs into 15-page chunks with SHA256 manifests. |
| `chunk_xlsx` | Splits Excel sheets into 4,000-row chunks. |
| `auto_retry_until_complete` | Retry loop: calls `resume_parsing_job` up to 10 times until all chunks succeed. |

---

### Chunking Strategy

Large documents are split into overlapping chunks to stay within LLM context windows while preserving item continuity across page boundaries.

**Default chunking (process_parsing_job):**

```
Max chunk size:  2,500 characters
Overlap:         3 lines retained from end of previous chunk
```

**Advanced chunking (parse_quote_llm_fallback_v2):**

Three-tier strategy, tried in order:

1. **Section-based** — detect section headers and split at boundaries (keeps related items together)
2. **Line-based with overlap** — split by line count with 3-line lookback
3. **Fixed-size** — split at 3,200 character boundaries (fallback)

Chunks are stored in the `parsing_chunks` table with:
- `chunk_number` — sequential index
- `chunk_text` — the actual content
- `status` — pending / processing / completed / failed
- `parsed_items` — JSON array of items extracted from this chunk

---

### LLM Extraction: Two-Phase Model

Each chunk goes through two sequential GPT-4o calls:

**Phase 1: Row Detection**

The model acts as a filter. Given raw text, it identifies which lines are candidate line items and returns them as an array of raw strings. It does not extract structure yet. This phase is heavily trade-specific — a plumbing quote accepts lump-sum lines with just a description and a dollar amount, while a passive fire quote requires a quantity and a line total.

**Phase 2: Normalization**

The model takes the raw candidate rows and extracts structured fields: `description`, `qty`, `unit`, `rate`, `total`, `confidence`. Missing fields are calculated where possible (e.g., `rate = total / qty`).

This two-phase approach avoids the common LLM failure mode of trying to both identify and extract in a single pass, which leads to hallucinated quantities and missed items.

---

### Trade-Specific Parsing Behaviour

#### Passive Fire (default)

- **Valid item:** must have description + quantity + line total
- Section headers like "Electrical $2,490.50" are summaries — excluded
- "Optional Extras" rows with a real quantity and total are included
- `unit = "0"` or blank defaults to `"ea"`
- FRR (Fire Resistance Rating) extracted when present

#### Plumbing

- **Valid item:** can be a lump sum — just description + dollar amount
- Quantity defaults to `1`, unit defaults to `"LS"` for lump sums
- Item numbers ("Item NO. 3", "6.") are preserved in the description
- `extractPlumbingLevelTable()` regex runs on the full document text. If it finds a structured price table with 5+ rows (common in NZ plumbing quotes formatted as level-by-level breakdowns), these replace all LLM-extracted level items
- `sanitizePlumbingItems()` post-processes items to remove summary rows and detect OCR-induced digit-clipping artifacts (e.g., `"61490"` split into `"6"` and `"1490"`)

#### Carpentry

- Handles 5+ table formats (SERO full 11-column, GIB material-only, level-based lump sum, high-level section lump sum, numbered items)
- `parseCarpentrySeraFormat()` deterministic parser runs first. If it extracts ≥ 10 items, LLM is bypassed entirely
- Page-truncated rows (PDF cuts off the last column): `total = qty × overall_rate` is calculated
- European number format supported: `"38 076,42"` = `38076.42`
- Levels multiplier: if document contains `"x 17 levels"` annotation, a synthetic multiplier item is added and the quote total is adjusted
- Column depth up to 11: Description | Qty | Unit | Labour Rate | Labour Constant | Hourly Rate | Labour Total | Material Rate | Material Total | Overall Rate | Overall Total

#### Electrical / HVAC / Active Fire

These trades use the default passive fire parsing rules with no custom overrides.

---

### Deduplication & Normalization

After all chunks are processed and aggregated, the following pipeline runs:

```
Raw aggregated items (may contain duplicates from overlapping chunks)
           │
           ▼
[1] filterTotalRows()
    Removes items where description matches known summary labels:
    "Total", "Grand Total", "Subtotal", "Sub Total", "Sub-Total",
    "Net Total", "Contract Sum", "Quote Total", "Tender Total",
    "P&G", "Margin", "GST", "Contract Value", "Overall Total"
           │
           ▼
[2] normalizeLine()
    For each item:
    - Extracts description from raw_text if missing
    - If qty = 0 and total > 0: sets qty = 1 (lump sum recovery)
    - If rate = 0 and qty > 0 and total > 0: calculates rate = total / qty
    - If total = 0 and qty > 0 and rate > 0: calculates total = qty × rate
    - Normalizes unit: "0", "N/A", "-", "" → "ea"
           │
           ▼
[3] dedupeKey()
    Builds a string key for each item:
    key = toLower(description) + "|" + qty + "|" + unit + "|" + rate
           │
           ▼
[4] Set-based deduplication
    Tracks seen keys in a Set.
    First occurrence of a key is kept; subsequent occurrences are discarded.
    This handles items that appear in multiple overlapping chunks.
           │
           ▼
[5] isArithmeticTotal() check
    For each remaining item: checks if its total equals the arithmetic sum
    of all other items. If so, it is a grand total row that survived the
    label filter — discarded.
```

---

### Document Total Reconciliation

After deduplication, the system compares the sum of all extracted items against the document's declared total (found by scanning for "Grand Total", "Total Price", etc.).

If a discrepancy exists and is greater than $100:

```
remainder = documentTotal - sum(extractedItems)
```

A synthetic `"Remainder Adjustment"` item is added to account for the difference. This ensures the stored quote total matches the original document and flags cases where items were missed.

---

### LLM Prompts Reference

#### Row Detection — Passive Fire / Electrical / HVAC / Active Fire (default)

> You are a line item detector for construction quotes.
>
> Your ONLY job is to identify which lines are PRICED line items — items that have an actual quantity AND a line total.
>
> A valid line item MUST have:
> - A product or service description
> - A quantity (a number > 0)
> - A line total price (the final dollar amount)
>
> CRITICAL: In some quotes the "Unit" column contains "0" or is blank. This does NOT mean the quantity is zero.
> Example: "Trafalgar SuperSTOPPER 350x125x250mm ... 1276 0 $365.00 $465,740.00"
> → This IS a valid line item: qty=1276, unit="0" means "each", rate=$365, total=$465,740
>
> DO NOT extract:
> - Section header lines like "Electrical $2,490.50"
> - Subtotals / Grand Totals / Summary lines
> - GST / tax lines
> - Rate schedule rows (description + unit rate, but NO quantity and NO line total)
> - Any section labelled "Excluded" or "Exclusions"
> - IMPORTANT: Do NOT skip rows under "Optional Extras" — if a row has a real quantity AND a real line total, INCLUDE it
>
> Return JSON: `{"rows": ["raw line 1", "raw line 2", ...]}`

---

#### Row Detection — Plumbing

> You are a line item detector for plumbing construction quotes.
>
> Plumbing quotes are often presented as LUMP SUM items — a scope description paired with a single total price, without individual quantities or unit rates.
>
> A valid plumbing line item can be ANY of these formats:
> 1. LUMP SUM: description + total (e.g. "Item NO. 3 - Sanitary fixtures - $250,000 + GST")
> 2. ITEMISED: description + qty + unit + rate + total
> 3. NUMBERED SCOPE: numbered work items with a price (e.g. "6. Non-Potable Cold Water $85,000")
> 4. SUMMARY LINE: single price for the whole quote (e.g. "Total Price: $1,511,338 + GST")
>
> INCLUDE: any line with a plumbing/drainage/gas work description AND a dollar amount
> DO NOT extract: bullet point inclusions/exclusions with no price, payment terms, GST lines, subtotals that clearly sum already-listed items
>
> Return JSON: `{"rows": ["raw line 1", ...]}`

---

#### Row Detection — Carpentry

> You are a line item detector for carpentry and interior lining quotes (NZ/AU market).
>
> Carpentry quotes cover: timber framing, steel stud framing, GIB/plasterboard, insulation, ceiling suspension, internal doors, skirting/architrave, bulkheads.
>
> FORMAT 1 — LEVEL-BASED LUMP SUMS:
> Pair prices with descriptions by sequential order.
> Example rows: "LGF, UGF  $13,700.00" / "Lv1-9 ($77400 Each)  $696,600.00"
>
> FORMAT 2A — FULLY ITEMISED (SERO Carpentry, up to 11 columns):
> Columns: Description | Qty | Unit | Labour Rate | Labour Constant | Hourly Rate | Labour Total | Material Rate | Material Total | Overall Rate | Overall Total
> Last value = Overall Total
> Example: "51mm 0.75BMT Bottom Track  4096  m  5.88  0.14  42  24,084.48  3.42  13,991.94  9.30  38,076.42"
>
> PAGE-TRUNCATED ROWS: If row ends at Overall Rate with no Overall Total, include as-is — normalizer calculates qty × rate.
>
> FORMAT 2B — MATERIAL-ONLY (GIB Supply style)
> FORMAT 3 — HIGH-LEVEL LUMP SUMS: "Wall framing  1.00  Sum  $1,387,477.30"
> FORMAT 4 — NUMBERED ITEMS: No | Description | Dwg Ref | Qty | Unit | U/Rate | Total
>
> CRITICAL — PDF splits rows across lines. You MUST join fragments into single rows.
>
> NEVER INCLUDE: "Subtotal", "x N levels" multiplier annotations, section headers, Grand Total, GST, payment terms
>
> Return JSON: `{"rows": ["raw line 1", ...]}`

---

#### Normalization — Passive Fire / Default

> You are a line item normalizer for construction quotes.
>
> For each raw text line, extract: description, qty (number), unit (ea/m/m2/lm/etc), rate (unit price), total
>
> CRITICAL RULES:
> 1. Commas are THOUSAND separators: "$465,740" = 465740
> 2. If Unit column shows "0", "N/A", blank → use "ea"
> 3. For multi-column tables: ALWAYS use the LAST numeric value as unit_rate; ALWAYS use the RIGHTMOST dollar amount as line_total
> 4. If qty = 0 but total exists → default qty = 1
> 5. Calculate missing fields: rate = total / qty, OR total = qty × rate
>
> Return JSON: `{"items": [{"description": "...", "qty": N, "unit": "...", "rate": N, "total": N, "confidence": N}]}`

---

#### Normalization — Plumbing

> For each raw line, extract description, qty, unit, rate, total.
>
> CRITICAL RULES:
> 1. NUMBER FORMAT: Commas are THOUSAND separators. "$1,511,338" = 1511338 (NOT 1511.338)
> 2. Lump sum items are VALID — use qty=1, unit="LS", rate=total
> 3. If a line says "Item NO. X", include the item number in the description
> 4. SKIP: pure contact details, payment terms with no dollar amount
> 5. If only one grand total exists for the whole quote, return it as a single lump sum item
>
> Return JSON: `{"items": [...]}`

---

#### Normalization — Carpentry

> For each raw row, extract description, qty, unit, rate (OVERALL/COMBINED rate), total (OVERALL total).
>
> COLUMN FORMAT — Hourly Rate column contains 42 or 50.
>
> FORMAT A — FULL 11-COLUMN ROW (Overall Total present):
> "51mm 0.75BMT Bottom Track  4096  m  5.88  0.14  42  24,084.48  3.42  13,991.94  9.30  38,076.42"
> → qty=4096, unit="m", rate=9.30, total=38076.42
>
> FORMAT B — PAGE-TRUNCATED (no Overall Total):
> "90x45mm H3.2 timber batten  4410  m  10.50  0.25  42  46305  4.68  20,638.80  15.18"
> → total = 4410 × 15.18 = 66,943.80
>
> FORMAT C — NO OVERALL TOTAL COLUMN:
> → total = Labour Total + Material Total
>
> FORMAT D — MATERIAL-ONLY ROW
> FORMAT E — LUMP SUM
>
> NUMBER FORMAT:
> - Standard: comma = thousands ("$38,076.42" = 38076.42)
> - European: comma = decimal, space = thousands ("38 076,42" = 38076.42)
> - Large unformatted integers like "501336" = $501,336
>
> ALWAYS SKIP: subtotals, column headers, standalone "42" or "50" separator rows, exclusion notes, rate-only rows
>
> CRITICAL: Do NOT produce duplicate rows.
>
> Return JSON: `{"items": [...]}`

---

#### Multi-Model Extraction System Prompt (extract_quote_multi_model)

> You are an expert at extracting structured data from passive fire protection quotes.
>
> Extract:
> 1. Metadata: supplier name, quote number, date, project details, currency
> 2. Line items from DETAILED BREAKDOWN pages (not the summary page)
> 3. Financials: subtotal, tax rate, tax amount, grand total
>
> CRITICAL — MULTI-COLUMN PRICING TABLES:
> Tables have columns: Service | Size | Substrate | Qty | Base Rate | GIB Patch | Batt Patch | Insulation | Timber Top Plate | Baffle | TOTAL
> YOU MUST extract the TOTAL column (rightmost), NOT Base Rate
>
> CRITICAL — EXTRA COLUMNS:
> "Trafalgar SuperSTOPPER | 350x125x250mm | Wall 2x13mm | 1276 | 0 | $365.00 | $465,740.00"
> → qty=1276, "0" is extra column, unit_rate=$365.00, line_total=$465,740.00
>
> CRITICAL — UNIT FIELD:
> If Unit shows "0", "N/A", blank → default to "ea"
>
> FINANCIAL VALIDATION:
> Extract GRAND TOTAL from summary page; it should equal sum of all line items. Include contingency as a separate line item.

---

### Parsing File Reference

**Edge Functions (Supabase)**

| File | Purpose |
|---|---|
| `supabase/functions/start_parsing_job/index.ts` | File upload entry point, job creation |
| `supabase/functions/process_parsing_job/index.ts` | Text extraction, small-doc parsing, chunking |
| `supabase/functions/resume_parsing_job/index.ts` | Chunk processing, aggregation, finalization |
| `supabase/functions/parse_quote_llm_fallback_v2/index.ts` | Core two-phase LLM engine |
| `supabase/functions/parse_quote_llm_fallback/index.ts` | Legacy single-phase LLM parser |
| `supabase/functions/parse_quote_production/index.ts` | Multi-model extraction |
| `supabase/functions/parse_quote_with_extractor/index.ts` | External extractor + v3 pipeline |
| `supabase/functions/extract_quote_multi_model/index.ts` | OpenAI + Anthropic consensus extraction |
| `supabase/functions/parse_quote_ensemble/index.ts` | Python service coordination |
| `supabase/functions/chunk_pdf/index.ts` | PDF page splitting |
| `supabase/functions/chunk_xlsx/index.ts` | Excel row splitting |
| `supabase/functions/auto_retry_until_complete/index.ts` | Retry loop (max 10 iterations) |
| `supabase/functions/_shared/parsingV3.ts` | v3 pipeline: normalize → filter → reconcile |
| `supabase/functions/_shared/parsingV5Prompt.ts` | Two-pass LLM prompt templates |
| `supabase/functions/_shared/itemNormalizer.ts` | Deduplication, normalization, doc total extraction |
| `supabase/functions/_shared/deterministicExtractor.ts` | Regex-based extraction |
| `supabase/functions/_shared/plumbingSanitizer.ts` | Plumbing cleanup + total detection |
| `supabase/functions/_shared/pageChunker.ts` | Page-based chunking |
| `supabase/functions/_shared/rowAwareChunker.ts` | Row-aware chunking with lookback |

**Frontend Parsing Libraries**

| File | Purpose |
|---|---|
| `src/lib/parsing/parsingV3.ts` | Client-side v3 pipeline implementation |
| `src/lib/parsing/resilientParser.ts` | Fallback parser with retry logic |
| `src/lib/parsing/intelligentChunker.ts` | Client-side chunking strategy |
| `src/lib/parsing/rowFilter.ts` | Client-side row filtering |
| `src/lib/parsing/plumbing/plumbingPrompt.ts` | Plumbing LLM prompt (client copy) |
| `src/lib/parsing/plumbing/sanitizePlumbingParsedQuote.ts` | Plumbing sanitization (client) |

**Trade Specification System**

| File | Purpose |
|---|---|
| `src/lib/tradeSpec/tradeSpecEngine.ts` | Trade spec orchestrator |
| `src/lib/tradeSpec/types.ts` | TypeScript interfaces |
| `src/lib/tradeSpec/specs/passiveFireSpec.ts` | Passive fire parsing rules |
| `src/lib/tradeSpec/specs/plumbingSpec.ts` | Plumbing parsing rules |
| `src/lib/tradeSpec/specs/electricalSpec.ts` | Electrical parsing rules |
| `src/lib/tradeSpec/specs/hvacSpec.ts` | HVAC parsing rules |
| `src/lib/tradeSpec/specs/activeFireSpec.ts` | Active fire parsing rules |
| `src/lib/tradeSpec/specs/carpentrySpec.ts` | Carpentry parsing rules |

**Importers & File Parsers**

| File | Purpose |
|---|---|
| `src/importer/parsers/passiveFireQuote.ts` | Passive fire-specific parser |
| `src/importer/parsers/globalFireQuote.ts` | Global fire quote parser |
| `src/importer/normalization.ts` | Item normalization rules |
| `src/importer/regex.ts` | Regex patterns for extraction |
| `src/importer/types.ts` | Importer type definitions |
| `src/importer/utils.ts` | Utility functions |
| `src/lib/parsers/excelParser.ts` | Excel file parsing |
| `src/lib/parsers/pdfParser.ts` | PDF file parsing (client) |
| `src/lib/parsers/fireScheduleParser.ts` | Fire schedule extraction |
| `src/lib/parsers/lineItemRejoiner.ts` | Multi-line item joining |

**Trade-Specific Module Parsers**

| File | Purpose |
|---|---|
| `src/lib/modules/parsers/plumbing/live.ts` | Live plumbing parser |
| `src/lib/modules/parsers/plumbing/shadow.ts` | Shadow/test plumbing parser |
| `src/lib/modules/parsers/plumbing/shared.ts` | Shared plumbing logic |
| `src/lib/modules/parsers/plumbing/ruleConfig.ts` | Plumbing rule configuration |
| `src/lib/modules/parsers/plumbing/totalRowDetection.ts` | Total row detection for plumbing |
| `src/lib/modules/parsers/plumbing/plumbingNormalizer.ts` | Plumbing item normalization |
| `src/lib/modules/parsers/plumbing/plumbingDiffBuilder.ts` | Version diff comparison |

**Quote Pipeline & Storage**

| File | Purpose |
|---|---|
| `src/lib/quoteProcessing/quotePipeline.ts` | Main processing pipeline |
| `src/lib/import/quoteAdapter.ts` | Adapts parsed items to DB schema |
| `src/lib/import/boqSaver.ts` | BOQ (Bill of Quantities) saver |

**UI Pages (trigger parsing)**

| File | Purpose |
|---|---|
| `src/pages/ImportQuotes.tsx` | Original import UI |
| `src/pages/EnhancedImportQuotes.tsx` | Primary import UI with chunking support |

---

## Supported Trade Modules

| Trade | Key | Notes |
|---|---|---|
| Passive Fire | `passive_fire` | Default trade. Full itemised parsing with FRR extraction. |
| Plumbing | `plumbing` | Lump-sum aware. Regex level-table fallback. Plumbing sanitizer. |
| Electrical | `electrical` | Uses passive fire default parsing rules. |
| HVAC / Mechanical | `hvac` | Uses passive fire default parsing rules. |
| Active Fire | `active_fire` | Uses passive fire default parsing rules. |
| Carpentry | `carpentry` | Multi-format deterministic + LLM. Levels multiplier detection. |

---

## Application Workflow

The application guides users through a sequential workflow for each project:

```
1. Dashboard        — Create/select project
2. Import Quotes    — Upload supplier quote files (triggers parsing pipeline)
3. Quote Select     — Choose which revision of each supplier's quote to use
4. Review & Clean   — Review parsed line items, correct any errors
5. Quote Intel      — AI-powered analysis (scope gaps, risk flags, pricing outliers)
6. Scope Matrix     — Map line items to a common scope framework
7. Equalisation     — Equalise quotes against scope (add/remove items to compare fairly)
8. Reports          — Generate award reports, export to Excel/PDF
9. Contract Manager — Create subcontract documentation (SA 2017, custom)
10. Commercial Control — Post-award claims, variations, retentions
```

---

## Database Schema Overview

Key tables:

| Table | Description |
|---|---|
| `organisations` | Multi-tenant root. All data is organisation-scoped. |
| `projects` | A tendering project. Belongs to an organisation. |
| `quotes` | A parsed supplier quote. Belongs to a project. |
| `quote_items` | Individual line items from a quote. Belongs to a quote. |
| `parsing_jobs` | Tracks parse job status, timing, chunk counts. |
| `parsing_chunks` | Individual text chunks during large-document parsing. |
| `award_reports` | Generated award/recommendation reports. |
| `subcontract_agreements` | Generated subcontract documents. |
| `contract_allowances` | Allowances attached to a contract. |
| `scc_contracts` | Subcontractor commercial control contracts. |
| `bt_projects` | Baseline tracker projects (SCC module). |
| `bt_baseline_headers` | Baseline line items for progress claim tracking. |
| `vs_items` | VerifyStock inventory items. |
| `platform_admins` | Platform-level admin users. |

All tables have Row Level Security (RLS) enabled. Access is restricted to authenticated users who are members of the relevant organisation.

---

## Shadow Admin System

The platform includes an internal admin/research system accessible at `/shadow`. This is a separate, isolated routing context used for:

- Monitoring parsing module health and accuracy
- Running regression test suites against historical quotes
- Managing module versions and controlled rollouts
- Reviewing human-flagged parsing failures
- Viewing revenue protection analytics

Access requires a verified admin account. The shadow system has its own login page at `/shadow/login` and does not share state with the main application.

---

## Subcontractor Commercial Control (SCC)

Subcontractor users log in to a restricted view of the platform that shows only the SCC module. This includes:

- **Quote Import Workflow** — Import subcontractor's own quotes and BOQs
- **Baseline Tracker** — Track awarded scope against progress
- **Payment Claims** — Submit and manage payment claims
- **Retention & Materials** — Track retention withheld and material on-site
- **VerifyStock** — Inventory and stock management
- **Plant Hire** — Plant and equipment hire tracking

Subcontractors are identified by the `client_type = 'subcontractor'` field on their organisation record. The app automatically redirects them to the SCC module on login.

---

## Deployment

The application deploys to:

- **Frontend:** Any static hosting (Netlify, Vercel, Cloudflare Pages). `public/_redirects` configures SPA routing.
- **Edge Functions:** Deployed via Supabase CLI or the `mcp__supabase__deploy_edge_function` tool.
- **Database:** Managed by Supabase. Migrations are in `supabase/migrations/`.
- **Python PDF Service (optional):** Docker-based service deployable to Render, Railway, or any container host. See `python-pdf-service/`.

**Build command:** `npm run build`
**Output directory:** `dist/`

---

## Known Issues & Limitations

### Parser Duplicate Ingestion

The most significant known issue is that duplicate items can appear in the database under certain conditions:

1. **Description prefix variants** — The same item stored as "Electrical Cable Bundle..." and "Cable Bundle..." are treated as different deduplication keys. When a PDF is parsed and the trade prefix is sometimes included and sometimes stripped, both variants survive deduplication.

2. **Optional scope leaking into main scope** — Items in "Optional Extras" or "Optional Scope" sections of a PDF that have a real quantity and total are included per the prompt instructions. These should be tagged with `scope_category = 'Optional'` but may be tagged `'Main'` depending on whether the section header was correctly detected.

3. **Block/section-identical items** — In multi-block quotes (e.g., Block B30 / B31 / B32...) where some blocks have identical line items, the deduplication key `description|qty|unit|rate` can collide across blocks. If blocks B30, B31, B33 have identical items, only one set is retained — under-counting the scope.

4. **Double finalization** — If `resume_parsing_job` is called twice (e.g., via `auto_retry_until_complete` after a partial success), the old `quote_items` are deleted and re-inserted. However if a quote record already exists and the second run creates a new one, orphaned items may result. The system should be idempotent but edge cases exist.

### Number Format Ambiguity

European-format numbers (comma = decimal, space = thousands) are only handled in the carpentry normalizer. If a supplier from a European country submits a quote with this format to a non-carpentry trade, dollar amounts may be mis-parsed.

### PDF Text Extraction Quality

PDF text extraction quality varies significantly by PDF type:
- Digitally generated PDFs: high quality
- Scanned PDFs: dependent on OCR quality (Tesseract)
- Password-protected PDFs: not supported
- PDFs with complex table layouts: may produce fragmented rows requiring the line-rejoiner

### LLM Hallucination Risk

The LLM extraction is not infallible. Common failure modes:
- Fabricating quantities for items that only have a total (lump sums)
- Combining adjacent rows into a single item
- Missing items on pages with very dense table layouts
- Misidentifying the unit column when tables have non-standard column ordering

The two-phase detect-then-normalize approach reduces (but does not eliminate) these failures. The document total reconciliation adds a safety net to flag when the sum of items does not match the declared quote total.
