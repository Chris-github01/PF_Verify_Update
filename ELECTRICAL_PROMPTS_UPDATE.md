# Electrical Trade Support - OpenAI Prompt Updates

## Summary

All 5 OpenAI system prompts have been updated to support **Electrical trade** while preserving **100% of Passive Fire functionality**. The updates are purely additive.

---

## 1. System Mapping Prompt ✅ UPDATED

**File:** `src/lib/mapping/llmMapper.ts`

### Changes Made

#### Added `trade` parameter to function signature
```typescript
export async function mapItemToSystemWithLLM(
  description: string,
  quantity?: number,
  unit?: string,
  existingSystemId?: string,
  trade?: string  // NEW PARAMETER
): Promise<MappingResult>
```

#### Extended MappingResult interface
```typescript
interface MappingResult {
  systemId: string;
  confidence: number;
  reasoning: string;
  matchedFactors: string[];
  missedFactors: string[];
  trade?: string;  // NEW
  electrical?: {   // NEW
    electricalScopeCategory?: string | null;
    voltage?: string | null;
    protection?: string | null;
    cableSignal?: string | null;
    containmentSignal?: string | null;
    commissioningSignal?: string | null;
    leadTimeSignal?: string | null;
    exclusionSignal?: string | null;
  };
}
```

#### Updated System Message
**Before:**
```
You are a passive fire protection systems expert. Respond only with valid JSON.
```

**After:**
```
You are a construction trade scope-mapping expert with deep specialization in:
1) Passive Fire Protection systems (fire stopping, FRR/FRL compliance, certified systems)
2) Electrical trade scope (commercial/industrial electrical works, switchboards, cabling,
   lighting, ELV/security/data, cable containment, lightning protection, testing & commissioning)

Respond ONLY with valid JSON.
```

#### Updated User Prompt
- Added `TRADE: ${tradeType}` context line
- Added 13 electrical scope categories for interim ontology:
  - switchboards_panels
  - cable_power_installed_terminated
  - cable_support_containment
  - lighting_power_devices
  - luminaires_appliances
  - access_equipment
  - lightning_protection
  - security_data_elv
  - seismic_bracing
  - prelims_ohp
  - design_documentation_bim
  - correction_variation_credit
  - excluded_out_of_scope

- Added electrical-specific analysis instructions:
  - Voltage extraction (230V/415V/LV/ELV)
  - Protection device signals (MCB/MCCB/RCD/RCBO)
  - Cable spec signals (mm², cores, copper vs aluminium)
  - Containment type (tray/basket/ladder/conduit)
  - Commissioning/testing signals
  - Lead time detection
  - Exclusion pattern detection

**Passive Fire behavior:** Unchanged - still uses PASSIVE_FIRE_ONTOLOGY when `trade === 'passive_fire'`

---

## 2. Copilot Assistant Prompt ✅ UPDATED

**File:** `src/lib/copilot/copilotAI.ts`

### Changes Made

Added new **Mode E) Electrical trade mode** section to Core Copilot Skills:

```text
**E) Electrical trade mode (when project.trade == "electrical"):**
- Treat "systems" as electrical work packages (MSB/DB, cable/containment, lighting,
  ELV/security/data, LPS, seismic bracing, testing & commissioning).
- Prioritise award defensibility: scope completeness, interface responsibility,
  commissioning/testing deliverables, lead times, exclusions, authority/Chorus dependencies.
- Always call out: (1) what is included, (2) what is excluded/by others, (3) what is assumed,
  (4) what is provisional/corrective, (5) lead times impacting programme.
- Never confuse passive fire "Electrical service penetrations" with electrical trade installations.
```

**Passive Fire behavior:** All existing A/B/C/D modes unchanged

---

## 3. Risk Analysis Prompt ✅ UPDATED

**File:** `src/lib/riskDetection/narrativeAnalyzer.ts`

### Changes Made

#### Updated System Message
**Before:**
```
You are an expert construction quantity surveyor specializing in risk analysis.
Respond only with valid JSON.
```

**After:**
```
You are an expert construction quantity surveyor specializing in risk analysis across
multiple trades, including passive fire and electrical. Respond only with valid JSON.
```

