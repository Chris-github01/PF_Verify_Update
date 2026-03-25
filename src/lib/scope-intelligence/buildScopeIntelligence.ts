import type { ScopeIntelligenceLine, ScopeIntelligenceResult } from "./types";
import { normalizeScopeLines } from "./normalizeScope";
import { classifyLine } from "./classifyLine";

function buildSummary(lines: ScopeIntelligenceLine[]) {
  return {
    mainScopeCount:     lines.filter(l => l.classification === "main_scope").length,
    exclusionCount:     lines.filter(l => l.classification === "exclusion").length,
    qualificationCount: lines.filter(l => l.classification === "qualification").length,
    optionalCount:      lines.filter(l => l.classification === "optional_item").length,
    totalLineCount:     lines.filter(l => l.classification === "total_line").length,
    narrativeCount:     lines.filter(l => l.classification === "narrative").length,
    unknownCount:       lines.filter(l => l.classification === "unknown").length,
  };
}

export function buildScopeIntelligence(parsedLines: unknown[]): ScopeIntelligenceResult {
  const normalized = normalizeScopeLines(parsedLines);

  const lines: ScopeIntelligenceLine[] = normalized.map((norm, i) =>
    classifyLine(norm, i)
  );

  const countedLines  = lines.filter(l => l.shouldCountInScopeTotal);
  const excludedLines = lines.filter(l => !l.shouldCountInScopeTotal);
  const detectedTotals = lines.filter(l => l.classification === "total_line");

  const calculatedScopeTotal = countedLines.reduce(
    (sum, l) => sum + (l.value ?? 0),
    0
  );

  const detectedDocumentTotal: number | null =
    detectedTotals.length > 0 && detectedTotals[0].value !== null
      ? detectedTotals[0].value
      : null;

  const discrepancy: number | null =
    detectedDocumentTotal !== null
      ? parseFloat((detectedDocumentTotal - calculatedScopeTotal).toFixed(2))
      : null;

  return {
    lines,
    countedLines,
    excludedLines,
    detectedTotals,
    calculatedScopeTotal: parseFloat(calculatedScopeTotal.toFixed(2)),
    detectedDocumentTotal,
    discrepancy,
    summary: buildSummary(lines),
  };
}
