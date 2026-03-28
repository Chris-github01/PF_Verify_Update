/**
 * CLIENT MODE — Gold Standard Award Report Template
 *
 * Audience: Client, principal, director, QS team, Tier 1 contractor.
 * Tone: Commercially authoritative, concise, premium, defensible.
 *
 * Report States (mutually exclusive):
 *   STATE A — FINAL AWARD REPORT
 *     Triggers: approvalRecord present with final_approved_supplier
 *     Shows: Final Award header, approved supplier, decision summary, approval trace
 *     Suppresses: pre-award wording, "No Recommendation Issued"
 *
 *   STATE B — COMMERCIAL RECOMMENDATION (Pre-Award)
 *     Triggers: no approvalRecord, top supplier exists with defensible recommendation
 *     Shows: Recommended supplier, commercial position, drivers, controls
 *     Suppresses: final award wording, approval trace
 *
 *   STATE C — ANALYSIS INCOMPLETE / DRAFT
 *     Triggers: no suppliers or recommendation is not defensible
 *     Shows: Draft notice only, internal-use wording
 *     Suppresses: all award/recommendation language
 *
 * IMPORTANT: This file contains NO calculation logic.
 * All input values are pre-computed by the existing scoring engines.
 */

import type { ReportOptions, ReportSupplierRow } from './reportTypes';
import {
  C, fmt, pct, riskRatio,
  sharedHeader, sharedFooter, baseStyles, htmlWrap, openPrintWindow,
} from './reportShared';

// ─── Report State Determination ───────────────────────────────────────────────

type ClientReportState = 'FINAL_AWARD' | 'RECOMMENDATION' | 'DRAFT';

function determineReportState(opts: ReportOptions): ClientReportState {
  if (opts.approvalRecord?.final_approved_supplier) return 'FINAL_AWARD';
  const top = opts.suppliers[0];
  if (
    top &&
    opts.suppliers.length >= 1 &&
    (top.recommendationStatus === 'recommended' ||
      top.recommendationStatus === 'narrow_margin' ||
      top.recommendationStatus === 'provisional')
  ) {
    return 'RECOMMENDATION';
  }
  return 'DRAFT';
}

// ─── Risk Vocabulary (client-safe) ────────────────────────────────────────────

function clientRiskLabel(ratio: number): string {
  if (ratio < 0.3) return 'Acceptable';
  if (ratio < 0.6) return 'Elevated — Controls Required';
  return 'High — Commercial Controls Required';
}

function clientRiskColor(ratio: number): string {
  if (ratio < 0.3) return C.GREEN;
  if (ratio < 0.6) return C.AMBER;
  return C.RED;
}

function clientRiskBg(ratio: number): string {
  if (ratio < 0.3) return C.GREEN_BG;
  if (ratio < 0.6) return C.AMBER_BG;
  return C.RED_BG;
}

function scopeCoverageNote(coveragePct: number): string {
  if (coveragePct >= 90) return 'Complete';
  if (coveragePct >= 80) return 'Complete — minor clarification';
  if (coveragePct >= 65) return 'Partial — clarification required';
  return 'Incomplete — significant scope gaps';
}

function supplierStatusLabel(s: ReportSupplierRow, isApproved: boolean, state: ClientReportState): string {
  if (isApproved && state === 'FINAL_AWARD') return 'Approved';
  if (s.rank === 1 && state === 'RECOMMENDATION') return 'Recommended';
  const maxRisk = 1;
  const ratio = riskRatio(s.riskScore, maxRisk);
  if (ratio >= 0.6) return 'Higher Risk';
  return 'Not Selected';
}

function supplierStatusColor(s: ReportSupplierRow, isApproved: boolean, state: ClientReportState): string {
  if (isApproved && state === 'FINAL_AWARD') return C.GREEN;
  if (s.rank === 1 && state === 'RECOMMENDATION') return C.GREEN;
  if (s.riskScore > 0) {
    const ratio = riskRatio(s.riskScore, Math.max(1, s.riskScore));
    if (ratio >= 0.6) return C.RED;
  }
  return C.MUTED;
}

function commercialInterpretation(s: ReportSupplierRow, maxRisk: number, state: ClientReportState): string {
  const ratio = riskRatio(s.riskScore, maxRisk);
  if (s.rank === 1) {
    if (state === 'FINAL_AWARD') return 'Approved — strongest overall commercial position';
    if (ratio < 0.3) return 'Commercially preferred tenderer — acceptable risk profile';
    if (ratio < 0.6) return 'Commercially preferred with elevated scope risk to be managed by controls';
    return 'Commercially preferred — commercial controls required before award';
  }
  if (ratio >= 0.6) return 'Higher risk profile relative to evaluated field';
  if (s.coveragePercent < 75) return 'Competitive price — incomplete scope coverage';
  return 'Competitive but not the leading commercial position';
}

// ─── Shared Design Tokens ─────────────────────────────────────────────────────

const BRAND = '#1e293b';
const BRAND_ACCENT = '#f97316';
const GOLD = '#92400e';
const GOLD_BG = '#fffbeb';
const GOLD_BORDER = '#fbbf24';

// ─── Cover / Page 1 — Executive Decision ──────────────────────────────────────

