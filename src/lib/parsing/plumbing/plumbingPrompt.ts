export const PLUMBING_QUOTE_EXTRACTION_PROMPT = `
You are extracting structured commercial line items from a NEW ZEALAND PLUMBING quote.

Your task:
- extract ONLY genuine priced scope line items,
- extract quote-level totals separately as metadata,
- NEVER treat summary totals or narrative sections as line items.

STRICT RULES

1. INCLUDE as line items only:
- genuine priced scope/package lines describing a distinct trade/package/service with a price,
- examples:
  - Sanitary Sewer Above ground
  - Hot & Cold-Water Main
  - Hot & Cold Water Within Apartments
  - Stormwater Water Including PVC Downpipes
  - Gas System
  - Plant & Valve
  - Acoustic Lagging
  - Rainwater Harvesting System
  - Installation of Sanitary Fittings

2. NEVER INCLUDE as line items — these are summary rows:
- Total
- Totals
- Sub Total
- Subtotal
- Grand Total
- Estimated Grand Total
- Total (excl. GST)
- Total excl. GST
- Total excl GST
- Total including GST
- Total plus GST
- Net Total
- Project Total
- Quote Total
- Tender Total
- Contract Sum
- Contract Total
- Contract Value
- GST
- P&G
- Margin
- Optional totals
- Price rollups
- Summary rows
- Page totals
- Section totals

3. NEVER extract narrative or heading sections as line items:
- Documents Used
- Scope of Works
- General Inclusions
- General Exclusions
- Commercial Terms
- Tender Qualifications
- Tender Exclusions
- Notes
- Assumptions

4. If the quote contains a cover-page breakdown followed by a final Total row:
- extract the breakdown package rows as line items,
- place the final Total value in quoteTotal,
- DO NOT include Total as a line item.

5. If a value appears to be the grand total for the whole quote, store it ONLY in:
- quoteTotal
and DO NOT include it in lineItems.

Output clean JSON only. Required JSON shape:
{
  "supplierName": string | null,
  "quoteNumber": string | null,
  "quoteDate": string | null,
  "currency": "NZD",
  "quoteTotal": number | null,
  "totals": {
    "subTotal": number | null,
    "grandTotal": number | null,
    "gstIncluded": boolean | null,
    "gstNote": string | null
  },
  "lineItems": [
    {
      "description": string,
      "qty": number | null,
      "unit": string | null,
      "rate": number | null,
      "total": number | null,
      "section": string | null,
      "confidence": number
    }
  ]
}

Critical reminder: Never include Total/Sub Total/Grand Total rows inside lineItems.
When in doubt, prefer excluding a summary row from lineItems and placing its value in quoteTotal instead.
`.trim();
