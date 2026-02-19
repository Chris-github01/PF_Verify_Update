# Quote Parsing Logic - Deep Dive Walkthrough

This document provides a detailed, step-by-step explanation of how the quote parsing system works, from file upload to database storage.

---

## Table of Contents

1. [Entry Point: User Uploads File](#entry-point)
2. [Step 1: PDF Extraction (Python Service)](#step-1-pdf-extraction)
3. [Step 2: LLM Parsing (GPT-4o)](#step-2-llm-parsing)
4. [Step 3: Filtering & Validation](#step-3-filtering)
5. [Step 4: Database Storage](#step-4-database)
6. [Python Ensemble Coordinator](#python-ensemble)
7. [Critical Logic Points](#critical-logic)

---

## Entry Point: User Uploads File {#entry-point}

**File:** `src/pages/ImportQuotes.tsx`

**Function:** `startBackgroundParsing()`

### What Happens:

```typescript
// User clicks "Upload Quote"
const file = selectedFile; // "FireSafe Quote.pdf"
const supplierName = "FireSafe"; // User-entered
const projectId = "abc-123"; // Current project
const trade = "passive_fire"; // Selected trade

// Detect file type
const isPdf = file.name.toLowerCase().endsWith('.pdf');

if (isPdf) {
  // Try FAST PATH first (external extractor)
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/parse_quote_with_extractor`,
    {
      method: 'POST',
      body: formData, // Contains: file, projectId, supplierName, trade
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  // If extractor succeeds, done! If fails, fallback to background job
}
```

---

## Step 1: PDF Extraction (Python Service) {#step-1-pdf-extraction}

**File:** `supabase/functions/parse_quote_with_extractor/index.ts`

**Python Service:** `python-pdf-service/parsers/ensemble_coordinator.py`

### Step 1.1: Edge Function Receives File

```typescript
// Lines 45-63
const formData = await req.formData();
const file = formData.get("file") as File; // The PDF file
const projectId = formData.get("projectId") as string;
const supplierName = formData.get("supplierName") as string;
const trade = formData.get("trade") as string; // "passive_fire"

if (!file || !projectId || !supplierName) {
  throw new Error("Missing required fields");
}
```

### Step 1.2: Get Python Service Credentials

```typescript
// Lines 77-88
// Fetch API key and URL from database
const { data: configs } = await supabaseAdmin
  .from("system_config")
  .select("key, value")
  .in("key", ["RENDER_PDF_EXTRACTOR_API_KEY", "RENDER_PDF_EXTRACTOR_URL"]);

const apiKey = configMap.get("RENDER_PDF_EXTRACTOR_API_KEY");
const baseUrl = configMap.get("RENDER_PDF_EXTRACTOR_URL");
// baseUrl = "https://verify-pdf-extractor.onrender.com"
```

### Step 1.3: Call Python Extractor

```typescript
// Lines 93-102
const extractorFormData = new FormData();
extractorFormData.append("file", file);

const extractorResponse = await fetch(`${baseUrl}/parse/ensemble`, {
  method: "POST",
  headers: { "X-API-Key": apiKey },
  body: extractorFormData,
});

const extractorData = await extractorResponse.json();
```

### Step 1.4: Python Service Processes PDF

**Python File:** `ensemble_coordinator.py`

The Python service runs MULTIPLE parsers in PARALLEL:

```python
# Lines 69-82
results = []
with ThreadPoolExecutor(max_workers=5) as executor:
    # Launch all parsers at once
    for parser_name in ['pdfplumber', 'pymupdf', 'ocr', 'textract']:
        future = executor.submit(parser.parse, pdf_bytes, filename)
        future_to_parser[future] = parser_name

    # Collect results as they complete
    for future in as_completed(future_to_parser):
        result = future.result(timeout=60)
        results.append(result)
```

#### Parser 1: PDFPlumber

- Extracts text using PDFPlumber library
- Good for: Modern PDFs with selectable text
- Output: Raw text + table structures

#### Parser 2: PyMuPDF

- Extracts text using MuPDF library
- Good for: Complex layouts, embedded fonts
- Output: Raw text with better formatting

#### Parser 3: OCR (Tesseract)

- Converts PDF to images, then OCR
- Good for: Scanned PDFs, poor quality scans
- Output: Text from image recognition

#### Parser 4: Textract (Optional)

- AWS Textract API
- Good for: Tables, forms, complex layouts
- Output: Structured tables + text

### Step 1.5: Ensemble Selection Logic

**Critical Logic:** `_select_best_result()` in `ensemble_coordinator.py`

```python
# Lines 264-315
def _select_best_result(self, results):
    """
    Select the best result from multiple parser outputs.
    Strongly prefers LLM-based parsers over simple table extractors.
    """

    # 1. Filter successful results (extracted items)
    successful = [r for r in results if r['success'] and r.get('items')]

    # 2. PRIORITY: LLM-based parsers (docai, textract, pymupdf)
    llm_parsers = ['docai', 'textract', 'unstructured', 'pymupdf']
    llm_results = [r for r in successful if r['parser_name'] in llm_parsers and len(r['items']) >= 10]

    if llm_results:
        # Choose LLM parser with MOST items
        best_llm = max(llm_results, key=lambda r: len(r['items']))
        return best_llm

    # 3. If no good LLM results, score all parsers
    def score(result):
        conf = result['confidence_score']  # 0.0 to 1.0
        items_norm = len(result['items']) / max_items
        base_score = conf * 0.7 + items_norm * 0.3  # 70% confidence, 30% item count

        # Apply parser type bonus
        if result['parser_name'] in llm_parsers:
            base_score *= 1.5  # 50% BONUS for LLM parsers
        elif result['parser_name'] in ['pdfplumber', 'ocr']:
            base_score *= 0.6  # 40% PENALTY for simple parsers

        return base_score

    best = max(successful, key=score)
    return best
```

**Key Insight:** The system HEAVILY prefers LLM-based parsers (1.5x multiplier) and penalizes simple parsers (0.6x multiplier).

### Step 1.6: Return to Edge Function

```typescript
// Line 108
const extractorData = await extractorResponse.json();

console.log("Extractor → Import Quotes:", extractorData);

// extractorData = {
//   text: "Full extracted text from PDF (5000+ chars)",
//   num_pages: 8,
//   tables: [...],
//   confidence: 0.85
// }
```

### Step 1.7: Upload PDF to Storage

```typescript
// Lines 116-148
const fileName = file.name;
const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
const fileBuffer = await file.arrayBuffer();
const timestamp = new Date().getTime();
const storagePath = `${projectId}/${timestamp}-${sanitizedFileName}`;

const { data: uploadData, error: uploadError } = await supabaseAdmin
  .storage
  .from("quotes")
  .upload(storagePath, fileBuffer, {
    contentType: file.type,
    upsert: false,
  });

// Stored at: quotes/abc-123/1234567890-FireSafe_Quote.pdf
```

---

## Step 2: LLM Parsing (GPT-4o) {#step-2-llm-parsing}

**File:** `supabase/functions/parse_quote_llm_fallback/index.ts`

Now the extracted text is sent to OpenAI GPT-4o to extract structured line items.

### Step 2.1: Call LLM Parser

```typescript
// Lines 150-169 (parse_quote_with_extractor)
const llmUrl = `${supabaseUrl}/functions/v1/parse_quote_llm_fallback`;
const llmHeaders = {
  "Authorization": `Bearer ${supabaseServiceKey}`,
  "Content-Type": "application/json",
};

const llmPayload = {
  text: extractorData.text,  // Full PDF text
  supplierName: supplierName,  // "FireSafe"
  documentType: "PDF Quote (Extractor)",
  chunkInfo: `Complete document - ${extractorData.num_pages} pages`
};

const llmResponse = await fetch(llmUrl, {
  method: "POST",
  headers: llmHeaders,
  body: JSON.stringify(llmPayload),
});

const parseResult = await llmResponse.json();
```

### Step 2.2: Chunking Decision

**File:** `parse_quote_llm_fallback/index.ts`

```typescript
// Lines 70-80
function shouldChunkQuote(text: string): boolean {
  // Chunk if text is over 5,000 characters
  if (text.length > 5000) return true;

  // Count line items - if more than 30, chunk it
  const itemLinePattern = /^\s*\d+\s+ea\s+\$[\d,]+/gim;
  const itemCount = (text.match(itemLinePattern) || []).length;
  if (itemCount > 30) return true;

  return false;
}

// Lines 253-257
const textLength = text.length;  // e.g., 12,450 chars
const needsChunking = shouldChunkQuote(text);  // true
console.log(`[LLM Fallback] Quote needs chunking: ${needsChunking}`);
```

**Decision:** If text > 5000 chars OR > 30 items detected → CHUNK IT

### Step 2.3: Section Detection

```typescript
// Lines 85-155
function chunkQuoteBySection(text: string): { section: string; content: string }[] {
  const chunks: { section: string; content: string }[] = [];

  // Detect section header patterns
  const sectionPatterns = [
    /^([A-Z][A-Za-z\s]+)\s+\$[\d,]+\.?\d*/m,  // "Greenhouse $21,964.00"
    /^([A-Z][A-Za-z\s]+)\s+continued/im,       // "Headhouse Continued"
    /^([A-Z][A-Za-z\s]+)$/m,                   // "Lab", "Outbuilding"
  ];

  const lines = text.split('\n');
  let currentSection = 'Main';
  let currentContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if this is a section header
    for (const pattern of sectionPatterns) {
      const match = line.match(pattern);
      if (match && line.length < 100) {
        // Save previous section
        if (currentContent.length > 10) {
          chunks.push({
            section: currentSection,
            content: currentContent.join('\n')
          });
        }

        // Start new section
        currentSection = match[1].trim();
        currentContent = [line];
        break;
      }
    }

    if (!isSectionHeader) {
      currentContent.push(line);

      // Force chunk if section gets too large (3000 chars)
      const currentSize = currentContent.join('\n').length;
      if (currentSize > 3000) {
        chunks.push({
          section: `${currentSection} (part ${partNum})`,
          content: currentContent.join('\n')
        });
        currentContent = [];
      }
    }
  }

  return chunks;
}
```

**Example Output:**
```javascript
chunks = [
  { section: "Greenhouse", content: "Greenhouse $21,964.00\n19 ea Protecta..." },
  { section: "Headhouse", content: "Headhouse $45,123.00\n7 ea Nullifire..." },
  { section: "Lab", content: "Lab $12,450.00\n15 ea Hilti..." }
]
```

### Step 2.4: System Prompt (Critical!)

```typescript
// Lines 260-297
const systemPrompt = `You are an expert at extracting line items from construction quotes with hierarchical structures.

CRITICAL: Quotes often have a hierarchical structure:
- Section summaries (e.g., "Greenhouse $21,964.00") - DO NOT EXTRACT
- Subsection summaries (e.g., "Electrical Services Fire stopping $1,948.50") - DO NOT EXTRACT
- Individual line items with quantity, unit, rate (e.g., "Protecta FR Acrylic... 19 ea $35.50 $674.50") - EXTRACT THESE

You MUST ONLY extract individual line items that have ALL of:
1. A detailed product/service description
2. A quantity (number)
3. A unit of measure (ea, m, LS, etc.)
4. A unit rate (price per unit)
5. A total price

SKIP ANY LINE that is a summary/subtotal:
- Lines showing only a description and total price (no qty/unit/rate)
- Lines with section names like "Electrical Services Fire stopping $X"
- Lines with "Total", "Subtotal", "P&G", "Margin", "Grand Total"
- Lines that aggregate other items

Extract each valid line item with:
- description: Full item description (e.g., product name, specifications)
- qty: Quantity (number only, e.g., 19)
- unit: Unit of measure (ea, m, LS, per m, etc.)
- rate: Unit price (number only, e.g., 35.50)
- total: Total price (number only, must equal qty × rate)
- section: Section name if present

VALIDATION:
- Every extracted item MUST have qty × rate = total (within rounding)
- If you can't find qty, unit, and rate, it's probably a summary - SKIP IT

Return JSON format:
{
  "items": [{"description": "string", "qty": number, "unit": "string", "rate": number, "total": number, "section": "string"}],
  "confidence": number,
  "warnings": ["string"]
}`;
```

**Key Points:**
- Explicitly tells AI to skip section summaries
- Requires ALL fields (qty, unit, rate, total) to be present
- Must validate qty × rate = total

### Step 2.5: Process Each Chunk

```typescript
// Lines 304-369
if (needsChunking) {
  const chunks = chunkQuoteBySection(text);
  console.log(`[LLM Fallback] Processing ${chunks.length} chunks...`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    const userPrompt = `Extract line items from this section:

Section: ${chunk.section}

${chunk.content}

Supplier: ${supplierName}`;

    try {
      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",  // OpenAI's latest model
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },  // Force JSON response
          temperature: 0.1,  // Low temperature = more deterministic
          max_completion_tokens: 4096,
        }),
      }, 45000);  // 45 second timeout

      const openaiResult = await openaiResponse.json();
      const content = openaiResult.choices?.[0]?.message?.content;

      const parsed = JSON.parse(content);
      const chunkItems = (parsed.items || []).map(item => ({
        ...item,
        section: item.section || chunk.section
      }));

      allItems.push(...chunkItems);
      allWarnings.push(...(parsed.warnings || []));
      overallConfidence += (parsed.confidence || 0.8);

      console.log(`[LLM Fallback] Chunk ${i + 1} extracted ${chunkItems.length} items`);
    } catch (error) {
      console.error(`[LLM Fallback] Error processing chunk ${i + 1}:`, error);
      allWarnings.push(`Section "${chunk.section}" parse error`);
    }
  }

  overallConfidence = chunks.length > 0 ? overallConfidence / chunks.length : 0;
}
```

**Example GPT-4o Response:**
```json
{
  "items": [
    {
      "description": "Protecta FR Acrylic Sealant 600ml",
      "qty": 19,
      "unit": "ea",
      "rate": 35.50,
      "total": 674.50,
      "section": "Greenhouse"
    },
    {
      "description": "Nullifire FS703 Firestop Sealant",
      "qty": 12,
      "unit": "ea",
      "rate": 42.00,
      "total": 504.00,
      "section": "Greenhouse"
    }
  ],
  "confidence": 0.92,
  "warnings": []
}
```

### Step 2.6: Duplicate Total Detection

**Critical Bug Fix:** Sometimes AI assigns section total to ALL items

```typescript
// Lines 420-447
const totalFrequency = new Map<number, number>();
items.forEach(item => {
  const total = item.total || 0;
  totalFrequency.set(total, (totalFrequency.get(total) || 0) + 1);
});

const maxFrequency = Math.max(...Array.from(totalFrequency.values()));
const hasDuplicateTotals = maxFrequency >= 10;

if (hasDuplicateTotals) {
  console.warn(`[LLM Fallback] DETECTED PARSING ERROR: ${maxFrequency} items with identical total - recalculating from qty × rate`);

  items = items.map(item => {
    const qty = parseFloat(String(item.qty || 0));
    const rate = parseFloat(String(item.rate || 0));
    const calculatedTotal = qty * rate;

    if (calculatedTotal > 0 && calculatedTotal !== item.total) {
      console.log(`[LLM Fallback] Fixed: ${item.description} - Total: ${item.total} → ${calculatedTotal.toFixed(2)}`);
      return { ...item, total: calculatedTotal };
    }
    return item;
  });
}
```

**Why?** Sometimes AI extracts section total as "$21,964" and incorrectly assigns it to EVERY item in that section.

### Step 2.7: Return Parsed Items

```typescript
// Lines 449-476
const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);

