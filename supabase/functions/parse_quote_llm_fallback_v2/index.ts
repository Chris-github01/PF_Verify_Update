import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface LineItem {
  description: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
  section?: string;
  confidence: number;
  source: string;
  raw_text: string;
  validation_flags: string[];
}

interface ParseRequest {
  text?: string;
  supplierName?: string;
  phase?: 'detect' | 'normalize' | 'full';
  trade?: string;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 45000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

function chunkByLineItems(text: string, maxLinesPerChunk: number = 30): { section: string; content: string; lineCount: number }[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const chunks: { section: string; content: string; lineCount: number }[] = [];

  let currentSection = 'Main';
  let currentLines: string[] = [];

  const looksLikeSubtotal = (line: string): boolean => {
    const lower = line.toLowerCase().trim();
    return /^(sub)?total[\s:]/i.test(lower) ||
           /^grand\s+total/i.test(lower) ||
           /^carried\s+forward/i.test(lower) ||
           /^gst/i.test(lower);
  };

  const detectSectionHeader = (line: string): string | null => {
    const patterns = [
      /^([A-Z][A-Za-z\s&-]+)\s+\$[\d,]+\.?\d*/,
      /^([A-Z][A-Z\s&-]+)$/,
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && line.length < 100) {
        return match[1]?.trim() || match[0]?.trim();
      }
    }
    return null;
  };

  for (const line of lines) {
    const sectionHeader = detectSectionHeader(line);
    if (sectionHeader) {
      if (currentLines.length > 5) {
        chunks.push({
          section: currentSection,
          content: currentLines.join('\n'),
          lineCount: currentLines.length,
        });
        currentLines = [];
      }
      currentSection = sectionHeader;
      currentLines.push(line);
      continue;
    }

    if (looksLikeSubtotal(line)) continue;

    if (currentLines.length >= maxLinesPerChunk) {
      chunks.push({
        section: `${currentSection} (part ${chunks.filter(c => c.section.startsWith(currentSection)).length + 1})`,
        content: currentLines.join('\n'),
        lineCount: currentLines.length,
      });
      currentLines = [];
    }

    currentLines.push(line);
  }

  if (currentLines.length > 5) {
    chunks.push({
      section: currentSection,
      content: currentLines.join('\n'),
      lineCount: currentLines.length,
    });
  }

  console.log(`[Row-Aware Chunker] Created ${chunks.length} chunks from ${lines.length} lines`);
  return chunks;
}

