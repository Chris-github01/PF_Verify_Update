/**
 * CLIENT MODE Report Template
 *
 * Audience: Client, principal, owner's representative.
 * Tone: Professional, plain-English, commercially focused.
 *
 * What is shown:
 *   - Executive decision and recommended position
 *   - High-level financial summary (quoted totals, variation exposure)
 *   - Scope coverage summary (no internal gap details)
 *   - High-level risk classification (no behaviour tier labels)
 *   - Final recommendation and next steps
 *
 * What is hidden:
 *   - Behaviour classification labels ("Unreliable", "High tier" etc.)
 *   - Quantity intelligence detail tables
 *   - Internal scoring weights breakdown
 *   - Specific scope gap text
 *   - Under-allowance flags
 *
 * Language replacements applied here (no logic changes):
 *   "Unreliable" → "Requires commercial controls"
 *   "Missing scope" → "Scope clarification required"
 *   "High risk tier" → "Additional controls recommended"
 *   "Under-allowance" → "Quantity alignment required"
 *
 * IMPORTANT: This file contains NO calculation logic.
 * All input values are pre-computed by the existing scoring engines.
 */

import type { ReportOptions } from './reportTypes';
import {
  C, fmt, pct, riskRatio, riskColor, riskLabel, coverageColor,
  positionLabel, positionBg, positionBorder, positionText,
  sharedHeader, sharedFooter, sectionHeading, infoBox,
  baseStyles, htmlWrap, openPrintWindow,
} from './reportShared';

function clientRiskLabel(ratio: number): string {
  if (ratio < 0.3) return 'Standard';
  if (ratio < 0.6) return 'Elevated — Controls Recommended';
  return 'Requires Commercial Controls';
}

function clientRiskColor(ratio: number): string {
  if (ratio < 0.3) return C.GREEN;
  if (ratio < 0.6) return C.AMBER;
  return C.RED;
}

function clientScopeNote(coveragePct: number): string {
  if (coveragePct >= 85) return 'Scope fully addressed';
  if (coveragePct >= 70) return 'Scope clarification required on minor items';
  return 'Scope clarification required — some items require follow-up';
}