return {
  success: true,
  lines: items,  // Array of line items
  items: items,  // Duplicate for compatibility
  confidence: overallConfidence,  // 0.0 to 1.0
  warnings: allWarnings,  // Any parsing issues
  totals: {
    subtotal,
    grandTotal: subtotal
  },
  metadata: {
    supplier: supplierName,
    itemCount: items.length,
    chunked: needsChunking
  }
};
```

**Example:**
```json
{
  "success": true,
  "items": [
    { "description": "Protecta FR Acrylic...", "qty": 19, "unit": "ea", "rate": 35.50, "total": 674.50 },
    { "description": "Nullifire FS703...", "qty": 12, "unit": "ea", "rate": 42.00, "total": 504.00 },
    // ... 120 more items
  ],
  "confidence": 0.89,
  "warnings": [],
  "totals": { "grandTotal": 1140511.00 },
  "metadata": { "itemCount": 122, "chunked": true }
}
```

---

## Step 3: Filtering & Validation {#step-3-filtering}

**Back to:** `supabase/functions/parse_quote_with_extractor/index.ts`

### Step 3.1: Receive AI Results

```typescript
// Lines 176-180
const parseResult = await llmResponse.json();
let items = parseResult.lines || parseResult.items || [];
const grandTotal = parseResult.totals?.grandTotal || parseResult.grandTotal || parseResult.quoteTotalAmount;

