export const PASSIVE_FIRE_TOTAL_SELECTOR_PROMPT = `You are selecting the AUTHORITATIVE TOTAL EXCL GST for a PASSIVE FIRE quote.
Input includes:
- the financial map
- extracted line items
- all candidate totals found in the document
Your job is to choose the single best main-scope total for comparison.
Selection rules in order:
1. Prefer a front-page or summary-page total explicitly labelled:
   - Grand Total (excluding GST)
   - Total (excl. GST)
   - Total Estimate value submitted for approval Excluded GST
   - Quote Summary total
2. If the summary page clearly states that certain "not shown on drawings" penetration items are included, include them in main scope.
3. Do NOT include optional scope unless the summary explicitly says add-to-scope items are already included.
4. If there is a master total and also building/block totals that roll into it, choose the master total only.
5. If there is a subtotal plus PS3/QA that exactly equals the grand total, prefer the grand total and keep PS3/QA separately.
6. Reject candidate totals that are:
   - phone numbers
   - dates
   - quote numbers
   - repeated footer/header numbers
   - rate-card prices
   - page-level subtotals when a later or earlier master total exists
7. If a candidate is far outside plausible range relative to all other totals in the document, treat it as corrupted unless strong evidence proves otherwise.
8. Never select a number that appears only in contact/footer metadata.
Supplier-pattern examples:
- Optimal Fire: choose the page summary grand total, not footer phone number, and do not add detailed schedules again.
- Global Fire: choose the page-1 total excl GST if it explicitly includes the extra-over penetration items; do not replace it with the page-5 identified-drawings-only grand total.
- Passive Fire NZ: choose the page-1 total estimate value submitted for approval excluded GST; do not add Basement/Building A/B/C totals again if they already roll up to that figure.
Return STRICT JSON:
{
  "selected_main_total_ex_gst": number|null,
  "selected_label": string|null,
  "selected_page": number|null,
  "optional_total_ex_gst": number|null,
  "ps3_qa_total_ex_gst": number|null,
  "selection_reason": string,
  "rejected_candidates": [
    {
      "value": number|string,
      "page": number|null,
      "reason": "footer_phone|optional_scope|duplicate_rollup|intermediate_subtotal|rate_card|metadata|implausible_outlier|other"
    }
  ],
  "confidence": 0.0
}`;
