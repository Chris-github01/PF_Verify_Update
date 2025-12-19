# Award Recommendation Reporting & Analysis Criteria

## Complete Evaluation Framework Documentation

---

## Overview

The VerifyTrade Award Recommendation system employs a comprehensive, multi-criteria evaluation framework to assess supplier quotes and identify optimal award recommendations. This document details the complete methodology, scoring criteria, weighting systems, and risk assessment protocols used in the award process.

---

## 1. EVALUATION METHODOLOGY

### 1.1 Five-Stage Evaluation Process

The award analysis follows a structured five-stage process:

#### Stage 1: Quote Import & Validation
- **Purpose:** Import supplier quotes and validate data integrity
- **Activities:**
  - Parse PDF/Excel quote documents using ensemble extraction
  - Validate all line items have required fields (description, unit, quantity, price)
  - Normalize units and descriptions for consistent comparison
  - Flag missing or incomplete data for review
  - Verify mathematical accuracy (unit price × quantity = total)

#### Stage 2: Data Normalization
- **Purpose:** Standardize quote data for accurate comparison
- **Activities:**
  - Normalize unit descriptions (e.g., "Nr" → "ea", "No." → "ea")
  - Standardize system descriptions (e.g., "Ryanfire SL Collar" → "SL Collar")
  - Rebuild subtotals from line items for consistency
  - Separate special buckets (P&G, Contingency, EWPs, Site Setup, Options)
  - Exclude rate-only items from totals (stored for variations)

#### Stage 3: Scope Gap Analysis
- **Purpose:** Identify missing items and scope coverage
- **Activities:**
  - Compare all suppliers against baseline scope (first uploaded quote)
  - Identify items quoted by some suppliers but not others
  - Calculate scope coverage percentage for each supplier
  - Flag missing items as scope gaps
  - Assess impact of gaps on overall project delivery

#### Stage 4: Risk Assessment
- **Purpose:** Evaluate technical, commercial, and delivery risks
- **Activities:**
  - Assess scope completeness (missing items = risk)
  - Identify lump sum quotes without breakdown (higher risk)
  - Flag expired validity dates
  - Identify missing access equipment (MEWPs)
  - Flag estimate-only pricing (not fixed)
  - Identify missing seismic provisions
  - Assess commercial terms and conditions

#### Stage 5: Multi-Criteria Scoring
- **Purpose:** Calculate weighted scores across multiple dimensions
- **Activities:**
  - Calculate price competitiveness score (0-10)
  - Calculate compliance score based on technical requirements
  - Calculate scope coverage score (0-10)
  - Calculate risk score based on identified risk factors
  - Apply weightings to determine overall weighted score
  - Rank suppliers by weighted score

---

## 2. SCORING CRITERIA

### 2.1 Price Score (Weighting: 40%)

**Calculation Method:**
- Uses inverse linear scaling between lowest and highest price
- Formula: `10 - ((supplier_price - min_price) / (max_price - min_price) × 10)`
- Lowest price = 10 points
- Highest price = 0 points
- Linear distribution between extremes

**Example:**
- Supplier A: $450,000 (lowest) → 10.0/10
- Supplier B: $485,000 (mid) → 6.5/10
- Supplier C: $520,000 (highest) → 0.0/10

**Key Considerations:**
- Price must be adjusted/equalised before scoring
- Excludes optional items not common to all suppliers
- Includes P&G, contingency, and site setup costs
- Currency normalized to project currency

### 2.2 Compliance Score (Weighting: 25%)

**Calculation Method:**
- Formula: `10 - (risk_score × 0.5)`
- Based on number and severity of compliance issues
- Higher risk score = lower compliance score

**Compliance Factors:**
- Technical specification adherence
- Required certifications and approvals
- Material compliance with fire ratings
- Adherence to Australian/NZ Standards
- Quality assurance processes (PS3/PS4)
- Installation methodology acceptance

**Scoring Scale:**
- 10/10: Full compliance, no issues
- 8-9/10: Minor clarifications needed
- 6-7/10: Some non-compliances identified
- 4-5/10: Multiple compliance concerns
- 0-3/10: Major compliance failures

