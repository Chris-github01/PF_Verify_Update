/**
 * Modern Handover Pack Generators with VerifyTrade Branding
 * Matches Award Report design and styling
 */

const VERIFYTRADE_ORANGE = '#f97316';
const VERIFYTRADE_ORANGE_LIGHT = '#fed7aa';
const VERIFYTRADE_ORANGE_DARK = '#ea580c';

function generateLogoSection(organisationLogoUrl?: string): string {
  if (organisationLogoUrl) {
    return `
      <div class="logo-section">
        <img
          src="${organisationLogoUrl}"
          alt="Organisation Logo"
          style="max-width: 140px; max-height: 52px; object-fit: contain;"
        />
        <div style="border-left: 2px solid #e5e7eb; height: 52px; margin: 0 12px;"></div>
        <div class="logo-text">VerifyTrade</div>
      </div>`;
  } else {
    return `
      <div class="logo-section">
        <div class="logo-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
          </svg>
        </div>
        <div class="logo-text">VerifyTrade</div>
      </div>`;
  }
}

export function generateJuniorPackHTML(
  projectName: string,
  supplierName: string,
  scopeSystems: any[],
  inclusions: string[],
  exclusions: string[],
  organisationLogoUrl?: string
): string {
  const systemsHTML = scopeSystems.map(sys => {
    const detailsHTML = sys.details && sys.details.length > 0
      ? `<ul class="detail-list">${sys.details.map((d: string) => `<li>${d}</li>`).join('')}</ul>`
      : '';

    return `<div class="system-card">
      <h4>${sys.service_type}</h4>
      <p class="item-count">${sys.item_count} items</p>
      ${detailsHTML}
    </div>`;
  }).join('');

  const inclusionsHTML = inclusions.length > 0
    ? `<h2>Scope Inclusions</h2><ul class="checklist">${inclusions.map(i => `<li><input type="checkbox" disabled> ${i}</li>`).join('')}</ul>`
    : '';

  const exclusionsHTML = exclusions.length > 0
    ? `<h2>Scope Exclusions</h2><div class="warning-box"><h3>Not Included in Scope</h3><ul>${exclusions.map(e => `<li class="safety-item">${e}</li>`).join('')}</ul></div>`
    : '';

  const year = new Date().getFullYear();
  const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Junior Site Team Handover Pack - ${projectName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f2937; background: white; padding: 0; -webkit-font-smoothing: antialiased; }
    @page { size: A4; margin: 20mm 15mm; }
    .page { page-break-after: always; padding: 40px; }
    .page:last-child { page-break-after: auto; }
    header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid ${VERIFYTRADE_ORANGE}; }
    .logo-section { display: flex; align-items: center; gap: 12px; }
    .logo-icon { width: 52px; height: 52px; background: linear-gradient(135deg, ${VERIFYTRADE_ORANGE} 0%, ${VERIFYTRADE_ORANGE_DARK} 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(249, 115, 22, 0.25); }
    .logo-text { font-size: 26px; font-weight: 700; color: #111827; letter-spacing: -0.5px; }
    .generated-by { text-align: right; font-size: 12px; color: #6b7280; }
    .generated-by strong { color: ${VERIFYTRADE_ORANGE}; font-weight: 600; }
    footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #9ca3af; }
    .cover-page { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; min-height: 80vh; }
    h1 { font-size: 46px; font-weight: 800; color: #111827; letter-spacing: -1.2px; line-height: 1.1; margin-bottom: 12px; }
    .subtitle { font-size: 22px; color: #6b7280; font-weight: 400; margin-bottom: 48px; }
    h2 { font-size: 30px; font-weight: 700; color: #111827; letter-spacing: -0.5px; margin-bottom: 28px; padding-bottom: 12px; border-bottom: 2px solid #f3f4f6; }
    h3 { font-size: 22px; font-weight: 600; color: #374151; margin-bottom: 18px; }
    .project-details-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; margin: 40px 0; text-align: left; width: 100%; max-width: 600px; }
    .project-details-card .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
    .project-details-card .detail-row:last-child { border-bottom: none; }
    .project-details-card .detail-label { font-weight: 600; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    .project-details-card .detail-value { font-weight: 600; color: #111827; font-size: 15px; }
    .systems-grid { display: grid; grid-template-columns: 1fr; gap: 20px; margin-top: 24px; }
    .system-card { background: white; border: 2px solid #e5e7eb; border-radius: 12px; padding: 20px; page-break-inside: avoid; }
    .system-card h4 { color: ${VERIFYTRADE_ORANGE}; font-size: 16px; margin-bottom: 8px; }
    .item-count { font-size: 12px; color: #6b7280; margin-bottom: 12px; font-weight: 500; }
    .detail-list { list-style: none; font-size: 12px; color: #4b5563; padding-left: 0; column-count: 2; column-gap: 20px; }
    .detail-list li { padding: 4px 0; padding-left: 20px; position: relative; line-height: 1.5; break-inside: avoid; }
    .detail-list li:before { content: "✓"; position: absolute; left: 0; color: #10b981; font-weight: 700; }
    .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 20px 24px; margin: 24px 0; line-height: 1.8; }
    .warning-box h3 { font-weight: 700; font-size: 15px; color: #92400e; margin-bottom: 12px; }
    .warning-box ul { list-style: none; padding-left: 0; }
    .safety-item { display: flex; align-items: flex-start; margin-bottom: 12px; line-height: 1.7; color: #78350f; }
    .safety-item:before { content: "⚠"; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: #f59e0b; color: white; border-radius: 50%; margin-right: 12px; flex-shrink: 0; font-weight: 700; font-size: 14px; }
    .checklist-section { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
    .checklist-section h3 { font-size: 18px; color: #111827; margin-bottom: 16px; font-weight: 600; }
    .checklist { list-style: none; padding-left: 0; }
    .checklist li { padding: 12px 0; font-size: 14px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; color: #374151; }
    .checklist li:last-child { border-bottom: none; }
    .checklist input[type="checkbox"] { margin-right: 12px; width: 18px; height: 18px; flex-shrink: 0; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .page-break { page-break-after: always; break-after: page; } }
  </style>
</head>
<body>
  <div class="page cover-page">
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;">
      <h1 style="text-align: center;">Junior Site Team Handover Pack</h1>
      <div class="subtitle" style="text-align: center;">Practical Guide for On-Site Installation & Quality Control</div>
      <div class="project-details-card">
        <div class="detail-row"><span class="detail-label">Project</span><span class="detail-value">${projectName}</span></div>
        <div class="detail-row"><span class="detail-label">Subcontractor</span><span class="detail-value">${supplierName}</span></div>
      </div>
      <div style="margin-top: 60px;">
        ${generateLogoSection(organisationLogoUrl)}
        <div style="font-size: 13px; color: #6b7280; margin-top: 12px; text-align: center;">Generated ${generatedDate}</div>
      </div>
    </div>
    <footer style="text-align: right; margin-top: auto;"><div style="color: ${VERIFYTRADE_ORANGE}; font-weight: 600;">Generated by VerifyTrade</div></footer>
  </div>

  <div class="page page-break">
    <header>${generateLogoSection(organisationLogoUrl)}<div class="generated-by">Generated by <strong>VerifyTrade</strong></div></header>
    <h2>Scope of Works Overview</h2>
    <div class="systems-grid">${systemsHTML}</div>
    <div class="warning-box">
      <h3>Safety & Installation Notes</h3>
      <ul>
        <li class="safety-item">All personnel must complete site induction before commencing work</li>
        <li class="safety-item">Use appropriate PPE: Hard hat, safety glasses, high-vis vest, safety boots</li>
        <li class="safety-item">Follow manufacturer's instructions for all fire protection materials</li>
      </ul>
    </div>
    <footer><div>© ${year} VerifyTrade. All rights reserved.</div><div>Page 2</div></footer>
  </div>

  <div class="page page-break">
    <header>${generateLogoSection(organisationLogoUrl)}<div class="generated-by">Generated by <strong>VerifyTrade</strong></div></header>
    <h2>Site Handover Checklists</h2>
    <div class="checklist-section"><h3>Pre-Start Checklist</h3><ul class="checklist">
      <li><input type="checkbox" disabled> Site induction completed</li>
      <li><input type="checkbox" disabled> SWMS reviewed and signed</li>
      <li><input type="checkbox" disabled> All required materials and equipment on site</li>
    </ul></div>
    <div class="checklist-section"><h3>Installation Checklist</h3><ul class="checklist">
      <li><input type="checkbox" disabled> Verify penetration dimensions against drawings</li>
      <li><input type="checkbox" disabled> Check FRR requirements</li>
      <li><input type="checkbox" disabled> Apply products as per manufacturer specifications</li>
    </ul></div>
    <div class="checklist-section"><h3>Quality Control</h3><ul class="checklist">
      <li><input type="checkbox" disabled> Photograph all completed penetrations</li>
      <li><input type="checkbox" disabled> Complete QA documentation for each penetration</li>
      <li><input type="checkbox" disabled> Ensure PS3 documentation is prepared</li>
    </ul></div>
    <footer><div>© ${year} VerifyTrade. All rights reserved.</div><div>Page 3</div></footer>
  </div>

  ${inclusionsHTML || exclusionsHTML ? `<div class="page page-break">
    <header>${generateLogoSection(organisationLogoUrl)}<div class="generated-by">Generated by <strong>VerifyTrade</strong></div></header>
    ${inclusionsHTML}
    ${exclusionsHTML}
    <footer><div>© ${year} VerifyTrade. All rights reserved.</div><div>Page 4</div></footer>
  </div>` : ''}
</body>
</html>`;
}

export function generateSeniorReportHTML(
  projectName: string,
  supplierName: string,
  totalAmount: number,
  scopeSystems: any[],
  inclusions: string[],
  exclusions: string[],
  organisationLogoUrl?: string
): string {
  const retentionAmount = totalAmount * 0.03;
  const netAmount = totalAmount - retentionAmount;

  const inclusionsHTML = inclusions.length > 0
    ? `<div style="margin-top: 24px;"><h3>Scope Inclusions</h3><ul style="list-style: disc; margin-left: 20px;">${inclusions.map(i => `<li style="margin: 8px 0;">${i}</li>`).join('')}</ul></div>`
    : '';

  const exclusionsHTML = exclusions.length > 0
    ? `<div style="margin-top: 24px;"><h3>Scope Exclusions</h3><ul style="list-style: disc; margin-left: 20px; color: #ef4444;">${exclusions.map(e => `<li style="margin: 8px 0;">${e}</li>`).join('')}</ul></div>`
    : '';

  const pieColors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];
  let currentAngle = -90;
  const paths = scopeSystems.map((sys, idx) => {
    const angle = (sys.percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = 100 + 90 * Math.cos(startRad);
    const y1 = 100 + 90 * Math.sin(startRad);
    const x2 = 100 + 90 * Math.cos(endRad);
    const y2 = 100 + 90 * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;
    currentAngle = endAngle;
    return `<path d="M 100 100 L ${x1} ${y1} A 90 90 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${pieColors[idx % pieColors.length]}" stroke="white" stroke-width="2"/>`;
  }).join('');

  const legend = scopeSystems.map((sys, idx) => `
    <div style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
      <div style="width: 12px; height: 12px; border-radius: 2px; background-color: ${pieColors[idx % pieColors.length]};"></div>
      <div style="flex: 1; color: #475569;">${sys.service_type}</div>
      <div style="font-weight: 600; color: #1e293b;">${sys.percentage.toFixed(1)}%</div>
    </div>
  `).join('');

  const scopeDetailsHTML = scopeSystems.map(sys => `
    <div style="margin-bottom: 32px; page-break-inside: avoid;">
      <h3 style="color: ${VERIFYTRADE_ORANGE}; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb;">
        ${sys.service_type} (${sys.item_count} items)
      </h3>
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
        <ul style="list-style: none; padding: 0; margin: 0; column-count: 2; column-gap: 24px;">
          ${sys.details.map((d: string) => `
            <li style="padding: 6px 0; font-size: 13px; color: #374151; break-inside: avoid; position: relative; padding-left: 20px;">
              <span style="position: absolute; left: 0; color: #10b981; font-weight: 700;">✓</span>
              ${d}
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
  `).join('');

  const year = new Date().getFullYear();
  const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Senior Project Team Overview - ${projectName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f2937; background: white; padding: 0; -webkit-font-smoothing: antialiased; }
    @page { size: A4; margin: 20mm 15mm; }
    .page { page-break-after: always; padding: 40px; }
    .page:last-child { page-break-after: auto; }
    header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid ${VERIFYTRADE_ORANGE}; }
    .logo-section { display: flex; align-items: center; gap: 12px; }
    .logo-icon { width: 52px; height: 52px; background: linear-gradient(135deg, ${VERIFYTRADE_ORANGE} 0%, ${VERIFYTRADE_ORANGE_DARK} 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(249, 115, 22, 0.25); }
    .logo-text { font-size: 26px; font-weight: 700; color: #111827; letter-spacing: -0.5px; }
    .generated-by { text-align: right; font-size: 12px; color: #6b7280; }
    .generated-by strong { color: ${VERIFYTRADE_ORANGE}; font-weight: 600; }
    footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #9ca3af; }
    .cover-page { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; min-height: 80vh; }
    h1 { font-size: 46px; font-weight: 800; color: #111827; letter-spacing: -1.2px; line-height: 1.1; margin-bottom: 12px; }
    .subtitle { font-size: 22px; color: #6b7280; font-weight: 400; margin-bottom: 48px; }
    h2 { font-size: 30px; font-weight: 700; color: #111827; letter-spacing: -0.5px; margin-bottom: 28px; padding-bottom: 12px; border-bottom: 2px solid #f3f4f6; }
    h3 { font-size: 22px; font-weight: 600; color: #374151; margin-bottom: 18px; }
    .project-details-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; margin: 40px 0; text-align: left; width: 100%; max-width: 600px; }
    .project-details-card .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
    .project-details-card .detail-row:last-child { border-bottom: none; }
    .project-details-card .detail-label { font-weight: 600; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    .project-details-card .detail-value { font-weight: 600; color: #111827; font-size: 15px; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 32px 0; }
    .stat-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; text-align: center; }
    .stat-card-value { font-size: 32px; font-weight: 800; color: ${VERIFYTRADE_ORANGE}; margin-bottom: 8px; }
    .stat-card-label { font-size: 13px; color: #6b7280; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
    .content-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
    .card { background: white; border: 2px solid #e5e7eb; border-radius: 12px; padding: 28px; }
    .cost-breakdown { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-top: 24px; }
    .cost-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    .cost-row:last-child { border-bottom: none; padding-top: 16px; margin-top: 8px; border-top: 2px solid ${VERIFYTRADE_ORANGE}; font-weight: 700; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="page cover-page">
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;">
      <h1 style="text-align: center;">Senior Project Team Overview</h1>
      <div class="subtitle" style="text-align: center;">Executive Summary & Commercial Dashboard</div>
      <div class="project-details-card">
        <div class="detail-row"><span class="detail-label">Project</span><span class="detail-value">${projectName}</span></div>
        <div class="detail-row"><span class="detail-label">Subcontractor</span><span class="detail-value">${supplierName}</span></div>
      </div>
      <div class="stats-grid" style="margin-top: 40px;">
        <div class="stat-card"><div class="stat-card-value">$${(totalAmount / 1000).toFixed(0)}k</div><div class="stat-card-label">Contract Value</div></div>
        <div class="stat-card"><div class="stat-card-value">$${(retentionAmount / 1000).toFixed(0)}k</div><div class="stat-card-label">Retention</div></div>
        <div class="stat-card"><div class="stat-card-value">$${(netAmount / 1000).toFixed(0)}k</div><div class="stat-card-label">Net Payable</div></div>
        <div class="stat-card"><div class="stat-card-value">${scopeSystems.length}</div><div class="stat-card-label">Service Types</div></div>
      </div>
      <div style="margin-top: 60px;">
        ${generateLogoSection(organisationLogoUrl)}
        <div style="font-size: 13px; color: #6b7280; margin-top: 12px; text-align: center;">Generated ${generatedDate}</div>
      </div>
    </div>
    <footer style="text-align: right; margin-top: auto;"><div style="color: ${VERIFYTRADE_ORANGE}; font-weight: 600;">Generated by VerifyTrade</div></footer>
  </div>

  <div class="page page-break">
    <header>${generateLogoSection(organisationLogoUrl)}<div class="generated-by">Generated by <strong>VerifyTrade</strong></div></header>
    <div class="content-grid">
      <div class="card">
        <h3>Scope Distribution</h3>
        <div style="display: flex; justify-content: center; padding: 10px;">
          <svg width="200" height="200" viewBox="0 0 200 200">${paths}</svg>
        </div>
        <div style="display: grid; gap: 6px; margin-top: 12px;">${legend}</div>
      </div>
      <div class="card">
        <h3>Financial Breakdown</h3>
        ${inclusionsHTML}
        ${exclusionsHTML}
        <div class="cost-breakdown">
          <div class="cost-row"><span style="color: #6b7280;">Total Contract Value</span><span style="color: #111827; font-weight: 700;">$${totalAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</span></div>
          <div class="cost-row"><span style="color: #6b7280;">Less: Retention (3%)</span><span style="color: #f59e0b; font-weight: 700;">-$${retentionAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</span></div>
          <div class="cost-row"><span style="color: #6b7280;">Net Amount Payable</span><span style="color: #16a34a; font-weight: 700;">$${netAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</span></div>
        </div>
      </div>
    </div>
    <footer><div>© ${year} VerifyTrade. All rights reserved.</div><div>Page 2</div></footer>
  </div>

  <div class="page page-break">
    <header>${generateLogoSection(organisationLogoUrl)}<div class="generated-by">Generated by <strong>VerifyTrade</strong></div></header>
    <h2 style="margin-bottom: 24px;">Detailed Scope Breakdown</h2>
    ${scopeDetailsHTML}
    <footer><div>© ${year} VerifyTrade. All rights reserved.</div><div>Page 3</div></footer>
  </div>
</body>
</html>`;
}