#### Extended Risk Detection List
Added 8 electrical-specific risk patterns:

```text
Additional ELECTRICAL-specific risks to detect (when quote relates to electrical works):
- Long-lead items (switchboards, luminaires, cables) and any stated lead times
- Authority / utility dependencies (power authority charges, incoming fibre by Chorus, metering)
- Commissioning / testing / certification gaps (test sheets, COC/ESC, discrimination studies,
  DB schedules/load updates)
- Interface ambiguity (BMS, fire alarm power, UPS/generator, security/data boundaries)
- Builder's works exclusions (concrete cutting/chasing/penetrations),
  trenching/reinstatement exclusions
- Material substitutions and design-driven changes (e.g., copper → aluminium mains cable change;
  design/build drawing basis)
- Scope exclusions that commonly cause variations (EV chargers, intruder alarm, PV/solar strings,
  appliances, storage unit control wiring)
- Seismic bracing scope ambiguity (allowance counts, engineering included/excluded)
```

**Passive Fire behavior:** All existing risk patterns preserved

---

## 4. Line Item Matching Prompt ✅ UPDATED

**File:** `src/lib/matching/aiGrader.ts`

### Changes Made

#### Updated System Prompt
**Before:**
```
You are a strict line-item comparator for passive fire protection quotes.
```

**After:**
```
You are a strict line-item comparator for construction quotes.

If TRADE == "passive_fire":
- Use passive fire matching rules exactly as provided.

If TRADE == "electrical":
- Match items by same electrical work package + same technical intent (rating/spec/class),
  not by FRR/substrate.
- Output only JSON matching the provided schema.
- If data is insufficient, choose "review" with confidence 70-89 and explain briefly in reasons.
```

#### Extended Grading Rules
Added **ELECTRICAL "same scope" definition**:

```text
ELECTRICAL "same scope" definition (only when TRADE == "electrical"):
"Same scope" means same package + same key spec signals:
- Switchboards/panels: same board type (MSB/DB/MCC), similar capacity/rating class when stated,
  and same included studies (e.g., discrimination studies).
- Cables: same function (mains/submains/finals/ELV), same or equivalent conductor size/class
  if stated, same install/terminate intent.
- Containment: same type (tray/basket/ladder/conduit), same finish/class if stated,
  and similar support/bracing inclusion.
- Lighting: same count/type intent; emergency/exit/façade lighting must match as a distinct subset.
- ELV/security/data: same subsystem (CCTV vs access control vs data outlets), not interchangeable.
- Seismic bracing: compare allowance count and whether engineering is included.

ELECTRICAL Tolerances:
- Ratings/spec: exact match = accept; close/unknown = review; materially different class = reject.
- Brand differences alone are not a reject if performance class is equivalent.
- If one quote splits a package into multiple lines and the other combines it,
  choose "review" and explain.
```

**Passive Fire behavior:** All existing ±2mm tolerance, substrate matching, extras rules preserved

---

## 5. Quote Line Item Extraction Prompt ✅ UPDATED & DEPLOYED

**File:** `supabase/functions/parse_quote_llm_fallback/index.ts`
**Status:** ✅ Deployed to Supabase Edge Functions

### Changes Made

Added **electrical-specific extraction guidance** under the IMPORTANT section:

```text
Additional guidance for ELECTRICAL quotes:
- Electrical proposals often contain section-level subtotals (e.g., "Electrical TOTAL",
  "Security & Data TOTAL", "Cable Tray TOTAL") — do NOT extract those as line items.
- Extract the underlying package lines inside each section (e.g., "Switchboard Panels",
  "Cable-Power (Installed Terminated)", "Lightning Protection Level 4", "Access Control",
  "CCTV", "Preliminary and General Overheads", "Seismic Bracing Materials & Installation",
  "Seismic Engineering").
- If a quote includes corrections/credits (e.g., "Cable supply price error",
  "Removal of exit lighting ... -$X"), extract them as line items with negative totals when shown.
- Preserve the section name if visible (Electrical, Security & Data, Cable Tray, Corrections, etc.).
```

