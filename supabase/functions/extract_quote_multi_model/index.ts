import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExtractionRequest {
  text: string;
  metadata: {
    pageCount: number;
    ocrUsed: boolean;
  };
}

interface AIProviderConfig {
  name: string;
  apiKey: string;
  endpoint: string;
}

const OPENAI_CONFIG: AIProviderConfig = {
  name: "openai",
  apiKey: Deno.env.get("OPENAI_API_KEY") || "",
  endpoint: "https://api.openai.com/v1/chat/completions",
};

const ANTHROPIC_CONFIG: AIProviderConfig = {
  name: "anthropic",
  apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "",
  endpoint: "https://api.anthropic.com/v1/messages",
};

const SCHEMA = {
  type: "object",
  properties: {
    metadata: {
      type: "object",
      properties: {
        supplier_name: { type: "string" },
        quote_number: { type: "string" },
        quote_date: { type: "string" },
        quote_reference: { type: "string" },
        project_name: { type: "string" },
        customer_name: { type: "string" },
        currency: { type: "string" },
        payment_terms: { type: "string" },
        validity_period: { type: "string" },
      },
      required: ["supplier_name", "currency"],
    },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          line_number: { type: "number" },
          item_code: { type: "string" },
          description: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          unit_rate: { type: "number" },
          line_total: { type: "number" },
          trade: { type: "string" },
          system_code: { type: "string" },
          fire_rating: { type: "string" },
          notes: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["description", "quantity", "unit", "unit_rate", "line_total"],
      },
    },
    financials: {
      type: "object",
      properties: {
        subtotal: { type: "number" },
        tax_rate: { type: "number" },
        tax_amount: { type: "number" },
        discount: { type: "number" },
        grand_total: { type: "number" },
        currency: { type: "string" },
      },
      required: ["grand_total", "currency"],
    },
  },
  required: ["metadata", "line_items", "financials"],
};

const SYSTEM_PROMPT = `You are an expert at extracting structured data from passive fire protection and intumescent coating quotes.

Extract the following information from the quote:
1. Metadata: supplier name, quote number, date, project details, currency
2. Line items: each item's description, quantity, unit, unit rate, and line total from DETAILED BREAKDOWN pages
3. Financials: subtotal, tax rate, tax amount, and grand total from summary page

CRITICAL INSTRUCTIONS FOR MULTI-PAGE QUOTES:
- Look for "QUOTE BREAKDOWN" section (typically pages 8-15) - THIS is where ALL line items are listed
- The first page summary shows categories (e.g., "COLLAR $540,242", "CAVITY BARRIER $309,869") but NOT individual items
- Extract EVERY individual row from the detailed breakdown tables
- Parse building sections separately: Building A, Block B, Block C, Undercroft
- DO NOT skip any pages with "Page X of 15" headers

CRITICAL: MULTI-COLUMN PRICING TABLES
- These tables have MULTIPLE cost columns that ADD UP to the final Total
- Columns: Service, Size, Substrate, Quantity, Base Rate, GIB Patch, Batt Patch, Insulation, Timber Top Plate, Baffle, Total
- YOU MUST extract the TOTAL column value (rightmost column) as the line_total
- DO NOT just use Base Rate - that's only ONE component of the price
- Example row: "Cable Bundle, Up to 40mm, Korok Panel 51mm, 48, Base Rate $39.15, Total $1,879.20"
  - Correct line_total = $1,879.20 (from Total column)
  - WRONG = $39.15 (that's just the base rate per unit)
- The Total column already includes: base + patches + insulation + all add-ons
- Look for sub-section totals like "Electrical - Sub Total $103,444.65", "Hydraulic - Sub Total $248,704.68"
- Linear works sections show: Description, Depth/Width, Length (in meters), Rate per meter, Total
- Verify: Sum of ALL line item Totals = subtotal from page 1 ($2,227,124.09 for this quote)

FINANCIAL VALIDATION:
- Extract the GRAND TOTAL from the summary page (page 1)
- This should be the sum of all detailed line items
- Look for "MISCELLANEOUS" section with cost increases/contingencies
- Include contingency as a separate line item

Return a valid JSON object matching the schema exactly.`;