console.log(`AI parser extracted ${items.length} items, grand total: ${grandTotal}`);
// AI parser extracted 122 items, grand total: 1140511
```

### Step 3.2: FILTER 1 - Lump Sum Items (THE BUG!)

```typescript
// Lines 182-201
// CRITICAL: Remove lump sum items if we have itemized items
const lumpSumItems = items.filter((item: any) => {
  const unit = String(item.unit || '').toUpperCase().trim();
  return ['LS', 'LUMP SUM', 'L.S.', 'SUM', 'LUMPSUM'].includes(unit);
});

const itemizedItems = items.filter((item: any) => {
  const unit = String(item.unit || '').toUpperCase().trim();
  return !['LS', 'LUMP SUM', 'L.S.', 'SUM', 'LUMPSUM'].includes(unit);
});

console.log(`Item breakdown: ${lumpSumItems.length} LS items, ${itemizedItems.length} itemized items`);
// Item breakdown: 27 LS items, 95 itemized items

// HARD RULE: If we have ANY itemized items, remove ALL lump sum items
if (itemizedItems.length > 0) {
  console.log(`FILTERING: Removing ALL ${lumpSumItems.length} lump sum items - keeping ${itemizedItems.length} itemized items`);
  items = itemizedItems;  // ❌ DELETES $291K!
} else {
  console.log(`Only LS items found - keeping all ${items.length} items`);
}
```

**What Just Happened:**
- AI extracted 122 items total
- 95 items have unit "ea" (total $849,008)
- 27 items have unit "LS" (total $291,503)
- Filter sees: `itemizedItems.length = 95 > 0`
- **Filter executes: `items = itemizedItems`**
- **Result: 27 LS items DELETED!**

**Original Intent:** Remove duplicate summary lines that have unit "LS"

**Actual Behavior:** Removes ALL LS items, even legitimate ones like:
- "Site Establishment LS $15,000"
- "Mobilization LS $8,500"
- "Project Management LS $25,000"

### Step 3.3: FILTER 2 - Optional Items

```typescript
// Lines 203-221
// CRITICAL: Remove items marked as "Optional" to avoid double-counting
const optionalItems = items.filter((item: any) => {
  const desc = String(item.description || '').toLowerCase();
  return desc.includes('optional');
});

