import { buildScopeIntelligence } from "../buildScopeIntelligence";
import { classifyLine } from "../classifyLine";
import { normalizeScopeLine } from "../normalizeScope";
import { extractRiskSignals } from "../riskSignals";

const choicePlumbingLines = [
  { description: "Sanitary Sewer Above ground",            total: 484522 },
  { description: "Hot & Cold-Water Main",                  total: 432165 },
  { description: "Hot & Cold Water Within Apartments",     total: 303690 },
  { description: "Stormwater Water Including PVC Downpipes", total: 96330 },
  { description: "Gas System",                             total: 27558 },
  { description: "Acoustic Lagging – In Habitable Spece Only", total: 36000 },
  { description: "Installation of Sanitary Fittings",      total: 188836 },
  { description: "Plant & Valve",                          total: 383171 },
  { description: "Rainwater Harvesting System",            total: 25800 },
  { description: "Total",                                  total: 1978072 },
];

describe("buildScopeIntelligence – Choice Plumbing (9 scope + 1 total)", () => {
  const result = buildScopeIntelligence(choicePlumbingLines);

  test("produces 10 classified lines", () => {
    expect(result.lines).toHaveLength(10);
  });

  test("detects exactly 1 total line", () => {
    expect(result.detectedTotals).toHaveLength(1);
    expect(result.detectedTotals[0].description).toMatch(/total/i);
  });

  test("counts 9 scope lines", () => {
    expect(result.countedLines).toHaveLength(9);
  });

  test("calculated scope total equals sum of 9 items", () => {
    const expected = 484522 + 432165 + 303690 + 96330 + 27558 + 36000 + 188836 + 383171 + 25800;
    expect(result.calculatedScopeTotal).toBeCloseTo(expected, 0);
  });

  test("detected document total equals the total line value", () => {
    expect(result.detectedDocumentTotal).toBe(1978072);
  });

  test("discrepancy is zero or null (no mismatch)", () => {
    expect(result.discrepancy).toBeCloseTo(0, 0);
  });

  test("summary counts are correct", () => {
    expect(result.summary.totalLineCount).toBe(1);
    expect(result.summary.mainScopeCount).toBeGreaterThanOrEqual(5);
  });

  test("total line shouldCountInScopeTotal is false", () => {
    const totalLine = result.lines.find(l => l.classification === "total_line");
    expect(totalLine?.shouldCountInScopeTotal).toBe(false);
  });
});

