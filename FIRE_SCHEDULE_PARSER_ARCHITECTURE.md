# Fire Schedule Parser - New Architecture

## Problem Solved

The previous approach tried to extract fire schedules using OpenAI GPT-4o with text extracted from PDFs. This failed because:

1. **Tables aren't text** - PDF tables are visual layouts, not structured text
2. **Edge Functions can't do heavy PDF parsing** - They have limited runtime and no native libraries
3. **OpenAI can't see tables** - When given unstructured text, it can't reconstruct table structure

## New Architecture

We now use a **proper PDF table extraction pipeline** with your existing Python PDF service:

```
┌─────────────────────────────────────────────────────────────────┐
│  FIRE SCHEDULE IMPORT FLOW                                      │
└─────────────────────────────────────────────────────────────────┘

1. User uploads PDF
   └─> Frontend (FireScheduleImport.tsx)

2. Split PDF into chunks
   └─> Edge Function: parse_fire_schedule
       └─> Chunks PDF into 5-page segments
       └─> Sends each chunk to parse_fire_schedule_chunk

3. Parse each chunk (HEAVY LIFTING HAPPENS HERE)
   └─> Edge Function: parse_fire_schedule_chunk
       └─> Forwards to Python service

4. Python PDF Service (/parse/fire_schedule)
   └─> FireScheduleParser class
       ├─> STEP 1: Find schedule pages
       │   └─> Look for "PASSIVE FIRE SCHEDULE", "Appendix A"
       │   └─> Stop at product sheets (PS-01 pages)
       │
       ├─> STEP 2: Extract tables using pdfplumber
       │   └─> Strategy 1: lines_strict (bordered tables)
       │   └─> Strategy 2: lines (less strict)
       │   └─> Strategy 3: text-based
       │   └─> Strategy 4: aggressive (last resort)
       │
       ├─> STEP 3: Parse schedule rows
       │   └─> Identify columns (solution_id, FRR, service_type, etc.)
       │   └─> Extract structured data from each row
       │   └─> Calculate confidence scores
       │
       └─> STEP 4: Return structured JSON
           └─> { success, rows[], metadata }

5. Combine results from all chunks
   └─> Edge Function: parse_fire_schedule

6. Save to database
   └─> fire_engineer_schedules table
   └─> fire_engineer_schedule_rows table
```

## Key Features

### 1. Schedule Page Detection
The parser **ignores everything except schedule pages**:

- Looks for markers: "PASSIVE FIRE SCHEDULE", "Appendix A", "Fire Schedule"
- **Stops** when it hits product sheets (PS-01 installation instructions)
- Only processes pages that contain actual schedule data

### 2. Multi-Strategy Table Extraction
Uses 4 progressively aggressive strategies:

```python
Strategy 1: lines_strict     # For tables with clear borders
Strategy 2: lines            # Less strict borders
Strategy 3: text-based       # For tables without lines
Strategy 4: aggressive       # Last resort with loose tolerances
```

If one fails, it tries the next. This handles various PDF formats.

### 3. Intelligent Column Mapping
The parser identifies columns by looking for patterns:

- `solution_id`: "Passive Solution", "PS-", "PS ID"
- `frr_rating`: "FRR", "Fire Resistance", "Rating"
- `service_type`: "Service Type", "Penetration", "Service"
- `substrate`: "Substrate", "Wall Type", "Construction"
- etc.

### 4. Confidence Scoring
Each row gets a confidence score (0.0 to 1.0):

- 0.25 points for solution_id
- 0.25 points for system_classification
- 0.15 points for substrate
- 0.25 points for service_type
- 0.10 points for raw text quality

Rows with confidence < 0.3 are automatically filtered out.

## Files Changed

### New Files
- `python-pdf-service/parsers/fire_schedule_parser.py` - Specialized fire schedule parser

### Modified Files
- `python-pdf-service/app.py` - Added `/parse/fire_schedule` endpoint
- `supabase/functions/parse_fire_schedule_chunk/index.ts` - Now uses Python parser
- `src/components/FireScheduleImport.tsx` - Better error messages

## Why This Works

### 1. Proper Table Extraction
pdfplumber uses PDF structure (lines, text positioning) to detect table cells correctly.

### 2. No AI Guessing
The parser extracts what's actually in the PDF, not what an AI thinks might be there.

### 3. Handles Real-World PDFs
Multiple strategies mean it works with:
- Clean digital PDFs with borders
- PDFs without visible lines
- Complex multi-section schedules

### 4. Focused Parsing
By ignoring non-schedule pages, it doesn't waste time on cover pages, product sheets, etc.

## Testing the New Parser

1. Upload a fire schedule PDF
2. Check the logs for:
   ```
   [FireSchedule] Found schedule on pages: [2, 3, 4]
   [FireSchedule] Table on page 2: 15 data rows
   [FireSchedule] Parsed 45 schedule rows
   ```

3. If it fails, you'll see detailed reasons:
   - "No fire schedule pages found" → PDF doesn't have schedule markers
   - "Found schedule pages but no tables extracted" → PDF uses images
   - "Extracted tables but couldn't parse rows" → Unexpected table format

## Next Steps (If Still Failing)

If the parser still can't find tables:

1. **Add OCR Fallback** - Rasterize pages and use OpenCV to detect grid
2. **Visual Inspection** - The parser logs exactly which pages it found
3. **Custom Markers** - Add project-specific schedule markers to `_find_schedule_pages()`

## Environment Variables Required

In your Python service `.env`:

```bash
API_KEY=your-render-api-key
MAX_FILE_SIZE_MB=10
ENABLE_MEMORY_OPTIMIZATION=true
```

In Supabase Edge Function environment:

```bash
RENDER_PDF_EXTRACTOR_API_KEY=your-render-api-key
RENDER_BASE_URL=https://verify-pdf-extractor.onrender.com
```

## Confidence Metrics

After parsing, you'll see:

- `total_rows`: Number of schedule rows found
- `average_confidence`: Overall quality (0.0 to 1.0)
- `low_confidence_count`: Rows that might need review
- `parsing_notes`: Human-readable explanation of what happened

A good parse typically has:
- Average confidence > 0.7
- Low confidence count < 10% of total rows