const nonOptionalItems = items.filter((item: any) => {
  const desc = String(item.description || '').toLowerCase();
  return !desc.includes('optional');
});

console.log(`Optional filtering: ${optionalItems.length} optional items, ${nonOptionalItems.length} base items`);

// If we have both optional and non-optional items, keep only non-optional
if (nonOptionalItems.length > 0 && optionalItems.length > 0) {
  console.log(`FILTERING: Removing ${optionalItems.length} optional items to avoid double-counting - keeping ${nonOptionalItems.length} base items`);
  items = nonOptionalItems;
}
```

**Original Intent:** Remove marked-up "Optional" versions of base items (to avoid double-counting)

**Actual Behavior:** Removes ALL items with "optional" in description, even if they're separate line items

### Step 3.4: Calculate Totals

```typescript
// Lines 225-241
const lineItemsTotal = items.reduce((sum: number, item: any) => {
  const itemTotal = parseFloat(item.total || item.amount || "0");
  return sum + itemTotal;
}, 0);
// lineItemsTotal = $849,008 (95 items)

const quotedTotal = grandTotal || null;
// quotedTotal = $1,140,511 (from AI)

const contingencyAmount = quotedTotal && quotedTotal > lineItemsTotal
  ? quotedTotal - lineItemsTotal
  : 0;