async function detectCandidateRows(text: string, openaiApiKey: string, trade?: string): Promise<{ rows: string[]; confidence: number }> {
  const isPlumbing = trade === 'plumbing';
  const isCarpentry = trade === 'carpentry';

  const systemPrompt = isPlumbing
    ? `You are a line item detector for plumbing construction quotes.

Plumbing quotes are often presented as LUMP SUM items — a section or work package description paired with a single total price, without individual quantities or unit rates.

A valid plumbing line item can be ANY of these formats:
1. LUMP SUM: A description of a scope of work with a total price (e.g. "Item NO. 3 - Sanitary fixtures - $250,000 + GST")
2. ITEMISED: Description + quantity + unit + rate + total (e.g. "HWC 450L storage vessel 2 ea $1,200 $2,400")
3. NUMBERED SCOPE: Numbered work items with a price (e.g. "6. Non-Potable Cold Water system $85,000")
4. SUMMARY LINE: A single price covering the whole quote (e.g. "Total Price: $1,511,338 + GST")

INCLUDE:
- Any line that contains a description of plumbing/drainage/gas work AND a dollar amount
- Item numbers with descriptions and prices (e.g. "Item NO. 6", "Item 3", "6.")
- Lump sum work packages even if no qty or rate is visible
- Section totals that represent a discrete scope (e.g. "Sanitary Fixtures $250,000")
- The overall quote total if no individual items are broken out

DO NOT extract:
- Pure header lines with no dollar amount (e.g. "Price included:", "Price not included:")
- Bullet point inclusions/exclusions lists with no price
- Payment terms, conditions, warranty text
- GST lines, subtotals that are clearly summations of already-listed items
- Supplier contact details, dates, project addresses

Return JSON: {"rows": ["raw line 1", "raw line 2", ...]}`
    : isCarpentry
    ? `You are a line item detector for carpentry and interior lining construction quotes (NZ/AU market).

Carpentry quotes cover: timber framing, steel stud framing, GIB/plasterboard supply/fixing/stopping, insulation, ceiling suspension systems, internal doors, skirting/architrave, bulkheads, and associated hardware. They appear in multiple formats — you must handle ALL of them.

FORMAT 1 — LEVEL-BASED LUMP SUMS where PRICES and DESCRIPTIONS are separated (e.g. Cloud10 style):
The PDF may list prices in a column first (under a "TOTAL" header) and descriptions in a separate column or section.
You MUST pair them by their sequential order: 1st price → 1st description, 2nd price → 2nd description, etc.
The descriptions are typically level/zone labels like "LGF, UGF", "Lv1-9", "Lv10", "Lv11,12", "Lv13,14", "Lv15,16,17".
Even if they appear on different parts of the page, match them in order and return one combined row per item.
Example output rows (after pairing):
  "LGF, UGF  $13,700.00"
  "Lv1-9 ($77400 Each)  $696,600.00"
  "Lv10  $61,000.00"
CRITICAL: If you see a TOTAL column with 6 prices and a separate list of 6 level labels, ALL 6 must be included.

FORMAT 2A — FULLY ITEMISED with LABOUR + MATERIAL + OVERALL columns (SERO Carpentry style):
Columns: Description | Qty | Unit | Labour Rate | Labour Constant | Hourly Rate | Labour Total | Material Rate | Material Total | Overall Rate | Overall Total
The LAST value on the row is the Overall Total. The second-to-last is the Overall Rate.
Example: "51mm 0.75BMT Bottom Track  4096  m  5.88  0.14  42  24,084.48  3.42  13,991.94  9.30  38,076.42"
→ Extract as the raw row including ALL numbers so the normalizer can identify Overall Total.
PAGE-TRUNCATED ROWS: If a row ends at the Overall Rate with no Overall Total (e.g. ends in "15.18" or "18.64" with nothing after), include the full row as-is — the normalizer will calculate qty × rate.
Example truncated rows to INCLUDE as-is:
  "90x45mm H3.2 timber batten  4410  m  10.50  0.25  42  46305  4.68  20,638.80  15.18"
  "140x45mm H3.2 timber plate  1130  m  11.76  0.28  42  13,288.80  6.88  7,774.40  18.64"
  "100mm wide DPC  4410  m  3.36  0.08  42  14,817.60  0.45  1,984.50  3.81"
  "Joist Hanger  1157  no.  6.30  0.15  42  7,289.10  5.45  6,305.65  11.75"
  "M12 Bolt  1502  no.  5.04  0.12  42  7,570.08  3.43  5,151.86  8.47"
  "13mm GIB Fyreline  882  m2  29.40  0.70  42  25,930.80  13.30  11,730.60  42.70"
These are VALID line items — do NOT skip them.

FORMAT 2B — MATERIAL-ONLY columns with NO Labour columns (SERO GIB Supply style):
Columns: Description | Qty | Unit | Material Rate | Material Total | Overall Rate | Overall Total
(Labour Rate, Labour Constant, Hourly Rate, Labour Total are all blank/zero)
The row has only: qty, unit, material rate, material total, overall rate, overall total.
Example: "10mm GIB Standard - W33, W34, W35  30384  m2  8.06  244760  8.06  244760"
→ Overall Total = 244760. INCLUDE this row.

FORMAT 3 — HIGH-LEVEL SECTION LUMP SUMS (e.g. TBH Construction style):
Trade sections each have a lump sum total. Qty=1, unit="sum" or "LS".
Example rows to INCLUDE:
  "Wall framing  1.00  Sum  $1,387,477.30"
  "Ceiling  1.00  sum  $402,979.50"
  "Gib Plasterboard Supply  1.00  Sum  $946,680.00"

FORMAT 4 — ITEMISED with Qty | Unit | U/Rate | Total, sometimes COMMA as decimal separator:
European number format may be used: "$ 373 819,07" means $373,819.07 (comma = decimal point, space = thousands separator).
Example rows to INCLUDE:
  "1  Internal Wall Framing  373 819,07"
  "37  Ceiling height 2.4-2.7m  676  m2  $93.14  $62,961.58"

ALWAYS INCLUDE:
- Any row with a description AND a dollar amount or enough numbers to calculate a total
- All rows in Format 2A (full columns) and 2B (material-only), including page-truncated rows
- Percentage-based allowances: "General Fixings (nails, screws) - 6%  1  sum  76,651.49" and "Wastage - 10%  1  sum  127,752.48"
- Items in ALL sections: Soffit, Overflow/Sump, Seismic Joint, Parapet, Entry Canopy, Lift/Car Starker top roof, Roof Hatch, Steel beam packer, Bulkhead, Window reveal, Miscellaneous, Ceiling suspension, Interior Doors, Finishing Lines

DO NOT INCLUDE:
- GIB Stopping section rows — these are rows under the "GIB Stopping" heading that follow the pattern: GIB description + qty + m2 + labour columns ending at Overall Rate ~17.02 with NO Overall Total after it. These rows are NOT in scope for this subcontract. Examples to EXCLUDE:
    "10mm GIB Standard - W33, W34, W35  30384  m2  16.50  0.33  50  501336  0.52  15,799.68  17.02"
    "13mm GIB Fyreline - W30, W31, W32, W36  13,254.40  m2  16.50  0.33  50  218,697.60  0.52  6,892.29  17.02"
- "No allowance to..." exclusion notes with no dollar amount
- Grand totals, GST lines, or lines whose value equals the sum of preceding items in the same section (e.g. "1,926,482.09  1,481,928.81  2,617,826.06")
- Payment terms, contact details, project addresses, warranty text
- Column header rows only (Description, Qty, Unit, Rate, Total, Labour, Material, Overall)
- Section header labels with no numbers (e.g. "INTERNAL WALL FRAME", "ROOF", "Soffit", "Bulkhead" alone with no dollar amounts)
- Standalone "42" or "50" separator rows

Return JSON: {"rows": ["raw line 1", "raw line 2", ...]}`
    : `You are a line item detector for construction quotes.

Your ONLY job is to identify which lines are PRICED line items — items that have an actual quantity AND a line total.

A valid line item MUST have:
- A product or service description
- A quantity (a number > 0 representing units being purchased/installed — this appears BEFORE the unit rate)
- A line total price (the final dollar amount for this row, appearing at the END of the row)

CRITICAL: In some quotes the "Unit" column contains "0" (zero) or is blank. This does NOT mean the quantity is zero.
The columns are always: Description | Size | Substrate | Qty | Unit | Unit Rate | Total Price
Example: "Trafalgar SuperSTOPPER 350x125x250mm New Gib Wall 2x13mm 1276 0 $365.00 $465,740.00"
→ This IS a valid line item: qty=1276, unit="0" (means "each"), rate=$365, total=$465,740 — INCLUDE IT.

DO NOT extract:
- Section header lines that are just a category name with a subtotal (e.g. "Electrical $2,490.50", "New Building", "Heritage Building") — these have NO qty column
- Subtotals / Grand Totals / Summary lines / P&G lines
- GST / tax lines
- Rate schedule / price list rows — these have a description and unit rate but NO quantity column and NO line total (e.g. "Linear seals per m $22.00", "Cavity barriers per m $89.90", "Intumescent Flushbox ea $20.50")
- Any section labelled "Excluded" or "Exclusions" that lists rates without quantities
- Rate-only rows with no quantity and no line total (e.g. "Linear seals per m $22.00")
- IMPORTANT: Do NOT skip rows just because they appear under a section called "Optional Extras" or similar — if a row has a real quantity AND a real line total, INCLUDE it regardless of its section heading.

INCLUDE all rows that have: a description + a numeric quantity + a line total.

Return JSON: {"rows": ["raw line 1", "raw line 2", ...]}`;

  const userPrompt = `Identify line item rows from this text:\n\n${text}`;

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_completion_tokens: 4096,
    }),
  }, 30000);

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content);

  return {
    rows: parsed.rows || [],
    confidence: 0.85,
  };
}

