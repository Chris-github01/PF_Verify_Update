# FRR Compliance Logic Fixes

## Summary
Fixed critical bugs in the FRR (Fire Resistance Rating) compliance matching system to ensure correct "meets or exceeds" logic and proper cost-optimization ranking.

## Critical Fixes Applied

### A) Fixed Backwards FRR Call (CRITICAL BUG)
**Before:**
```typescript
frrBreakdown = compareFRR(template.frr_string, item.frr);
```

**After:**
```typescript
frrBreakdown = compareFRR(item.frr, template.frr_string);
```

- `item.frr` = REQUIRED (specification requirement)
- `template.frr_string` = PROVIDED (system capability)

### B) Fixed sm Handling
**Before:** Special case forced sm to match sm exactly (incorrect)

**After:** Proper ordering: `- < sm < 30 < 60 < 90 < 120 < 240`

**Test Results:**
- ✅ Required `sm`, provided `30` → PASS (30 > sm)
- ✅ Required `30`, provided `sm` → FAIL (sm < 30)
- ✅ Required `-/30/30`, provided `-/120/90` → PASS (overspec allowed)
- ✅ Required `-/60/60`, provided `-/120/30` → FAIL (insulation underspec)

### C) Added Null/Invalid FRR Guards
- `parseFRR()` can return null
- `compareFRR()` now handles null gracefully without crashing
- Always returns consistent `maxScore: 25`

### D) Fixed Confidence Calculation
**Before:**
```typescript
const confidence = Math.min(maxScore / 90, 1.0);  // Wrong!
```

**After:**
```typescript
const MAX_SCORE = 95;  // Service(30) + Size(25) + FRR(25) + Subclass(15)
const confidence = Math.min(maxScore / MAX_SCORE, 1.0);
```

**Impact:**
- Scores 90-95 no longer incorrectly show as 100%
- Score 95 → 100.0% confidence
- Score 90 → 94.7% confidence
- Score 85 → 89.5% confidence

### E) Cost Bonus Behavior (Confirmed Correct)
The cost bonus (0-5 points) correctly prefers closer FRR matches without forcing "minimum only":

**For requirement `-/30/30`:**
- `-/30/30` (exact match) = **5 points** bonus
- `-/90/30` (FRL 90) = **1 point** bonus
- `-/120/30` (FRL 120) = **0 points** bonus

**Result:** FRL 90 scores higher than FRL 120 when all else equal ✅

**But:** Higher FRR systems can still win if they match better on service/type/size (bonus is small relative to other factors).

## Compliance Principles Enforced

1. **Meets or Exceeds:** Component-by-component comparison (structural/integrity/insulation)
2. **Overspec Allowed:** Higher FRR systems remain valid and selectable
3. **Cost Optimization:** Closer matches preferred, but not forced
4. **Ordering:** `- (none) < sm < 30 < 60 < 90 < 120 < 240`
5. **No Hard Filters:** Cost bonus guides ranking but doesn't block options

## Test Validation

Added comprehensive test suite in `systemMatcher.ts`:
- `runFRRComplianceTests()` - Automated test runner
- `validateFRRCompliance()` - Console-friendly validation

**Run tests:**
```typescript
import { validateFRRCompliance } from './src/lib/mapping/systemMatcher';
validateFRRCompliance();
```

## Files Modified
- `src/lib/mapping/systemMatcher.ts` - Core logic fixes + test suite

## Validation
All tests pass. Run `node validate-frr-fixes.js` to verify.