// contingencyAmount = $1,140,511 - $849,008 = $291,503 ❌ WRONG!

const totalAmount = quotedTotal || lineItemsTotal;
// totalAmount = $1,140,511

console.log("Quote totals:", {
  lineItemsTotal,    // $849,008
  quotedTotal,       // $1,140,511
  contingencyAmount, // $291,503
  totalAmount        // $1,140,511
});
```

**The Problem:**
- `quotedTotal` = $1,140,511 ✅ Correct (from AI)
- `lineItemsTotal` = $849,008 ❌ Wrong (27 items deleted)
- `contingencyAmount` = $291,503 ❌ This is NOT contingency, it's DELETED ITEMS!

---

## Step 4: Database Storage {#step-4-database}

### Step 4.1: Create Quote Record

```typescript
// Lines 258-282
const { data: quote, error: quoteError } = await supabase
  .from("quotes")
  .insert({
    project_id: projectId,
    supplier_name: supplierName,
    file_name: fileName,
    file_url: storagePath,
    total_amount: totalAmount,        // $1,140,511 ✅
    quoted_total: quotedTotal,        // $1,140,511 ✅
    contingency_amount: contingencyAmount,  // $291,503 ❌
    items_count: items.length,        // 95 ❌ (should be 122)
    user_id: userId,
    organisation_id: project.organisation_id,
    status: "pending",
    revision_number: revisionNumber,
    trade: trade,
    metadata: {
      extractor_used: "external_direct",
      num_pages: extractorData.num_pages,
      tables_count: extractorData.tables?.length || 0,
      parsed_at: new Date().toISOString(),
    },
  })
  .select()
  .single();