### 2.3 Scope Coverage Score (Weighting: 20%)

**Calculation Method:**
- Formula: `coverage_percentage / 10`
- Based on percentage of baseline items quoted
- Maximum score: 10/10 (100% coverage)

**Coverage Calculation:**
- Total items in baseline scope: X items
- Items quoted by supplier: Y items
- Coverage percentage: `(Y / X) × 100`
- Scope coverage score: `coverage_percentage / 10`

**Example:**
- Supplier A: 46/46 items (100%) → 10.0/10
- Supplier B: 45/46 items (97.8%) → 9.8/10
- Supplier C: 42/46 items (91.3%) → 9.1/10

**Impact of Gaps:**
- Each missing item reduces coverage score
- Gaps flagged for clarification/pricing
- May require provisional sum allowances

### 2.4 Risk Score (Weighting: 15%)

**Calculation Method:**
- Formula: `10 - number_of_missing_items`
- Each missing item = 1 risk point
- Additional risk factors may apply

**Risk Categories:**

#### Red Flag Risks (High Impact)
- **Lump Sum Without Breakdown:** Cannot verify pricing accuracy, variation risk
- **Validity Expired:** Quote may not be honored, price may change
- **Major Scope Gaps:** Critical systems missing from quote
- **Non-Compliance:** Does not meet specification requirements

#### Amber Flag Risks (Medium Impact)
- **Estimate Only (Not Fixed):** Pricing subject to change upon detailed design
- **Missing MEWPs/Access:** Access costs not included, additional cost expected
- **Missing Seismic Provisions:** May not comply with structural requirements
- **Clarifications Required:** Items needing confirmation before award

#### Green Flag Risks (Low Impact)
- **Minor Scope Gaps:** Non-critical items missing
- **Rate-Only Items:** Unit rates for variations provided separately
- **Options Listed Separately:** Additional scope items available if required

**Risk Scoring:**
- 10/10: No risks identified, complete submission
- 8-9/10: Minor clarifications only
- 6-7/10: Some gaps or missing information
- 4-5/10: Multiple risks requiring mitigation
- 0-3/10: Major risks making award inadvisable

---

## 3. WEIGHTED SCORE CALCULATION

### 3.1 Overall Weighted Score Formula

```
Weighted Score = (Price Score × 0.40) +
                 (Compliance Score × 0.25) +
                 (Scope Coverage Score × 0.20) +
                 (Risk Score × 0.15)
```

### 3.2 Default Weightings

| Criterion | Weighting | Rationale |
|-----------|-----------|-----------|
| **Price** | 40% | Primary commercial driver, most objective measure |
| **Compliance** | 25% | Essential for project delivery, regulatory requirement |
| **Scope Coverage** | 20% | Completeness of solution, reduced variation risk |
| **Risk** | 15% | Overall project risk, delivery confidence |
| **TOTAL** | 100% | |

### 3.3 Weighting Rationale

**Price (40%):**
- Most objective and quantifiable criterion
- Primary concern for commercial viability
- Direct impact on project budget
- Easy to verify and compare

**Compliance (25%):**
- Second-most important criterion
- Non-negotiable for regulatory approval
- Critical for building consent and warranty
- Technical competence indicator

**Scope Coverage (20%):**
- Important for complete solution delivery
- Reduces variation and claim risk
- Indicates thoroughness of tender response
- Affects final contract value certainty

**Risk (15%):**
- Overall project delivery confidence
- Encompasses multiple risk dimensions
- Important but partially reflected in other scores
- Lowest weighting as other factors capture most concerns

---

## 4. SUPPLIER COMPARISON METHODOLOGY

### 4.1 Baseline Establishment

- **First uploaded quote becomes baseline:** All items from this quote form the comparison baseline
- **Subsequent quotes mapped to baseline:** Items matched by description, unit, and size
- **Unmatched items flagged:** Items in baseline but not in other quotes = scope gap
- **Additional items captured:** Items in other quotes but not baseline = additional scope

### 4.2 Matching Algorithm

**Exact Match Criteria:**
1. **Description:** Case-insensitive text match after normalization
2. **Unit:** Normalized unit must match (e.g., "Nr" = "ea")
3. **Size/System:** If specified, must match (e.g., "100mm" = "100mm")