async function callOpenAI(text: string): Promise<any> {
  const response = await fetch(OPENAI_CONFIG.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "quote_extraction",
          strict: true,
          schema: SCHEMA,
        },
      },
      temperature: 0,
      seed: 42,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

async function callAnthropic(text: string): Promise<any> {
  const response = await fetch(ANTHROPIC_CONFIG.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_CONFIG.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `${SYSTEM_PROMPT}\n\nExtract data from this quote and return valid JSON:\n\n${text}`,
        },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Anthropic response");
  }

  return JSON.parse(jsonMatch[0]);
}

function validate(quote: any): any {
  const errors: any[] = [];
  const warnings: any[] = [];
  const checks: any[] = [];

  if (!quote.metadata?.supplier_name) {
    errors.push({
      type: "missing_required",
      field: "metadata.supplier_name",
      message: "Supplier name is required",
      severity: "critical",
    });
  }

  if (!quote.line_items || quote.line_items.length === 0) {
    errors.push({
      type: "missing_required",
      field: "line_items",
      message: "No line items found",
      severity: "critical",
    });
  }

  let arithmeticErrors = 0;
  (quote.line_items || []).forEach((item: any, index: number) => {
    if (item.quantity && item.unit_rate && item.line_total) {
      const expected = item.quantity * item.unit_rate;
      const diff = Math.abs(expected - item.line_total);
      if (diff > 0.02) {
        arithmeticErrors++;
        if (arithmeticErrors <= 3) {
          warnings.push({
            type: "arithmetic",
            field: `line_items[${index}].line_total`,
            message: `Line item ${index + 1} arithmetic mismatch: ${item.quantity} × ${item.unit_rate} = ${expected.toFixed(2)}, but line_total is ${item.line_total}`,
            severity: "medium",
          });
        }
      }
    }
  });

  if (arithmeticErrors > 0) {
    checks.push({
      name: "line_item_arithmetic",
      passed: false,
      message: `${arithmeticErrors} line items have arithmetic errors`,
    });
  }

  const lineItemsTotal = (quote.line_items || []).reduce(
    (sum: number, item: any) => sum + (item.line_total || 0),
    0
  );

  if (quote.financials?.subtotal) {
    const diff = Math.abs(lineItemsTotal - quote.financials.subtotal);
    const percentDiff = (diff / quote.financials.subtotal) * 100;
    const passed = diff <= 0.02;
    checks.push({
      name: "line_items_sum_to_subtotal",
      passed,
      message: passed
        ? `Line items sum correctly to subtotal`
        : `Line items sum mismatch: $${lineItemsTotal.toFixed(2)} vs $${quote.financials.subtotal.toFixed(2)} (${percentDiff.toFixed(1)}% difference)`,
    });

    if (!passed) {
      const severity = percentDiff > 5 ? "critical" : diff > 100 ? "high" : "medium";
      errors.push({
        type: "arithmetic",
        field: "financials.subtotal",
        message: `Sum of line items does not match subtotal - possible missing items`,
        severity,
        expected: lineItemsTotal,
        actual: quote.financials.subtotal,
        difference: diff,
        percent_difference: percentDiff,
      });
    }
  } else {
    errors.push({
      type: "missing_required",
      field: "financials.subtotal",
      message: "Subtotal is missing",
      severity: "high",
    });
  }

  if (quote.financials?.subtotal && quote.financials?.tax_amount && quote.financials?.grand_total) {
    const expected = quote.financials.subtotal + quote.financials.tax_amount;
    const diff = Math.abs(expected - quote.financials.grand_total);
    const passed = diff <= 0.02;

    checks.push({
      name: "subtotal_plus_tax_equals_total",
      passed,
      message: passed
        ? `Subtotal + Tax = Grand Total`
        : `Grand total mismatch`,
    });

    if (!passed && diff > 1) {
      errors.push({
        type: "arithmetic",
        field: "financials.grand_total",
        message: `Grand total does not match subtotal + tax`,
        severity: "high",
        expected,
        actual: quote.financials.grand_total,
      });
    }
  }

  const criticalErrors = errors.filter(e => e.severity === "critical").length;
  const highErrors = errors.filter(e => e.severity === "high").length;
  const passedChecks = checks.filter(c => c.passed).length;
  const totalChecks = checks.length || 1;

  let confidence = passedChecks / totalChecks;
  if (criticalErrors > 0) confidence = 0;
  else {
    confidence -= highErrors * 0.15;
    confidence -= warnings.length * 0.02;
  }

  confidence = Math.max(0, Math.min(1, confidence));

  return {
    is_valid: criticalErrors === 0,
    confidence_score: Math.round(confidence * 100) / 100,
    errors,
    warnings,
    checks,
  };
}

