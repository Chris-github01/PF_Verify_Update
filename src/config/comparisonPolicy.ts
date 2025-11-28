export const config = {
  comparisonPolicy: {
    acceptLumpSum: true,
    lumpSumRiskIfNoBreakdown: true,
    rebuildSubtotalsFromLineItems: true,
    validateTotals: true,
    separateBuckets: ["P&G", "PS3_QA", "Contingency", "EWPs", "SiteSetup", "Options"],
    excludeRateOnlyFromTotals: true,
    storeRateOnlyForVariations: true,
    unitNormalization: { "Nr": "ea", "No.": "ea" },
    systemNormalization: {
      "Ryanfire SL Collar": "SL Collar",
      "Ryanfire HP-X / Mastic cone": "HP-X / Mastic"
    },
    validity: { flagExpired: true, autoEscalate: false },
    access: { flagMissingMEWPs: true, treatEWPsAsAccessNotPenetrations: true },
    seismic: { flagMissingSeismic: true, applyNormalizedUplift: false },
    stageComparison: {
      allowStageCompare: true,
      requireComparableSplitsAcrossSuppliers: true,
      fallbackToGrandTotalWhenNotComparable: true
    },
    optionsComparison: {
      includeOnlyIfAllSuppliersListSameItem: true,
      otherwiseListAsOptions: true
    },
    awardReportFlags: {
      showExclusions: true,
      showClarifications: true,
      showEstimateRisks: true,
      showAccessRisks: true,
      showValidityExpired: true
    }
  },
  suppliers: {
    CakeCommercial: {
      comparisonTotal: 212540.84,
      currency: "NZD",
      risks: [
        "LumpSumOnly_NoBreakdown",
        "ValidityExpired",
        "MEWPsExcluded",
        "VariationsNotInFixedScope"
      ]
    },
    PFNZ_HV2: {
      comparisonTotal: 767068.13,
      currency: "NZD",
      risks: ["EstimateNotFixed", "SeismicNotIncluded"],
      treatEWPsAsAccess: true,
      groupStructuralVsServices: true
    },
    PFNZ_SylviaParkBTR: {
      stageTotals: {
        Basement: 24774,
        BuildingA: 283658,
        BuildingB: 175505,
        BuildingC: 264967,
        SiteSetup: 4400
      },
      grandTotal: 753304,
      requireComparableSplits: true,
      rebuildBasementFromLines: true,
      risks: ["Misc_NotShownOnDrawings_Estimate"],
      rateOnlyHandling: "excludeFromTotals_storeForVariations",
      showClarificationsAsRisk: true
    },
    OptimalFire_Anzor: {
      headlineTotal: 7603.5,
      penetrationSubtotalRequired: true,
      showPG_PS3_QA_Split: true,
      exclusions: ["ElectricalPenetrationsMissingDrawings"],
      optionsComparisonPolicy: "onlyIfOtherSuppliersListSame"
    },
    OptimalFire_Marewa: {
      headlineTotal: 56010.8,
      penetrationSubtotal: 53951.3,
      addOns: { PG_Margin: 809.5, PS3_QA: 1250.0 },
      groupByCategoryIfCommon: true,
      enforceNormalization: true
    }
  }
} as const;