**Passive Fire behavior:** Core extraction rules unchanged

---

## Key Electrical Categories (Interim Ontology)

Until `electricalOntology.ts` is built, the system uses these 13 categories based on the DGE proposal structure:

| Category | Examples from DGE Quote |
|----------|-------------------------|
| `switchboards_panels` | MSB, DBs, UPS, MCC, discrimination studies |
| `cable_power_installed_terminated` | Mains/submains/finals, copper→aluminium changes |
| `cable_support_containment` | Cable tray, basket, ladder, conduit, bonding |
| `lighting_power_devices` | Switches, GPOs, power outlets, small power |
| `luminaires_appliances` | Light fittings, emergency, façade lighting |
| `access_equipment` | EWP, scissor lifts, undercroft/facade access |
| `lightning_protection` | LPS Level 4, bonding, down conductors |
| `security_data_elv` | CCTV, access control, intercoms, data outlets |
| `seismic_bracing` | Seismic bracing count + engineering |
| `prelims_ohp` | P&G, overheads, preliminaries |
| `design_documentation_bim` | Design fees, BIM/shop drawings, DB schedules |
| `correction_variation_credit` | Price corrections, credits, deltas |
| `excluded_out_of_scope` | Explicitly excluded items |

---

## Usage Instructions

### For System Mapping
```typescript
// Passive Fire (existing)
const mapping = await mapItemToSystemWithLLM(
  "Fire collar 100mm",
  1,
  "EA",
  undefined,
  "passive_fire"  // default if omitted
);

// Electrical (new)
const mapping = await mapItemToSystemWithLLM(
  "MSB with discrimination study",
  1,
  "EA",
  undefined,
  "electrical"
);
```

### Response Structure (Electrical)
```json
{
  "systemId": "switchboards_panels",
  "confidence": 0.92,
  "reasoning": "MSB with engineering study included",
  "matchedFactors": ["switchboard", "discrimination study", "panel board"],
  "missedFactors": [],
  "trade": "electrical",
  "electrical": {
    "electricalScopeCategory": "switchboards_panels",
    "voltage": "415V LV",
    "protection": "MCCB discrimination study",
    "commissioningSignal": "test certificates included",
    "leadTimeSignal": "16 week lead time",
    "exclusionSignal": null
  }
}
```

---

## Testing Checklist

- [ ] Import DGE electrical quote PDF
- [ ] Verify section subtotals are NOT extracted as line items
- [ ] Verify switchboard + discrimination study mapped to `switchboards_panels`
- [ ] Verify lightning protection mapped to `lightning_protection`
- [ ] Verify cable tray + seismic bracing mapped correctly
- [ ] Verify corrections/credits extracted with negative totals
- [ ] Verify exclusions detected (Chorus fibre, authority charges, EV chargers, etc.)
- [ ] Verify lead times flagged in risk analysis
- [ ] Verify Copilot answers electrical questions using work package language
- [ ] Verify line item matching uses electrical tolerances (not FRR/substrate)

---

## Next Steps

1. **Store electrical signals:** Store `electrical.*` fields in `quote_items.issue_flags` (jsonb) - no DB migration needed
2. **Pass trade context:** Add `trade` parameter when calling `mapItemToSystemWithLLM()` from import flows
3. **Build electricalOntology.ts:** Create structured ontology similar to `passiveFireOntology.ts`
4. **Update UI:** Show electrical categories/signals in Review & Clean and Scope Matrix
5. **Test with real quotes:** Import DGE quote and validate all extractions/mappings

---

## Files Modified

1. ✅ `src/lib/mapping/llmMapper.ts` - System mapping with trade awareness
2. ✅ `src/lib/copilot/copilotAI.ts` - Added electrical trade mode
3. ✅ `src/lib/riskDetection/narrativeAnalyzer.ts` - Added electrical risk patterns
4. ✅ `src/lib/matching/aiGrader.ts` - Added electrical matching rules
5. ✅ `supabase/functions/parse_quote_llm_fallback/index.ts` - Added electrical extraction guidance (DEPLOYED)

**Zero files deleted. Zero passive fire functionality removed. Pure addition.**
