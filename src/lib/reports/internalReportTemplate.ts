/**
 * INTERNAL MODE Report Template
 *
 * Audience: Commercial team, QS, project manager, procurement lead.
 * Tone: Technical, direct, fully detailed.
 *
 * Additional sections vs Client report:
 *   - Full behaviour classification with tier labels
 *   - Quantity intelligence detail (variances, under-allowance flags)
 *   - Scope gap text
 *   - Commercial Weakness Map: where each supplier may recover margin
 *   - Internal scoring weights exposed
 *
 * IMPORTANT: This file contains NO calculation logic.
 * All values are passed in pre-computed from upstream engines.
 */

import type { ReportOptions } from './reportTypes';
import {
  C, fmt, pct, riskRatio, riskColor, riskLabel, coverageColor,
  positionLabel, positionBg, positionBorder, positionText,
  tierColor, tierBg, sharedHeader, sharedFooter, sectionHeading,
  infoBox, baseStyles, htmlWrap, openPrintWindow,
} from './reportShared';

function pageExecutiveAndFinancial(opts: ReportOptions): string {
  const top = opts.suppliers[0];
  const maxRisk = Math.max(...opts.suppliers.map(s => s.riskScore));
  const pos = top?.recommendationStatus ?? 'no_recommendation';

  const rows = opts.suppliers.map(s => {
    const ratio = riskRatio(s.riskScore, maxRisk);
    const proj = s.projectedTotal ?? s.adjustedTotal;
    const varVal = s.variationExposureValue ?? 0;
    const varPct = s.variationExposurePct !== undefined ? s.variationExposurePct * 100 : 0;
    return `<tr style="border-bottom:1px solid ${C.BORDER};${s.rank === 1 ? `background:linear-gradient(90deg,${C.GREEN_BG} 0%,transparent 50%);` : ''}">
      <td style="padding:10px 12px;font-weight:700;color:${C.DARK};font-size:13px;">
        <div style="display:flex;align-items:center;gap:7px;">
          <span style="width:22px;height:22px;border-radius:4px;background:${s.rank === 1 ? C.GREEN : '#e5e7eb'};color:${s.rank === 1 ? 'white' : C.MID};font-size:10px;font-weight:700;text-align:center;line-height:22px;">${s.rank}</span>
          ${s.supplierName}
        </div>
      </td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:13px;">${fmt(s.adjustedTotal)}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:13px;color:${proj !== s.adjustedTotal ? C.AMBER : C.GREEN};">${fmt(proj)}</td>
      <td style="padding:10px 12px;text-align:right;font-size:12px;color:${varVal > 0 ? C.RED : C.MUTED};">${fmt(varVal)}</td>
      <td style="padding:10px 12px;text-align:center;font-size:12px;color:${varPct > 10 ? C.RED : varPct > 5 ? C.AMBER : C.GREEN};">${pct(varPct)}</td>
      <td style="padding:10px 12px;text-align:center;font-weight:700;font-size:12px;color:${riskColor(ratio)};">${riskLabel(ratio)}</td>
      <td style="padding:10px 12px;text-align:center;font-weight:700;font-size:12px;color:${coverageColor(s.coveragePercent)};">${pct(s.coveragePercent)}</td>
      <td style="padding:10px 12px;text-align:center;font-weight:700;font-size:12px;color:${C.DARK};">${s.weightedScore !== undefined ? `${Math.round(s.weightedScore)}/100` : '—'}</td>
    </tr>`;
  }).join('');

  return `<div class="page">
    ${sharedHeader(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt, 'Internal Commercial Report — Restricted')}

    <div style="display:inline-block;background:${C.RED_BG};border:1px solid ${C.RED_BORDER};border-radius:4px;padding:4px 10px;font-size:10px;font-weight:700;color:${C.RED};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:18px;">
      INTERNAL USE ONLY — NOT FOR CLIENT DISTRIBUTION
    </div>

    <div style="text-align:center;margin-bottom:22px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${C.MUTED};margin-bottom:5px;">Section 1</div>
      <div style="font-size:24px;font-weight:800;color:${C.DARK};letter-spacing:-0.4px;">Executive Summary & Financial Position</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
      <div style="background:${positionBg(pos)};border:2px solid ${positionBorder(pos)};border-radius:10px;padding:20px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${C.MUTED};margin-bottom:6px;">Commercial Position</div>
        <div style="font-size:14px;font-weight:800;color:${positionText(pos)};margin-bottom:${top ? '10px' : '0'};">${positionLabel(pos)}</div>
        ${top ? `<div style="font-size:20px;font-weight:800;color:${C.DARK};">${top.supplierName}</div>
        <div style="font-size:12px;color:${C.MUTED};margin-top:5px;">Quoted: <strong>${fmt(top.adjustedTotal)}</strong> | Projected: <strong>${fmt(top.projectedTotal ?? top.adjustedTotal)}</strong></div>` : ''}
      </div>
      <div style="background:${C.LIGHT_BG};border:1px solid ${C.BORDER};border-radius:10px;padding:20px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:${C.MUTED};margin-bottom:12px;">Key Metrics</div>
        ${[
          ['Score (rank 1)', top?.weightedScore !== undefined ? `${Math.round(top.weightedScore)}/100` : '—'],
          ['Coverage', top ? pct(top.coveragePercent) : '—'],
          ['Risk factors', top ? String(top.riskScore) : '—'],
          ['Variation exposure', top?.variationExposureValue !== undefined ? fmt(top.variationExposureValue) : '—'],
        ].map(([l, v]) => `<div style="padding:7px 0;border-bottom:1px solid ${C.BORDER};">
          <div style="font-size:10px;font-weight:600;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.4px;margin-bottom:2px;">${l}</div>
          <div style="font-size:13px;font-weight:700;color:${C.DARK};">${v}</div>
        </div>`).join('')}
      </div>
    </div>

    <div style="border:1px solid ${C.BORDER};border-radius:10px;overflow:hidden;">
      <div style="background:${C.DARK};padding:10px 12px;">
        <div style="font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.8px;">Full Tender Financial Comparison</div>
      </div>
      <table>
        <thead style="background:${C.LIGHT_BG};">
          <tr>
            ${['Tenderer','Quoted','Projected','Variation ($)','Variation (%)','Risk','Coverage','Score'].map(h =>
              `<th style="padding:9px 12px;text-align:${h==='Tenderer'?'left':(h==='Variation ($)'||h==='Quoted'||h==='Projected'?'right':'center')};font-size:10px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.4px;">${h}</th>`
            ).join('')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    ${sharedFooter('Executive Summary', '1', true)}
  </div>`;
}