function pageExecutiveDecision(opts: ReportOptions): string {
  const top = opts.suppliers[0];
  const maxRisk = Math.max(...opts.suppliers.map(s => s.riskScore));
  const pos = top?.recommendationStatus ?? 'no_recommendation';
  const confidence = top?.weightedScore !== undefined ? Math.round(top.weightedScore) : undefined;

  const snapshotRows = opts.suppliers.slice(0, 5).map(s => {
    const proj = s.projectedTotal ?? s.adjustedTotal;
    const ratio = riskRatio(s.riskScore, maxRisk);
    return `<tr style="border-bottom:1px solid ${C.BORDER};">
      <td style="padding:10px 12px;font-weight:600;color:${C.DARK};font-size:13px;">${s.supplierName}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:13px;color:${C.DARK};">${fmt(s.adjustedTotal)}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:13px;color:${proj !== s.adjustedTotal ? C.AMBER : C.GREEN};">${fmt(proj)}</td>
      <td style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:${clientRiskColor(ratio)};">${clientRiskLabel(ratio)}</td>
      <td style="padding:10px 12px;text-align:center;">
        <span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;background:${s.rank === 1 ? C.GREEN_BG : C.LIGHT_BG};color:${s.rank === 1 ? C.GREEN : C.MUTED};">${s.rank === 1 ? 'Leader' : `#${s.rank}`}</span>
      </td>
    </tr>`;
  }).join('');

  const drivers = opts.keyDecisionDrivers ?? top?.notes ?? [];

  return `<div class="page">
    ${sharedHeader(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt, 'Commercial Recommendation — Client Report')}

    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${C.MUTED};margin-bottom:5px;">Section 1</div>
      <div style="font-size:26px;font-weight:800;color:${C.DARK};letter-spacing:-0.4px;">Executive Decision</div>
      <div style="font-size:13px;color:${C.MUTED};margin-top:4px;">${opts.suppliers.length} tenderer${opts.suppliers.length !== 1 ? 's' : ''} evaluated</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px;">
      <div style="background:${positionBg(pos)};border:2px solid ${positionBorder(pos)};border-radius:10px;padding:22px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${C.MUTED};margin-bottom:7px;">Commercial Position</div>
        <div style="font-size:15px;font-weight:800;color:${positionText(pos)};margin-bottom:${top ? '12px' : '0'};">${positionLabel(pos)}</div>
        ${top ? `<div style="font-size:22px;font-weight:800;color:${C.DARK};">${top.supplierName}</div>
        <div style="font-size:12px;color:${C.MUTED};margin-top:5px;">Recommended quoted total: <strong style="color:${C.DARK};">${fmt(top.adjustedTotal)}</strong></div>` : ''}
      </div>
      <div style="background:${C.LIGHT_BG};border:1px solid ${C.BORDER};border-radius:10px;padding:22px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${C.MUTED};margin-bottom:14px;">Summary</div>
        <div style="padding:8px 0;border-bottom:1px solid ${C.BORDER};">
          <div style="font-size:10px;font-weight:600;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px;">Scope Addressed</div>
          <div style="font-size:14px;font-weight:700;color:${top && top.coveragePercent >= 85 ? C.GREEN : C.AMBER};">${top ? pct(top.coveragePercent) : '—'}</div>
        </div>
        ${confidence !== undefined ? `<div style="padding:8px 0;border-bottom:1px solid ${C.BORDER};">
          <div style="font-size:10px;font-weight:600;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px;">Assessment Confidence</div>
          <div style="font-size:14px;font-weight:700;color:${confidence >= 70 ? C.GREEN : confidence >= 50 ? C.AMBER : C.RED};">${confidence}/100</div>
        </div>` : ''}
        <div style="padding:8px 0;">
          <div style="font-size:10px;font-weight:600;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px;">Commercial Risk Level</div>
          <div style="font-size:14px;font-weight:700;color:${top ? clientRiskColor(riskRatio(top.riskScore, Math.max(...opts.suppliers.map(s => s.riskScore)))) : C.MUTED};">${top ? clientRiskLabel(riskRatio(top.riskScore, Math.max(...opts.suppliers.map(s => s.riskScore)))) : '—'}</div>
        </div>
      </div>
    </div>

    ${drivers.length > 0 ? `<div style="background:${C.LIGHT_BG};border:1px solid ${C.BORDER};border-radius:10px;padding:18px;margin-bottom:18px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${C.MUTED};margin-bottom:10px;">Basis of Recommendation</div>
      <ul style="list-style:none;padding:0;margin:0;">
        ${drivers.slice(0, 5).map(d => `<li style="display:flex;gap:10px;align-items:flex-start;margin-bottom:7px;font-size:13px;color:${C.MID};">
          <span style="width:15px;height:15px;background:${C.ORANGE};color:white;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0;margin-top:2px;">&#10003;</span>
          <span>${d}</span>
        </li>`).join('')}
      </ul>
    </div>` : ''}

    ${opts.commercialWarning ? `<div style="background:${C.AMBER_BG};border:2px solid ${C.AMBER_BORDER};border-radius:8px;padding:14px 18px;margin-bottom:18px;font-size:12px;color:#78350f;line-height:1.7;">
      <strong>Commercial Note:</strong> ${opts.commercialWarning}
    </div>` : ''}

    <div style="border:1px solid ${C.BORDER};border-radius:10px;overflow:hidden;">
      <div style="background:${C.DARK};padding:11px 13px;">
        <div style="font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.8px;">Tender Financial Overview</div>
      </div>
      <table>
        <thead style="background:${C.LIGHT_BG};">
          <tr>
            <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.5px;">Tenderer</th>
            <th style="padding:9px 12px;text-align:right;font-size:10px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.5px;">Quoted Total</th>
            <th style="padding:9px 12px;text-align:right;font-size:10px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.5px;">Projected Final</th>
            <th style="padding:9px 12px;text-align:center;font-size:10px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.5px;">Risk Level</th>
            <th style="padding:9px 12px;text-align:center;font-size:10px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.5px;">Standing</th>
          </tr>
        </thead>
        <tbody>${snapshotRows}</tbody>
      </table>
    </div>

    ${sharedFooter('Executive Decision', '1', false)}
  </div>`;
}

function pageCommercialSummary(opts: ReportOptions): string {
  const maxRisk = Math.max(...opts.suppliers.map(s => s.riskScore));
  const weights = opts.scoringWeights ?? { price: 45, compliance: 20, coverage: 25, risk: 10 };

  const rows = opts.suppliers.map(s => {
    const ratio = riskRatio(s.riskScore, maxRisk);
    const isTop = s.rank === 1;
    return `<tr style="border-bottom:1px solid ${C.BORDER};${isTop ? `background:linear-gradient(90deg,${C.GREEN_BG} 0%,transparent 50%);` : ''}">
      <td style="padding:11px 13px;font-weight:700;color:${C.DARK};font-size:13px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:24px;height:24px;border-radius:5px;background:${isTop ? C.GREEN : '#e5e7eb'};color:${isTop ? 'white' : C.MID};font-size:10px;font-weight:700;text-align:center;line-height:24px;flex-shrink:0;">${s.rank}</span>
          <span>${s.supplierName}</span>
        </div>
      </td>
      <td style="padding:11px 13px;text-align:right;font-weight:700;font-size:13px;color:${C.DARK};">${fmt(s.adjustedTotal)}</td>
      <td style="padding:11px 13px;text-align:center;font-weight:600;font-size:12px;color:${coverageColor(s.coveragePercent)};">${clientScopeNote(s.coveragePercent)}</td>
      <td style="padding:11px 13px;text-align:center;font-weight:600;font-size:12px;color:${clientRiskColor(ratio)};">${clientRiskLabel(ratio)}</td>
      <td style="padding:11px 13px;text-align:center;font-weight:700;font-size:13px;color:${C.DARK};">${s.weightedScore !== undefined ? `${Math.round(s.weightedScore)}/100` : '—'}</td>
    </tr>`;
  }).join('');

  return `<div class="page">
    ${sharedHeader(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt, 'Commercial Recommendation — Client Report')}
    ${sectionHeading('2', 'Commercial Comparison')}

    ${infoBox(`Assessment weighting: Price <strong>${weights.price}%</strong>, Scope Coverage <strong>${weights.coverage}%</strong>, Compliance <strong>${weights.compliance}%</strong>, Risk <strong>${weights.risk}%</strong>.`, C.ORANGE, C.LIGHT_BG, C.MID)}

    <div style="border:1px solid ${C.BORDER};border-radius:10px;overflow:hidden;margin-bottom:22px;">
      <table>
        <thead style="background:${C.DARK};">
          <tr>
            <th style="padding:11px 13px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Tenderer</th>
            <th style="padding:11px 13px;text-align:right;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Quoted Total</th>
            <th style="padding:11px 13px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Scope Status</th>
            <th style="padding:11px 13px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Risk Level</th>
            <th style="padding:11px 13px;text-align:center;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.5px;">Assessment Score</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
      ${opts.recommendations.slice(0, 3).map(rec => {
        const labels: Record<string, string> = { best_value: 'Best Value', lowest_risk: 'Lowest Risk', balanced: 'Balanced' };
        const colors: Record<string, string> = { best_value: C.GREEN, lowest_risk: C.BLUE, balanced: C.ORANGE };
        const bgs: Record<string, string> = { best_value: C.GREEN_BG, lowest_risk: C.BLUE_BG, balanced: '#fff7ed' };
        const col = colors[rec.type] ?? C.ORANGE;
        const bg = bgs[rec.type] ?? C.LIGHT_BG;
        return `<div style="background:${bg};border:2px solid ${col}33;border-radius:10px;padding:16px;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${col};margin-bottom:6px;">${labels[rec.type] ?? rec.type}</div>
          <div style="font-size:15px;font-weight:800;color:${C.DARK};margin-bottom:10px;">${rec.supplierName}</div>
          <div style="font-size:12px;color:${C.MID};">
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid ${C.BORDER};"><span>Quoted</span><strong>${fmt(rec.price)}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid ${C.BORDER};"><span>Coverage</span><strong>${pct(rec.coverage)}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Score</span><strong style="color:${col};">${Math.round(rec.score)}/100</strong></div>
          </div>
        </div>`;
      }).join('')}
    </div>

    ${sharedFooter('Commercial Comparison', '2', false)}
  </div>`;
}

function pageRecommendationAndNextSteps(opts: ReportOptions): string {
  const top = opts.suppliers[0];
  const pos = top?.recommendationStatus ?? 'no_recommendation';
  const isProvisional = pos === 'provisional' || pos === 'narrow_margin';
  const isFinal = pos === 'recommended';
  const noRec = pos === 'no_recommendation';

  const statusText = isFinal
    ? 'This recommendation is issued on a final basis. The assessment is complete and supports proceeding to contract award with the identified tenderer.'
    : isProvisional
    ? 'This is a provisional recommendation. One or more items require resolution before contract award can proceed. See below for required actions.'
    : noRec
    ? 'A commercial recommendation cannot be issued at this stage. Further information is required from one or more tenderers before a position can be established.'
    : 'Commercial assessment is ongoing. Contact your project commercial representative for the current position.';

  const controls = opts.commercialControlsRequired ?? (isProvisional
    ? ['Resolve scope clarification items identified in the assessment', 'Confirm quantity allowances with tenderer prior to award', 'Obtain client approval in accordance with project governance requirements']
    : ['Execute contract documents with the recommended tenderer', 'Issue outcome notifications to all participating tenderers', 'Retain tender documentation in accordance with record-keeping requirements']);

  const execText = opts.executiveSummary ?? (top
    ? `Commercial assessment of ${opts.suppliers.length} tenderer${opts.suppliers.length !== 1 ? 's' : ''} was conducted. ${top.supplierName} was assessed as presenting the strongest commercial position with a quoted total of ${fmt(top.adjustedTotal)} and scope coverage of ${pct(top.coveragePercent)}.`
    : `Commercial assessment completed for ${opts.suppliers.length} tenderer${opts.suppliers.length !== 1 ? 's' : ''}.`);

  return `<div class="page">
    ${sharedHeader(opts.organisationLogoUrl, opts.projectName, opts.clientName, opts.generatedAt, 'Commercial Recommendation — Client Report')}
    ${sectionHeading('3', 'Recommendation & Next Steps')}

    <div style="background:${positionBg(pos)};border:2px solid ${positionBorder(pos)};border-radius:12px;padding:22px;margin-bottom:20px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${positionText(pos)};margin-bottom:5px;">Commercial Position</div>
      <div style="font-size:20px;font-weight:800;color:${positionText(pos)};margin-bottom:${top ? '8px' : '0'};">${positionLabel(pos)}</div>
      ${top && !noRec ? `<div style="font-size:17px;font-weight:700;color:${C.DARK};">${top.supplierName}</div>` : ''}
    </div>

    <div style="background:${C.LIGHT_BG};border-left:4px solid ${C.ORANGE};border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:18px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${C.MUTED};margin-bottom:7px;">Assessment Summary</div>
      <p style="font-size:13px;color:${C.MID};line-height:1.8;margin:0;">${execText}</p>
    </div>

    <div style="background:${isProvisional ? C.AMBER_BG : isFinal ? C.GREEN_BG : C.RED_BG};border:1px solid ${isProvisional ? C.AMBER_BORDER : isFinal ? C.GREEN_BORDER : C.RED_BORDER};border-radius:8px;padding:14px 18px;margin-bottom:20px;font-size:12px;color:${isProvisional ? '#78350f' : isFinal ? '#14532d' : '#7f1d1d'};line-height:1.7;">
      <strong>${isFinal ? 'Status:' : isProvisional ? 'Provisional Status:' : 'Notice:'}</strong> ${statusText}
    </div>

    <div style="border:1px solid ${C.BORDER};border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <div style="background:${C.DARK};padding:10px 13px;">
        <div style="font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.8px;">Required Actions</div>
      </div>
      ${controls.map((c, i) => `<div style="display:flex;gap:13px;padding:13px 16px;border-bottom:${i < controls.length - 1 ? `1px solid ${C.BORDER}` : 'none'};background:${i % 2 === 0 ? 'white' : C.LIGHT_BG};">
        <div style="width:26px;height:26px;border-radius:5px;background:${C.DARK};color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</div>
        <div style="font-size:13px;color:${C.MID};line-height:1.6;padding-top:2px;">${c}</div>
      </div>`).join('')}
    </div>

    ${opts.approvalRecord ? `<div style="background:${opts.approvalRecord.is_override ? C.AMBER_BG : C.GREEN_BG};border:2px solid ${opts.approvalRecord.is_override ? C.AMBER_BORDER : C.GREEN_BORDER};border-radius:8px;padding:16px 20px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${C.MUTED};margin-bottom:10px;">Approval Record</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:13px;color:${C.MID};">
        <div><strong>Approved Tenderer:</strong> ${opts.approvalRecord.final_approved_supplier}</div>
        <div><strong>Approved By:</strong> ${opts.approvalRecord.approved_by_email}</div>
        <div><strong>Approval Date:</strong> ${new Date(opts.approvalRecord.approved_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        ${opts.approvalRecord.is_override ? `<div style="color:${C.AMBER};font-weight:600;">Note: Commercial override applied</div>` : ''}
      </div>
    </div>` : ''}

    <div style="background:${C.DARK};border-radius:8px;padding:14px 18px;font-size:11px;color:#9ca3af;line-height:1.7;text-align:center;margin-top:8px;">
      This report is prepared by VerifyTrade. It is based on submitted tender data and does not constitute legal or financial advice.
      Prepared for: ${opts.clientName ?? opts.projectName}
    </div>

    ${sharedFooter('Recommendation & Next Steps', '3', false)}
  </div>`;
}

export function generateClientReport(opts: ReportOptions): string {
  const body = [
    pageExecutiveDecision(opts),
    pageCommercialSummary(opts),
    pageRecommendationAndNextSteps(opts),
  ].join('\n');

  return htmlWrap(
    `Commercial Recommendation — ${opts.projectName}`,
    baseStyles('screen'),
    body,
  );
}

export function openClientReport(opts: ReportOptions, filename: string): void {
  openPrintWindow(generateClientReport(opts), filename);
}
