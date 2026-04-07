/**
 * Enterprise-Grade Commercial Adjudication Report Template
 * Generates a structured, consulting-quality PDF for Tier 1 contractor and client submission.
 *
 * IMPORTANT: This file only controls output layout and wording.
 * No calculation logic lives here. All scores and data are computed upstream.
 */

interface RecommendationCard {
  type: 'best_value' | 'lowest_risk' | 'balanced';
  supplierName: string;
  price: number;
  coverage: number;
  riskScore: number;
  score: number;
}

interface SupplierRow {
  rank: number;
  supplierName: string;
  adjustedTotal: number;
  comparablePrice?: number;
  comparisonMode?: 'FULLY_ITEMISED' | 'PARTIAL_BREAKDOWN' | 'LUMP_SUM';
  confidenceScore?: number;
  riskScore: number;
  coveragePercent: number;
  itemsQuoted: number;
  totalItems: number;
  weightedScore?: number;
  notes?: string[];
  quoteId?: string | null;
  projectedTotal?: number;
  variationExposurePct?: number;
  variationExposureValue?: number;
  behaviourClass?: string;
  behaviourRiskTier?: 'low' | 'medium' | 'high' | 'critical';
  scopeGaps?: string[];
  normalizedTotal?: number;
  underallowanceFlag?: boolean;
  recommendationStatus?: 'recommended' | 'narrow_margin' | 'provisional' | 'no_recommendation';
}

interface ScoringWeightsForPdf {
  price: number;
  compliance: number;
  coverage: number;
  risk: number;
  confidence?: number;
}

interface ModernPdfOptions {
  projectName: string;
  clientName?: string;
  generatedAt: string;
  recommendations: RecommendationCard[];
  suppliers: SupplierRow[];
  executiveSummary?: string;
  methodology?: string[];
  additionalSections?: Array<{ title: string; content: string }>;
  organisationLogoUrl?: string;
  renderMode?: 'screen' | 'pdf';
  approvedQuoteId?: string | null;
  scoringWeights?: ScoringWeightsForPdf;
  commercialPosition?: 'recommended' | 'narrow_margin' | 'provisional' | 'no_recommendation';
  confidenceLevel?: number;
  keyDecisionDrivers?: string[];
  commercialWarning?: string;
  commercialControlsRequired?: string[];
  quantityIntelligenceSummary?: {
    linesWithMajorVariance: number;
    linesWithReviewFlag: number;
    underallowedSupplierNames: string[];
  };
}

const DARK = '#111827';
const MID = '#374151';
const MUTED = '#6b7280';
const LIGHT_BG = '#f9fafb';
const BORDER = '#e5e7eb';
const GREEN = '#059669';
const GREEN_BG = '#ecfdf5';
const GREEN_BORDER = '#6ee7b7';
const AMBER = '#d97706';
const AMBER_BG = '#fffbeb';
const AMBER_BORDER = '#fcd34d';
const RED = '#dc2626';
const RED_BG = '#fef2f2';
const RED_BORDER = '#fca5a5';
const BLUE = '#2563eb';
const BLUE_BG = '#eff6ff';
const BLUE_BORDER = '#93c5fd';
const ORANGE = '#f97316';
const ORANGE_DARK = '#ea580c';
const ORANGE_LIGHT = '#fed7aa';