function pageRiskAndBehaviour(opts: ReportOptions): string {
  const maxRisk = Math.max(...opts.suppliers.map(s => s.riskScore));

  const cards = opts.suppliers.map(s => {
    const ratio = riskRatio(s.riskScore, maxRisk);
    const tier = s.behaviourRiskTier;
    const tierLabel = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Not assessed';
    const bClass = s.behaviourClass ?? 'Not classified';

    const rationale: string[] = [];
    if (tier === 'low') rationale.push('Unit rate distribution is consistent and competitive', 'Scope coverage aligns with the peer field', 'No adverse pricing patterns identified');
    else if (tier === 'medium') rationale.push('Minor unit rate inconsistencies present across line items', 'Scope coverage broadly in line with peers', 'Standard commercial monitoring recommended');
    else if (tier === 'high') rationale.push('Significant unit rate spread identified across line items', 'Scope coverage gaps indicate potential under-pricing', 'Independent rate validation recommended before award');
    else if (tier === 'critical') rationale.push('Extreme pricing anomalies identified — significant under-pricing risk', 'Substantial scope omissions relative to peers', 'Do not award without formal commercial review and sign-off');
    else rationale.push('Behaviour classification data not available');

    const weaknesses: string[] = [];
    if (s.coveragePercent < 85) weaknesses.push(`Margin recovery via scope variations on ${s.totalItems - s.itemsQuoted} unpriced items`);
    if (tier === 'high' || tier === 'critical') weaknesses.push('Unit rate re-measurement risk on high-spread line items');
    if (s.underallowanceFlag) weaknesses.push('Under-allowance detected — quantity shortfall likely to result in post-contract claims');
    if (s.variationExposurePct !== undefined && s.variationExposurePct > 0.05) weaknesses.push(`Estimated variation exposure of ${pct(s.variationExposurePct * 100)} above quoted total`);
    if (weaknesses.length === 0) weaknesses.push('No specific margin recovery vectors identified');

    return `<div style="border:1px solid ${C.BORDER};border-radius:10px;padding:18px;margin-bottom:14px;break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
        <div>
          <div style="font-size:15px;font-weight:800;color:${C.DARK};">${s.supplierName}</div>
          <div style="font-size:11px;color:${C.MUTED};margin-top:2px;">${bClass} | Risk score: ${s.riskScore} | ${riskLabel(ratio)}</div>
        </div>
        <span style="display:inline-block;padding:4px 10px;border-radius:4px;background:${tierBg(tier)};color:${tierColor(tier)};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${tierLabel} Tier</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;border-top:1px solid ${C.BORDER};padding-top:12px;">
        <div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${C.MUTED};margin-bottom:7px;">Behaviour Classification Rationale</div>
          ${rationale.map(r => `<div style="display:flex;gap:7px;margin-bottom:5px;font-size:12px;color:${C.MID};">
            <span style="color:${tierColor(tier)};font-weight:700;flex-shrink:0;">&#8250;</span>${r}
          </div>`).join('')}
        </div>
        <div style="background:${C.RED_BG};border-left:3px solid ${C.RED};border-radius:0 6px 6px 0;padding:12px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${C.RED};margin-bottom:7px;">Where Supplier May Recover Margin</div>
          ${weaknesses.map(w => `<div style="display:flex;gap:7px;margin-bottom:5px;font-size:12px;color:#7f1d1d;">
            <span style="font-weight:700;flex-shrink:0;">!</span>${w}
          </div>`).join('')}
        </div>
      </div>
    </div>`;
  }).join('');

  return `<div class="page">
    ${sharedHeader(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt, 'Internal Commercial Report — Restricted')}
    ${sectionHeading('2', 'Risk & Behaviour Intelligence')}

    ${infoBox('The following behaviour classifications and margin recovery analysis are based on pricing pattern analysis. They are <strong>not</strong> for client distribution. The risk tier reflects pricing consistency relative to the peer field, not a qualitative assessment of the supplier.', C.RED, C.RED_BG, '#7f1d1d')}

    ${cards}

    ${sharedFooter('Risk & Behaviour Intelligence', '2', true)}
  </div>`;
}