**Normalization Process:**
- Remove punctuation and special characters
- Convert to lowercase
- Collapse multiple spaces
- Apply standard abbreviation mappings
- Apply system name standardization

**Match Confidence Levels:**
- **100% - Exact Match:** All criteria match exactly
- **80-99% - High Confidence:** Minor differences in description
- **60-79% - Medium Confidence:** Similar descriptions, manual review suggested
- **0-59% - Low Confidence:** Poor match, likely different items
- **0% - No Match:** Item not found in supplier quote

### 4.3 Variance Analysis

**Price Variance Calculation:**
- Formula: `((supplier_price - baseline_price) / baseline_price) × 100`
- Positive percentage = more expensive than baseline
- Negative percentage = cheaper than baseline

**Variance Thresholds:**
- **Green (±0-15%):** Normal commercial variance, acceptable
- **Amber (±15-30%):** Significant variance, requires review
- **Red (>±30%):** Major variance, requires clarification/justification

**Variance Flags:**
- **Over-Priced:** Red cells indicating significantly higher pricing
- **Under-Priced:** Amber cells indicating potentially missing scope
- **Missing:** Red cells indicating item not quoted

---

## 5. RECOMMENDATION TYPES

The system generates three distinct recommendation types based on different optimization criteria:

### 5.1 Best Value Supplier

**Selection Criteria:**
- **Primary:** Lowest adjusted total price
- **Secondary:** Adequate scope coverage (>90%)
- **Tertiary:** Acceptable risk level (<5 risk points)

**Recommendation Logic:**
- Supplier with lowest total price among qualifying candidates
- Must meet minimum compliance threshold
- May not have perfect scope coverage
- Prioritizes commercial value

**Typical Profile:**
- Most competitive pricing
- May have minor scope gaps
- Good technical compliance
- Acceptable risk profile

### 5.2 Lowest Risk Supplier

**Selection Criteria:**
- **Primary:** Lowest risk score (fewest missing items)
- **Secondary:** Highest scope coverage percentage
- **Tertiary:** Acceptable pricing (within 20% of lowest)

**Recommendation Logic:**
- Supplier with most complete submission
- Fewest scope gaps and clarifications
- May not be lowest price
- Prioritizes delivery confidence

**Typical Profile:**
- Most complete scope coverage (often 100%)
- Comprehensive submission
- Strong technical compliance
- May command premium pricing

### 5.3 Balanced Choice

**Selection Criteria:**
- **Primary:** Highest weighted score (all criteria considered)
- **Secondary:** Well-rounded performance across all dimensions
- **Tertiary:** No major weaknesses in any category

**Recommendation Logic:**
- Optimal balance of price, compliance, coverage, and risk
- May not be best in any single category
- Represents best overall value proposition
- Typically recommended for award

**Typical Profile:**
- Competitive but not necessarily lowest price
- Good scope coverage (95-100%)
- Strong compliance record
- Low to moderate risk
- Highest overall weighted score

---

## 6. RISK ASSESSMENT FRAMEWORK

### 6.1 Risk Categories & Flags

#### Commercial Risks

**Lump Sum Only - No Breakdown**
- **Impact:** High
- **Description:** Quote provided as single lump sum without itemized breakdown
- **Consequence:** Cannot verify pricing accuracy, variation pricing unclear
- **Mitigation:** Request detailed breakdown, consider provisional pricing for variations

**Validity Expired**
- **Impact:** High
- **Description:** Quote validity date has passed
- **Consequence:** Supplier may not honor quoted prices
- **Mitigation:** Request validity extension, obtain confirmation of pricing

**Estimate Not Fixed**
- **Impact:** High
- **Description:** Pricing marked as estimate only, subject to change
- **Consequence:** Final price may differ from quoted amount
- **Mitigation:** Seek fixed pricing, establish price ceiling, budget contingency

#### Technical Risks

**Missing MEWPs/Access Equipment**
- **Impact:** Medium
- **Description:** Access equipment (Mobile Elevated Work Platforms) not included
- **Consequence:** Additional costs for access equipment hire
- **Mitigation:** Obtain separate access pricing, include in cost comparison

