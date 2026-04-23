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
7. [Quote Parsing System — Parser V2](#quote-parsing-system--parser-v2)
   - [End-to-End Pipeline](#end-to-end-pipeline)
   - [Stage Sequence](#stage-sequence)
   - [Multi-Path Total Recovery](#multi-path-total-recovery)
   - [Trade-Specific Extraction](#trade-specific-extraction)
   - [LLM Prompts Reference](#llm-prompts-reference)
   - [Parser V2 File Reference](#parser-v2-file-reference)
   - [Edge Functions](#edge-functions)
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
- Track baselines and progress claims through a dedicated SCC module

Trades supported: Passive Fire, Plumbing, Electrical, HVAC/Mechanical, Active Fire, Carpentry.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| Backend / API | Supabase Edge Functions (Deno/TypeScript) |
| Database | Supabase (PostgreSQL) with Row Level Security |
| AI / LLM | OpenAI `gpt-4.1` (extractors) + `gpt-4o-mini` (classifiers) |
| PDF Parsing | pdfjs-dist (client), optional Python ensemble service |
| Excel Parsing | xlsx, exceljs |
| File Storage | Supabase Storage |
| Auth | Supabase Auth (email/password) |
| Icons | Lucide React |

---

## Project Structure

```
/
├── src/
│   ├── App.tsx
│   ├── pages/
│   │   ├── EnhancedImportQuotes.tsx   # Primary upload UI
│   │   ├── ReviewClean.tsx
│   │   ├── QuoteIntelligence.tsx
│   │   ├── ScopeMatrix.tsx
│   │   ├── Equalisation.tsx
│   │   ├── AwardReport.tsx
│   │   ├── ContractManager.tsx
│   │   ├── scc/                       # Subcontractor Commercial Control
│   │   ├── shadow/                    # Internal admin
│   │   └── admin/                     # Platform admin
│   ├── components/
│   ├── lib/
│   │   ├── tradeSpec/
│   │   ├── modules/parsers/
│   │   ├── reports/
│   │   ├── comparison/
│   │   ├── export/
│   │   └── supabase.ts
│   └── types/
├── supabase/
│   ├── functions/
│   │   ├── start_parsing_job/         # Entry: upload + queue
│   │   ├── process_parsing_job/       # Orchestrator (Parser V2)
│   │   └── _shared/parser_v2/         # Parser V2 engine
│   └── migrations/
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
npm install
npm run dev         # Development server
npm run build       # Production build
npm run typecheck   # Type check
```

---

## Environment Variables

`.env` at project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Edge Functions use the following (auto-populated by Supabase):

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
OPENAI_API_KEY
PDF_EXTRACTOR_URL    # Optional Python ensemble service
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
        OpenAI (gpt-4.1 / gpt-4o-mini)
               │
       PostgreSQL (Supabase, RLS enforced)
```

---

## Quote Parsing System — Parser V2

The live parser is **Parser V2**, a multi-stage pipeline under `supabase/functions/_shared/parser_v2/`. Strategy is hard-coded to `parser_v2_only` in `process_parsing_job/index.ts`; there is no legacy fallback in the live flow.

### End-to-End Pipeline

```
User uploads file (EnhancedImportQuotes.tsx)
           │
           ▼
[1] start_parsing_job
    - Auth + org validation
    - Upload file to Storage
    - Create quotes + parsing_jobs rows (status=pending)
    - Trigger process_parsing_job async
           │
           ▼
[2] process_parsing_job  — ORCHESTRATOR
    - Download file
    - Extract text (PDF: pdfjs or Python service; XLSX: xlsx)
    - Invoke runParserV2() with 110s watchdog + 25s grace
    - Persist v2 output, quote, quote_items, pipeline_stages
           │
           ▼
[3] runParserV2()  — _shared/parser_v2/runParserV2.ts
    (stage sequence below)
           │
           ▼
[4] DB persist: quotes, quote_items, parsing_jobs.parser_v2_output
```

### Stage Sequence

Every stage is durably recorded to `parsing_jobs.pipeline_stages` via `StageTracker`.

| # | Stage | Model | Trade scope | File |
|---|---|---|---|---|
| 1 | Classification (trade + quote_type + supplier) | gpt-4o-mini | All | `classifiers/classifyTrade.ts`, `classifyQuoteType.ts`, `classifySupplier.ts` |
| 2 | Sanitize | gpt-4o-mini | Passive fire | `classifiers/sanitizePassiveFireText.ts` |
| 3 | Structure map | gpt-4o-mini | Passive fire | `classifiers/classifyPassiveFireStructure.ts` |
| 4 | Extraction | gpt-4.1 | All (per-trade) | `extractors/_extractorRuntime.ts` + trade extractor |
| 5 | Authoritative total | gpt-4o-mini | Passive fire | `classifiers/selectPassiveFireAuthoritativeTotal.ts` |
| 6 | Intent (sub_scope refinement) | gpt-4o-mini | Passive fire | `classifiers/classifyPassiveFireIntent.ts` |
| 7 | Validation (line math, totals, missing rows, confidence) | deterministic | All | `validation/*` |
| 8 | Multi-path decision | deterministic | All | `multipath/decisionEngine.ts` + `pathB` + `pathC` |
| 9 | PF validation | gpt-4o-mini | Passive fire | `validation/validatePassiveFireParse.ts` |
| 10 | Mappers | deterministic | All | `mappers/mapToQuotesTable.ts`, `mapToQuoteItems.ts`, `composePassiveFireFinalRecord.ts` |

Failure gate: if `items.length === 0` after extraction, the job commits as `failed` with a full failure report (anomalies, extractor_used, classification, passive_fire_validation).

### Multi-Path Total Recovery

After extraction the decision engine considers three paths and picks a winner:

- **Path A** — Sum of extracted line items (`main_total`, `grand_total`).
- **Path B** — Regex scan for labelled totals (`pathB_commercialTotals.ts`): Grand Total, Total Ex GST, Quote Total, etc., ranked by label specificity.
- **Path C** — Zero-LLM deterministic scan (`pathC_deterministicStructure.ts`): extracts all currency, detects GST relations (subtotal + 10/15% = total), and rollups; picks highest-confidence.

`decisionEngine.ts` produces a `MultiPathDecision` recorded in `parser_v2_output`.

### Trade-Specific Extraction

Every trade has its own extractor (`extractors/extract<Trade>.ts`) that wraps the shared gpt-4.1 runtime with a trade-specific prompt from `prompts/`. Passive fire additionally runs through sanitize → structure → authoritative-total → intent stages.

Supported trades:

- `passive_fire` — full pipeline (sanitize, structure, auth total, intent)
- `electrical`, `plumbing`, `hvac`, `active_fire`, `carpentry` — classification + extraction + validation + multipath
- `extractFallback` — used when a trade-specific extractor returns zero rows or throws

### LLM Prompts Reference

All prompts live in `supabase/functions/_shared/parser_v2/prompts/`.

| File | Purpose | Model |
|---|---|---|
| `tradeClassifierPrompt.ts` | Identify primary trade | gpt-4o-mini |
| `quoteTypePrompt.ts` | Classify structure (itemized / lump_sum / hybrid) | gpt-4o-mini |
| `passiveFireSanitizerPrompt.ts` | OCR cleanup, strip non-financial numerics | gpt-4o-mini |
| `passiveFireStructurePrompt.ts` | Map financial sections + authoritative total page | gpt-4o-mini |
| `passiveFireTotalSelectorPrompt.ts` | Select single authoritative total ex-GST | gpt-4o-mini |
| `passiveFirePrompt.ts` | Main PF row extraction (sub_scope taxonomy, FRR rules) | gpt-4.1 |
| `passiveFireLineItemPrompt.ts` | Alternative detailed PF extractor consuming sanitizer + structure | gpt-4.1 |
| `activeFirePrompt.ts` | Active fire row extraction | gpt-4.1 |
| `electricalPrompt.ts` | Electrical row extraction | gpt-4.1 |
| `plumbingPrompt.ts` | Plumbing row extraction | gpt-4.1 |
| `hvacPrompt.ts` | HVAC row extraction | gpt-4.1 |
| `carpentryPrompt.ts` | Carpentry row extraction | gpt-4.1 |

Each extractor prompt returns STRICT JSON:

```json
{
  "items": [
    {
      "item_number": "1",
      "description": "Fire collar PVC 100mm",
      "quantity": 50,
      "unit": "ea",
      "unit_price": 125.00,
      "total_price": 6250.00,
      "scope_category": "main",
      "trade": "passive_fire",
      "sub_scope": "fire_collar",
      "frr": "-/60/60",
      "confidence": 0.95
    }
  ]
}
```

Inline prompts for `classifyPassiveFireIntent` and `classifySupplier` are built at call site inside their `classifiers/*.ts` files.

### Parser V2 File Reference

**Core orchestration (`_shared/parser_v2/`):**

| File | Purpose |
|---|---|
| `runParserV2.ts` | Top-level stage orchestrator |
| `stageTracker.ts` | Durable per-stage lifecycle recorder |
| `telemetrySink.ts` | LLM call duration + token usage accumulator |
| `composePassiveFireFinalRecord.ts` | Builds final PF metadata record |

**Classifiers (`_shared/parser_v2/classifiers/`):**

| File | Role |
|---|---|
| `classifyTrade.ts` | Primary trade identification |
| `classifyQuoteType.ts` | Structure (itemized / lump_sum / hybrid) |
| `classifySupplier.ts` | Supplier name extraction |
| `sanitizePassiveFireText.ts` | OCR cleanup for PF |
| `classifyPassiveFireStructure.ts` | Financial section mapping for PF |
| `selectPassiveFireAuthoritativeTotal.ts` | Authoritative total selection |
| `classifyPassiveFireIntent.ts` | Sub-scope refinement for PF items |

**Extractors (`_shared/parser_v2/extractors/`):**

| File | Role |
|---|---|
| `_extractorRuntime.ts` | Shared gpt-4.1 caller: chunking, retry, dedupe |
| `extractPassiveFire.ts` | Passive fire extraction |
| `extractActiveFire.ts` | Active fire extraction |
| `extractElectrical.ts` | Electrical extraction |
| `extractPlumbing.ts` | Plumbing extraction |
| `extractHVAC.ts` | HVAC extraction |
| `extractCarpentry.ts` | Carpentry extraction |
| `extractFallback.ts` | Generic fallback |

**Validation (`_shared/parser_v2/validation/`):**

| File | Role |
|---|---|
| `validateLineMath.ts` | qty × rate = total per-row check |
| `validateTotals.ts` | Sum reconciliation against document totals |
| `detectMissingRows.ts` | Missing-itemization detection |
| `scoreConfidence.ts` | Overall HIGH/MEDIUM/LOW confidence |
| `validatePassiveFireParse.ts` | PF-specific final validation |

**Multipath (`_shared/parser_v2/multipath/`):**

| File | Role |
|---|---|
| `decisionEngine.ts` | Picks winner across Path A/B/C |
| `pathB_commercialTotals.ts` | Labelled-total regex scanner |
| `pathC_deterministicStructure.ts` | GST relations + rollup detector |

**Mappers (`_shared/parser_v2/mappers/`):**

| File | Role |
|---|---|
| `mapToQuotesTable.ts` | Items → quotes row shape |
| `mapToQuoteItems.ts` | Items → quote_items row shape |

### Edge Functions

**Live flow:**

| Function | Role |
|---|---|
| `start_parsing_job` | Upload file, create job, trigger orchestrator |
| `process_parsing_job` | Text extract, run Parser V2, persist results |

**Legacy / test-only (not called by live flow):**

`parse_quote_production`, `parse_quote_llm_fallback`, `parse_quote_llm_fallback_v2`, `parse_quote_ensemble`, `parse_quote_with_extractor`, `parsing_v2`, `test_parsing_v2`, `test_parsing_v3`, `validate_parser`, `chunk_pdf`, `chunk_xlsx`, `resume_parsing_job`, `auto_retry_until_complete`.

**Runtime constants (extractor runtime):**

- Model: `gpt-4.1`, temperature 0, `response_format: json_object`
- Chunk budget: 18,000 chars, max 8 chunks, 4 concurrent
- Per-chunk timeout: 18s; extraction stage budget: 35s
- Retries: 3 with exponential backoff on 429/5xx

---

## Supported Trade Modules

| Trade | Key | Dedicated pipeline stages |
|---|---|---|
| Passive Fire | `passive_fire` | Sanitize + Structure + Auth Total + Intent + PF Validation |
| Plumbing | `plumbing` | Classification + Extraction + Validation + Multipath |
| Electrical | `electrical` | Classification + Extraction + Validation + Multipath |
| HVAC / Mechanical | `hvac` | Classification + Extraction + Validation + Multipath |
| Active Fire | `active_fire` | Classification + Extraction + Validation + Multipath |
| Carpentry | `carpentry` | Classification + Extraction + Validation + Multipath |

---

## Application Workflow

```
1. Dashboard          — Create/select project
2. Import Quotes      — Upload supplier quote files (triggers Parser V2)
3. Quote Select       — Choose which revision of each supplier's quote to use
4. Review & Clean     — Review parsed line items, correct any errors
5. Quote Intelligence — AI-powered analysis (scope gaps, risk flags, outliers)
6. Scope Matrix       — Map line items to a common scope framework
7. Equalisation       — Equalise quotes against scope
8. Reports            — Generate award reports, export to Excel/PDF
9. Contract Manager   — Create subcontract documentation (SA 2017, custom)
10. Commercial Control — Post-award claims, variations, retentions
```

---

## Database Schema Overview

| Table | Description |
|---|---|
| `organisations` | Multi-tenant root. All data is organisation-scoped. |
| `projects` | A tendering project. Belongs to an organisation. |
| `quotes` | A parsed supplier quote. Belongs to a project. |
| `quote_items` | Individual line items from a quote. |
| `parsing_jobs` | Parse job status, timing, stage history, parser_v2_output. |
| `parsing_chunks` | Legacy chunk table (not used by Parser V2 live flow). |
| `award_reports` | Generated award/recommendation reports. |
| `subcontract_agreements` | Generated subcontract documents. |
| `contract_allowances` | Allowances attached to a contract. |
| `scc_contracts` | Subcontractor commercial control contracts. |
| `bt_projects` | Baseline tracker projects (SCC module). |
| `vs_items` | VerifyStock inventory items. |
| `platform_admins` | Platform-level admin users. |

All tables have Row Level Security (RLS) enabled. Access is restricted to authenticated users who are members of the relevant organisation.

---

## Shadow Admin System

The platform includes an internal admin/research system at `/shadow`. Separate isolated routing for:

- Monitoring parsing module health and accuracy
- Running regression test suites against historical quotes
- Managing module versions and controlled rollouts
- Reviewing human-flagged parsing failures
- Revenue protection analytics

Access requires a verified admin account. Login at `/shadow/login`.

---

## Subcontractor Commercial Control (SCC)

Subcontractor users log in to a restricted view containing only the SCC module:

- **Quote Import Workflow** — Import subcontractor's own quotes and BOQs
- **Baseline Tracker** — Track awarded scope against progress
- **Payment Claims** — Submit and manage payment claims
- **Retention & Materials** — Track retention withheld and material on-site
- **VerifyStock** — Inventory and stock management
- **Plant Hire** — Plant and equipment hire tracking

Subcontractors are identified by `client_type = 'subcontractor'` on their organisation record.

---

## Deployment

- **Frontend:** Any static hosting (Netlify, Vercel, Cloudflare Pages). `public/_redirects` configures SPA routing.
- **Edge Functions:** Deployed via the `mcp__supabase__deploy_edge_function` tool.
- **Database:** Managed by Supabase. Migrations are in `supabase/migrations/`.
- **Python PDF Service (optional):** Docker-based service in `python-pdf-service/`.

**Build command:** `npm run build`
**Output directory:** `dist/`

---

## Known Issues & Limitations

### Parser strategy locked to V2

`process_parsing_job/index.ts` hard-codes `parser_strategy: "parser_v2_only"`. There is no runtime flag to route to a legacy parser. If V2 returns zero items the job commits as `failed` rather than falling back.

### OCR-sensitive PF sanitizer

The passive-fire sanitizer stage can strip a document to empty output when the quote starts with a cover-letter-heavy first page and the rest of the content is dense small-font text. When `sanitize in > 0 / out = 0`, extraction will have nothing to work on.

### Chunk concurrency bounded

Extraction chunks are capped at 8 chunks × 4-way concurrency × 18s per chunk. Very large quotes (>144k chars of text) will be truncated; the top 8 chunks are prioritized in document order.

### LLM hallucination risk

Common failure modes:
- Fabricating quantities for items that only have a total (lump sums)
- Combining adjacent rows into a single item
- Missing items on pages with very dense table layouts
- Misidentifying the unit column when tables have non-standard column ordering

The classification → sanitize → extract → validate → multipath pipeline reduces (but does not eliminate) these failures.

### PDF extraction quality

PDF text extraction quality varies by PDF type:
- Digitally generated PDFs: high quality
- Scanned PDFs: dependent on OCR (Tesseract via optional Python service)
- Password-protected PDFs: not supported
- Complex table layouts: may produce fragmented rows