function fmt(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

function riskColor(score: number, max: number): string {
  if (max === 0) return GREEN;
  const ratio = score / max;
  if (ratio < 0.3) return GREEN;
  if (ratio < 0.6) return AMBER;
  return RED;
}

function riskLabel(score: number, max: number): string {
  if (max === 0) return 'Low';
  const ratio = score / max;
  if (ratio < 0.3) return 'Low';
  if (ratio < 0.6) return 'Moderate';
  return 'High';
}

function tierColor(tier?: string): string {
  if (!tier) return MID;
  switch (tier) {
    case 'low': return GREEN;
    case 'medium': return AMBER;
    case 'high': return RED;
    case 'critical': return '#7f1d1d';
    default: return MID;
  }
}

function tierBg(tier?: string): string {
  if (!tier) return LIGHT_BG;
  switch (tier) {
    case 'low': return GREEN_BG;
    case 'medium': return AMBER_BG;
    case 'high': return RED_BG;
    case 'critical': return '#fef2f2';
    default: return LIGHT_BG;
  }
}

function positionLabel(pos?: string): string {
  switch (pos) {
    case 'recommended': return 'Recommended';
    case 'narrow_margin': return 'Commercial Leader — Narrow Margin';
    case 'provisional': return 'Provisional Leader — Validation Required';
    case 'no_recommendation': return 'No Recommendation Issued';
    default: return 'Under Review';
  }
}

function positionBg(pos?: string): string {
  switch (pos) {
    case 'recommended': return GREEN_BG;
    case 'narrow_margin': return AMBER_BG;
    case 'provisional': return BLUE_BG;
    case 'no_recommendation': return RED_BG;
    default: return LIGHT_BG;
  }
}

function positionBorder(pos?: string): string {
  switch (pos) {
    case 'recommended': return GREEN_BORDER;
    case 'narrow_margin': return AMBER_BORDER;
    case 'provisional': return BLUE_BORDER;
    case 'no_recommendation': return RED_BORDER;
    default: return BORDER;
  }
}

function positionTextColor(pos?: string): string {
  switch (pos) {
    case 'recommended': return GREEN;
    case 'narrow_margin': return AMBER;
    case 'provisional': return BLUE;
    case 'no_recommendation': return RED;
    default: return MID;
  }
}

function header(organisationLogoUrl: string | undefined, projectName: string, clientName: string | undefined, generatedAt: string): string {
  const logoHtml = organisationLogoUrl
    ? `<img src="${organisationLogoUrl}" alt="Organisation Logo" style="height:48px;object-fit:contain;" />`
    : `<div style="display:flex;align-items:center;gap:10px;">
        <div style="width:44px;height:44px;background:linear-gradient(135deg,${ORANGE} 0%,${ORANGE_DARK} 100%);border-radius:10px;display:flex;align-items:center;justify-content:center;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <span style="font-size:20px;font-weight:700;color:${DARK};letter-spacing:-0.3px;">VerifyTrade</span>
      </div>`;

  return `<header style="display:flex;justify-content:space-between;align-items:center;padding-bottom:18px;margin-bottom:32px;border-bottom:3px solid ${ORANGE};">
    ${logoHtml}
    <div style="text-align:right;">
      <div style="font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Commercial Adjudication Report</div>
      <div style="font-size:13px;font-weight:700;color:${DARK};margin-top:3px;">${projectName}</div>
      ${clientName ? `<div style="font-size:12px;color:${MUTED};margin-top:2px;">${clientName}</div>` : ''}
      <div style="font-size:11px;color:${MUTED};margin-top:4px;">Prepared ${new Date(generatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
  </header>`;
}

function pageFooter(section: string, pageNum: string): string {
  return `<footer style="margin-top:48px;padding-top:14px;border-top:1px solid ${BORDER};display:flex;justify-content:space-between;align-items:center;font-size:10px;color:${MUTED};">
    <span>COMMERCIAL IN CONFIDENCE — For authorised recipients only</span>
    <span style="font-weight:600;">${section}</span>
    <span>Page ${pageNum}</span>
  </footer>`;
}

function sectionTitle(num: string, title: string): string {
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;padding-bottom:12px;border-bottom:2px solid ${BORDER};">
    <div style="width:30px;height:30px;background:${DARK};color:white;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${num}</div>
    <h2 style="font-size:18px;font-weight:700;color:${DARK};margin:0;letter-spacing:-0.2px;">${title}</h2>
  </div>`;
}

function dataCell(label: string, value: string, valueColor?: string): string {
  return `<div style="padding:10px 0;border-bottom:1px solid ${BORDER};">
    <div style="font-size:10px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">${label}</div>
    <div style="font-size:15px;font-weight:700;color:${valueColor ?? DARK};">${value}</div>
  </div>`;
}

function pill(text: string, bg: string, color: string): string {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:4px;background:${bg};color:${color};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${text}</span>`;
}

/**
 * Page 1 — Executive Decision
 */
function pageExecutiveDecision(opts: ModernPdfOptions): string {
  const top = opts.suppliers[0];
  const pos = opts.commercialPosition ?? (top?.recommendationStatus ?? 'no_recommendation');
  const confidence = opts.confidenceLevel ?? (top?.weightedScore ? Math.round((top.weightedScore / 100) * 100) : undefined);
  const drivers = opts.keyDecisionDrivers ?? top?.notes ?? [];

  const posBg = positionBg(pos);
  const posBorder = positionBorder(pos);
  const posText = positionTextColor(pos);
  const posLabel = positionLabel(pos);

  const warning = opts.commercialWarning;

  const snapshotRows = opts.suppliers.slice(0, 4).map(s => {
    const projTotal = s.projectedTotal ?? s.adjustedTotal;
    const varExp = s.variationExposureValue;
    const modeLabel = s.comparisonMode === 'FULLY_ITEMISED' ? 'Detailed'
      : s.comparisonMode === 'PARTIAL_BREAKDOWN' ? 'Partial'
      : s.comparisonMode === 'LUMP_SUM' ? 'Lump Sum' : '';
    const modeBg = s.comparisonMode === 'FULLY_ITEMISED' ? GREEN_BG
      : s.comparisonMode === 'PARTIAL_BREAKDOWN' ? AMBER_BG : LIGHT_BG;
    const modeColor = s.comparisonMode === 'FULLY_ITEMISED' ? GREEN
      : s.comparisonMode === 'PARTIAL_BREAKDOWN' ? AMBER : MUTED;
    const comparableDisplay = s.comparablePrice != null ? fmt(s.comparablePrice) : fmt(s.adjustedTotal);
    return `<tr style="border-bottom:1px solid ${BORDER};">
      <td style="padding:10px 12px;font-weight:600;color:${DARK};font-size:13px;">
        <div>${s.supplierName}</div>
        ${modeLabel ? `<span style="display:inline-block;margin-top:3px;padding:2px 7px;border-radius:3px;background:${modeBg};color:${modeColor};font-size:9px;font-weight:700;text-transform:uppercase;">${modeLabel}</span>` : ''}
      </td>
      <td style="padding:10px 12px;text-align:right;font-weight:600;color:${MUTED};font-size:12px;">${fmt(s.adjustedTotal)}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;color:${GREEN};font-size:13px;">${comparableDisplay}</td>
      <td style="padding:10px 12px;text-align:right;font-size:13px;color:${varExp && varExp > 0 ? RED : MUTED};">${varExp !== undefined ? fmt(varExp) : '—'}</td>
      <td style="padding:10px 12px;text-align:center;">
        <span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;background:${s.rank === 1 ? GREEN_BG : LIGHT_BG};color:${s.rank === 1 ? GREEN : MUTED};">
          ${s.rank === 1 && pos !== 'no_recommendation' ? 'Leader' : `#${s.rank}`}
        </span>
      </td>
    </tr>`;
  }).join('');

  return `<div class="page">
    ${header(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt)}

    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${MUTED};margin-bottom:6px;">Section 1</div>
      <h1 style="font-size:28px;font-weight:800;color:${DARK};margin:0 0 6px;letter-spacing:-0.5px;">Executive Decision</h1>
      <p style="font-size:14px;color:${MUTED};margin:0;">${opts.suppliers.length} tenderer${opts.suppliers.length !== 1 ? 's' : ''} evaluated across ${opts.suppliers[0]?.totalItems ?? '—'} scope items</p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
      <div style="background:${posBg};border:2px solid ${posBorder};border-radius:10px;padding:24px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${MUTED};margin-bottom:8px;">Commercial Position</div>
        <div style="font-size:16px;font-weight:800;color:${posText};margin-bottom:${top ? '14px' : '0'};">${posLabel}</div>
        ${top ? `<div style="font-size:24px;font-weight:800;color:${DARK};">${top.supplierName}</div>
        <div style="font-size:13px;color:${MUTED};margin-top:6px;">Comparable price: <strong style="color:${GREEN};">${fmt(top.comparablePrice ?? top.adjustedTotal)}</strong></div>
        ${top.comparablePrice != null && top.comparablePrice !== top.adjustedTotal ? `<div style="font-size:11px;color:${MUTED};margin-top:2px;">Quoted total: ${fmt(top.adjustedTotal)}</div>` : ''}` : ''}
      </div>
      <div style="background:${LIGHT_BG};border:1px solid ${BORDER};border-radius:10px;padding:24px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${MUTED};margin-bottom:16px;">Key Metrics</div>
        ${dataCell('Coverage of Scope', top ? pct(top.coveragePercent) : '—', top && top.coveragePercent >= 85 ? GREEN : AMBER)}
        ${confidence !== undefined ? dataCell('Composite Confidence Score', `${confidence}/100`, confidence >= 70 ? GREEN : confidence >= 50 ? AMBER : RED) : ''}
        ${top ? dataCell('Risk Classification', riskLabel(top.riskScore, Math.max(...opts.suppliers.map(s => s.riskScore))), riskColor(top.riskScore, Math.max(...opts.suppliers.map(s => s.riskScore)))) : ''}
      </div>
    </div>

    ${drivers.length > 0 ? `<div style="background:${LIGHT_BG};border:1px solid ${BORDER};border-radius:10px;padding:20px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${MUTED};margin-bottom:12px;">Key Decision Drivers</div>
      <ul style="margin:0;padding:0;list-style:none;">
        ${drivers.slice(0, 6).map(d => `<li style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;font-size:13px;color:${MID};">
          <span style="width:16px;height:16px;background:${ORANGE};color:white;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0;margin-top:1px;">&#10003;</span>
          <span>${d}</span>
        </li>`).join('')}
      </ul>
    </div>` : ''}

    ${warning ? `<div style="background:${AMBER_BG};border:2px solid ${AMBER_BORDER};border-radius:8px;padding:16px 20px;margin-bottom:20px;display:flex;gap:12px;">
      <div style="font-size:18px;line-height:1;flex-shrink:0;">&#9888;</div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${AMBER};margin-bottom:4px;">Commercial Warning</div>
        <div style="font-size:13px;color:#78350f;line-height:1.6;">${warning}</div>
      </div>
    </div>` : ''}

    <div style="border:1px solid ${BORDER};border-radius:10px;overflow:hidden;">
      <div style="background:${DARK};padding:12px 14px;">
        <div style="font-size:11px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.8px;">Financial Snapshot — All Tenderers</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead style="background:${LIGHT_BG};">
          <tr>
            <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.5px;">Tenderer</th>
            <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.5px;">Quoted Total</th>
            <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.5px;">Comparable Price</th>
            <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.5px;">Variation Exposure</th>
            <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.5px;">Rank</th>
          </tr>
        </thead>
        <tbody>${snapshotRows}</tbody>
      </table>
    </div>

    ${pageFooter('Executive Decision', '1')}
  </div>`;
}

/**
 * Page 2 — Commercial Comparison
 */
function pageCommercialComparison(opts: ModernPdfOptions): string {
  const maxRisk = Math.max(...opts.suppliers.map(s => s.riskScore));
  const weights = opts.scoringWeights ?? { price: 45, compliance: 20, coverage: 25, risk: 10 };

  const rows = opts.suppliers.map(s => {
    const rColor = riskColor(s.riskScore, maxRisk);
    const rLabel = riskLabel(s.riskScore, maxRisk);
    const isTop = s.rank === 1;
    const modeLabel = s.comparisonMode === 'FULLY_ITEMISED' ? 'Detailed'
      : s.comparisonMode === 'PARTIAL_BREAKDOWN' ? 'Partial'
      : s.comparisonMode === 'LUMP_SUM' ? 'Lump Sum' : '—';
    const modeBg = s.comparisonMode === 'FULLY_ITEMISED' ? GREEN_BG
      : s.comparisonMode === 'PARTIAL_BREAKDOWN' ? AMBER_BG : LIGHT_BG;
    const modeColor = s.comparisonMode === 'FULLY_ITEMISED' ? GREEN
      : s.comparisonMode === 'PARTIAL_BREAKDOWN' ? AMBER : MUTED;
    const comparableDisplay = s.comparablePrice != null ? fmt(s.comparablePrice) : fmt(s.adjustedTotal);
    const isAdjusted = s.comparablePrice != null && s.comparablePrice !== s.adjustedTotal;

    const drivers: string[] = [];
    if (isTop) drivers.push('Highest composite score');
    if (s.coveragePercent >= 90) drivers.push('Full scope coverage');
    else if (s.coveragePercent < 70 && s.comparisonMode !== 'LUMP_SUM') drivers.push(`Scope coverage gap (${pct(s.coveragePercent)})`);
    if (s.riskScore === 0) drivers.push('No risk factors identified');
    else if (rLabel === 'High') drivers.push(`High risk classification (${s.riskScore} factors)`);
    if (s.variationExposurePct !== undefined && s.variationExposurePct > 0.1) drivers.push(`Elevated variation exposure (${pct(s.variationExposurePct * 100)})`);
    if (s.underallowanceFlag) drivers.push('Quantity under-allowance flagged');
    if (s.comparisonMode === 'LUMP_SUM') drivers.push('Lump sum — price is scope-adjusted');

    return `<tr style="border-bottom:1px solid ${BORDER};${isTop ? `background:linear-gradient(90deg,${GREEN_BG} 0%,transparent 40%);` : ''}">
      <td style="padding:12px 14px;font-weight:700;color:${DARK};font-size:13px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="display:inline-block;width:26px;height:26px;border-radius:5px;background:${isTop ? GREEN : '#e5e7eb'};color:${isTop ? 'white' : MID};font-size:11px;font-weight:700;text-align:center;line-height:26px;">${s.rank}</span>
          <span>${s.supplierName}</span>
        </div>
        <span style="display:inline-block;margin-top:4px;padding:2px 7px;border-radius:3px;background:${modeBg};color:${modeColor};font-size:9px;font-weight:700;text-transform:uppercase;">${modeLabel}</span>
      </td>
      <td style="padding:12px 14px;text-align:right;font-size:12px;color:${MUTED};">${fmt(s.adjustedTotal)}</td>
      <td style="padding:12px 14px;text-align:right;font-weight:700;font-size:14px;color:${GREEN};">
        ${comparableDisplay}
        ${isAdjusted ? `<div style="font-size:9px;color:${MUTED};font-weight:400;">scope-adjusted</div>` : ''}
      </td>
      <td style="padding:12px 14px;text-align:center;font-weight:700;font-size:13px;color:${rColor};">${rLabel}</td>
      <td style="padding:12px 14px;text-align:center;font-weight:700;color:${s.coveragePercent >= 85 ? GREEN : AMBER};font-size:13px;">${s.comparisonMode === 'LUMP_SUM' ? '<span style="color:#9ca3af;">N/A</span>' : pct(s.coveragePercent)}</td>
      <td style="padding:12px 14px;text-align:center;font-weight:700;font-size:14px;color:${DARK};">${s.weightedScore !== undefined ? `${Math.round(s.weightedScore)}/100` : '—'}</td>
      <td style="padding:12px 14px;font-size:12px;color:${MID};max-width:180px;">
        ${drivers.length > 0 ? drivers.slice(0, 2).map(d => `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px;"><span style="color:${ORANGE};font-weight:700;flex-shrink:0;">&#8250;</span>${d}</div>`).join('') : '<span style="color:#9ca3af;">—</span>'}
      </td>
    </tr>`;
  }).join('');

  return `<div class="page">
    ${header(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt)}
    ${sectionTitle('2', 'Commercial Comparison')}

    <div style="background:${LIGHT_BG};border:1px solid ${BORDER};border-radius:8px;padding:14px 18px;margin-bottom:20px;font-size:12px;color:${MID};line-height:1.7;">
      Composite Score is calculated using: Price <strong>${weights.price}%</strong>, Compliance <strong>${weights.compliance}%</strong>, Coverage <strong>${weights.coverage}%</strong>, Risk <strong>${weights.risk}%</strong>, Confidence <strong>${weights.confidence ?? 15}%</strong>.
      Comparable Price is scope-adjusted for apples-to-apples comparison. Higher scores indicate stronger commercial and technical position.
    </div>

    <div style="border:1px solid ${BORDER};border-radius:10px;overflow:hidden;margin-bottom:28px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead style="background:${DARK};">
          <tr>
            <th style="padding:12px 14px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Tenderer</th>
            <th style="padding:12px 14px;text-align:right;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Quoted Total</th>
            <th style="padding:12px 14px;text-align:right;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Comparable Price</th>
            <th style="padding:12px 14px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Risk Level</th>
            <th style="padding:12px 14px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Scope Coverage</th>
            <th style="padding:12px 14px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Composite Score</th>
            <th style="padding:12px 14px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Commercial Impact</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    ${(() => {
      const pos2 = opts.commercialPosition ?? (opts.suppliers[0]?.recommendationStatus ?? 'no_recommendation');
      if (pos2 === 'no_recommendation') {
        return `<div style="background:${LIGHT_BG};border:1px solid ${BORDER};border-radius:10px;padding:20px;text-align:center;">
          <div style="font-size:13px;color:${MUTED};font-style:italic;">No commercial recommendation has been issued for this tender. Refer to the Executive Decision section for current commercial position.</div>
        </div>`;
      }
      return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
        ${opts.recommendations.slice(0, 3).map(rec => {
          const typeLabels: Record<string, string> = { best_value: 'Best Value', lowest_risk: 'Lowest Risk', balanced: 'Balanced' };
          const typeColors: Record<string, string> = { best_value: GREEN, lowest_risk: BLUE, balanced: ORANGE };
          const typeBgs: Record<string, string> = { best_value: GREEN_BG, lowest_risk: BLUE_BG, balanced: '#fff7ed' };
          const c = typeColors[rec.type] ?? ORANGE;
          const bg = typeBgs[rec.type] ?? LIGHT_BG;
          return `<div style="background:${bg};border:2px solid ${c}33;border-radius:10px;padding:18px;">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${c};margin-bottom:6px;">${typeLabels[rec.type] ?? rec.type}</div>
            <div style="font-size:16px;font-weight:800;color:${DARK};margin-bottom:12px;line-height:1.2;">${rec.supplierName}</div>
            <div style="font-size:12px;color:${MID};">
              <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid ${BORDER};"><span>Quoted</span><strong>${fmt(rec.price)}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid ${BORDER};"><span>Coverage</span><strong>${pct(rec.coverage)}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:5px 0;"><span>Composite</span><strong style="color:${c};">${Math.round(rec.score)}/100</strong></div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    })()}

    ${pageFooter('Commercial Comparison', '2')}
  </div>`;
}

/**
 * Page 3 — Risk Intelligence
 */
function pageRiskIntelligence(opts: ModernPdfOptions): string {
  const maxRisk = Math.max(...opts.suppliers.map(s => s.riskScore));

  const rows = opts.suppliers.map(s => {
    const rColor = riskColor(s.riskScore, maxRisk);
    const rLabel = riskLabel(s.riskScore, maxRisk);
    const varPct = s.variationExposurePct !== undefined ? s.variationExposurePct * 100 : undefined;
    const varVal = s.variationExposureValue;
    const tierLabel = s.behaviourRiskTier ? s.behaviourRiskTier.charAt(0).toUpperCase() + s.behaviourRiskTier.slice(1) : 'Not assessed';

    return `<tr style="border-bottom:1px solid ${BORDER};">
      <td style="padding:12px 14px;font-weight:600;color:${DARK};font-size:13px;">${s.supplierName}</td>
      <td style="padding:12px 14px;text-align:center;">
        <span style="display:inline-block;padding:4px 10px;border-radius:4px;background:${tierBg(s.behaviourRiskTier)};color:${tierColor(s.behaviourRiskTier)};font-size:10px;font-weight:700;text-transform:uppercase;">${tierLabel}</span>
      </td>
      <td style="padding:12px 14px;text-align:center;font-weight:700;font-size:13px;color:${rColor};">${rLabel} (${s.riskScore})</td>
      <td style="padding:12px 14px;text-align:right;font-size:13px;font-weight:600;color:${varVal && varVal > 0 ? RED : MUTED};">${varVal !== undefined ? fmt(varVal) : '—'}</td>
      <td style="padding:12px 14px;text-align:center;font-size:13px;font-weight:600;color:${varPct !== undefined && varPct > 10 ? RED : varPct !== undefined && varPct > 5 ? AMBER : GREEN};">${varPct !== undefined ? pct(varPct) : '—'}</td>
    </tr>`;
  }).join('');

  const topBehaviour = opts.suppliers[0];
  const hasHighRisk = opts.suppliers.some(s => riskLabel(s.riskScore, maxRisk) === 'High');

  return `<div class="page">
    ${header(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt)}
    ${sectionTitle('3', 'Risk Intelligence')}

    <div style="border:1px solid ${BORDER};border-radius:10px;overflow:hidden;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead style="background:${DARK};">
          <tr>
            <th style="padding:12px 14px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Tenderer</th>
            <th style="padding:12px 14px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Behaviour Tier</th>
            <th style="padding:12px 14px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Risk Level</th>
            <th style="padding:12px 14px;text-align:right;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Variation Exposure ($)</th>
            <th style="padding:12px 14px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Exposure (%)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
      <div style="background:${LIGHT_BG};border:1px solid ${BORDER};border-radius:8px;padding:18px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};margin-bottom:10px;">What is Variation Exposure?</div>
        <p style="font-size:12px;color:${MID};line-height:1.7;margin:0;">
          Variation exposure estimates the additional cost that may arise from scope gaps, under-allowances, and pricing behaviour patterns.
          A high exposure percentage indicates material risk that the final contract value will exceed the quoted amount.
        </p>
      </div>
      <div style="background:${LIGHT_BG};border:1px solid ${BORDER};border-radius:8px;padding:18px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};margin-bottom:10px;">Behaviour Tier Explained</div>
        <p style="font-size:12px;color:${MID};line-height:1.7;margin:0;">
          Behaviour tier reflects historical pricing patterns, unit rate consistency, and scope coverage relative to peers.
          <strong style="color:${GREEN};">Low tier</strong> = consistent and competitive. <strong style="color:${RED};">High tier</strong> = patterns that elevate commercial risk.
        </p>
      </div>
    </div>

    ${hasHighRisk ? `<div style="background:${RED_BG};border:2px solid ${RED_BORDER};border-radius:8px;padding:16px 20px;font-size:12px;color:#7f1d1d;line-height:1.7;">
      <strong>Commercial Verdict:</strong> One or more tenderers carry a high-risk classification. Independent scope and rate validation is recommended before contract execution.
    </div>` : `<div style="background:${GREEN_BG};border:2px solid ${GREEN_BORDER};border-radius:8px;padding:16px 20px;font-size:12px;color:#14532d;line-height:1.7;">
      <strong>Commercial Verdict:</strong> Risk levels across the tender field are within acceptable bounds. Standard contract controls are considered appropriate.
    </div>`}

    ${pageFooter('Risk Intelligence', '3')}
  </div>`;
}

/**
 * Page 4 — Scope Intelligence
 */
function pageScopeIntelligence(opts: ModernPdfOptions): string {
  const avgCoverage = opts.suppliers.length > 0
    ? opts.suppliers.reduce((sum, s) => sum + s.coveragePercent, 0) / opts.suppliers.length
    : 0;
  const gapSuppliers = opts.suppliers.filter(s => s.coveragePercent < 80);
  const allGaps = opts.suppliers.flatMap(s =>
    (s.scopeGaps ?? []).map(g => ({ supplier: s.supplierName, gap: g }))
  );

  const coverageRows = opts.suppliers.map(s => {
    const isLumpSum = s.comparisonMode === 'LUMP_SUM';
    const barWidth = Math.round(s.coveragePercent);
    const barColor = s.coveragePercent >= 85 ? GREEN : s.coveragePercent >= 70 ? AMBER : RED;
    const modeLabel = s.comparisonMode === 'FULLY_ITEMISED' ? 'Detailed'
      : s.comparisonMode === 'PARTIAL_BREAKDOWN' ? 'Partial'
      : s.comparisonMode === 'LUMP_SUM' ? 'Lump Sum' : '';
    return `<tr style="border-bottom:1px solid ${BORDER};">
      <td style="padding:12px 14px;font-weight:600;color:${DARK};font-size:13px;">
        <div>${s.supplierName}</div>
        ${modeLabel ? `<span style="display:inline-block;margin-top:3px;padding:2px 7px;border-radius:3px;background:${isLumpSum ? LIGHT_BG : s.comparisonMode === 'FULLY_ITEMISED' ? GREEN_BG : AMBER_BG};color:${isLumpSum ? MUTED : s.comparisonMode === 'FULLY_ITEMISED' ? GREEN : AMBER};font-size:9px;font-weight:700;text-transform:uppercase;">${modeLabel}</span>` : ''}
      </td>
      <td style="padding:12px 14px;text-align:center;font-weight:700;color:${isLumpSum ? MUTED : barColor};font-size:13px;">${isLumpSum ? 'N/A' : pct(s.coveragePercent)}</td>
      <td style="padding:12px 14px;text-align:center;font-size:12px;color:${MID};">${isLumpSum ? '—' : `${s.itemsQuoted} / ${s.totalItems}`}</td>
      <td style="padding:12px 14px;">
        ${isLumpSum
          ? `<span style="font-size:11px;color:${MUTED};font-style:italic;">Not applicable for lump sum quotes</span>`
          : `<div style="background:${BORDER};border-radius:3px;height:8px;width:100%;overflow:hidden;">
               <div style="background:${barColor};height:100%;width:${barWidth}%;border-radius:3px;"></div>
             </div>`
        }
      </td>
    </tr>`;
  }).join('');

  return `<div class="page">
    ${header(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt)}
    ${sectionTitle('4', 'Scope Intelligence')}

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;">
      <div style="background:${LIGHT_BG};border:1px solid ${BORDER};border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:${avgCoverage >= 80 ? GREEN : AMBER};margin-bottom:4px;">${pct(avgCoverage)}</div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};">Avg Scope Coverage</div>
      </div>
      <div style="background:${LIGHT_BG};border:1px solid ${BORDER};border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:${gapSuppliers.length === 0 ? GREEN : RED};margin-bottom:4px;">${gapSuppliers.length}</div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};">Tenderers Below 80%</div>
      </div>
      <div style="background:${LIGHT_BG};border:1px solid ${BORDER};border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:${allGaps.length === 0 ? GREEN : AMBER};margin-bottom:4px;">${allGaps.length}</div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};">Identified Scope Gaps</div>
      </div>
    </div>

    <div style="border:1px solid ${BORDER};border-radius:10px;overflow:hidden;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead style="background:${DARK};">
          <tr>
            <th style="padding:12px 14px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Tenderer</th>
            <th style="padding:12px 14px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Coverage</th>
            <th style="padding:12px 14px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Items Priced</th>
            <th style="padding:12px 14px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Coverage Bar</th>
          </tr>
        </thead>
        <tbody>${coverageRows}</tbody>
      </table>
    </div>

    ${allGaps.length > 0 ? `<div style="border:1px solid ${AMBER_BORDER};border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <div style="background:${AMBER_BG};padding:10px 14px;border-bottom:1px solid ${AMBER_BORDER};">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${AMBER};">Identified Scope Gaps</div>
      </div>
      <div style="padding:14px;">
        ${allGaps.slice(0, 8).map(g => `<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;font-size:12px;color:${MID};">
          <span style="flex-shrink:0;font-weight:600;color:${AMBER};">&#9654;</span>
          <span><strong>${g.supplier}:</strong> ${g.gap}</span>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <div style="background:${LIGHT_BG};border-left:4px solid ${ORANGE};border-radius:0 8px 8px 0;padding:14px 18px;font-size:12px;color:${MID};line-height:1.7;">
      <strong>Commercial Implication:</strong> Scope gaps identified in a tenderer's submission carry a risk of post-contract variations.
      Where a tenderer's coverage is materially below peers, the stated quoted total should be treated as a floor price, not a ceiling.
      Variation exposure values in Section 3 reflect this risk adjustment.
    </div>

    ${pageFooter('Scope Intelligence', '4')}
  </div>`;
}

/**
 * Page 5 — Quantity Intelligence
 */
function pageQuantityIntelligence(opts: ModernPdfOptions): string {
  const qi = opts.quantityIntelligenceSummary;
  const hasQI = !!qi;

  const normRows = opts.suppliers.map(s => {
    const hasNorm = s.normalizedTotal !== undefined;
    const diff = hasNorm ? s.normalizedTotal! - s.adjustedTotal : 0;
    const diffPct = s.adjustedTotal > 0 && hasNorm ? (diff / s.adjustedTotal) * 100 : 0;
    return `<tr style="border-bottom:1px solid ${BORDER};">
      <td style="padding:12px 14px;font-weight:600;color:${DARK};font-size:13px;">${s.supplierName}</td>
      <td style="padding:12px 14px;text-align:right;font-weight:700;color:${DARK};font-size:13px;">${fmt(s.adjustedTotal)}</td>
      <td style="padding:12px 14px;text-align:right;font-weight:700;font-size:13px;color:${hasNorm ? (diff > 0 ? RED : GREEN) : MUTED};">${hasNorm ? fmt(s.normalizedTotal!) : 'Not run'}</td>
      <td style="padding:12px 14px;text-align:center;font-size:12px;color:${Math.abs(diffPct) > 5 ? AMBER : MUTED};">${hasNorm ? `${diff > 0 ? '+' : ''}${diffPct.toFixed(1)}%` : '—'}</td>
      <td style="padding:12px 14px;text-align:center;">
        ${s.underallowanceFlag ? `<span style="display:inline-block;padding:3px 8px;border-radius:4px;background:${RED_BG};color:${RED};font-size:10px;font-weight:700;text-transform:uppercase;">Flagged</span>` : `<span style="display:inline-block;padding:3px 8px;border-radius:4px;background:${GREEN_BG};color:${GREEN};font-size:10px;font-weight:700;text-transform:uppercase;">Clear</span>`}
      </td>
    </tr>`;
  }).join('');

  return `<div class="page">
    ${header(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt)}
    ${sectionTitle('5', 'Quantity Intelligence')}

    <div style="background:${BLUE_BG};border:1px solid ${BLUE_BORDER};border-radius:8px;padding:14px 18px;margin-bottom:20px;font-size:12px;color:#1e3a8a;line-height:1.7;">
      <strong>Advisory note:</strong> Quantity Intelligence is a commercial analysis tool only. It does not modify tenderer submissions or determine the preferred tenderer.
      Normalised totals re-price all tenderers against a common reference quantity set to enable fair cost comparison.
    </div>

    <div style="border:1px solid ${BORDER};border-radius:10px;overflow:hidden;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead style="background:${DARK};">
          <tr>
            <th style="padding:12px 14px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Tenderer</th>
            <th style="padding:12px 14px;text-align:right;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Submitted Total</th>
            <th style="padding:12px 14px;text-align:right;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Normalised Total</th>
            <th style="padding:12px 14px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Qty Adjustment</th>
            <th style="padding:12px 14px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Under-Allowance</th>
          </tr>
        </thead>
        <tbody>${normRows}</tbody>
      </table>
    </div>

    ${hasQI ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;">
      <div style="background:${qi!.linesWithMajorVariance > 0 ? RED_BG : GREEN_BG};border:1px solid ${qi!.linesWithMajorVariance > 0 ? RED_BORDER : GREEN_BORDER};border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:${qi!.linesWithMajorVariance > 0 ? RED : GREEN};margin-bottom:4px;">${qi!.linesWithMajorVariance}</div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};">Major Qty Variances</div>
      </div>
      <div style="background:${qi!.linesWithReviewFlag > 0 ? AMBER_BG : GREEN_BG};border:1px solid ${qi!.linesWithReviewFlag > 0 ? AMBER_BORDER : GREEN_BORDER};border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:${qi!.linesWithReviewFlag > 0 ? AMBER : GREEN};margin-bottom:4px;">${qi!.linesWithReviewFlag}</div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};">Lines Needing Review</div>
      </div>
      <div style="background:${qi!.underallowedSupplierNames.length > 0 ? RED_BG : GREEN_BG};border:1px solid ${qi!.underallowedSupplierNames.length > 0 ? RED_BORDER : GREEN_BORDER};border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:${qi!.underallowedSupplierNames.length > 0 ? RED : GREEN};margin-bottom:4px;">${qi!.underallowedSupplierNames.length}</div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};">Under-Allowance Flags</div>
      </div>
    </div>
    ${qi!.underallowedSupplierNames.length > 0 ? `<div style="background:${RED_BG};border:1px solid ${RED_BORDER};border-radius:8px;padding:14px 18px;font-size:12px;color:#7f1d1d;line-height:1.7;">
      <strong>Under-Allowance Detected:</strong> ${qi!.underallowedSupplierNames.join(', ')} ha${qi!.underallowedSupplierNames.length === 1 ? 's' : 've'} submitted quantities below the reference level for one or more significant line items.
      This may result in post-contract variations if work is measured and re-priced at completion.
    </div>` : ''}` : `<div style="background:${LIGHT_BG};border:1px solid ${BORDER};border-radius:8px;padding:16px;font-size:12px;color:${MUTED};text-align:center;">
      Quantity Intelligence analysis was not run for this tender. Run a QI comparison from the Quantity Intelligence module to include normalised data in future reports.
    </div>`}

    ${pageFooter('Quantity Intelligence', '5')}
  </div>`;
}

/**
 * Page 6 — Behaviour Intelligence
 */
function pageBehaviourIntelligence(opts: ModernPdfOptions): string {
  const rows = opts.suppliers.map(s => {
    const tierLabel = s.behaviourRiskTier
      ? s.behaviourRiskTier.charAt(0).toUpperCase() + s.behaviourRiskTier.slice(1)
      : 'Not assessed';
    const bClass = s.behaviourClass ?? 'Not classified';

    const explanation: string[] = [];
    if (s.behaviourRiskTier === 'low') explanation.push('Unit rate distribution is consistent and competitive', 'Scope coverage aligns with peer submissions', 'No unusual pricing patterns detected');
    else if (s.behaviourRiskTier === 'medium') explanation.push('Minor unit rate inconsistencies observed', 'Coverage is broadly in line with peers', 'Standard commercial vigilance recommended');
    else if (s.behaviourRiskTier === 'high') explanation.push('Significant unit rate spread observed across line items', 'Coverage gaps indicate potential scope under-pricing', 'Independent rate validation is recommended before award');
    else if (s.behaviourRiskTier === 'critical') explanation.push('Extreme pricing anomalies detected', 'Substantial scope under-allowance identified', 'Do not award without thorough independent commercial review');
    else explanation.push('Behaviour data not available for this tenderer');

    return `<div style="border:1px solid ${positionBorder(undefined)};border-radius:10px;padding:20px;margin-bottom:16px;break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
        <div>
          <div style="font-size:16px;font-weight:800;color:${DARK};">${s.supplierName}</div>
          <div style="font-size:12px;color:${MUTED};margin-top:3px;">${bClass}</div>
        </div>
        <span style="display:inline-block;padding:5px 12px;border-radius:5px;background:${tierBg(s.behaviourRiskTier)};color:${tierColor(s.behaviourRiskTier)};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${tierLabel} Tier</span>
      </div>
      <div style="border-top:1px solid ${BORDER};padding-top:12px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};margin-bottom:8px;">Classification Rationale</div>
        ${explanation.map(e => `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;font-size:12px;color:${MID};">
          <span style="color:${tierColor(s.behaviourRiskTier)};font-weight:700;flex-shrink:0;margin-top:1px;">&#8250;</span>
          <span>${e}</span>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');

  return `<div class="page">
    ${header(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt)}
    ${sectionTitle('6', 'Behaviour Intelligence')}

    <p style="font-size:13px;color:${MID};line-height:1.7;margin-bottom:20px;">
      Behaviour Intelligence classifies each tenderer based on pricing consistency, scope coverage relative to peers, and historical unit rate patterns.
      This classification is independent of price rank and reflects the commercial risk profile of each submission.
    </p>

    ${rows}

    ${pageFooter('Behaviour Intelligence', '6')}
  </div>`;
}

/**
 * Page 7 — Final Commercial Position
 */
function pageFinalPosition(opts: ModernPdfOptions, approvalSection?: { title: string; content: string }): string {
  const top = opts.suppliers[0];
  const pos = opts.commercialPosition ?? (top?.recommendationStatus ?? 'no_recommendation');
  const posLabel = positionLabel(pos);
  const posText = positionTextColor(pos);
  const posBg = positionBg(pos);
  const posBorder = positionBorder(pos);

  const isProvisional = pos === 'provisional' || pos === 'narrow_margin';
  const isFinal = pos === 'recommended';
  const noRec = pos === 'no_recommendation';

  const statusText = isFinal
    ? 'This is a final recommendation. All scoring gates have been passed and the composite analysis supports award to the identified tenderer.'
    : isProvisional
    ? 'This is a provisional position only. One or more scoring gates are pending resolution. The report should not be used to initiate contract award until the conditions listed in Section 8 are satisfied.'
    : noRec
    ? 'No recommendation can be issued at this time. The analysis has identified unresolved conditions that prevent a defensible commercial position from being established.'
    : 'Commercial position is under review. Contact the project commercial team for current status.';

  const execSummaryText = opts.executiveSummary ?? (top
    ? `Commercial analysis of ${opts.suppliers.length} tenderer${opts.suppliers.length !== 1 ? 's' : ''} was conducted across ${top.totalItems} scope items. ` +
      `${top.supplierName} achieved the highest composite score of ${top.weightedScore !== undefined ? `${Math.round(top.weightedScore)}/100` : 'N/A'}, ` +
      `with a quoted total of ${fmt(top.adjustedTotal)} and scope coverage of ${pct(top.coveragePercent)}.`
    : `Commercial analysis completed for ${opts.suppliers.length} tenderer${opts.suppliers.length !== 1 ? 's' : ''}.`);

  return `<div class="page">
    ${header(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt)}
    ${sectionTitle('7', 'Final Commercial Position')}

    <div style="background:${posBg};border:2px solid ${posBorder};border-radius:12px;padding:24px;margin-bottom:24px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${posText};margin-bottom:6px;">Commercial Position</div>
      <div style="font-size:22px;font-weight:800;color:${posText};margin-bottom:${top ? '10px' : '0'};">${posLabel}</div>
      ${top && !noRec ? `<div style="font-size:18px;font-weight:700;color:${DARK};">${top.supplierName}</div>` : ''}
    </div>

    <div style="background:${LIGHT_BG};border-left:4px solid ${ORANGE};border-radius:0 8px 8px 0;padding:18px 22px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};margin-bottom:8px;">Justification</div>
      <p style="font-size:13px;color:${MID};line-height:1.8;margin:0;">${execSummaryText}</p>
    </div>

    <div style="background:${isProvisional ? AMBER_BG : isFinal ? GREEN_BG : RED_BG};border:1px solid ${isProvisional ? AMBER_BORDER : isFinal ? GREEN_BORDER : RED_BORDER};border-radius:8px;padding:16px 20px;margin-bottom:24px;font-size:12px;color:${isProvisional ? '#78350f' : isFinal ? '#14532d' : '#7f1d1d'};line-height:1.7;">
      <strong>${isFinal ? 'Final Status:' : isProvisional ? 'Provisional Status:' : 'Status Notice:'}</strong> ${statusText}
    </div>

    ${approvalSection ? `<div style="margin-top:24px;">${approvalSection.content}</div>` : ''}

    ${pageFooter('Final Commercial Position', '7')}
  </div>`;
}

/**
 * Page 8 — Commercial Controls Required
 */
function pageCommercialControls(opts: ModernPdfOptions): string {
  const pos = opts.commercialPosition ?? (opts.suppliers[0]?.recommendationStatus ?? 'no_recommendation');
  const isProvisional = pos === 'provisional' || pos === 'narrow_margin';

  const defaultControls: string[] = isProvisional
    ? [
        'Independent verification of scope coverage for any tenderer below 80%',
        'Reconciliation of unit rates against current market benchmarks',
        'Confirm quantity allowances align with design documentation',
        'Resolve all flagged scope gaps prior to contract execution',
        'Board or client approval of commercial position where required by governance framework',
      ]
    : [
        'Execute formal contract documents in line with approved form of contract',
        'Issue unsuccessful tenderer notifications in accordance with procurement policy',
        'Retain tender documentation for audit trail compliance',
        'Confirm insurance and bond requirements are met prior to mobilisation',
        'Log contract award in project financial management system',
      ];

  const controls = opts.commercialControlsRequired ?? defaultControls;

  return `<div class="page">
    ${header(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt)}
    ${sectionTitle('8', 'Commercial Controls Required')}

    <p style="font-size:13px;color:${MID};line-height:1.7;margin-bottom:20px;">
      The following conditions must be satisfied ${isProvisional ? 'before contract award proceeds' : 'as part of contract execution'}.
      These controls are generated based on the commercial position and risk profile identified in this report.
    </p>

    <div style="border:1px solid ${BORDER};border-radius:10px;overflow:hidden;margin-bottom:24px;">
      ${controls.map((c, i) => `<div style="display:flex;align-items:flex-start;gap:14px;padding:14px 18px;border-bottom:${i < controls.length - 1 ? `1px solid ${BORDER}` : 'none'};background:${i % 2 === 0 ? 'white' : LIGHT_BG};">
        <div style="width:28px;height:28px;border-radius:6px;background:${DARK};color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</div>
        <div style="font-size:13px;color:${MID};line-height:1.6;padding-top:3px;">${c}</div>
      </div>`).join('')}
    </div>

    <div style="background:${LIGHT_BG};border:1px solid ${BORDER};border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};margin-bottom:8px;">Methodology</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;">
        ${['Quote Import', 'Data Validation', 'Scope Analysis', 'Risk Scoring', 'Multi-Criteria Decision'].map((step, i) => `<div style="text-align:center;padding:10px 8px;">
          <div style="width:32px;height:32px;border-radius:50%;background:${ORANGE};color:white;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;">${i + 1}</div>
          <div style="font-size:10px;font-weight:600;color:${MID};line-height:1.3;">${step}</div>
        </div>`).join('')}
      </div>
    </div>

    <div style="background:${DARK};border-radius:8px;padding:16px 20px;font-size:11px;color:#9ca3af;line-height:1.7;text-align:center;">
      This report is generated by VerifyTrade and is commercial in confidence. It is intended solely for the named project and authorised recipients.
      The analysis is based on submitted tender data and does not constitute legal or financial advice.
    </div>

    ${pageFooter('Commercial Controls Required', '8')}
  </div>`;
}

/**
 * Main export — generates complete enterprise adjudication report HTML
 */
export function generateModernPdfHtml(options: ModernPdfOptions): string {
  const {
    renderMode = 'screen',
    additionalSections = [],
  } = options;

  const approvalSection = additionalSections.find(s => s.title.includes('Approval'));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commercial Adjudication Report — ${options.projectName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #1f2937;
      background: white;
      -webkit-font-smoothing: antialiased;
    }
    @page {
      size: A4;
      margin: ${renderMode === 'pdf' ? '12mm 12mm 14mm 12mm' : '18mm 14mm'};
    }
    * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .page {
      page-break-after: always;
      padding: 32px 36px 64px 36px;
      position: relative;
      box-sizing: border-box;
    }
    .page:last-child { page-break-after: auto; }
    table { break-inside: auto; }
    tr { break-inside: avoid; break-after: auto; }
    thead { display: table-header-group; }
    @media print {
      .page { padding: 24px 28px 56px 28px; }
    }
  </style>
</head>
<body>
  ${pageExecutiveDecision(options)}
  ${pageCommercialComparison(options)}
  ${pageRiskIntelligence(options)}
  ${pageScopeIntelligence(options)}
  ${pageQuantityIntelligence(options)}
  ${pageBehaviourIntelligence(options)}
  ${pageFinalPosition(options, approvalSection)}
  ${pageCommercialControls(options)}
</body>
</html>`;
}

/**
 * Opens a print dialog for PDF export.
 * Unchanged from original — no calculation logic here.
 */
export function generatePdfWithPrint(htmlContent: string, filename: string): void {
  const printWindow = window.open('', '_blank', 'width=1200,height=800');
  if (!printWindow) {
    downloadPdfHtml(htmlContent, filename);
    return;
  }

  const bannerHtml = `
    <div id="print-banner" style="
      position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
      background: ${ORANGE}; color: white;
      padding: 12px 20px; font-family: -apple-system, sans-serif;
      font-size: 14px; font-weight: 600;
      display: flex; align-items: center; justify-content: space-between;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    ">
      <span>Commercial Adjudication Report — ${filename}</span>
      <span style="opacity:0.9;">Select "Save as PDF" in the print dialog</span>
    </div>
    <div style="height:48px;"></div>
  `;

  const autoprint = `
    <script>
      window.onload = function() {
        var banner = document.getElementById('print-banner');
        if(banner) banner.style.display = 'flex';
        setTimeout(function() {
          if(banner) banner.style.display = 'none';
          window.print();
        }, 600);
      };
    </script>
  `;

  printWindow.document.write(htmlContent.replace('<body>', `<body>${bannerHtml}`).replace('</html>', `${autoprint}</html>`));
  printWindow.document.close();
}

export function downloadPdfHtml(htmlContent: string, filename: string): void {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