```

### Step 4.2: Create Quote Items

```typescript
// Lines 289-323
if (items.length > 0) {
  const quoteItems = items.map((item: any) => {
    const unitPrice = item.unit_price ?? item.unitPrice ?? item.rate;
    const totalPrice = item.total ?? item.amount;
    let quantity = parseFloat(item.qty || item.quantity || "0");
    let finalUnitPrice = unitPrice;

    // CRITICAL FIX: If item has total but missing qty/unit_price, convert to qty=1, price=total
    if ((quantity === 0 || finalUnitPrice === null || finalUnitPrice === undefined) && totalPrice) {
      quantity = 1;
      finalUnitPrice = parseFloat(totalPrice.toString());
      console.log(`[DATA INTEGRITY FIX] Item "${item.description}" has total but missing qty/price, saving as qty=1, price=${totalPrice}`);
    }

    return {
      quote_id: quote.id,
      description: item.description || item.desc || "",
      quantity: quantity,
      unit: item.unit || "ea",
      unit_price: finalUnitPrice !== null && finalUnitPrice !== undefined ? parseFloat(finalUnitPrice.toString()) : null,
      total_price: totalPrice !== null && totalPrice !== undefined ? parseFloat(totalPrice.toString()) : null,
    };
  });

  const { error: itemsError } = await supabase
    .from("quote_items")
    .insert(quoteItems);

  if (itemsError) {
    console.error("Quote items creation error:", itemsError);
    throw new Error("Failed to create quote items");
  }
}
```

**Result in Database:**

**quotes table:**
```sql
id: "abc-123"
supplier_name: "FireSafe"
total_amount: 1140511.00        ✅ Correct
quoted_total: 1140511.00        ✅ Correct
contingency_amount: 291503.00   ❌ Wrong (this is deleted items)
items_count: 95                 ❌ Wrong (should be 122)
```

**quote_items table:** (95 rows)
```sql
-- Only the 95 "ea" items are saved
-- The 27 "LS" items worth $291K are MISSING!
```

### Step 4.3: Return Success

```typescript
// Lines 325-345
return new Response(
  JSON.stringify({
    success: true,
    quoteId: quote.id,
    itemsCount: items.length,  // 95 (wrong)
    extractorData: {
      filename: extractorData.filename,
      num_pages: extractorData.num_pages,
      text_length: extractorData.text.length,
      tables_count: extractorData.tables?.length || 0,
    },
    message: `Successfully parsed quote using external extractor. Found ${items.length} items.`,
  }),
  { status: 200 }
);
```

---

## Python Ensemble Coordinator {#python-ensemble}

### How Multiple Parsers Work Together

**File:** `python-pdf-service/parsers/ensemble_coordinator.py`

### Step 1: Parallel Execution

```python
# Lines 69-101
with ThreadPoolExecutor(max_workers=5) as executor:
    future_to_parser = {}

    # Launch all parsers simultaneously
    for parser_name in ['pdfplumber', 'pymupdf', 'ocr']:
        parser = self.parsers[parser_name]
        future = executor.submit(parser.parse, pdf_bytes, filename)
        future_to_parser[future] = parser_name

    # Collect results as they complete (first-wins advantage)
    for future in as_completed(future_to_parser):
        parser_name = future_to_parser[future]
        try:
            result = future.result(timeout=60)
            results.append(result)
        except Exception as e:
            # If a parser fails, add error result
            results.append({
                'parser_name': parser_name,
                'success': False,
                'items': [],
                'confidence_score': 0.0,
                'errors': [str(e)]
            })
```

### Step 2: Build Consensus

```python
# Lines 197-262
def _build_consensus(self, results):
    """
    Build consensus items from multiple parser results.
    """
    successful_results = [r for r in results if r['success'] and r.get('items')]

    if len(successful_results) == 1:
        return successful_results[0]['items']

    # Group items by similarity (description + quantity)
    all_items = {}

    for result in successful_results:
        for item in result['items']:
            desc = item.get('description', '').lower().strip()
            qty = item.get('quantity', 0)
            key = f"{desc}_{qty}"

            if key not in all_items:
                all_items[key] = []

            all_items[key].append({
                **item,
                'source_parser': result['parser_name'],
                'source_confidence': result['confidence_score'],
            })

    # Build consensus items
    consensus_items = []

    for key, items in all_items.items():
        if len(items) == 1:
            # Single source - use as-is
            consensus_items.append({
                **items[0],
                'consensus_level': 'single_source',
                'agreement_count': 1,
            })
        else:
            # Multiple sources - average numeric values
            quantities = [i['quantity'] for i in items if i.get('quantity', 0) > 0]
            unit_prices = [i['unit_price'] for i in items if i.get('unit_price', 0) > 0]
            totals = [i['total_price'] for i in items if i.get('total_price', 0) > 0]

            avg_qty = sum(quantities) / len(quantities) if quantities else 0
            avg_price = sum(unit_prices) / len(unit_prices) if unit_prices else 0
            avg_total = sum(totals) / len(totals) if totals else 0

            # Use item with highest confidence as base
            best_item = max(items, key=lambda x: x['source_confidence'])

            consensus_items.append({
                **best_item,
                'quantity': avg_qty or best_item['quantity'],
                'unit_price': avg_price or best_item['unit_price'],
                'total_price': avg_total or best_item['total_price'],
                'consensus_level': 'multi_source_averaged',
                'agreement_count': len(items),
                'sources': [i['source_parser'] for i in items],
            })

    return consensus_items