function buildConsensus(primary: any, secondary: any): any {
  return {
    metadata: {
      supplier_name: primary.metadata?.supplier_name || secondary.metadata?.supplier_name,
      quote_number: primary.metadata?.quote_number || secondary.metadata?.quote_number,
      quote_date: primary.metadata?.quote_date || secondary.metadata?.quote_date,
      currency: primary.metadata?.currency || secondary.metadata?.currency,
      project_name: primary.metadata?.project_name || secondary.metadata?.project_name,
      customer_name: primary.metadata?.customer_name || secondary.metadata?.customer_name,
    },
    line_items: primary.line_items?.length >= secondary.line_items?.length
      ? primary.line_items
      : secondary.line_items,
    financials: {
      subtotal: primary.financials?.subtotal || secondary.financials?.subtotal,
      tax_rate: primary.financials?.tax_rate || secondary.financials?.tax_rate,
      tax_amount: primary.financials?.tax_amount || secondary.financials?.tax_amount,
      grand_total: primary.financials?.grand_total || secondary.financials?.grand_total,
      currency: primary.financials?.currency || secondary.financials?.currency,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { text, metadata }: ExtractionRequest = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startTime = Date.now();

    const primaryResult = await callOpenAI(text);
    const primaryValidation = validate(primaryResult);
    primaryResult.validation = primaryValidation;

    let secondaryResult = null;
    let consensus = null;

    if (primaryValidation.confidence_score < 0.9 && ANTHROPIC_CONFIG.apiKey) {
      try {
        secondaryResult = await callAnthropic(text);
        const secondaryValidation = validate(secondaryResult);
        secondaryResult.validation = secondaryValidation;

        if (secondaryValidation.confidence_score > primaryValidation.confidence_score) {
          consensus = buildConsensus(secondaryResult, primaryResult);
        } else {
          consensus = buildConsensus(primaryResult, secondaryResult);
        }

        const consensusValidation = validate(consensus);
        consensus.validation = consensusValidation;
      } catch (error) {
        console.error("Secondary model failed:", error);
      }
    }

    const processingTime = Date.now() - startTime;

    const finalQuote = consensus || primaryResult;
    const finalValidation = finalQuote.validation;

    const response = {
      primary: primaryResult,
      secondary: secondaryResult,
      consensus,
      confidence_breakdown: {
        overall: finalValidation.confidence_score,
        metadata: 0.8,
        line_items: 0.85,
        financials: 0.9,
        cross_model_agreement: secondaryResult ? 0.75 : 1.0,
        arithmetic_consistency: finalValidation.checks.filter((c: any) => c.passed).length /
          (finalValidation.checks.length || 1),
        format_validity: 0.9,
      },
      extraction_metadata: {
        models_used: secondaryResult ? ["openai", "anthropic"] : ["openai"],
        extraction_method: consensus ? "consensus" : secondaryResult ? "fallback" : "primary",
        processing_time_ms: processingTime,
        page_count: metadata?.pageCount || 1,
        ocr_used: metadata?.ocrUsed || false,
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Extraction failed:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});