**Seismic Not Included**
- **Impact:** Medium
- **Description:** Seismic bracing/reinforcement not included in quote
- **Consequence:** May not meet structural engineer requirements
- **Mitigation:** Confirm seismic requirements, obtain additional pricing

**Missing Items on Drawings**
- **Impact:** Medium
- **Description:** Items visible on drawings not included in quote
- **Consequence:** Incomplete scope, variations required
- **Mitigation:** Issue clarification RFI, request supplementary pricing

#### Scope Risks

**Variations Not in Fixed Scope**
- **Impact:** Medium
- **Description:** Rate-only items provided, not included in fixed price
- **Consequence:** Uncertainty in final contract value
- **Mitigation:** Quantify likely variations, budget accordingly

**Options Not Included in Comparison**
- **Impact:** Low
- **Description:** Optional items listed separately
- **Consequence:** Base comparison may not be like-for-like
- **Mitigation:** Ensure options consistently excluded or included

**Clarifications Required**
- **Impact:** Low to Medium
- **Description:** Items requiring confirmation before award
- **Consequence:** Potential for misunderstanding or dispute
- **Mitigation:** Issue formal RFI, obtain written clarifications

### 6.2 Risk Scoring Impact

Each risk factor contributes to the overall risk score:

| Risk Level | Point Deduction | Example |
|------------|----------------|---------|
| **Critical** | -3 points | Non-compliant with mandatory requirements |
| **High** | -2 points | Lump sum only, validity expired |
| **Medium** | -1 point | Missing MEWPs, seismic not included |
| **Low** | -0.5 points | Minor clarifications needed |

**Starting Score:** 10 points
**Final Risk Score:** 10 - (sum of all risk point deductions) - (number of missing items)

---

## 7. COMPARISON POLICIES

### 7.1 Data Handling Policies

**Lump Sum Treatment:**
- Accept lump sum quotes: YES
- Flag as risk if no breakdown: YES
- Request breakdown in clarifications: RECOMMENDED

**Subtotal Rebuilding:**
- Rebuild subtotals from line items: YES
- Validate against supplier totals: YES
- Flag discrepancies >2%: YES

**Special Item Buckets:**
- Separate buckets tracked:
  - Preliminaries & General (P&G)
  - Producer Statements (PS3/PS4 QA)
  - Contingency
  - Access Equipment (EWPs/MEWPs)
  - Site Setup
  - Optional Items

**Rate-Only Items:**
- Exclude from total comparison: YES
- Store rates for variation pricing: YES
- Flag as separate in report: YES

### 7.2 Normalization Policies

**Unit Normalization:**
- "Nr" → "ea" (each)
- "No." → "ea" (each)
- "m2" → "sqm" (square meters)
- "LM" → "lm" (linear meters)

**System Normalization:**
- Standardize product names across suppliers
- Map proprietary names to generic systems
- Example: "Ryanfire SL Collar" → "SL Collar"
- Example: "Ryanfire HP-X / Mastic cone" → "HP-X / Mastic"

### 7.3 Stage Comparison Policies

**Stage-by-Stage Comparison:**
- Allow stage comparison: YES
- Require comparable splits across suppliers: YES
- Fallback to grand total if stages not comparable: YES

**Stage Matching:**
- Must have same stage names/definitions
- All suppliers must quote same stages
- If not comparable, use total contract value only

### 7.4 Options Comparison Policies

**Optional Items:**
- Include only if all suppliers list same item: YES
- Otherwise list as options separately: YES
- Base award recommendation on core scope only: YES

---

## 8. AWARD REPORT CONTENTS

### 8.1 Executive Summary

**Contents:**
- Number of suppliers evaluated
- Number of systems/items in baseline scope
- Recommended supplier with overall weighted score
- Executive recommendation statement

**Example:**
> "This report evaluates 5 competitive quotes for 46 passive fire protection systems. Following a comprehensive analysis of pricing, technical compliance, scope coverage, and risk factors, Supplier A has been identified as the recommended supplier with the highest weighted score of 8.7/10."