```

### Step 3: Remove Summary Duplicates (Another Bug!)

```python
# Lines 345-446
def _remove_summary_duplicates(self, items):
    """
    Detect and remove summary/lump sum items when detailed line items exist.
    """
    if not items or len(items) < 2:
        return items

    # STEP 1: Separate items by unit type
    lump_sum_items = []
    itemized_items = []

    for item in items:
        unit = str(item.get('unit', '')).upper().strip()

        if unit in ['LS', 'LUMP SUM', 'L.S.', 'SUM', 'LUMPSUM']:
            lump_sum_items.append(item)
        else:
            itemized_items.append(item)

    print(f"[Deduplication] Found {len(lump_sum_items)} items with unit 'LS' and {len(itemized_items)} itemized items")

    # CRITICAL RULE: If we have ANY itemized items, ALWAYS remove lump sum items
    if len(itemized_items) >= 3:
        print(f"[Deduplication] HARD RULE: Found {len(itemized_items)} itemized items - REMOVING ALL {len(lump_sum_items)} lump sum items")
        return itemized_items  # ❌ SAME BUG IN PYTHON!

    # If we only have lump sum items, keep them
    if not itemized_items:
        print(f"[Deduplication] Only lump sum items found - keeping them")
        return lump_sum_items

    # Additional content-based detection...
    summary_keywords = [
        'lump sum', 'fixed price', 'sub-total', 'subtotal',
        'grand total', 'summary', 'fixed price lump sum'
    ]

    for item in itemized_items:
        desc = item.get('description', '').lower()
        is_summary = any(keyword in desc for keyword in summary_keywords)

        if is_summary:
            summary_items.append(item)
        else:
            detailed_items.append(item)

    # If we have detailed items, prefer them
    if len(detailed_items) >= 5:
        summary_total = sum(item.get('total_price', 0) for item in summary_items)
        detailed_total = sum(item.get('total_price', 0) for item in detailed_items)

        if detailed_total / summary_total >= 0.30:  # 30% coverage
            print(f"[Deduplication] Detailed items cover {coverage_ratio*100:.1f}% - removing summary items")
            return detailed_items

    return all_itemized
```

**Same Bug in Python!** The Python service ALSO deletes all LS items if itemized items exist (Line 376).

---

## Critical Logic Points {#critical-logic}

### 1. **Chunking Decision (5000 chars / 30 items)**

**File:** `parse_quote_llm_fallback/index.ts` Line 70

```typescript
function shouldChunkQuote(text: string): boolean {
  if (text.length > 5000) return true;
  const itemCount = (text.match(/^\s*\d+\s+ea\s+\$[\d,]+/gim) || []).length;
  if (itemCount > 30) return true;
  return false;
}
```

**Why:** GPT-4o has token limits. Large quotes need chunking to avoid hitting limits.

**Risk:** Items can be lost between chunks if section detection fails.

---

### 2. **Section Detection Patterns**

**File:** `parse_quote_llm_fallback/index.ts` Lines 89-93

```typescript
const sectionPatterns = [
  /^([A-Z][A-Za-z\s]+)\s+\$[\d,]+\.?\d*/m,  // "Greenhouse $21,964.00"
  /^([A-Z][A-Za-z\s]+)\s+continued/im,       // "Headhouse Continued"
  /^([A-Z][A-Za-z\s]+)$/m,                   // "Lab", "Outbuilding"
];
```

**Why:** Construction quotes often have section headers like "Greenhouse $21,964" before line items.

**Risk:** If pattern doesn't match, entire document is treated as one section.

---

### 3. **Lump Sum Filter (THE BUG)**

**File:** `parse_quote_with_extractor/index.ts` Lines 195-198

```typescript
if (itemizedItems.length > 0) {
  console.log(`FILTERING: Removing ALL ${lumpSumItems.length} lump sum items`);
  items = itemizedItems;  // ❌ DELETES LEGITIMATE LS ITEMS
}
```

**Why:** Developer assumed LS items are always duplicates of itemized items on summary pages.

**Reality:** Many quotes have BOTH legitimate LS items AND itemized items.

---

### 4. **Duplicate Total Detection**

**File:** `parse_quote_llm_fallback/index.ts` Lines 422-447

```typescript
const totalFrequency = new Map<number, number>();
items.forEach(item => {
  totalFrequency.set(item.total, (totalFrequency.get(item.total) || 0) + 1);
});

const maxFrequency = Math.max(...Array.from(totalFrequency.values()));

if (maxFrequency >= 10) {
  // Recalculate totals from qty × rate
  items = items.map(item => ({
    ...item,
    total: item.qty * item.rate
  }));
}
```

**Why:** Sometimes AI incorrectly assigns the section total to ALL items in that section.

**Fix:** If 10+ items have the same total, recalculate from qty × rate.

---

### 5. **Ensemble Parser Selection**

**File:** `ensemble_coordinator.py` Lines 283-315

```python
# Strongly prefer LLM-based parsers
llm_parsers = ['docai', 'textract', 'unstructured', 'pymupdf']

def score(result):
    base_score = conf * 0.7 + items_norm * 0.3

    if result['parser_name'] in llm_parsers:
        base_score *= 1.5  # 50% BONUS
    elif result['parser_name'] in ['pdfplumber', 'ocr']:
        base_score *= 0.6  # 40% PENALTY

    return base_score
```

**Why:** LLM-based parsers (textract, docai) are better at understanding context than simple table extractors.

**Effect:** PyMuPDF with 100 items will beat PDFPlumber with 150 items.

---

### 6. **Data Integrity Fix**

**File:** `parse_quote_with_extractor/index.ts` Lines 298-303

```typescript
if ((quantity === 0 || finalUnitPrice === null) && totalPrice) {
  quantity = 1;
  finalUnitPrice = parseFloat(totalPrice.toString());
  console.log(`[DATA INTEGRITY FIX] Item "${item.description}" has total but missing qty/price, saving as qty=1, price=${totalPrice}`);
}
```

**Why:** Some items have only a total price (no qty or rate). Convert to qty=1, price=total to preserve value.

**Effect:** Ensures `SUM(quote_items.total_price)` equals expected total.

---

## Summary Flow Diagram

```
User Upload (FireSafe_Quote.pdf)
    ↓
