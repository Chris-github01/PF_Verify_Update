export interface JuniorPackData {
  projectName: string;
  projectClient: string;
  supplierName: string;
  scopeSystems: Array<{
    service_type: string;
    coverage: string;
    item_count: number;
    details: string[];
  }>;
  inclusions: string[];
  exclusions: string[];
  safetyNotes: string[];
  checklists: Array<{
    title: string;
    items: string[];
  }>;
  organisationLogoUrl?: string;
}

const VERIFYTRADE_ORANGE = '#f97316';
const VERIFYTRADE_ORANGE_LIGHT = '#fed7aa';
const VERIFYTRADE_ORANGE_DARK = '#ea580c';

/**
 * Generate Logo Section
 */
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

export function generateJuniorPackHTML(data: JuniorPackData): string {
  const safetyNotesHTML = data.safetyNotes.map(note =>
    `<li class="safety-item">${note}</li>`
  ).join('');

  const scopeSystemsHTML = data.scopeSystems.map(system => `
    <div class="system-card">
      <h4>${system.service_type}</h4>
      <p class="item-count">${system.item_count} items</p>
      <ul class="detail-list">
        ${system.details.slice(0, 3).map(detail => `<li>${detail}</li>`).join('')}
      </ul>
    </div>
  `).join('');

  const checklistsHTML = data.checklists.map(checklist => `
    <div class="checklist-section">
      <h3>${checklist.title}</h3>
      <ul class="checklist">
        ${checklist.items.map(item => `<li><input type="checkbox" disabled> ${item}</li>`).join('')}
      </ul>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Junior Site Team Handover Pack - ${data.projectName}</title>
  <style>
    /* === RESET & BASE STYLES === */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #1f2937;
      background: white;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* === PAGE LAYOUT === */
    @page {
      size: A4;
      margin: 20mm 15mm;
    }

    .page {
      page-break-after: always;
      padding: 40px 40px 80px 40px; /* Extra bottom padding for footer */
      position: relative;
      box-sizing: border-box;
    }

    .page:last-child {
      page-break-after: auto;
    }

    /* === HEADER & FOOTER === */
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid ${VERIFYTRADE_ORANGE};
    }

    .logo-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-icon {
      width: 52px;
      height: 52px;
      background: linear-gradient(135deg, ${VERIFYTRADE_ORANGE} 0%, ${VERIFYTRADE_ORANGE_DARK} 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 8px rgba(249, 115, 22, 0.25);
    }

    .logo-text {
      font-size: 26px;
      font-weight: 700;
      color: #111827;
      letter-spacing: -0.5px;
    }

    .generated-by {
      text-align: right;
      font-size: 12px;
      color: #6b7280;
    }

    .generated-by strong {
      color: ${VERIFYTRADE_ORANGE};
      font-weight: 600;
    }

    footer {
      position: absolute;
      bottom: 20px;
      left: 40px;
      right: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #9ca3af;
    }

    /* === COVER PAGE === */
    .cover-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      min-height: 80vh;
    }

    h1 {
      font-size: 46px;
      font-weight: 800;
      color: #111827;
      letter-spacing: -1.2px;
      line-height: 1.1;
      margin-bottom: 12px;
    }

    .subtitle {
      font-size: 22px;
      color: #6b7280;
      font-weight: 400;
      margin-bottom: 48px;
    }

    /* === TYPOGRAPHY === */
    h2 {
      font-size: 30px;
      font-weight: 700;
      color: #111827;
      letter-spacing: -0.5px;
      margin-bottom: 28px;
      padding-bottom: 12px;
      border-bottom: 2px solid #f3f4f6;
    }

    h3 {
      font-size: 22px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 18px;
    }

    h4 {
      font-size: 18px;
      font-weight: 600;
      color: #4b5563;
      margin-bottom: 14px;
    }

    /* === PROJECT DETAILS CARD === */
    .project-details-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 32px;
      margin: 40px 0;
      text-align: left;
      width: 100%;
      max-width: 600px;
    }

    .project-details-card .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e5e7eb;
    }

    .project-details-card .detail-row:last-child {
      border-bottom: none;
    }

    .project-details-card .detail-label {
      font-weight: 600;
      color: #6b7280;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .project-details-card .detail-value {
      font-weight: 600;
      color: #111827;
      font-size: 15px;
    }

    /* === INFO BOXES === */
    .warning-box {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      border-radius: 0 8px 8px 0;
      padding: 20px 24px;
      margin: 24px 0;
      line-height: 1.8;
    }

    .warning-box h3 {
      font-weight: 700;
      font-size: 15px;
      color: #92400e;
      margin-bottom: 12px;
    }

    .warning-box ul {
      list-style: none;
      padding-left: 0;
    }

    .safety-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 12px;
      line-height: 1.7;
      color: #78350f;
      padding-left: 0;
    }

    .safety-item:before {
      content: "⚠";
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: #f59e0b;
      color: white;
      border-radius: 50%;
      margin-right: 12px;
      flex-shrink: 0;
      font-weight: 700;
      font-size: 14px;
    }

    /* === SYSTEMS GRID === */
    .systems-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-top: 24px;
    }

    .system-card {
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px;
      transition: all 0.3s ease;
    }

    .system-card:hover {
      border-color: ${VERIFYTRADE_ORANGE};
      box-shadow: 0 4px 12px rgba(249, 115, 22, 0.15);
    }

    .system-card h4 {
      color: ${VERIFYTRADE_ORANGE};
      font-size: 16px;
      margin-bottom: 8px;
    }

    .item-count {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 12px;
      font-weight: 500;
    }

    .detail-list {
      list-style: none;
      font-size: 13px;
      color: #4b5563;
      padding-left: 0;
    }

    .detail-list li {
      padding: 6px 0;
      padding-left: 20px;
      position: relative;
      line-height: 1.6;
    }

    .detail-list li:before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #10b981;
      font-weight: 700;
    }

    /* === CHECKLIST SECTION === */
    .checklist-section {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
    }

    .checklist-section h3 {
      font-size: 18px;
      color: #111827;
      margin-bottom: 16px;
      font-weight: 600;
    }

    .checklist {
      list-style: none;
      padding-left: 0;
    }

    .checklist li {
      padding: 12px 0;
      font-size: 14px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      color: #374151;
    }

    .checklist li:last-child {
      border-bottom: none;
    }

    .checklist input[type="checkbox"] {
      margin-right: 12px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      cursor: pointer;
    }

    /* === PRINT STYLES === */
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      .page-break {
        page-break-after: always;
        break-after: page;
      }
    }
  </style>
</head>
<body>
  <!-- COVER PAGE -->
  <div class="page cover-page">
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;">
      <h1 style="text-align: center;">Junior Site Team Handover Pack</h1>
      <div class="subtitle" style="text-align: center;">Practical Guide for On-Site Installation & Quality Control</div>

      <div class="project-details-card">
        <div class="detail-row">
          <span class="detail-label">Project</span>
          <span class="detail-value">${data.projectName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Subcontractor</span>
          <span class="detail-value">${data.supplierName}</span>
        </div>
      </div>

      <div style="margin-top: 60px;">
        ${generateLogoSection(data.organisationLogoUrl)}
        <div style="font-size: 13px; color: #6b7280; margin-top: 12px; text-align: center;">
          Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>
    </div>

    <footer style="text-align: right; margin-top: auto;">
      <div style="color: ${VERIFYTRADE_ORANGE}; font-weight: 600;">Generated by VerifyTrade</div>
    </footer>
  </div>

  <!-- SCOPE OF WORKS PAGE -->
  <div class="page page-break">
    <header>
      ${generateLogoSection(data.organisationLogoUrl)}
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <h2>Scope of Works Overview</h2>
    <div class="systems-grid">
      ${scopeSystemsHTML}
    </div>

    <div class="warning-box">
      <h3>Safety & Installation Notes</h3>
      <ul>
        ${safetyNotesHTML}
      </ul>
    </div>

    <footer>
      <div>© ${new Date().getFullYear()} VerifyTrade. All rights reserved.</div>
      <div>Page 2</div>
    </footer>
  </div>

  <!-- CHECKLISTS PAGE -->
  <div class="page page-break">
    <header>
      ${generateLogoSection(data.organisationLogoUrl)}
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <h2>Site Handover Checklists</h2>
    ${checklistsHTML}

    <footer>
      <div>© ${new Date().getFullYear()} VerifyTrade. All rights reserved.</div>
      <div>Page 3</div>
    </footer>
  </div>

  <div style="margin-top: 40px; padding: 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; text-align: center;">
    <p style="font-size: 12px; color: #6b7280; line-height: 1.7;">
      <strong style="color: #111827;">Note:</strong> This document is for site team reference only and does not contain commercial or pricing information.
    </p>
  </div>
</body>
</html>
  `.trim();
}

export function getDefaultJuniorPackData(): Partial<JuniorPackData> {
  return {
    safetyNotes: [
      'All personnel must complete site induction before commencing work',
      'Ensure SWMS (Safe Work Method Statement) is reviewed and signed',
      'Use appropriate PPE: Hard hat, safety glasses, high-vis vest, safety boots',
      'Work at heights requires appropriate access equipment and fall protection',
      'Report any health and safety concerns immediately to site supervisor',
      'Follow manufacturer\'s instructions for all fire protection materials',
      'Ensure adequate ventilation when working with sealants and intumescent products'
    ],
    checklists: [
      {
        title: 'Pre-Start Checklist',
        items: [
          'Site induction completed',
          'SWMS reviewed and signed',
          'All required materials and equipment on site',
          'Access to work areas confirmed',
          'Fire engineering drawings reviewed',
          'Quality control procedures understood'
        ]
      },
      {
        title: 'Installation Checklist',
        items: [
          'Verify penetration dimensions against drawings',
          'Check FRR (Fire Resistance Rating) requirements',
          'Ensure surfaces are clean and free from debris',
          'Apply products as per manufacturer specifications',
          'Install in accordance with tested systems',
          'Label all penetrations with system reference'
        ]
      },
      {
        title: 'Quality Control Checklist',
        items: [
          'Photograph all completed penetrations',
          'Record system references and FRR achieved',
          'Verify compliance with fire engineering report',
          'Complete QA documentation for each penetration',
          'Prepare for independent inspection if required',
          'Ensure PS3 documentation is prepared'
        ]
      },
      {
        title: 'Completion & Handover',
        items: [
          'All works completed as per scope',
          'All penetrations labeled and photographed',
          'QA documentation package complete',
          'Site cleaned and made good',
          'Defects list prepared if applicable',
          'Handover documentation submitted to main contractor'
        ]
      }
    ]
  };
}