### 8.2 Supplier Comparison Table

**Columns:**
- Rank (1-5, based on weighted score)
- Supplier Name
- Adjusted Total Price
- Risk Score (0-10)
- Scope Coverage (%)
- Items Quoted (count)
- Weighted Score (0-10)

**Formatting:**
- Rank 1 highlighted with orange badge
- Prices in bold green
- Alternating row shading
- Professional table styling

### 8.3 Award Rationale

**Contents:**
- Why recommended supplier was selected
- Key strengths of recommended supplier
- Scope coverage statistics
- Price competitiveness analysis
- Risk assessment summary

**Example:**
> "Supplier A demonstrates the optimal balance of value, compliance, and delivery capability. Their submission achieves 98% scope coverage (45/46 items) and maintains a competitive price position within 2.5% of the lowest bid, while presenting minimal technical and commercial risk."

### 8.4 Conditions of Award

**Standard Conditions:**
1. All work completed per approved specifications and drawings
2. Updated project schedule within 5 business days of award
3. Materials comply with fire ratings and relevant standards
4. Monthly progress claims with supporting documentation

**Conditional Requirements:**
- Address identified clarifications prior to contract execution
- Provide pricing for scope gaps before commencement
- Confirm validity extension if quote expired
- Provide breakdown if lump sum quote
- Submit method statements for specialized systems

### 8.5 Risk Register

**For Each Supplier:**
- **Risks:** Critical items requiring attention
- **Clarifications:** Items needing confirmation
- **Exclusions:** Items explicitly excluded from quote
- **Assumptions:** Basis of pricing assumptions

**Color Coding:**
- Red: High-impact risks requiring immediate attention
- Amber: Medium-impact clarifications needed
- Green: Low-impact items for noting only

---

## 9. REPORTING METRICS

### 9.1 Key Performance Indicators

**Price Metrics:**
- Lowest quoted price
- Highest quoted price
- Price range ($)
- Price range (%)
- Average quoted price
- Median quoted price
- Recommended supplier price vs. lowest
- Recommended supplier price vs. average

**Coverage Metrics:**
- Total items in baseline scope
- Average items quoted per supplier
- Best scope coverage (%)
- Worst scope coverage (%)
- Average scope coverage (%)
- Items quoted by all suppliers
- Items quoted by only one supplier

**Risk Metrics:**
- Total risk flags across all suppliers
- Average risk score
- Number of suppliers with expired validity
- Number of lump sum quotes
- Number of quotes with missing MEWPs
- Number of quotes requiring clarifications

**Quality Metrics:**
- Average weighted score
- Score range (highest - lowest)
- Number of suppliers above 8.0/10
- Number of suppliers below 6.0/10

### 9.2 Variance Analysis

**Price Variance:**
- Variance from lowest price
- Variance from average price
- Variance by trade package
- Variance by system type

**Coverage Variance:**
- Common items across all suppliers
- Unique items by supplier
- Most commonly missing items
- Critical missing items

---

## 10. DECISION SUPPORT

### 10.1 Recommendation Confidence Levels

**High Confidence (85-100%):**
- Clear winner with significant score advantage (>1.0 points)
- Low risk profile
- Strong compliance
- Competitive pricing

**Medium Confidence (70-84%):**
- Close scores between top 2-3 suppliers (<1.0 point difference)
- Some minor risks or clarifications needed
- Good overall performance

**Low Confidence (0-69%):**
- Very close scores across multiple suppliers
- Multiple significant risks identified
- Major clarifications required before award
- Consider re-tendering or value engineering

### 10.2 Award Recommendations

The system provides three recommendations to support decision-making:

1. **Best Value** - Optimizes for lowest price
2. **Lowest Risk** - Optimizes for delivery confidence
3. **Balanced** - Optimizes for overall weighted score (RECOMMENDED)

**Selection Guidance:**
- **Choose Best Value when:** Budget is primary constraint, project is low-complexity, risk can be managed
- **Choose Lowest Risk when:** Project is complex, schedule is critical, quality is paramount
- **Choose Balanced when:** Need optimal value across all dimensions (most common choice)

### 10.3 Post-Award Activities

