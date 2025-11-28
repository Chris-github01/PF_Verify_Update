type Line = {
  id?: string;
  section?: string;
  description: string;
  unit?: string;
  qty?: number;
  rate?: number;
  amount?: number;
  code?: string;
  size?: string;
  solution?: string;
};

type Filters = {
  variancePct: number;
  sectionIds: string[];
  variancesOnly: boolean;
};

type Dataset = { id: string; lines: Line[] };

const clean = (s: any) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[\s\-\_\/\\,.;:()|[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const num = (v: any) => {
  if (v === null || v === undefined) return NaN;
  const n = Number(String(v).replace(/[$€£,%\s,()]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

function buildKey(x: Line): string {
  if (x.code) return `code:${clean(x.code)}`;
  const parts = [
    clean(x.description),
    clean(x.unit),
    clean(x.size || x.solution || "")
  ].filter(Boolean);
  return `cmp:${parts.join("|")}`;
}

export type CompareDiagnostics = {
  leftCount: number;
  rightCount: number;
  leftSections: Record<string, number>;
  rightSections: Record<string, number>;
  commonSections: string[];
  intersectionSize: number;
  postFilterSize: number;
  reason?: string;
};

export type CompareResult = {
  rows: any[];
  diag: CompareDiagnostics;
};

export function computeComparison(left: Dataset, right: Dataset, f: Filters): CompareResult {
  const filtLeft = left.lines.filter(
    (l) => f.sectionIds.length === 0 || f.sectionIds.includes(String(l.section ?? ""))
  );
  const filtRight = right.lines.filter(
    (l) => f.sectionIds.length === 0 || f.sectionIds.includes(String(l.section ?? ""))
  );

  const leftSections: Record<string, number> = {};
  const rightSections: Record<string, number> = {};
  for (const l of left.lines) leftSections[String(l.section ?? "—")] = (leftSections[String(l.section ?? "—")] ?? 0) + 1;
  for (const r of right.lines) rightSections[String(r.section ?? "—")] = (rightSections[String(r.section ?? "—")] ?? 0) + 1;

  const commonSections = Array.from(new Set(filtLeft.map(x => String(x.section ?? ""))
    .filter(s => filtRight.some(y => String(y.section ?? "") === s))));

  const rIndex = new Map<string, Line[]>();
  for (const r of filtRight) {
    const k = buildKey(r);
    if (!rIndex.has(k)) rIndex.set(k, []);
    rIndex.get(k)!.push(r);
  }

  const pairs: Array<{ L: Line; R: Line; key: string }> = [];
  for (const l of filtLeft) {
    const k = buildKey(l);
    const cand = rIndex.get(k);
    if (!cand || cand.length === 0) continue;
    pairs.push({ L: l, R: cand[0], key: k });
  }

  const rows = pairs.map(({ L, R }) => {
    const Lqty = num(L.qty), Rqty = num(R.qty);
    const Lrate = num(L.rate), Rrate = num(R.rate);
    const Lamt = num(L.amount), Ramt = num(R.amount);

    const Lval = Number.isFinite(Lamt) ? Lamt :
      (Number.isFinite(Lqty) && Number.isFinite(Lrate)) ? Lqty * Lrate : NaN;
    const Rval = Number.isFinite(Ramt) ? Ramt :
      (Number.isFinite(Rqty) && Number.isFinite(Rrate)) ? Rqty * Rrate : NaN;

    const avg = Number.isFinite(Lval) && Number.isFinite(Rval) ? (Lval + Rval) / 2 : NaN;
    const diff = Number.isFinite(Lval) && Number.isFinite(Rval) ? (Rval - Lval) : NaN;
    const pct = Number.isFinite(avg) && avg !== 0 ? (diff / avg) * 100 : NaN;

    return {
      section: L.section ?? R.section ?? "—",
      code: L.code || R.code || "",
      description: L.description || R.description,
      unit: L.unit || R.unit || "",
      leftQty: Lqty, rightQty: Rqty,
      leftRate: Lrate, rightRate: Rrate,
      leftAmount: Number.isFinite(Lval) ? +Lval.toFixed(2) : null,
      rightAmount: Number.isFinite(Rval) ? +Rval.toFixed(2) : null,
      variancePct: Number.isFinite(pct) ? +pct.toFixed(2) : null,
    };
  });

  const intersectionSize = rows.length;

  const withinBand = (pct: number | null) =>
    pct !== null && Math.abs(pct) <= Math.abs(f.variancePct);

  const filtered = f.variancesOnly
    ? rows.filter(r => r.variancePct !== null && !withinBand(r.variancePct))
    : rows;

  const postFilterSize = filtered.length;

  let reason: string | undefined;
  if (intersectionSize === 0) {
    reason = "No comparable items found — keys don't match. Check mapping (Description/Unit/Code) or enable key normalisation.";
  } else if (postFilterSize === 0) {
    reason = f.variancesOnly
      ? "All items are within variance threshold. Turn off 'Show variances only' or widen the threshold."
      : "After section filtering there were no rows to display.";
  }

  return {
    rows: filtered,
    diag: {
      leftCount: filtLeft.length,
      rightCount: filtRight.length,
      leftSections,
      rightSections,
      commonSections,
      intersectionSize,
      postFilterSize,
      reason,
    },
  };
}
