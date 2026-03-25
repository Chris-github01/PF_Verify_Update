export const PLUMBING_RULE_CONFIG = {
  summaryPhrases: [
    'total',
    'totals',
    'sub total',
    'subtotal',
    'sub-total',
    'grand total',
    'estimated grand total',
    'total excl gst',
    'total excl. gst',
    'total excl',
    'total incl gst',
    'total incl. gst',
    'total including gst',
    'total plus gst',
    'total inc gst',
    'total inc. gst',
    'net total',
    'project total',
    'quote total',
    'tender total',
    'tender sum',
    'contract sum',
    'contract total',
    'contract value',
    'contract price',
    'price total',
    'total price',
    'total cost',
    'total amount',
    'overall total',
    'lump sum total',
    'total carried forward',
    'carried forward',
    'carried fwd',
    'c/f',
    'b/f',
    'brought forward',
    'gst',
    'p&g',
    'margin',
    'sum',
    'final total',
    'final amount',
    'amount due',
    'invoice total',
    'balance due',
    'section total',
    'page total',
    'floor total',
    'level total',
  ],

  nearMatchTolerancePercent: 0.02,

  nearMatchToleranceAbsolute: 50,

  lastRowsWindowSize: 5,

  lastRowsWindowPercent: 0.15,

  highAmountMultiplierThreshold: 5,

  amountOnlyWeighting: 0.35,

  missingQtyWeighting: 0.25,

  missingUnitWeighting: 0.15,

  lastRowPositionWeighting: 0.20,

  phraseMatchWeighting: 0.85,

  valueMatchesDocumentTotalWeighting: 0.90,

  valueSumsPriorRowsWeighting: 0.75,

  classifyConfidenceThresholdHigh: 0.70,

  classifyConfidenceThresholdMedium: 0.40,
} as const;