**If Recommending Award:**
1. Issue Letter of Intent to successful supplier
2. Issue RFI for any outstanding clarifications
3. Obtain pricing for scope gaps (provisional sums)
4. Negotiate contract terms and conditions
5. Issue Unsuccessful Letters to other suppliers
6. Execute formal contract

**If Recommending Clarification:**
1. Issue RFI to shortlisted suppliers
2. Obtain written responses
3. Re-evaluate scores if material changes
4. Update award recommendation
5. Proceed to award or request revised quotes

**If Recommending Re-Tender:**
1. Document reasons for re-tender
2. Refine scope and specifications
3. Address issues from first tender
4. Issue revised tender documentation
5. Conduct new tender process

---

## 11. DATA SOURCES

### 11.1 Input Data

**Project Data:**
- Project name and description
- Client name and contact
- Project location
- Contract type and value range
- Tender closing date

**Quote Data:**
- Supplier name and contact
- Quote reference number
- Quote date and validity
- Line item descriptions
- Units of measurement
- Quantities
- Unit prices
- Total prices
- Terms and conditions
- Exclusions and assumptions

**Baseline Data:**
- Scope of work definition
- Specification requirements
- Drawing references
- Mandatory requirements
- Evaluation criteria

### 11.2 Data Quality Requirements

**Minimum Required Fields:**
- Description (mandatory)
- Unit (mandatory)
- Quantity (mandatory)
- Unit Price (mandatory for pricing comparison)
- Total Price (mandatory for pricing comparison)

**Optional Fields:**
- Item code/reference
- Scope category/trade
- System type/solution
- Size/dimension
- Location/zone

**Data Validation:**
- Mathematical consistency (qty × unit price = total price)
- Reasonable values (no negative prices, quantities)
- Complete records (no missing mandatory fields)
- Consistent units (within quote and across quotes)

---

## 12. QUALITY ASSURANCE

### 12.1 Review Checkpoints

**Pre-Award Review:**
1. All quotes parsed and imported correctly
2. All line items matched or flagged appropriately
3. Price variance analysis completed
4. Risk assessment completed
5. Weighted scores calculated correctly
6. Recommendations generated and reviewed
7. Report content accurate and complete

**Technical Review:**
1. Scope coverage verified
2. Compliance with specifications confirmed
3. Risk factors appropriately identified
4. Clarifications documented
5. Exclusions noted

**Commercial Review:**
1. Pricing complete and accurate
2. Like-for-like comparison achieved
3. Provisional sums identified
4. Contract terms acceptable
5. Value for money demonstrated

### 12.2 Approval Workflow

**Typical Approval Hierarchy:**
1. **Prepared by:** Estimating/Procurement Team
2. **Reviewed by:** Project Manager
3. **Approved by:** Commercial Manager
4. **Final Approval:** Project Director or Client Representative

**Approval Criteria:**
- Technical compliance verified
- Commercial viability confirmed
- Risk mitigation strategies in place
- Recommendation justified and documented
- Budget authority obtained

---

## SUMMARY

The VerifyTrade Award Recommendation system employs a rigorous, transparent, and defensible evaluation methodology that:

✅ **Objectively scores** suppliers across four key criteria (Price, Compliance, Coverage, Risk)
✅ **Weights criteria** based on relative importance (40% Price, 25% Compliance, 20% Coverage, 15% Risk)
✅ **Calculates overall weighted scores** to identify optimal supplier
✅ **Provides three distinct recommendations** for different optimization scenarios
✅ **Identifies and flags risks** requiring mitigation before award
✅ **Generates professional reports** suitable for executive decision-making
✅ **Supports audit trail** with complete documentation of evaluation process

This comprehensive framework ensures award recommendations are:
- **Transparent:** Clear methodology and criteria
- **Objective:** Quantitative scoring reduces bias
- **Defensible:** Well-documented rationale
- **Comprehensive:** All relevant factors considered
- **Professional:** Suitable for client presentation

---

**Document Version:** 1.0
**Last Updated:** December 2025
**System:** VerifyTrade Award Recommendation Engine
**Framework:** Multi-Criteria Decision Analysis (MCDA)