function pageWeaknessMap(opts: ReportOptions): string {
  const rows = opts.suppliers.map(s => {
    const weaknesses: string[] = [];
    if (s.coveragePercent < 80) weaknesses.push(`${s.totalItems - s.itemsQuoted} unpriced scope items (${pct(100 - s.coveragePercent)} of scope)`);
    if (s.underallowanceFlag) weaknesses.push('Quantity under-allowance detected — re-measurement risk');
    if (s.behaviourRiskTier === 'high' || s.behaviourRiskTier === 'critical') weaknesses.push('High unit rate spread — selective pricing risk');
    if (s.variationExposurePct !== undefined && s.variationExposurePct > 0.05) weaknesses.push(`${pct(s.variationExposurePct * 100)} variation exposure above contract sum`);
    if ((s.scopeGaps ?? []).length > 0) weaknesses.push(`${s.scopeGaps!.length} scope gap(s) identified in submission`);
    if (weaknesses.length === 0) weaknesses.push('No specific commercial weakness vectors identified');

    const overallRisk = weaknesses.length >= 3 ? 'High' : weaknesses.length >= 2 ? 'Moderate' : 'Low';
    const rCol = overallRisk === 'High' ? C.RED : overallRisk === 'Moderate' ? C.AMBER : C.GREEN;
    const rBg = overallRisk === 'High' ? C.RED_BG : overallRisk === 'Moderate' ? C.AMBER_BG : C.GREEN_BG;

    return `<tr style="border-bottom:1px solid ${C.BORDER};">
      <td style="padding:12px 13px;font-weight:700;color:${C.DARK};font-size:13px;vertical-align:top;">${s.supplierName}</td>
      <td style="padding:12px 13px;text-align:right;font-weight:700;font-size:13px;vertical-align:top;">${s.variationExposureValue !== undefined ? fmt(s.variationExposureValue) : '—'}</td>
      <td style="padding:12px 13px;vertical-align:top;">
        ${weaknesses.map(w => `<div style="display:flex;gap:8px;margin-bottom:5px;font-size:12px;color:${C.MID};">
          <span style="color:${C.RED};font-weight:700;flex-shrink:0;">&#9654;</span>${w}
        </div>`).join('')}
      </td>
      <td style="padding:12px 13px;text-align:center;vertical-align:top;">
        <span style="display:inline-block;padding:4px 10px;border-radius:4px;background:${rBg};color:${rCol};font-size:10px;font-weight:700;text-transform:uppercase;">${overallRisk}</span>
      </td>
    </tr>`;
  }).join('');

  const qi = opts.quantityIntelligenceSummary;

  return `<div class="page">
    ${sharedHeader(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt, 'Internal Commercial Report — Restricted')}
    ${sectionHeading('3', 'Commercial Weakness Map')}

    ${infoBox('This section identifies the specific vectors through which each tenderer may seek to recover margin post-award. This analysis should inform contract drafting, scope confirmation requirements, and payment schedule design.', C.ORANGE, C.LIGHT_BG, C.MID)}

    <div style="border:1px solid ${C.BORDER};border-radius:10px;overflow:hidden;margin-bottom:22px;">
      <table>
        <thead style="background:${C.DARK};">
          <tr>
            <th style="padding:11px 13px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Tenderer</th>
            <th style="padding:11px 13px;text-align:right;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Exposure Value</th>
            <th style="padding:11px 13px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Commercial Weakness Vectors</th>
            <th style="padding:11px 13px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Overall Risk</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    ${qi ? `<div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:700;color:${C.DARK};margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid ${C.BORDER};">Quantity Intelligence Summary</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px;">
        <div style="background:${qi.linesWithMajorVariance > 0 ? C.RED_BG : C.GREEN_BG};border:1px solid ${qi.linesWithMajorVariance > 0 ? C.RED_BORDER : C.GREEN_BORDER};border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:${qi.linesWithMajorVariance > 0 ? C.RED : C.GREEN};">${qi.linesWithMajorVariance}</div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:${C.MUTED};margin-top:3px;">Major Qty Variances</div>
        </div>
        <div style="background:${qi.linesWithReviewFlag > 0 ? C.AMBER_BG : C.GREEN_BG};border:1px solid ${qi.linesWithReviewFlag > 0 ? C.AMBER_BORDER : C.GREEN_BORDER};border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:${qi.linesWithReviewFlag > 0 ? C.AMBER : C.GREEN};">${qi.linesWithReviewFlag}</div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:${C.MUTED};margin-top:3px;">Lines for Review</div>
        </div>
        <div style="background:${qi.underallowedSupplierNames.length > 0 ? C.RED_BG : C.GREEN_BG};border:1px solid ${qi.underallowedSupplierNames.length > 0 ? C.RED_BORDER : C.GREEN_BORDER};border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:${qi.underallowedSupplierNames.length > 0 ? C.RED : C.GREEN};">${qi.underallowedSupplierNames.length}</div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:${C.MUTED};margin-top:3px;">Under-Allowance Flags</div>
        </div>
      </div>
      ${qi.underallowedSupplierNames.length > 0 ? `<div style="background:${C.RED_BG};border:1px solid ${C.RED_BORDER};border-radius:8px;padding:13px 16px;font-size:12px;color:#7f1d1d;line-height:1.7;">
        <strong>Under-Allowance:</strong> ${qi.underallowedSupplierNames.join(', ')} submitted quantities below the reference baseline. Post-contract re-measurement risk is elevated.
      </div>` : ''}
    </div>` : ''}

    ${sharedFooter('Commercial Weakness Map', '3', true)}
  </div>`;
}