async function normalizeRows(rows: string[], section: string, openaiApiKey: string, trade?: string): Promise<LineItem[]> {
  if (rows.length === 0) return [];

  const isPlumbing = trade === 'plumbing';
  const isCarpentry = trade === 'carpentry';

  const systemPrompt = isPlumbing
    ? `You are a line item normalizer for plumbing construction quotes.

For each raw text line, extract:
- description: The scope of work or product/service name (clean, concise)
- qty: Quantity as a number. For lump sum items use 1. If a real quantity is present, use it.
- unit: Unit of measure. Use "LS" for lump sum items, "ea" for each, "m" for metres, etc.
- rate: Unit price as a number. For lump sums where only a total is given, set rate equal to the total.
- total: The total dollar amount for this line item.

CRITICAL RULES:
1. NUMBER FORMAT: Commas are THOUSAND separators, NOT decimal separators
   - "$1,511,338" = 1511338 (NOT 1511.338)
   - "$250,000" = 250000
2. Lump sum items are VALID — if a line has a description and a dollar amount, extract it as qty=1, unit="LS", rate=total.
3. If a line says "Item NO. X" or "Item X", include the item number in the description.
4. SKIP pure contact details, addresses, dates, payment terms with no dollar amount.
5. SKIP lines that are clearly inclusions/exclusions bullet points with no price.
6. If only one grand total is found for the whole quote, return it as a single lump sum item.

Example: "Item NO. 3 - Sanitary fixtures Total Price: $250,000 + GST" → description="Item NO. 3 - Sanitary fixtures", qty=1, unit="LS", rate=250000, total=250000, confidence=0.9
Example: "Non-Potable Cold Water system $85,000" → description="Non-Potable Cold Water system", qty=1, unit="LS", rate=85000, total=85000, confidence=0.85

Return JSON: {"items": [{"description": "...", "qty": 1, "unit": "LS", "rate": 250000, "total": 250000, "confidence": 0.9}]}`
    : isCarpentry
    ? `You are a line item normalizer for carpentry and interior lining construction quotes (NZ/AU market).

For each raw text row, extract:
- description: Clean, concise name including wall-type/section if present.
- qty: Numeric quantity. Use 1 for lump sums.
- unit: "m", "m2", "no", "ea", "LS", "sum" as appropriate.
- rate: The OVERALL/COMBINED unit rate (labour + material combined). For lump sums set rate = total.
- total: The OVERALL total dollar amount (see format rules below).

CRITICAL NUMBER FORMAT RULES:
1. Standard format — comma = thousands separator: "$38,076.42" = 38076.42, "$1,025,500" = 1025500
2. European format — comma = decimal, space = thousands: "38 076,42" = 38076.42, "373 819,07" = 373819.07
3. Never interpret a comma-separated number as a small decimal.
4. Large unformatted integers like "501336", "46305", "244760" are full dollar amounts (e.g. 501336 = $501,336).

IDENTIFYING THE COLUMN STRUCTURE — read the numbers carefully:
This quote uses up to 11 columns: Description | Qty | Unit | Labour Rate | Labour Constant | Hourly Rate | Labour Total | Material Rate | Material Total | Overall Rate | Overall Total
The Hourly Rate column contains a fixed value of 42 or 50 (the hourly labour rate). Use this to orient yourself.
Count columns from left: col7 = Labour Total (large), col9 = Material Total (large), col10 = Overall Rate (small), col11 = Overall Total (large).

FORMAT A — FULL 11-COLUMN ROW (Overall Total present):
The LAST value is the Overall Total. The second-to-last is the Overall Rate.
Examples:
  "51mm 0.75BMT Bottom Track  4096  m  5.88  0.14  42  24,084.48  3.42  13,991.94  9.30  38,076.42"
  → qty=4096, unit="m", rate=9.30, total=38076.42
  "Rondo128 - 38x21x0.75 top cross rail  11,981.44  m  6.30  0.15  42  75,483.10  8.72  104,442.25  15.02  179,925.35"
  → qty=11981.44, unit="m", rate=15.02, total=179925.35
  "60mm (h) Suspension Clip  13,312.72  no  2.52  0.06  42  33,548.04  2.90  38,580.25  5.42  72,128.30"
  → qty=13312.72, unit="no", rate=5.42, total=72128.30
  "Hanger clips to concrete  13,312.72  no  2.10  0.05  42  27,956.70  3.42  45,469.58  5.52  73,426.29"
  → qty=13312.72, unit="no", rate=5.52, total=73426.29
  "Ø5.0mm Soft Galvanised Suspension Rod  8,653.27  m  1.68  0.04  42  14,537.49  1.84  15,922.01  3.52  30,459.49"
  → qty=8653.27, unit="m", rate=3.52, total=30459.49
  "Gridlocl bracing tee  95  no  147  3.50  42  13965  223.69  21,250.55  370.69  35,215.55"
  → qty=95, unit="no", rate=370.69, total=35215.55
  "9mm Villaboard soffit lining  882  m2  27.30  0.65  42  24,078.60  29.53  26,045.46  56.83  50,124.06"
  → qty=882, unit="m2", rate=56.83, total=50124.06
  "9mm Villaboard soffit lining  135  m2  27.30  0.65  42  3,685.50  29.53  3,986.55  56.83  7,672.05"
  → qty=135, unit="m2", rate=56.83, total=7672.05
  "Joist Hanger  771  no.  6.30  0.15  42  4,857.30  5.45  4,201.95  11.75  9,059.25"
  → qty=771, unit="no", rate=11.75, total=9059.25
  "240x45mm H1.2 timber trimmer beam  80  m  14.70  0.35  42  1176  12.56  1,004.80  27.26  2,180.80"
  → qty=80, unit="m", rate=27.26, total=2180.80
  "18mm Plywood  30  m2  37.80  0.90  42  1134  50.25  1,507.50  88.05  2,641.50"
  → qty=30, unit="m2", rate=88.05, total=2641.50

FORMAT B — PAGE-TRUNCATED ROW (Overall Total cut off, row ends at Overall Rate):
You can identify these because: the row ends with a small decimal number (the Overall Rate) and there is no following large total value.
Calculate: total = qty × Overall Rate
Examples:
  "90x45mm H3.2 timber batten  4410  m  10.50  0.25  42  46305  4.68  20,638.80  15.18"
  → Row ends at 15.18 (Overall Rate), no Overall Total. total = 4410 × 15.18 = 66,943.80
  "140x45mm H3.2 timber plate  1130  m  11.76  0.28  42  13,288.80  6.88  7,774.40  18.64"
  → total = 1130 × 18.64 = 21,063.20
  "100mm wide DPC  4410  m  3.36  0.08  42  14,817.60  0.45  1,984.50  3.81"
  → total = 4410 × 3.81 = 16,802.10
  "Joist Hanger  1157  no.  6.30  0.15  42  7,289.10  5.45  6,305.65  11.75"
  → total = 1157 × 11.75 = 13,593.75
  "M12 Bolt  1502  no.  5.04  0.12  42  7,570.08  3.43  5,151.86  8.47"
  → total = 1502 × 8.47 = 12,721.94
  "13mm GIB Fyreline  882  m2  29.40  0.70  42  25,930.80  13.30  11,730.60  42.70"
  → total = 882 × 42.70 = 37,661.40
  "90x45mm H3.2 timber plate  3,458.33  m  10.50  0.25  42  36,312.50  4.68  16185  15.18"
  → total = 3458.33 × 15.18 = 52,497.25
  "90x45mm H3.2 timber plate  756  m  10.50  0.25  42  7938  4.88  3,689.28  15.38"
  → total = 756 × 15.38 = 11,627.28
  "140x45mm H3.2 timber plate  1701  m  11.76  0.28  42  20,003.76  6.88  11,702.88  18.64"
  → total = 1701 × 18.64 = 31,706.64
  "140x45mm H3.2 timber plate  2,939.58  m  11.76  0.28  42  34,569.50  6.88  20,224.33  18.64"
  → total = 2939.58 × 18.64 = 54,793.77
  "140x45mm H3.2 timber plate  636.16  m  11.76  0.28  42  7,481.24  6.88  4,376.78  18.64"
  → total = 636.16 × 18.64 = 11,858.02
  "150mm DPC  227  m  4.20  0.10  42  953.40  0.55  124.85  4.75"
  → total = 227 × 4.75 = 1,078.25
  "M12 Bolt and Washer  378.33  no.  5.04  0.12  42  1,906.80  3.43  1,297.68  8.47"
  → total = 378.33 × 8.47 = 3,204.46
  "Metal flashing  227.20  m  10.50  0.25  42  2,385.60  26  5,907.20  36.50"
  → total = 227.20 × 36.50 = 8,292.80
  "140x45mm H3.2 timber plate  931.50  m  11.76  0.28  42  10,954.44  6.88  6,408.72  18.64"
  → total = 931.50 × 18.64 = 17,363.16
  "Metal flashing  102  m  10.50  0.25  42  1071  0.25  25.50  10.75"
  → total = 102 × 10.75 = 1,096.50
  "M12 Bolt and washer  156  no.  5.04  0.12  42  786.24  0.12  18.72  5.16"
  → total = 156 × 5.16 = 805.00 (approx)
  "Angel fillet  89  m  8.40  0.20  42  747.60  2.65  235.85  11.05"
  → total = 89 × 11.05 = 983.45
  "Metal flashing  225  m  10.50  0.25  42  2,362.50  26  5850  36.50"
  → total = 225 × 36.50 = 8,212.50
  "6mm RAB board  55  m2  25.20  0.60  42  1386  19.25  1,058.75  44.45"
  → total = 55 × 44.45 = 2,444.75
  "6mm RAB board  86  m2  25.20  0.60  42  2,167.20  19.25  1,655.50  44.45"
  → total = 86 × 44.45 = 3,822.70
  "CPC40  352  no.  5.04  0.12  42  1,774.08  2.25  792  7.29"
  → total = 352 × 7.29 = 2,566.08
  "90x45mm H1.2 Timber packer to steel beam / column  4856  m  10.50  0.25  42  50988  4.88  23,697.28  15.38"
  → total = 4856 × 15.38 = 74,685.28
  "M12 Bolt and washer  2,697.78  no.  5.04  0.12  42  13,596.80  3.43  9,253.38  8.47"
  → total = 2697.78 × 8.47 = 22,850.30
  "90x45mm H1.2 Timber frame Bulkhead  3252  m  10.50  0.25  42  34146  4.88  15,869.76  15.38"
  → total = 3252 × 15.38 = 50,033.76
  "Joist Hanger  1065  no.  6.30  0.15  42  6,709.50  5.25  5,591.25  11.55"
  → total = 1065 × 11.55 = 12,301.75
  "CPC40  922  no.  4.20  0.10  42  3,872.40  2.25  2,074.50  6.45"
  → total = 922 × 6.45 = 5,946.90
  "M12 Bolt and washer  1880  no.  5.04  0.12  42  9,475.20  3.43  6,448.40  8.47"
  → total = 1880 × 8.47 = 15,923.60
  "140x45mm H1.2 Timber packer to window jamb, head and sill  4705  m  11.76  0.28  42  55,330.80  6.88  32,370.40  18.64"
  → total = 4705 × 18.64 = 87,701.20
  "150mm DPC  4705  m  4.20  0.10  42  19761  0.55  2,587.75  4.75"
  → total = 4705 × 4.75 = 22,348.75
  "M12 Bolt and washer  3,920.83  no.  5.04  0.12  42  19761  3.43  13,448.46  8.47"
  → total = 3920.83 × 8.47 = 33,209.42

FORMAT C — NO OVERALL TOTAL COLUMN (GIB Stopping style — Labour Total + Material Total only, Overall Rate present):
These rows end with the Overall Rate but have no Overall Total. You can identify them by context (GIB Stopping section) or because the last number is a small unit rate.
Calculate: total = Labour Total + Material Total
Examples:
  "10mm GIB Standard - W33, W34, W35  30384  m2  16.50  0.33  50  501336  0.52  15,799.68  17.02"
  → Labour Total=501336, Material Total=15799.68, total = 501336 + 15799.68 = 517,135.68, rate=17.02
  "10mm GIB Aqualine - W33, W34, W35  3952  m2  16.50  0.33  50  65208  0.52  2,055.04  17.02"
  → total = 65208 + 2055.04 = 67,263.04, rate=17.02
  "13mm GIB Fyreline - W30, W31, W32, W36  13,254.40  m2  16.50  0.33  50  218,697.60  0.52  6,892.29  17.02"
  → total = 218697.60 + 6892.29 = 225,589.89, rate=17.02
  "13mm GIB Aqualine  889  m2  16.50  0.33  50  14,668.50  0.52  462.28  17.02"
  → total = 14668.50 + 462.28 = 15,130.78, rate=17.02
  "13mm GIB Fyreline  10568  m2  16.50  0.33  50  174372  0.52  5,495.36  17.02"
  → total = 174372 + 5495.36 = 179,867.36, rate=17.02

FORMAT D — MATERIAL-ONLY ROW (GIB Supply style — no labour columns, Material Rate = Overall Rate = Overall Total / Qty):
Example: "10mm GIB Standard - W33, W34, W35  30384  m2  8.06  244760  8.06  244760"
→ qty=30384, unit="m2", rate=8.06, total=244760

FORMAT E — LUMP SUM:
- "General Fixings (nails, screws) - 6%  1  sum  76,651.49  76,651.49" → qty=1, unit="LS", total=76651.49
- "Wastage - 10%  1  sum  127,752.48  127,752.48" → qty=1, unit="LS", total=127752.48
- "Wall framing  1.00  Sum  $1,387,477.30" → qty=1, unit="LS", total=1387477.30
- "Single door  460  no  189  4.50  42  86940  0  189  86940" → qty=460, unit="no", rate=189, total=86940

ALWAYS SKIP:
- Grand totals / section subtotals that sum other items (e.g. "1,926,482.09  1,481,928.81  2,617,826.06")
- "No allowance to..." exclusion notes
- Column header rows (Description, Qty, Unit, Rate, Total, Labour, Material, Overall)
- Standalone "42" or "50" separator rows with no description
- Contact details, addresses, payment terms, note text

CRITICAL: Do NOT produce duplicate rows. If the same description+qty+unit combination appears in both a GIB Supply block and a GIB Fixing block, they are DIFFERENT items with different scope — keep both. But do NOT extract the same physical row twice.

Return JSON: {"items": [{"description": "...", "qty": 4096, "unit": "m", "rate": 9.30, "total": 38076.42, "confidence": 0.95}]}`
    : `You are a line item normalizer for construction quotes.

For each raw text line, extract:
- description: Product/service name
- qty: Quantity as a number (use 1 ONLY if this is a genuine lump sum item with a real line total — do NOT invent a qty for rate-schedule rows that have no line total)
- unit: Unit of measure (ea, m, LS, etc.) - CRITICAL: If unit is "0", "-", "N/A", or blank, use "ea"
- rate: Unit price as a number
- total: Total price as a number (the line total, NOT a subtotal or section rollup)

CRITICAL RULES:
1. Some tables show "0" or blank in the Unit column. This does NOT mean skip the item - use "ea".
2. NUMBER FORMAT: Commas are THOUSAND separators, NOT decimal separators
   - "$465,740.00" = 465740.00 (NOT 465.74)
   - "$26,791.50" = 26791.50 (NOT 26.79)
3. SKIP lines that are section-level subtotals or category rollup headers. These look like:
   - A single word or short category name followed by a dollar amount (e.g. "Electrical $2,490.50", "Mechanical $2,461")
   - "Subtotal", "Grand Total", "Total", "P&G", "GST", "Margin", "Summary"
   - Any line where the dollar value equals or closely matches the sum of other items in that section
4. SKIP lines where there is no actual line total (total = 0 and rate = 0). These are rate card placeholders.

Example: "SuperSTOPPER | 1276 | 0 | $365.00 | $465,740.00" → qty=1276, unit="ea", rate=365.00, total=465740.00

Return JSON: {"items": [{"description": "...", "qty": 10, "unit": "ea", "rate": 5.50, "total": 55.00, "confidence": 0.9}]}`;

  const userPrompt = `Normalize these line items:\n\n${rows.join('\n')}`;

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_completion_tokens: 8192,
    }),
  }, 40000);

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content);

  return (parsed.items || []).map((item: any, idx: number) => ({
    description: item.description || '',
    qty: parseFloat(String(item.qty || 0)),
    unit: item.unit || 'ea',
    rate: parseFloat(String(item.rate || 0)),
    total: parseFloat(String(item.total || 0)),
    section,
    confidence: item.confidence || 0.8,
    source: 'llm_normalize',
    raw_text: rows[idx] || '',
    validation_flags: [],
  }));
}