describe("buildScopeIntelligence – exclusion lines mixed with priced items", () => {
  const lines = [
    { description: "Fire stopping – all penetrations",       total: 95000 },
    { description: "Electrical conduit sealing",             total: 12000 },
    { description: "Fire doors – by others",                 total: 0     },
    { description: "Hydraulic connections – excluded",       total: 0     },
    { description: "Client supply of fixtures – excluded from price", total: 0 },
  ];

  const result = buildScopeIntelligence(lines);

  test("classifies by-others and excluded lines as exclusion", () => {
    const exclusions = result.lines.filter(l => l.classification === "exclusion");
    expect(exclusions.length).toBeGreaterThanOrEqual(2);
  });

  test("exclusion lines do not count in scope total", () => {
    const exclusions = result.lines.filter(l => l.classification === "exclusion");
    exclusions.forEach(l => expect(l.shouldCountInScopeTotal).toBe(false));
  });

  test("priced scope lines are counted", () => {
    expect(result.countedLines.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildScopeIntelligence – optional and provisional lines", () => {
  const lines = [
    { description: "Plumbing rough-in works",               total: 120000 },
    { description: "Optional – rainwater harvesting",        total: 25000  },
    { description: "Provisional sum – unforeseen works",     total: 15000  },
    { description: "Contingency allowance",                  total: 10000  },
    { description: "Alternative pipe route (Option B)",      total: 8000   },
  ];

  const result = buildScopeIntelligence(lines);

  test("optional and provisional lines are classified correctly", () => {
    const optionals = result.lines.filter(l => l.classification === "optional_item");
    expect(optionals.length).toBeGreaterThanOrEqual(3);
  });

  test("optional lines do not count in scope total", () => {
    const optionals = result.lines.filter(l => l.classification === "optional_item");
    optionals.forEach(l => expect(l.shouldCountInScopeTotal).toBe(false));
  });

  test("main scope line is counted", () => {
    const main = result.lines.find(l => l.description === "Plumbing rough-in works");
    expect(main?.shouldCountInScopeTotal).toBe(true);
  });
});

describe("buildScopeIntelligence – narrative and admin text", () => {
  const lines = [
    { description: "Dear Paul,",                            total: 0 },
    { description: "Thank you for the opportunity to submit a quotation", total: 0 },
    { description: "Documents Used:",                       total: 0 },
    { description: "Architectural Drawings: Herriot Melhuish O'Neill Ltd", total: 0 },
    { description: "Page 1 of 3",                           total: 0 },
    { description: "Sanitary sewer installation",           total: 180000 },
  ];

  const result = buildScopeIntelligence(lines);

  test("narrative lines are classified as narrative", () => {
    const narratives = result.lines.filter(l => l.classification === "narrative");
    expect(narratives.length).toBeGreaterThanOrEqual(3);
  });

  test("narrative lines do not count in scope total", () => {
    const narratives = result.lines.filter(l => l.classification === "narrative");
    narratives.forEach(l => expect(l.shouldCountInScopeTotal).toBe(false));
  });

  test("scope line is correctly counted", () => {
    const scopeLine = result.lines.find(l => l.description.includes("Sanitary sewer"));
    expect(scopeLine?.shouldCountInScopeTotal).toBe(true);
  });
});

describe("buildScopeIntelligence – discrepancy detection", () => {
  const lines = [
    { description: "Mechanical ventilation",                total: 200000 },
    { description: "Hydraulic services",                    total: 150000 },
    { description: "Total",                                 total: 400000 },
  ];

  const result = buildScopeIntelligence(lines);

  test("detects discrepancy when scope total does not match document total", () => {
    expect(result.discrepancy).not.toBeNull();
    expect(Math.abs(result.discrepancy!)).toBeGreaterThan(1);
  });

  test("calculated scope total is sum of main scope lines", () => {
    expect(result.calculatedScopeTotal).toBeCloseTo(350000, 0);
  });

  test("detected document total is the total line", () => {
    expect(result.detectedDocumentTotal).toBe(400000);
  });
});

describe("buildScopeIntelligence – lines with missing values", () => {
  const lines = [
    { description: "Hydraulic works",        total: null  },
    { description: "Gas installation",       total: undefined },
    { description: "",                        total: 50000 },
    { description: "Fire collar supply",     total: 12000 },
    { description: null,                      total: 5000  },
  ];

  const result = buildScopeIntelligence(lines);

  test("does not throw on bad input", () => {
    expect(() => buildScopeIntelligence(lines)).not.toThrow();
  });

  test("lines with missing descriptions still get classified", () => {
    expect(result.lines).toHaveLength(5);
  });

  test("lines with null totals have null value", () => {
    const nullValueLines = result.lines.filter(l => l.value === null);
    expect(nullValueLines.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildScopeIntelligence – passive fire style scope", () => {
  const lines = [
    { description: "50mm PVC pipe penetration – Concrete floor (60/60/60)",  qty: 12, rate: 185, total: 2220 },
    { description: "100mm conduit – GIB wall -/60/60",                      qty: 8,  rate: 220, total: 1760 },
    { description: "Fire collar 100mm copper – concrete floor (90)/90/-",    qty: 5,  rate: 310, total: 1550 },
    { description: "Intumescent wrap 150x150 duct – smoke wall",             qty: 3,  rate: 450, total: 1350 },
    { description: "Extra over for fire stopping required not shown on layout", qty: 1, rate: 500, total: 500 },
    { description: "Supply and install batt patch to penetrations",          qty: 20, rate: 75,  total: 1500 },
    { description: "Grand Total",                                            total: 8880 },
  ];

  const result = buildScopeIntelligence(lines);

  test("does not classify passive fire items as narrative or exclusion", () => {
    const pipeItem = result.lines.find(l => l.description.includes("PVC pipe penetration"));
    expect(pipeItem?.classification).toBe("main_scope");
  });

  test("detects grand total line", () => {
    const totalLine = result.lines.find(l => l.classification === "total_line");
    expect(totalLine).toBeDefined();
  });

  test("passive fire scope lines are counted", () => {
    expect(result.countedLines.length).toBeGreaterThanOrEqual(4);
  });
});

describe("extractRiskSignals", () => {
  test("detects by_others", () => {
    expect(extractRiskSignals("Fire doors – by others")).toContain("by_others");
  });

  test("detects tbc", () => {
    expect(extractRiskSignals("Roof drainage TBC")).toContain("tbc");
  });

  test("detects provisional", () => {
    expect(extractRiskSignals("Provisional sum for unforeseen works")).toContain("provisional");
  });

  test("detects client_supply", () => {
    expect(extractRiskSignals("Fixtures – client supply")).toContain("client_supply");
  });

  test("detects supply_by_others", () => {
    expect(extractRiskSignals("Materials supply by others")).toContain("supply_by_others");
  });

  test("detects install_by_others", () => {
    expect(extractRiskSignals("Installation by others")).toContain("install_by_others");
  });

  test("detects no_allowance", () => {
    expect(extractRiskSignals("No allowance for roof penetrations")).toContain("no_allowance");
  });

  test("detects excluded", () => {
    expect(extractRiskSignals("Fire doors excluded")).toContain("excluded");
  });

  test("returns empty array for clean description", () => {
    expect(extractRiskSignals("Install fire collars to all pipe penetrations")).toHaveLength(0);
  });
});

describe("normalizeScopeLine – edge cases", () => {
  test("calculates value from qty × rate when total is missing", () => {
    const norm = normalizeScopeLine({ description: "Item A", qty: 5, rate: 100 });
    expect(norm.value).toBeCloseTo(500, 0);
  });

  test("uses total field over qty×rate calculation", () => {
    const norm = normalizeScopeLine({ description: "Item B", qty: 5, rate: 100, total: 600 });
    expect(norm.value).toBe(600);
  });

  test("strips currency symbols from total", () => {
    const norm = normalizeScopeLine({ description: "Item C", total: "$1,234.56" });
    expect(norm.value).toBeCloseTo(1234.56, 2);
  });

  test("returns null value when no financial data present", () => {
    const norm = normalizeScopeLine({ description: "Just text, no amounts" });
    expect(norm.value).toBeNull();
  });
});

describe("classifyLine – direct unit tests", () => {
  function classify(description: string, total?: number) {
    const norm = normalizeScopeLine({ description, total });
    return classifyLine(norm, 0);
  }

  test("'Total:' classified as total_line", () => {
    expect(classify("Total:", 1978072).classification).toBe("total_line");
  });

  test("'Grand Total' classified as total_line", () => {
    expect(classify("Grand Total", 500000).classification).toBe("total_line");
  });

  test("'by others' classified as exclusion", () => {
    expect(classify("Supply by others", 0).classification).toBe("exclusion");
  });

  test("'not included' classified as exclusion", () => {
    expect(classify("Fire doors – not included", 0).classification).toBe("exclusion");
  });

  test("'subject to' classified as qualification", () => {
    expect(classify("Subject to design confirmation", 0).classification).toBe("qualification");
  });

  test("'Provisional sum' classified as optional_item", () => {
    expect(classify("Provisional sum – roof drainage", 15000).classification).toBe("optional_item");
  });

  test("'Optional' classified as optional_item", () => {
    expect(classify("Optional – solar hot water", 25000).classification).toBe("optional_item");
  });

  test("priced scope item classified as main_scope", () => {
    const result = classify("Sanitary Sewer Above ground", 484522);
    expect(result.classification).toBe("main_scope");
    expect(result.shouldCountInScopeTotal).toBe(true);
  });

  test("total line has shouldCountInScopeTotal = false", () => {
    expect(classify("Total", 1978072).shouldCountInScopeTotal).toBe(false);
  });

  test("reasons array is non-empty for matched lines", () => {
    expect(classify("Total:", 100000).reasons.length).toBeGreaterThan(0);
  });

  test("confidence is between 0 and 1", () => {
    const result = classify("Sanitary Sewer Above ground", 484522);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