function pageScopeAndQuantityDetail(opts: ReportOptions): string {
  const coverageRows = opts.suppliers.map(s => {
    const barColor = coverageColor(s.coveragePercent);
    const gaps = s.scopeGaps ?? [];
    return `<tr style="border-bottom:1px solid ${C.BORDER};">
      <td style="padding:11px 12px;font-weight:600;color:${C.DARK};font-size:13px;">${s.supplierName}</td>
      <td style="padding:11px 12px;text-align:center;font-weight:700;font-size:13px;color:${barColor};">${pct(s.coveragePercent)}</td>
      <td style="padding:11px 12px;text-align:center;font-size:12px;color:${C.MID};">${s.itemsQuoted} / ${s.totalItems}</td>
      <td style="padding:11px 12px;">
        <div style="background:${C.BORDER};border-radius:3px;height:7px;width:100%;overflow:hidden;">
          <div style="background:${barColor};height:100%;width:${Math.round(s.coveragePercent)}%;border-radius:3px;"></div>
        </div>
      </td>
      <td style="padding:11px 12px;font-size:11px;color:${C.MID};">
        ${gaps.length > 0 ? gaps.slice(0,3).map(g => `<div style="margin-bottom:3px;">&#9654; ${g}</div>`).join('') : `<span style="color:${C.MUTED};">None identified</span>`}
      </td>
    </tr>`;
  }).join('');

  const normRows = opts.suppliers.map(s => {
    const hasNorm = s.normalizedTotal !== undefined;
    const diff = hasNorm ? s.normalizedTotal! - s.adjustedTotal : 0;
    const diffPct = s.adjustedTotal > 0 && hasNorm ? (diff / s.adjustedTotal) * 100 : 0;
    return `<tr style="border-bottom:1px solid ${C.BORDER};">
      <td style="padding:10px 12px;font-weight:600;color:${C.DARK};font-size:13px;">${s.supplierName}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:13px;">${fmt(s.adjustedTotal)}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:13px;color:${hasNorm ? (diff > 0 ? C.RED : C.GREEN) : C.MUTED};">${hasNorm ? fmt(s.normalizedTotal!) : 'Not run'}</td>
      <td style="padding:10px 12px;text-align:center;font-size:12px;color:${Math.abs(diffPct) > 5 ? C.AMBER : C.MUTED};">${hasNorm ? `${diff > 0 ? '+' : ''}${diffPct.toFixed(1)}%` : '—'}</td>
      <td style="padding:10px 12px;text-align:center;">
        ${s.underallowanceFlag
          ? `<span style="display:inline-block;padding:3px 8px;border-radius:4px;background:${C.RED_BG};color:${C.RED};font-size:10px;font-weight:700;text-transform:uppercase;">Flagged</span>`
          : `<span style="display:inline-block;padding:3px 8px;border-radius:4px;background:${C.GREEN_BG};color:${C.GREEN};font-size:10px;font-weight:700;text-transform:uppercase;">Clear</span>`}
      </td>
    </tr>`;
  }).join('');

  return `<div class="page">
    ${sharedHeader(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt, 'Internal Commercial Report — Restricted')}
    ${sectionHeading('4', 'Scope & Quantity Detail')}

    <div style="font-size:13px;font-weight:700;color:${C.DARK};margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid ${C.BORDER};">Scope Coverage & Gap Analysis</div>
    <div style="border:1px solid ${C.BORDER};border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <table>
        <thead style="background:${C.DARK};">
          <tr>
            <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Tenderer</th>
            <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Coverage</th>
            <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Items Priced</th>
            <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Bar</th>
            <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Scope Gaps</th>
          </tr>
        </thead>
        <tbody>${coverageRows}</tbody>
      </table>
    </div>

    <div style="font-size:13px;font-weight:700;color:${C.DARK};margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid ${C.BORDER};">Quantity Intelligence — Normalised Comparison</div>
    <div style="border:1px solid ${C.BORDER};border-radius:10px;overflow:hidden;margin-bottom:16px;">
      <table>
        <thead style="background:${C.DARK};">
          <tr>
            <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Tenderer</th>
            <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Submitted</th>
            <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Normalised</th>
            <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Adj %</th>
            <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Under-Allowance</th>
          </tr>
        </thead>
        <tbody>${normRows}</tbody>
      </table>
    </div>

    ${infoBox('Normalised totals re-price each tenderer against a common reference quantity set. A positive adjustment (red) indicates the tenderer allowed fewer quantities than the reference — increasing the risk of post-contract claims.', C.BLUE, C.BLUE_BG, '#1e3a8a')}

    ${sharedFooter('Scope & Quantity Detail', '4', true)}
  </div>`;
}

function pageFinalPositionAndControls(opts: ReportOptions): string {
  const top = opts.suppliers[0];
  const pos = top?.recommendationStatus ?? 'no_recommendation';
  const isProvisional = pos === 'provisional' || pos === 'narrow_margin';
  const isFinal = pos === 'recommended';
  const noRec = pos === 'no_recommendation';
  const weights = opts.scoringWeights ?? { price: 45, compliance: 20, coverage: 25, risk: 10 };

  const controls = opts.commercialControlsRequired ?? (isProvisional
    ? ['Independent scope verification for tenderers below 80% coverage', 'Unit rate reconciliation against current market benchmarks', 'Confirm quantity allowances against design documentation', 'Resolve all scope gaps prior to contract execution', 'Board or client approval required per governance framework']
    : ['Execute contract documents in line with approved form', 'Issue unsuccessful tenderer notifications per procurement policy', 'Retain tender documentation for audit trail', 'Confirm insurance and bond requirements prior to mobilisation', 'Log award in project financial management system']);

  return `<div class="page">
    ${sharedHeader(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt, 'Internal Commercial Report — Restricted')}
    ${sectionHeading('5', 'Final Position & Commercial Controls')}

    <div style="background:${positionBg(pos)};border:2px solid ${positionBorder(pos)};border-radius:10px;padding:20px;margin-bottom:18px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${positionText(pos)};margin-bottom:5px;">Internal Commercial Position</div>
      <div style="font-size:20px;font-weight:800;color:${positionText(pos)};margin-bottom:${top ? '8px' : '0'};">${positionLabel(pos)}</div>
      ${top && !noRec ? `<div style="font-size:17px;font-weight:700;color:${C.DARK};">${top.supplierName}</div>` : ''}
    </div>

    <div style="background:${C.LIGHT_BG};border-left:4px solid ${C.ORANGE};border-radius:0 8px 8px 0;padding:15px 19px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${C.MUTED};margin-bottom:7px;">Scoring Weights Applied</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;font-size:13px;color:${C.MID};">
        <div><strong>Price:</strong> ${weights.price}%</div>
        <div><strong>Coverage:</strong> ${weights.coverage}%</div>
        <div><strong>Compliance:</strong> ${weights.compliance}%</div>
        <div><strong>Risk:</strong> ${weights.risk}%</div>
      </div>
    </div>

    <div style="background:${isProvisional ? C.AMBER_BG : isFinal ? C.GREEN_BG : C.RED_BG};border:1px solid ${isProvisional ? C.AMBER_BORDER : isFinal ? C.GREEN_BORDER : C.RED_BORDER};border-radius:8px;padding:14px 18px;margin-bottom:18px;font-size:12px;color:${isProvisional ? '#78350f' : isFinal ? '#14532d' : '#7f1d1d'};line-height:1.7;">
      <strong>${isFinal ? 'Final Status:' : isProvisional ? 'Provisional Status:' : 'Notice:'}</strong>
      ${isFinal ? 'This is a final recommendation. All scoring gates satisfied. Cleared for contract execution.'
        : isProvisional ? 'Provisional position only. Conditions below must be satisfied before proceeding to award.'
        : noRec ? 'No recommendation issued. Unresolved conditions prevent a defensible commercial position.'
        : 'Commercial position under active review.'}
    </div>

    <div style="border:1px solid ${C.BORDER};border-radius:10px;overflow:hidden;margin-bottom:18px;">
      <div style="background:${C.DARK};padding:10px 13px;">
        <div style="font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.8px;">Commercial Controls Required</div>
      </div>
      ${controls.map((c, i) => `<div style="display:flex;gap:12px;padding:12px 15px;border-bottom:${i < controls.length - 1 ? `1px solid ${C.BORDER}` : 'none'};background:${i % 2 === 0 ? 'white' : C.LIGHT_BG};">
        <div style="width:24px;height:24px;border-radius:5px;background:${C.DARK};color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</div>
        <div style="font-size:13px;color:${C.MID};line-height:1.6;padding-top:2px;">${c}</div>
      </div>`).join('')}
    </div>

    ${opts.approvalRecord ? `<div style="background:${opts.approvalRecord.is_override ? C.AMBER_BG : C.GREEN_BG};border:2px solid ${opts.approvalRecord.is_override ? C.AMBER_BORDER : C.GREEN_BORDER};border-radius:8px;padding:16px 20px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:${C.MUTED};margin-bottom:10px;">Approval Trace</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:12px;color:${C.MID};">
        <div><strong>AI Recommended:</strong> ${opts.approvalRecord.ai_recommended_supplier}</div>
        <div><strong>Final Approved:</strong> ${opts.approvalRecord.final_approved_supplier}</div>
        <div><strong>Approved By:</strong> ${opts.approvalRecord.approved_by_email}</div>
        <div><strong>Timestamp:</strong> ${new Date(opts.approvalRecord.approved_at).toLocaleString('en-AU')}</div>
        ${opts.approvalRecord.is_override ? `<div style="color:${C.AMBER};font-weight:600;grid-column:span 2;">Override Category: ${opts.approvalRecord.override_reason_category?.replace(/_/g, ' ') ?? 'N/A'}</div>
        <div style="grid-column:span 2;color:${C.MID};">Override Detail: ${opts.approvalRecord.override_reason_detail ?? 'Not provided'}</div>` : ''}
      </div>
    </div>` : ''}

    ${sharedFooter('Final Position & Controls', '5', true)}
  </div>`;
}

export function generateInternalReport(opts: ReportOptions): string {
  const body = [
    pageExecutiveAndFinancial(opts),
    pageRiskAndBehaviour(opts),
    pageWeaknessMap(opts),
    pageScopeAndQuantityDetail(opts),
    pageFinalPositionAndControls(opts),
  ].join('\n');

  return htmlWrap(
    `Internal Commercial Report — ${opts.projectName}`,
    baseStyles('screen'),
    body,
  );
}

export function openInternalReport(opts: ReportOptions, filename: string): void {
  openPrintWindow(generateInternalReport(opts), filename);
}