/**
 * Regex fallback: extract level-based pricing table rows from plumbing quotes.
 * Used when the LLM returns 0 items on a plumbing quote.
 *
 * Handles PDFs where the text extractor splits each word onto its own line, e.g.:
 *   "LOWER\n GROUND\n LEVEL\n 13800   15355   1760   7620   32000   70535"
 *
 * Strategy:
 * 1. Join the entire text into one long string collapsing whitespace/newlines.
 * 2. Use a regex to find "LEVEL N" or "LOWER GROUND LEVEL" etc. followed by numbers.
 * 3. The last number in the sequence is the SUM column.
 */
function extractPlumbingLevelTable(text: string): LineItem[] {
  const results: LineItem[] = [];

  // Collapse the entire text: replace newlines with spaces, then collapse runs of spaces
  const flat = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

  // Match all known level label patterns followed by a sequence of numbers
  // The last number in the run is the SUM column value
  const LEVEL_RE = /(lower\s+ground(?:\s+level)?|upper\s+ground(?:\s+level)?|ground(?:\s+level)?|basement|level\s+\d+|floor\s+\d+|roof(?:\s+level)?|plant\s+room|car\s+park(?:\s+level)?|podium(?:\s+level)?)\s+((?:[\d,]+(?:\.\d+)?\s+){1,10}[\d,]+(?:\.\d+)?)/gi;

  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = LEVEL_RE.exec(flat)) !== null) {
    const rawLabel = match[1].trim();
    const numberStr = match[2].trim();

    // Skip header rows like "LEVELS ITEMS SUM NOTE" — these have no large numbers
    if (/^levels?\s*$/i.test(rawLabel)) continue;

    // Extract all numbers from the sequence
    const numbers = numberStr.match(/[\d,]+(?:\.\d+)?/g);
    if (!numbers || numbers.length < 1) continue;

    // The last number is the SUM column
    const sumStr = numbers[numbers.length - 1].replace(/,/g, '');
    const sumVal = parseFloat(sumStr);
    if (!sumVal || sumVal < 1000) continue;

    // Deduplicate by label
    const labelKey = rawLabel.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(labelKey)) continue;
    seen.add(labelKey);

    const description = rawLabel
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\s+/g, ' ')
      + ' - Plumbing Works';

    results.push({
      description,
      qty: 1,
      unit: 'LS',
      rate: sumVal,
      total: sumVal,
      section: 'Main',
      confidence: 0.9,
      source: 'regex_level_table',
      raw_text: match[0].trim(),
      validation_flags: [],
    });
  }

  return results;
}

