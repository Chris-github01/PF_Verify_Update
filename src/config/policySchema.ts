import { z } from "zod";

/** --- Shared enums & helpers --- */
export const BucketEnum = z.enum([
  "P&G",
  "PS3_QA",
  "Contingency",
  "EWPs",
  "SiteSetup",
  "Options",
]);

export const RateOnlyHandlingEnum = z.enum([
  "excludeFromTotals_storeForVariations",
  "includeInTotals",
]);

export const OptionsComparisonPolicyEnum = z.enum([
  "onlyIfOtherSuppliersListSame",
  "alwaysInclude",
  "neverInclude",
]);

/** --- comparisonPolicy schema --- */
export const ComparisonPolicyCoreSchema = z.object({
  acceptLumpSum: z.boolean(),
  lumpSumRiskIfNoBreakdown: z.boolean(),
  rebuildSubtotalsFromLineItems: z.boolean(),
  validateTotals: z.boolean(),

  separateBuckets: z.array(BucketEnum).nonempty(),

  excludeRateOnlyFromTotals: z.boolean(),
  storeRateOnlyForVariations: z.boolean(),

  unitNormalization: z.record(z.string(), z.string()).default({}),
  systemNormalization: z.record(z.string(), z.string()).default({}),

  validity: z.object({
    flagExpired: z.boolean(),
    autoEscalate: z.boolean(),
  }),

  access: z.object({
    flagMissingMEWPs: z.boolean(),
    treatEWPsAsAccessNotPenetrations: z.boolean(),
  }),

  seismic: z.object({
    flagMissingSeismic: z.boolean(),
    applyNormalizedUplift: z.boolean(),
  }),

  stageComparison: z.object({
    allowStageCompare: z.boolean(),
    requireComparableSplitsAcrossSuppliers: z.boolean(),
    fallbackToGrandTotalWhenNotComparable: z.boolean(),
  }),

  optionsComparison: z.object({
    includeOnlyIfAllSuppliersListSameItem: z.boolean(),
    otherwiseListAsOptions: z.boolean(),
  }),

  awardReportFlags: z.object({
    showExclusions: z.boolean(),
    showClarifications: z.boolean(),
    showEstimateRisks: z.boolean(),
    showAccessRisks: z.boolean(),
    showValidityExpired: z.boolean(),
  }),
});

/** --- suppliers schema ---
 * Each supplier can have different optional capabilities.
 */
export const SupplierConfigSchema = z.object({
  // Headline numeric totals
  comparisonTotal: z.number().optional(),
  headlineTotal: z.number().optional(),
  currency: z.string().optional(),

  // Risk flags (free-text keys your UI maps to chips)
  risks: z.array(z.string()).optional(),

  // Bucketing / treatment toggles
  treatEWPsAsAccess: z.boolean().optional(),
  groupStructuralVsServices: z.boolean().optional(),

  // Stage totals and grand totals (when a supplier provides splits)
  stageTotals: z.record(z.number()).optional(), // e.g. Basement, BuildingA, etc.
  grandTotal: z.number().optional(),
  requireComparableSplits: z.boolean().optional(),
  rebuildBasementFromLines: z.boolean().optional(),

  // Rate-only handling
  rateOnlyHandling: RateOnlyHandlingEnum.optional(),

  // Clarifications display
  showClarificationsAsRisk: z.boolean().optional(),

  // Anzor-style split requirements
  penetrationSubtotalRequired: z.boolean().optional(),
  showPG_PS3_QA_Split: z.boolean().optional(),
  exclusions: z.array(z.string()).optional(),
  optionsComparisonPolicy: OptionsComparisonPolicyEnum.optional(),

  // Marewa-style add-ons
  penetrationSubtotal: z.number().optional(),
  addOns: z
    .object({
      PG_Margin: z.number().optional(),
      PS3_QA: z.number().optional(),
    })
    .optional(),

  // Normalisation
  groupByCategoryIfCommon: z.boolean().optional(),
  enforceNormalization: z.boolean().optional(),
});

/** --- root config schema --- */
export const ComparisonPolicySchema = z.object({
  comparisonPolicy: ComparisonPolicyCoreSchema,
  suppliers: z.record(SupplierConfigSchema),
});

export type ComparisonPolicy = z.infer<typeof ComparisonPolicySchema>;
export type ComparisonPolicyCore = z.infer<typeof ComparisonPolicyCoreSchema>;
export type SupplierConfig = z.infer<typeof SupplierConfigSchema>;

/** --- helper: safe parse with readable errors --- */
export function validateConfig(input: unknown): ComparisonPolicy {
  const result = ComparisonPolicySchema.safeParse(input);
  if (!result.success) {
    // Throw a concise, readable error for Bolt console
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n - ");
    throw new Error(`Invalid comparison config:\n - ${issues}`);
  }
  return result.data;
}