function pageCoverDecision(opts: ReportOptions, state: ClientReportState): string {
  const approvedName = opts.approvalRecord?.final_approved_supplier ?? null;
  const top = opts.suppliers[0];
  const anchor = state === 'FINAL_AWARD'
    ? (opts.suppliers.find(s => s.supplierName === approvedName) ?? top)
    : top;

  const reportTitle = state === 'FINAL_AWARD'
    ? 'FINAL AWARD RECOMMENDATION'
    : state === 'RECOMMENDATION'
    ? 'COMMERCIAL RECOMMENDATION'
    : 'COMMERCIAL ANALYSIS — DRAFT';

  const reportSubtitle = 'Project commercial adjudication summary prepared by VerifyTrade';

  const maxRisk = Math.max(1, ...opts.suppliers.map(s => s.riskScore));

  const anchorRatio = anchor ? riskRatio(anchor.riskScore, maxRisk) : 0;
  const tenderCount = opts.suppliers.length;
  const scopePct = anchor?.coveragePercent ?? 0;
  const approvalDate = opts.approvalRecord?.approved_at
    ? new Date(opts.approvalRecord.approved_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const drivers = (opts.keyDecisionDrivers ?? anchor?.notes ?? []).slice(0, 5);

  const isOverride = opts.approvalRecord?.is_override ?? false;

  const mainPanelBg = state === 'FINAL_AWARD'
    ? `linear-gradient(135deg, #064e3b 0%, #065f46 100%)`
    : state === 'RECOMMENDATION'
    ? `linear-gradient(135deg, ${BRAND} 0%, #334155 100%)`
    : `linear-gradient(135deg, #1f2937 0%, #374151 100%)`;

  const statusPillText = state === 'FINAL_AWARD'
    ? 'FINAL AWARD APPROVED'
    : state === 'RECOMMENDATION'
    ? 'COMMERCIAL RECOMMENDATION'
    : 'DRAFT — INTERNAL USE ONLY';

  const statusPillBg = state === 'FINAL_AWARD' ? C.GREEN : state === 'RECOMMENDATION' ? BRAND_ACCENT : C.MUTED;

  const snapshotRows = opts.suppliers.slice(0, 6).map((s, i) => {
    const ratio = riskRatio(s.riskScore, maxRisk);
    const isAnchor = state === 'FINAL_AWARD'
      ? s.supplierName === approvedName
      : s.rank === 1;
    const statusText = supplierStatusLabel(s, s.supplierName === approvedName, state);
    const statusCol = supplierStatusColor(s, s.supplierName === approvedName, state);
    const proj = s.projectedTotal;
    const showProj = proj !== undefined && proj !== s.adjustedTotal;
    return `<tr style="border-bottom:1px solid ${C.BORDER};${isAnchor ? `background:${state === 'FINAL_AWARD' ? '#ecfdf5' : '#f0f9ff'};` : i % 2 === 1 ? `background:${C.LIGHT_BG};` : ''}">
      <td style="padding:11px 14px;">
        <div style="display:flex;align-items:center;gap:9px;">
          ${isAnchor ? `<span style="width:6px;height:36px;background:${state === 'FINAL_AWARD' ? C.GREEN : BRAND_ACCENT};border-radius:3px;flex-shrink:0;"></span>` : `<span style="width:6px;height:36px;flex-shrink:0;"></span>`}
          <div>
            <div style="font-size:13px;font-weight:700;color:${C.DARK};">${s.supplierName}</div>
            ${isAnchor ? `<div style="font-size:10px;font-weight:600;color:${state === 'FINAL_AWARD' ? C.GREEN : BRAND_ACCENT};text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">${statusPillText.replace('FINAL AWARD APPROVED', 'AWARDED').replace('COMMERCIAL RECOMMENDATION', 'RECOMMENDED')}</div>` : ''}
          </div>
        </div>
      </td>
      <td style="padding:11px 14px;text-align:right;">
        <div style="font-size:14px;font-weight:700;color:${C.DARK};">${fmt(s.adjustedTotal)}</div>
        ${showProj ? `<div style="font-size:10px;color:${C.AMBER};margin-top:2px;">Projected: ${fmt(proj!)}</div>` : ''}
      </td>
      <td style="padding:11px 14px;text-align:center;font-size:12px;font-weight:600;color:${clientRiskColor(ratio)};">${clientRiskLabel(ratio)}</td>
      <td style="padding:11px 14px;text-align:center;">
        <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;color:${statusCol};background:${statusCol}18;border:1px solid ${statusCol}33;">${statusText}</span>
      </td>
    </tr>`;
  }).join('');

  return `<div class="page">
    <header style="display:flex;justify-content:space-between;align-items:center;padding-bottom:18px;margin-bottom:32px;border-bottom:3px solid ${BRAND_ACCENT};">
      ${opts.organisationLogoUrl
        ? `<img src="${opts.organisationLogoUrl}" alt="Logo" style="height:44px;object-fit:contain;" />`
        : `<div style="display:flex;align-items:center;gap:10px;">
            <div style="width:40px;height:40px;background:linear-gradient(135deg,${BRAND_ACCENT} 0%,#ea580c 100%);border-radius:9px;display:flex;align-items:center;justify-content:center;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span style="font-size:18px;font-weight:800;color:${BRAND};">VerifyTrade</span>
          </div>`}
      <div style="text-align:right;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${C.MUTED};">Client Award Report</div>
        <div style="font-size:13px;font-weight:700;color:${C.DARK};margin-top:3px;">${opts.projectName}</div>
        ${opts.clientName ? `<div style="font-size:11px;color:${C.MUTED};margin-top:2px;">${opts.clientName}</div>` : ''}
        <div style="font-size:11px;color:${C.MUTED};margin-top:3px;">Prepared ${new Date(opts.generatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      </div>
    </header>

    <div style="background:${mainPanelBg};border-radius:14px;padding:36px 40px;margin-bottom:28px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-40px;right:-40px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,0.04);"></div>
      <div style="position:absolute;bottom:-60px;left:-30px;width:240px;height:240px;border-radius:50%;background:rgba(255,255,255,0.03);"></div>
      <div style="position:relative;">
        <div style="display:inline-block;background:${statusPillBg};color:white;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:4px 12px;border-radius:20px;margin-bottom:14px;">${statusPillText}</div>
        <div style="font-size:28px;font-weight:800;color:white;letter-spacing:-0.5px;line-height:1.2;margin-bottom:5px;">${reportTitle}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.65);margin-bottom:28px;">${reportSubtitle}</div>

        ${anchor ? `
        <div style="display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end;">
          <div>
            <div style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">${state === 'FINAL_AWARD' ? 'Approved Tenderer' : 'Recommended Tenderer'}</div>
            <div style="font-size:32px;font-weight:800;color:white;letter-spacing:-0.5px;line-height:1.1;">${anchor.supplierName}</div>
            <div style="font-size:20px;font-weight:700;color:rgba(255,255,255,0.85);margin-top:6px;">${fmt(anchor.adjustedTotal)}</div>
            ${state === 'FINAL_AWARD' && approvalDate ? `<div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:5px;">Award approved ${approvalDate}</div>` : ''}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:14px 16px;text-align:center;">
              <div style="font-size:22px;font-weight:800;color:white;">${tenderCount}</div>
              <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.5px;margin-top:3px;">Tenderers Evaluated</div>
            </div>
            <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:14px 16px;text-align:center;">
              <div style="font-size:22px;font-weight:800;color:${scopePct >= 85 ? '#6ee7b7' : scopePct >= 70 ? '#fcd34d' : '#fca5a5'};">${pct(scopePct)}</div>
              <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.5px;margin-top:3px;">Scope Addressed</div>
            </div>
            <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:14px 16px;text-align:center;">
              <div style="font-size:14px;font-weight:700;color:${anchorRatio < 0.3 ? '#6ee7b7' : anchorRatio < 0.6 ? '#fcd34d' : '#fca5a5'};">${clientRiskLabel(anchorRatio).split(' — ')[0].split(' —')[0]}</div>
              <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.5px;margin-top:3px;">Risk Classification</div>
            </div>
            ${isOverride ? `<div style="background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.3);border-radius:8px;padding:14px 16px;text-align:center;">
              <div style="font-size:12px;font-weight:700;color:#fcd34d;">Override</div>
              <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.5px;margin-top:3px;">Applied</div>
            </div>` : `<div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:14px 16px;text-align:center;">
              <div style="font-size:12px;font-weight:700;color:#6ee7b7;">Aligned</div>
              <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.5px;margin-top:3px;">AI Recommendation</div>
            </div>`}
          </div>
        </div>` : `<div style="font-size:16px;color:rgba(255,255,255,0.7);">Insufficient data to issue a commercial position. Internal review required.</div>`}
      </div>
    </div>

    ${drivers.length > 0 ? `
    <div style="margin-bottom:24px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${C.MUTED};margin-bottom:12px;">Key Decision Drivers</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${drivers.map((d, i) => `
        <div style="display:flex;gap:10px;align-items:flex-start;padding:11px 14px;background:${C.LIGHT_BG};border:1px solid ${C.BORDER};border-radius:8px;">
          <span style="width:20px;height:20px;background:${BRAND_ACCENT};color:white;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;margin-top:1px;">${i + 1}</span>
          <span style="font-size:12px;color:${C.MID};line-height:1.5;">${d}</span>
        </div>`).join('')}
      </div>
    </div>` : ''}

    ${opts.commercialWarning ? `
    <div style="background:${GOLD_BG};border:2px solid ${GOLD_BORDER};border-radius:8px;padding:14px 18px;margin-bottom:22px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${GOLD};margin-bottom:5px;">Commercial Notice</div>
      <div style="font-size:12px;color:${GOLD};line-height:1.7;">${opts.commercialWarning}</div>
    </div>` : ''}

    <div style="border:1px solid ${C.BORDER};border-radius:10px;overflow:hidden;">
      <div style="background:${BRAND};padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:1px;">Financial Snapshot</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.5);">${tenderCount} tender${tenderCount !== 1 ? 's' : ''} evaluated</div>
      </div>
      <table>
        <thead style="background:#f8fafc;">
          <tr>
            <th style="padding:9px 14px;text-align:left;font-size:9px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid ${C.BORDER};">Tenderer</th>
            <th style="padding:9px 14px;text-align:right;font-size:9px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid ${C.BORDER};">Quoted Total</th>
            <th style="padding:9px 14px;text-align:center;font-size:9px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid ${C.BORDER};">Risk Level</th>
            <th style="padding:9px 14px;text-align:center;font-size:9px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid ${C.BORDER};">Status</th>
          </tr>
        </thead>
        <tbody>${snapshotRows}</tbody>
      </table>
    </div>

    ${sharedFooter('Executive Decision', '1', true)}
  </div>`;
}

// ─── Page 2 — Commercial Comparison ──────────────────────────────────────────

function pageCommercialComparison(opts: ReportOptions, state: ClientReportState): string {
  const maxRisk = Math.max(1, ...opts.suppliers.map(s => s.riskScore));
  const approvedName = opts.approvalRecord?.final_approved_supplier ?? null;

  const rows = opts.suppliers.map((s, i) => {
    const ratio = riskRatio(s.riskScore, maxRisk);
    const isAnchor = state === 'FINAL_AWARD' ? s.supplierName === approvedName : s.rank === 1;
    const interpretation = commercialInterpretation(s, maxRisk, state);
    return `<tr style="border-bottom:1px solid ${C.BORDER};${isAnchor ? `background:${state === 'FINAL_AWARD' ? '#f0fdf4' : '#f0f9ff'};font-weight:700;` : i % 2 === 1 ? `background:${C.LIGHT_BG};` : ''}">
      <td style="padding:12px 14px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:22px;height:22px;border-radius:5px;background:${isAnchor ? (state === 'FINAL_AWARD' ? C.GREEN : BRAND_ACCENT) : '#e5e7eb'};color:${isAnchor ? 'white' : C.MID};font-size:10px;font-weight:700;text-align:center;line-height:22px;flex-shrink:0;">${s.rank}</span>
          <span style="font-size:13px;font-weight:${isAnchor ? '700' : '600'};color:${C.DARK};">${s.supplierName}</span>
        </div>
      </td>
      <td style="padding:12px 14px;text-align:right;font-size:13px;font-weight:700;color:${C.DARK};">${fmt(s.adjustedTotal)}</td>
      <td style="padding:12px 14px;text-align:center;">
        <div style="font-size:12px;font-weight:600;color:${s.coveragePercent >= 80 ? C.GREEN : s.coveragePercent >= 65 ? C.AMBER : C.RED};">${pct(s.coveragePercent)}</div>
        <div style="font-size:10px;color:${C.MUTED};margin-top:2px;">${scopeCoverageNote(s.coveragePercent)}</div>
      </td>
      <td style="padding:12px 14px;text-align:center;">
        <span style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;background:${clientRiskBg(ratio)};color:${clientRiskColor(ratio)};">${clientRiskLabel(ratio)}</span>
      </td>
      <td style="padding:12px 14px;font-size:12px;color:${C.MID};line-height:1.5;">${interpretation}</td>
    </tr>`;
  }).join('');

  return `<div class="page">
    <header style="display:flex;justify-content:space-between;align-items:center;padding-bottom:18px;margin-bottom:28px;border-bottom:3px solid ${BRAND_ACCENT};">
      ${opts.organisationLogoUrl
        ? `<img src="${opts.organisationLogoUrl}" alt="Logo" style="height:44px;object-fit:contain;" />`
        : `<div style="display:flex;align-items:center;gap:10px;">
            <div style="width:40px;height:40px;background:linear-gradient(135deg,${BRAND_ACCENT} 0%,#ea580c 100%);border-radius:9px;display:flex;align-items:center;justify-content:center;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span style="font-size:18px;font-weight:800;color:${BRAND};">VerifyTrade</span>
          </div>`}
      <div style="text-align:right;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${C.MUTED};">Client Award Report</div>
        <div style="font-size:13px;font-weight:700;color:${C.DARK};margin-top:3px;">${opts.projectName}</div>
        ${opts.clientName ? `<div style="font-size:11px;color:${C.MUTED};margin-top:2px;">${opts.clientName}</div>` : ''}
      </div>
    </header>

    <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;padding-bottom:12px;border-bottom:2px solid ${C.BORDER};">
      <div style="width:30px;height:30px;background:${BRAND};color:white;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">2</div>
      <div style="font-size:18px;font-weight:800;color:${BRAND};letter-spacing:-0.3px;">Commercial Comparison</div>
    </div>

    <div style="border:1px solid ${C.BORDER};border-radius:10px;overflow:hidden;margin-bottom:24px;">
      <div style="background:${BRAND};padding:12px 16px;">
        <div style="font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:1px;">Tender Evaluation Summary</div>
      </div>
      <table>
        <thead style="background:#f8fafc;">
          <tr>
            <th style="padding:10px 14px;text-align:left;font-size:9px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid ${C.BORDER};">Tenderer</th>
            <th style="padding:10px 14px;text-align:right;font-size:9px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid ${C.BORDER};">Quoted Total</th>
            <th style="padding:10px 14px;text-align:center;font-size:9px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid ${C.BORDER};">Scope Coverage</th>
            <th style="padding:10px 14px;text-align:center;font-size:9px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid ${C.BORDER};">Risk Level</th>
            <th style="padding:10px 14px;text-align:left;font-size:9px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid ${C.BORDER};">Commercial Position</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div style="background:#f8fafc;border:1px solid ${C.BORDER};border-radius:10px;padding:18px 20px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${C.MUTED};margin-bottom:10px;">Evaluation Basis</div>
      <div style="font-size:12px;color:${C.MID};line-height:1.8;">
        This evaluation assesses each tenderer's submitted commercial position against scope coverage, risk profile, and overall commercial outcome.
        Tenderers are ranked in order of evaluated commercial merit. All financial figures are based on submitted tender data.
        ${opts.scoringWeights ? `Assessment weighting applied: Price <strong>${opts.scoringWeights.price}%</strong>, Scope Coverage <strong>${opts.scoringWeights.coverage}%</strong>, Compliance <strong>${opts.scoringWeights.compliance}%</strong>, Risk <strong>${opts.scoringWeights.risk}%</strong>.` : ''}
      </div>
    </div>

    ${sharedFooter('Commercial Comparison', '2', true)}
  </div>`;
}

// ─── Page 3 — Risk & Scope Summary ───────────────────────────────────────────

function pageRiskAndScope(opts: ReportOptions, state: ClientReportState): string {
  const maxRisk = Math.max(1, ...opts.suppliers.map(s => s.riskScore));
  const approvedName = opts.approvalRecord?.final_approved_supplier ?? null;

  const hasReliableVariation = opts.suppliers.some(
    s => s.variationExposurePct !== undefined && s.variationExposurePct > 0
  );

  const riskRows = opts.suppliers.map((s, i) => {
    const ratio = riskRatio(s.riskScore, maxRisk);
    const isAnchor = state === 'FINAL_AWARD' ? s.supplierName === approvedName : s.rank === 1;
    const showVariation = hasReliableVariation && s.variationExposurePct !== undefined;
    return `<tr style="border-bottom:1px solid ${C.BORDER};${isAnchor ? `background:${state === 'FINAL_AWARD' ? '#f0fdf4' : '#f0f9ff'};` : i % 2 === 1 ? `background:${C.LIGHT_BG};` : ''}">
      <td style="padding:11px 14px;font-size:13px;font-weight:${isAnchor ? '700' : '600'};color:${C.DARK};">
        <div style="display:flex;align-items:center;gap:7px;">
          ${isAnchor ? `<span style="width:5px;height:20px;background:${state === 'FINAL_AWARD' ? C.GREEN : BRAND_ACCENT};border-radius:3px;flex-shrink:0;"></span>` : ''}
          ${s.supplierName}
        </div>
      </td>
      <td style="padding:11px 14px;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:6px;">
          <div style="width:80px;height:6px;background:${C.BORDER};border-radius:3px;overflow:hidden;">
            <div style="width:${Math.min(100, s.coveragePercent)}%;height:100%;background:${s.coveragePercent >= 80 ? C.GREEN : s.coveragePercent >= 65 ? C.AMBER : C.RED};border-radius:3px;"></div>
          </div>
          <span style="font-size:12px;font-weight:700;color:${s.coveragePercent >= 80 ? C.GREEN : s.coveragePercent >= 65 ? C.AMBER : C.RED};">${pct(s.coveragePercent)}</span>
        </div>
      </td>
      <td style="padding:11px 14px;text-align:center;">
        <span style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;background:${clientRiskBg(ratio)};color:${clientRiskColor(ratio)};">${clientRiskLabel(ratio)}</span>
      </td>
      ${hasReliableVariation ? `<td style="padding:11px 14px;text-align:center;font-size:12px;font-weight:600;color:${C.MID};">${showVariation ? `+${pct((s.variationExposurePct ?? 0) * 100)} exposure` : '—'}</td>` : ''}
    </tr>`;
  }).join('');

  return `<div class="page">
    <header style="display:flex;justify-content:space-between;align-items:center;padding-bottom:18px;margin-bottom:28px;border-bottom:3px solid ${BRAND_ACCENT};">
      ${opts.organisationLogoUrl
        ? `<img src="${opts.organisationLogoUrl}" alt="Logo" style="height:44px;object-fit:contain;" />`
        : `<div style="display:flex;align-items:center;gap:10px;">
            <div style="width:40px;height:40px;background:linear-gradient(135deg,${BRAND_ACCENT} 0%,#ea580c 100%);border-radius:9px;display:flex;align-items:center;justify-content:center;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span style="font-size:18px;font-weight:800;color:${BRAND};">VerifyTrade</span>
          </div>`}
      <div style="text-align:right;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${C.MUTED};">Client Award Report</div>
        <div style="font-size:13px;font-weight:700;color:${C.DARK};margin-top:3px;">${opts.projectName}</div>
        ${opts.clientName ? `<div style="font-size:11px;color:${C.MUTED};margin-top:2px;">${opts.clientName}</div>` : ''}
      </div>
    </header>

    <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;padding-bottom:12px;border-bottom:2px solid ${C.BORDER};">
      <div style="width:30px;height:30px;background:${BRAND};color:white;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">3</div>
      <div style="font-size:18px;font-weight:800;color:${BRAND};letter-spacing:-0.3px;">Commercial Risk and Scope Summary</div>
    </div>

    <div style="border:1px solid ${C.BORDER};border-radius:10px;overflow:hidden;margin-bottom:22px;">
      <div style="background:${BRAND};padding:12px 16px;">
        <div style="font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:1px;">Risk and Scope by Tenderer</div>
      </div>
      <table>
        <thead style="background:#f8fafc;">
          <tr>
            <th style="padding:10px 14px;text-align:left;font-size:9px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid ${C.BORDER};">Tenderer</th>
            <th style="padding:10px 14px;text-align:center;font-size:9px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid ${C.BORDER};">Scope Coverage</th>
            <th style="padding:10px 14px;text-align:center;font-size:9px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid ${C.BORDER};">Risk Classification</th>
            ${hasReliableVariation ? `<th style="padding:10px 14px;text-align:center;font-size:9px;font-weight:700;color:${C.MUTED};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid ${C.BORDER};">Variation Exposure</th>` : ''}
          </tr>
        </thead>
        <tbody>${riskRows}</tbody>
      </table>
    </div>

    <div style="background:${GOLD_BG};border:1px solid ${GOLD_BORDER};border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${GOLD};margin-bottom:7px;">Commercial Caution</div>
      <div style="font-size:12px;color:#78350f;line-height:1.8;">
        Any identified scope or commercial risks should be managed through contract clarification and award controls.
        Scope coverage percentages reflect the tenderer's pricing relative to the assessed project scope.
        Items not priced by a tenderer may become the subject of post-contract variations.
        ${hasReliableVariation ? 'Variation exposure estimates are indicative only and should be managed through contract risk provisions.' : ''}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
      ${opts.suppliers.slice(0, 3).map(s => {
        const ratio = riskRatio(s.riskScore, maxRisk);
        const isAnchor = state === 'FINAL_AWARD' ? s.supplierName === approvedName : s.rank === 1;
        return `<div style="border:2px solid ${isAnchor ? (state === 'FINAL_AWARD' ? C.GREEN_BORDER : BRAND_ACCENT + '88') : C.BORDER};border-radius:10px;padding:16px;background:${isAnchor ? (state === 'FINAL_AWARD' ? C.GREEN_BG : '#f0f9ff') : 'white'};">
          <div style="font-size:11px;font-weight:700;color:${C.DARK};margin-bottom:10px;border-bottom:1px solid ${C.BORDER};padding-bottom:8px;">${s.supplierName}</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px;">
            <span style="color:${C.MUTED};">Scope</span>
            <strong style="color:${s.coveragePercent >= 80 ? C.GREEN : s.coveragePercent >= 65 ? C.AMBER : C.RED};">${pct(s.coveragePercent)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span style="color:${C.MUTED};">Risk</span>
            <strong style="color:${clientRiskColor(ratio)};font-size:10px;">${clientRiskLabel(ratio).split(' — ')[0]}</strong>
          </div>
        </div>`;
      }).join('')}
    </div>

    ${sharedFooter('Risk & Scope Summary', '3', true)}
  </div>`;
}

// ─── Page 4 — Commercial Controls Required ───────────────────────────────────

function pageCommercialControls(opts: ReportOptions, state: ClientReportState): string {
  const defaultControls = state === 'FINAL_AWARD'
    ? [
        'Confirm all scope inclusions and exclusions in writing prior to contract execution',
        'Lock agreed unit rates for foreseeable variation items within the contract',
        'Obtain signed confirmation of documentation, certification, and compliance deliverables',
        'Confirm site access, sequencing, and interface assumptions with the appointed contractor',
        'Ensure all tender qualifications and clarifications are formally closed before contract execution',
        'Issue formal tender outcome notifications to all participating tenderers',
      ]
    : [
        'Confirm all scope inclusions and exclusions in writing before proceeding to award',
        'Resolve any outstanding scope clarification items identified in this assessment',
        'Lock agreed unit rates for foreseeable variation items prior to award',
        'Confirm documentation, certification, and compliance requirements with the recommended tenderer',
        'Ensure all tender qualifications are formally acknowledged and closed before execution',
        'Obtain client or principal approval in accordance with project governance requirements',
      ];

  const controls = opts.commercialControlsRequired?.length
    ? opts.commercialControlsRequired
    : defaultControls;

  const top = opts.suppliers[0];
  const anchorName = state === 'FINAL_AWARD'
    ? (opts.approvalRecord?.final_approved_supplier ?? top?.supplierName)
    : top?.supplierName;

  return `<div class="page">
    <header style="display:flex;justify-content:space-between;align-items:center;padding-bottom:18px;margin-bottom:28px;border-bottom:3px solid ${BRAND_ACCENT};">
      ${opts.organisationLogoUrl
        ? `<img src="${opts.organisationLogoUrl}" alt="Logo" style="height:44px;object-fit:contain;" />`
        : `<div style="display:flex;align-items:center;gap:10px;">
            <div style="width:40px;height:40px;background:linear-gradient(135deg,${BRAND_ACCENT} 0%,#ea580c 100%);border-radius:9px;display:flex;align-items:center;justify-content:center;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span style="font-size:18px;font-weight:800;color:${BRAND};">VerifyTrade</span>
          </div>`}
      <div style="text-align:right;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${C.MUTED};">Client Award Report</div>
        <div style="font-size:13px;font-weight:700;color:${C.DARK};margin-top:3px;">${opts.projectName}</div>
        ${opts.clientName ? `<div style="font-size:11px;color:${C.MUTED};margin-top:2px;">${opts.clientName}</div>` : ''}
      </div>
    </header>

    <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;padding-bottom:12px;border-bottom:2px solid ${C.BORDER};">
      <div style="width:30px;height:30px;background:${BRAND};color:white;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">4</div>
      <div style="font-size:18px;font-weight:800;color:${BRAND};letter-spacing:-0.3px;">Commercial Controls Required</div>
    </div>

    <div style="background:${BRAND};border-radius:10px;padding:20px 24px;margin-bottom:24px;">
      <div style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:5px;">The following controls must be addressed ${state === 'FINAL_AWARD' ? 'at contract execution' : 'before proceeding to award'}</div>
      ${anchorName ? `<div style="font-size:16px;font-weight:700;color:white;">Applicable to: ${anchorName}</div>` : ''}
    </div>

    ${controls.map((control, i) => `
    <div style="display:flex;gap:16px;padding:16px 18px;border:1px solid ${C.BORDER};border-radius:8px;margin-bottom:10px;background:white;align-items:flex-start;">
      <div style="width:32px;height:32px;border-radius:7px;background:${BRAND};color:white;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</div>
      <div style="flex:1;">
        <div style="font-size:13px;color:${C.DARK};line-height:1.6;font-weight:500;">${control}</div>
      </div>
      <div style="width:20px;height:20px;border-radius:4px;border:2px solid ${C.BORDER};flex-shrink:0;margin-top:2px;"></div>
    </div>`).join('')}

    <div style="margin-top:24px;background:#f8fafc;border:1px solid ${C.BORDER};border-radius:8px;padding:16px 20px;font-size:11px;color:${C.MUTED};line-height:1.7;">
      These commercial controls are recommended based on the assessment of the submitted tenders. They should be formally documented and confirmed
      prior to ${state === 'FINAL_AWARD' ? 'contract execution' : 'award of contract'}. Additional controls may be required depending on project-specific circumstances.
    </div>

    ${sharedFooter('Commercial Controls', '4', true)}
  </div>`;
}

// ─── Page 5 — Approval Record / Final Summary ─────────────────────────────────

function pageApprovalRecord(opts: ReportOptions, state: ClientReportState): string {
  const top = opts.suppliers[0];
  const rec = opts.approvalRecord;

  if (state === 'DRAFT') {
    return `<div class="page">
      <div style="background:${BRAND};border-radius:14px;padding:60px 40px;text-align:center;margin-top:40px;">
        <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:2px;margin-bottom:14px;">Document Status</div>
        <div style="font-size:28px;font-weight:800;color:white;margin-bottom:10px;">Analysis Incomplete</div>
        <div style="font-size:14px;color:rgba(255,255,255,0.6);margin-bottom:30px;max-width:480px;margin-left:auto;margin-right:auto;line-height:1.7;">
          This report is in draft status. Insufficient data exists to issue a commercial recommendation.
          This document is for internal review only and should not be distributed externally.
        </div>
        <div style="display:inline-block;background:rgba(255,255,255,0.1);border-radius:8px;padding:12px 24px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.7);">
          DRAFT — INTERNAL USE ONLY
        </div>
      </div>
      ${sharedFooter('Document Status', '5', true)}
    </div>`;
  }

  const anchorName = state === 'FINAL_AWARD'
    ? (rec?.final_approved_supplier ?? top?.supplierName ?? '—')
    : (top?.supplierName ?? '—');

  const anchorTotal = state === 'FINAL_AWARD'
    ? (opts.suppliers.find(s => s.supplierName === anchorName)?.adjustedTotal ?? top?.adjustedTotal)
    : top?.adjustedTotal;

  const approvalDate = rec?.approved_at
    ? new Date(rec.approved_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const isOverride = rec?.is_override ?? false;

  const execText = opts.executiveSummary
    ?? (state === 'FINAL_AWARD' && rec
      ? `Based on the submitted tenders and commercial evaluation undertaken, ${rec.final_approved_supplier} has been approved for contract award subject to the listed commercial controls.`
      : top
      ? `Based on the submitted tenders and commercial evaluation undertaken, ${top.supplierName} presents the strongest overall commercial position and is recommended for contract award, subject to the listed commercial controls and applicable governance approvals.`
      : '');

  return `<div class="page">
    <header style="display:flex;justify-content:space-between;align-items:center;padding-bottom:18px;margin-bottom:28px;border-bottom:3px solid ${BRAND_ACCENT};">
      ${opts.organisationLogoUrl
        ? `<img src="${opts.organisationLogoUrl}" alt="Logo" style="height:44px;object-fit:contain;" />`
        : `<div style="display:flex;align-items:center;gap:10px;">
            <div style="width:40px;height:40px;background:linear-gradient(135deg,${BRAND_ACCENT} 0%,#ea580c 100%);border-radius:9px;display:flex;align-items:center;justify-content:center;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span style="font-size:18px;font-weight:800;color:${BRAND};">VerifyTrade</span>
          </div>`}
      <div style="text-align:right;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${C.MUTED};">Client Award Report</div>
        <div style="font-size:13px;font-weight:700;color:${C.DARK};margin-top:3px;">${opts.projectName}</div>
        ${opts.clientName ? `<div style="font-size:11px;color:${C.MUTED};margin-top:2px;">${opts.clientName}</div>` : ''}
      </div>
    </header>

    <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;padding-bottom:12px;border-bottom:2px solid ${C.BORDER};">
      <div style="width:30px;height:30px;background:${BRAND};color:white;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">5</div>
      <div style="font-size:18px;font-weight:800;color:${BRAND};letter-spacing:-0.3px;">${state === 'FINAL_AWARD' ? 'Award Record' : 'Recommendation Summary'}</div>
    </div>

    <div style="background:${state === 'FINAL_AWARD' ? `linear-gradient(135deg,#064e3b 0%,#065f46 100%)` : `linear-gradient(135deg,${BRAND} 0%,#334155 100%)`};border-radius:12px;padding:32px 36px;margin-bottom:24px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,0.04);"></div>
      <div style="position:relative;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.5);margin-bottom:10px;">${state === 'FINAL_AWARD' ? 'Final Award Decision' : 'Commercial Recommendation'}</div>
        <div style="font-size:26px;font-weight:800;color:white;letter-spacing:-0.4px;margin-bottom:6px;">${anchorName}</div>
        ${anchorTotal !== undefined ? `<div style="font-size:18px;font-weight:700;color:rgba(255,255,255,0.8);margin-bottom:18px;">${fmt(anchorTotal)}</div>` : ''}
        ${state === 'FINAL_AWARD' && rec ? `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
          <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:12px 14px;">
            <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Approved By</div>
            <div style="font-size:12px;font-weight:600;color:white;">${rec.approved_by_email}</div>
          </div>
          <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:12px 14px;">
            <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Approval Date</div>
            <div style="font-size:12px;font-weight:600;color:white;">${approvalDate}</div>
          </div>
          <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:12px 14px;">
            <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Decision Type</div>
            <div style="font-size:12px;font-weight:600;color:${isOverride ? '#fcd34d' : '#6ee7b7'};">${isOverride ? 'Commercial Override' : 'Aligned with Assessment'}</div>
          </div>
        </div>` : ''}
      </div>
    </div>

    ${isOverride && rec ? `
    <div style="background:${GOLD_BG};border:2px solid ${GOLD_BORDER};border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${GOLD};margin-bottom:8px;">Commercial Override Applied</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:12px;color:#78350f;margin-bottom:${rec.override_reason_detail ? '12px' : '0'};">
        <div><strong>System Recommendation:</strong> ${rec.ai_recommended_supplier}</div>
        <div><strong>Final Decision:</strong> ${rec.final_approved_supplier}</div>
      </div>
      ${rec.override_reason_category ? `<div style="font-size:11px;color:#92400e;border-top:1px solid ${GOLD_BORDER};padding-top:10px;margin-top:8px;">
        <strong>Override Basis:</strong> ${rec.override_reason_category.replace(/_/g, ' ')}
        ${rec.override_reason_detail ? `<div style="margin-top:5px;">${rec.override_reason_detail}</div>` : ''}
      </div>` : ''}
    </div>` : ''}

    <div style="background:#f8fafc;border-left:4px solid ${state === 'FINAL_AWARD' ? C.GREEN : BRAND_ACCENT};border-radius:0 8px 8px 0;padding:18px 22px;margin-bottom:24px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${C.MUTED};margin-bottom:8px;">Commercial Statement</div>
      <p style="font-size:13px;color:${C.MID};line-height:1.8;margin:0;">${execText}</p>
    </div>

    <div style="background:${BRAND};border-radius:8px;padding:16px 20px;font-size:11px;color:rgba(255,255,255,0.55);line-height:1.7;text-align:center;">
      This report is prepared by VerifyTrade and is based on submitted tender data only. It does not constitute legal or financial advice.
      Prepared for the exclusive use of: <strong style="color:rgba(255,255,255,0.8);">${opts.clientName ?? opts.projectName}</strong>. Confidential — authorised recipients only.
    </div>

    ${sharedFooter(state === 'FINAL_AWARD' ? 'Award Record' : 'Recommendation Summary', '5', true)}
  </div>`;
}

// ─── Draft State Page ─────────────────────────────────────────────────────────

function pageDraftNotice(opts: ReportOptions): string {
  return `<div class="page">
    <header style="display:flex;justify-content:space-between;align-items:center;padding-bottom:18px;margin-bottom:40px;border-bottom:3px solid ${C.MUTED};">
      ${opts.organisationLogoUrl
        ? `<img src="${opts.organisationLogoUrl}" alt="Logo" style="height:44px;object-fit:contain;opacity:0.5;" />`
        : `<div style="display:flex;align-items:center;gap:10px;opacity:0.5;">
            <div style="width:40px;height:40px;background:${C.MUTED};border-radius:9px;display:flex;align-items:center;justify-content:center;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span style="font-size:18px;font-weight:800;color:${BRAND};">VerifyTrade</span>
          </div>`}
      <div style="text-align:right;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${C.MUTED};">Draft — Internal Use Only</div>
        <div style="font-size:13px;font-weight:700;color:${C.DARK};margin-top:3px;">${opts.projectName}</div>
      </div>
    </header>

    <div style="text-align:center;padding:60px 40px;">
      <div style="width:64px;height:64px;background:#f3f4f6;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${C.MUTED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div style="font-size:24px;font-weight:800;color:${C.DARK};margin-bottom:10px;">Analysis Incomplete</div>
      <div style="font-size:14px;color:${C.MUTED};max-width:480px;margin:0 auto 30px;line-height:1.7;">
        A commercial recommendation cannot be issued at this stage.
        Insufficient tender data or assessment inputs are available to produce a defensible client report.
      </div>

      <div style="background:#f9fafb;border:1px solid ${C.BORDER};border-radius:10px;padding:24px;text-align:left;max-width:480px;margin:0 auto;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${C.MUTED};margin-bottom:12px;">Required for a client report</div>
        ${[
          'At least one evaluated tenderer with a scored quote',
          'A defensible commercial recommendation from the assessment engine',
          'Scope coverage data for at least the leading tenderer',
          'Risk classification for all evaluated tenderers',
        ].map((item, i) => `
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;">
          <span style="width:18px;height:18px;background:#e5e7eb;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:${C.MUTED};flex-shrink:0;margin-top:1px;">${i + 1}</span>
          <span style="font-size:12px;color:${C.MID};line-height:1.5;">${item}</span>
        </div>`).join('')}
      </div>

      <div style="margin-top:24px;display:inline-block;background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:10px 20px;font-size:11px;font-weight:700;color:#7f1d1d;text-transform:uppercase;letter-spacing:0.8px;">
        Draft — Not For External Distribution
      </div>
    </div>

    ${sharedFooter('Draft Notice', '1', false)}
  </div>`;
}

// ─── Report Assembly ──────────────────────────────────────────────────────────

export function generateClientReport(opts: ReportOptions): string {
  const state = determineReportState(opts);

  const reportTitle = state === 'FINAL_AWARD'
    ? `Final Award Recommendation — ${opts.projectName}`
    : state === 'RECOMMENDATION'
    ? `Commercial Recommendation — ${opts.projectName}`
    : `Analysis Draft — ${opts.projectName}`;

  let body: string;

  if (state === 'DRAFT') {
    body = pageDraftNotice(opts);
  } else {
    body = [
      pageCoverDecision(opts, state),
      pageCommercialComparison(opts, state),
      pageRiskAndScope(opts, state),
      pageCommercialControls(opts, state),
      pageApprovalRecord(opts, state),
    ].join('\n');
  }

  return htmlWrap(reportTitle, baseStyles('screen'), body);
}

export function openClientReport(opts: ReportOptions, filename: string): void {
  openPrintWindow(generateClientReport(opts), filename);
}