function validateAndFixItem(item: LineItem, trade?: string): LineItem {
  const flags: string[] = [];
  const isLumpSum = item.unit === 'LS' || item.qty === 1;
  const isLumpSumTrade = trade === 'plumbing' || trade === 'carpentry';

  if (!item.total && item.qty && item.rate) {
    item.total = Math.round(item.qty * item.rate * 100) / 100;
    flags.push('CALCULATED_TOTAL');
  }

  if (!isLumpSum) {
    const expectedTotal = Math.round(item.qty * item.rate * 100) / 100;
    const actualTotal = Math.round(item.total * 100) / 100;
    const diff = Math.abs(expectedTotal - actualTotal);
    if (diff > 0.5) {
      flags.push('MISMATCH');
      item.confidence = Math.max(0.3, item.confidence - 0.2);
    }
  }

  if (!item.description || item.description.length < 3) {
    flags.push('MISSING_DESCRIPTION');
    item.confidence = Math.max(0.2, item.confidence - 0.3);
  }

  if (item.qty <= 0 && !isLumpSumTrade) {
    flags.push('INVALID_QTY');
    item.confidence = Math.max(0.2, item.confidence - 0.3);
  }

  if (item.rate <= 0 && !isLumpSumTrade) {
    flags.push('INVALID_RATE');
    item.confidence = Math.max(0.2, item.confidence - 0.3);
  }

  return {
    ...item,
    validation_flags: flags,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { createClient } = await import("npm:@supabase/supabase-js@2.57.4");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: configData } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "OPENAI_API_KEY")
      .maybeSingle();

    const openaiApiKey = configData?.value || Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({
          error: "OpenAI API key not configured",
          success: false,
          items: [],
          confidence: 0,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { text, supplierName, phase, trade }: ParseRequest = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "No text provided", success: false, items: [] }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[LLM v2] Processing ${text.length} characters (phase: ${phase || 'full'})...`);

    const needsChunking = text.length > 5000;
    let allItems: LineItem[] = [];

    if (needsChunking) {
      const chunks = chunkByLineItems(text, 30);
      console.log(`[LLM v2] Processing ${chunks.length} chunks in parallel (trade: ${trade || 'default'})...`);

      const chunkPromises = chunks.map(async (chunk) => {
        try {
          const detectionResult = await detectCandidateRows(chunk.content, openaiApiKey, trade);

          if (detectionResult.rows.length === 0) {
            console.log(`[LLM v2] Chunk "${chunk.section}" - no candidate rows found`);
            return [];
          }

          console.log(`[LLM v2] Chunk "${chunk.section}" - detected ${detectionResult.rows.length} candidate rows`);

          const normalizedItems = await normalizeRows(detectionResult.rows, chunk.section, openaiApiKey, trade);

          console.log(`[LLM v2] Chunk "${chunk.section}" - normalized ${normalizedItems.length} items`);

          return normalizedItems.map(item => validateAndFixItem(item, trade));
        } catch (error) {
          console.error(`[LLM v2] Chunk "${chunk.section}" failed:`, error);
          return [];
        }
      });

      const results = await Promise.all(chunkPromises);
      allItems = results.flat();
    } else {
      console.log(`[LLM v2] Processing entire document (no chunking, trade: ${trade || 'default'})...`);

      const detectionResult = await detectCandidateRows(text, openaiApiKey, trade);
      console.log(`[LLM v2] Detected ${detectionResult.rows.length} candidate rows`);

      if (detectionResult.rows.length > 0) {
        const normalizedItems = await normalizeRows(detectionResult.rows, 'Main', openaiApiKey, trade);
        allItems = normalizedItems.map(item => validateAndFixItem(item, trade));
      }
    }

    // Plumbing fallback: if LLM returned 0 items, try regex level-table extraction
    const isPlumbing = (trade ?? '').toLowerCase() === 'plumbing';
    const isCarpentry = (trade ?? '').toLowerCase() === 'carpentry';
    if (isPlumbing && allItems.length === 0) {
      console.log('[LLM v2] Plumbing: LLM returned 0 items, attempting regex level-table fallback...');
      const levelItems = extractPlumbingLevelTable(text);
      if (levelItems.length > 0) {
        console.log(`[LLM v2] Regex fallback extracted ${levelItems.length} level rows`);
        allItems = levelItems;
      }
    }

    const validItems = allItems.filter(item => {
      if (item.confidence >= 0.6) return true;
      if (item.total > 0 && item.description && item.description.length >= 3) return true;
      return false;
    });
    const flaggedItems = allItems.filter(item => {
      const isValid = item.confidence >= 0.6 || (item.total > 0 && item.description && item.description.length >= 3);
      return !isValid && item.confidence >= 0.4;
    });

    console.log(`[LLM v2] Extracted ${validItems.length} valid items, ${flaggedItems.length} flagged for review`);

    const subtotal = validItems.reduce((sum, item) => sum + (item.total || 0), 0);
    const avgConfidence = validItems.length > 0
      ? validItems.reduce((sum, item) => sum + item.confidence, 0) / validItems.length
      : 0;

    return new Response(
      JSON.stringify({
        success: true,
        items: validItems,
        lines: validItems,
        flagged_items: flaggedItems,
        confidence: avgConfidence,
        totals: {
          subtotal,
          grandTotal: subtotal,
        },
        metadata: {
          supplier: supplierName,
          itemCount: validItems.length,
          flaggedCount: flaggedItems.length,
          chunked: needsChunking,
          phase: 'two_phase_extraction',
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[LLM v2] ERROR:', errorMessage);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        items: [],
        confidence: 0,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