parse_quote_with_extractor
    ↓
Python Service (ensemble_coordinator.py)
    ├─→ PDFPlumber → "Extracted text (confidence: 0.75)"
    ├─→ PyMuPDF → "Extracted text (confidence: 0.85)"
    └─→ OCR → "Extracted text (confidence: 0.60)"
    ↓
Select Best Result → PyMuPDF (highest confidence)
    ↓
Return to Edge Function: { text: "...", num_pages: 8 }
    ↓
parse_quote_llm_fallback
    ↓
Check: text.length = 12,450 → needsChunking = true
    ↓
chunkQuoteBySection()
    ├─→ Chunk 1: "Greenhouse" (3200 chars)
    ├─→ Chunk 2: "Headhouse" (2800 chars)
    ├─→ Chunk 3: "Lab" (2400 chars)
    └─→ Chunk 4: "Outbuilding" (3050 chars)
    ↓
Process Each Chunk with GPT-4o
    ├─→ Chunk 1 → 32 items extracted
    ├─→ Chunk 2 → 28 items extracted
    ├─→ Chunk 3 → 35 items extracted
    └─→ Chunk 4 → 27 items extracted
    ↓
Combine Results: 122 items total
    ├─→ 95 items with unit "ea" = $849,008
    └─→ 27 items with unit "LS" = $291,503
    ↓
Return to parse_quote_with_extractor
    ↓
❌ FILTER 1: Lump Sum Filter
    ├─→ itemizedItems.length = 95 > 0
    └─→ items = itemizedItems (DELETE 27 LS items!)
    ↓
FILTER 2: Optional Items Filter
    ├─→ No optional items found
    └─→ items unchanged (95 items)
    ↓
Calculate Totals
    ├─→ lineItemsTotal = $849,008 (95 items)
    ├─→ quotedTotal = $1,140,511 (from AI)
    └─→ contingencyAmount = $291,503 ❌ (DELETED ITEMS!)
    ↓
Save to Database
    ├─→ quotes table: total_amount = $1,140,511 ✅
    ├─→ quotes table: contingency_amount = $291,503 ❌
    └─→ quote_items: 95 rows (27 items missing!)
    ↓
Return Success to User
```

---

## The Root Cause

The system has **TWO places** where LS items are deleted:

1. **Python Service:** `ensemble_coordinator.py` Line 376
   - `_remove_summary_duplicates()` deletes LS items if 3+ itemized items exist

2. **Edge Function:** `parse_quote_with_extractor/index.ts` Line 195-198
   - Same logic: delete ALL LS items if ANY itemized items exist

Both assume: **LS items = summary duplicates**

Reality: **LS items can be legitimate line items** (mobilization, project management, fixed price services)

---

## How to Fix

### Option 1: Remove the Filter Entirely

```typescript
// Delete lines 182-201 in parse_quote_with_extractor/index.ts
// Delete lines 345-446 in ensemble_coordinator.py
```

**Pros:** Simple, no data loss

**Cons:** May include some duplicate summary lines

### Option 2: Smarter Filter

Only remove LS items if they're ACTUALLY duplicates:

```typescript
// Check if LS item total matches sum of itemized items
const lsTotal = lumpSumItems.reduce((sum, item) => sum + item.total, 0);
const itemizedTotal = itemizedItems.reduce((sum, item) => sum + item.total, 0);

if (Math.abs(lsTotal - itemizedTotal) / lsTotal < 0.05) {
  // LS total matches itemized total (within 5%) → duplicate
  items = itemizedItems;
} else {
  // Different totals → keep both
  items = [...lumpSumItems, ...itemizedItems];
}
```

### Option 3: Improve AI Prompt

Tell GPT-4o to skip summaries more explicitly:

```typescript
const systemPrompt = `...

CRITICAL: DO NOT extract lines that are section summaries:
❌ "Greenhouse $21,964.00" (section header with only total)
❌ "Electrical Services Fire stopping $1,948.50" (subsection summary)
✅ "Protecta FR Acrylic... 19 ea $35.50 $674.50" (line item with qty/unit/rate)

HOWEVER: DO extract legitimate lump sum line items:
✅ "Site Establishment LS $15,000" (actual service)
✅ "Mobilization LS $8,500" (actual cost)
✅ "Project Management LS $25,000" (actual service)

The difference: Summary lines aggregate other items. Lump sum line items are standalone services with no breakdown.
...`;
```

This is the most comprehensive walkthrough of the parsing logic!
