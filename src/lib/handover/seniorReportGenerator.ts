export interface SeniorReportData {
  projectName: string;
  projectClient: string;
  supplierName: string;
  totalAmount: number;
  retentionAmount: number;
  netAmount: number;
  scopeSystems: Array<{
    service_type: string;
    coverage: string;
    item_count: number;
    percentage: number;
  }>;
  keyTerms: Array<{
    term: string;
    value: string;
  }>;
  risks: Array<{
    category: string;
    description: string;
    mitigation: string;
    severity: 'high' | 'medium' | 'low';
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

export function generateSeniorReportHTML(data: SeniorReportData): string {
  const pieChartSVG = generatePieChartSVG(data.scopeSystems);

  const keyTermsHTML = data.keyTerms.map(term => `
    <tr>
      <td class="term-name">${term.term}</td>
      <td class="term-value">${term.value}</td>
    </tr>
  `).join('');

  const risksHTML = data.risks.map(risk => {
    const severityClass = {
      high: 'severity-high',
      medium: 'severity-medium',
      low: 'severity-low'
    }[risk.severity];

    return `
      <tr class="${severityClass}">
        <td class="risk-category">${risk.category}</td>
        <td class="risk-desc">${risk.description}</td>
        <td class="risk-mitigation">${risk.mitigation}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Senior Project Team Overview - ${data.projectName}</title>
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
      padding: 40px;
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
      margin-top: 60px;
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

    /* === METRICS CARDS === */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      margin: 32px 0;
    }

    .stat-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
    }

    .stat-card-value {
      font-size: 32px;
      font-weight: 800;
      color: ${VERIFYTRADE_ORANGE};
      margin-bottom: 8px;
    }

    .stat-card-label {
      font-size: 13px;
      color: #6b7280;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* === CONTENT GRID === */
    .content-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 32px;
    }

    .card {
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 28px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .card h3 {
      margin-bottom: 20px;
    }

    .full-width {
      grid-column: 1 / -1;
    }

    .pie-chart-container {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 10px;
    }

    .legend {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      margin-top: 12px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 9pt;
    }

    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 2px;
    }

    .legend-label {
      flex: 1;
      color: #475569;
    }

    .legend-percentage {
      font-weight: 600;
      color: #1e293b;
    }

    /* === MODERN TABLE === */
    .table-container {
      margin: 24px 0;
      overflow: hidden;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    thead {
      background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
    }

    thead th {
      padding: 16px 12px;
      text-align: left;
      font-weight: 700;
      font-size: 12px;
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: none;
    }

    tbody tr {
      border-bottom: 1px solid #f3f4f6;
      transition: background 0.2s ease;
    }

    tbody tr:nth-child(even) {
      background: #f9fafb;
    }

    tbody tr:hover {
      background: #f3f4f6;
    }

    tbody td {
      padding: 14px 12px;
      color: #374151;
      border: none;
    }

    .term-name {
      font-weight: 600;
      color: #1e293b;
      width: 40%;
    }

    .term-value {
      color: #475569;
    }

    .risk-category {
      font-weight: 600;
      width: 20%;
    }

    .risk-desc {
      width: 40%;
      color: #475569;
    }

    .risk-mitigation {
      width: 40%;
      color: #475569;
    }

    .severity-high {
      background: #fee2e2;
    }

    .severity-high .risk-category {
      color: #dc2626;
    }

    .severity-medium {
      background: #fef3c7;
    }

    .severity-medium .risk-category {
      color: #f59e0b;
    }

    .severity-low {
      background: #dcfce7;
    }

    .severity-low .risk-category {
      color: #16a34a;
    }

    /* === COST BREAKDOWN === */
    .cost-breakdown {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 24px;
      margin-top: 24px;
    }

    .cost-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 14px;
    }

    .cost-row:last-child {
      border-bottom: none;
      padding-top: 16px;
      margin-top: 8px;
      border-top: 2px solid ${VERIFYTRADE_ORANGE};
      font-weight: 700;
    }

    .cost-label {
      color: #6b7280;
    }

    .cost-value {
      color: #111827;
      font-weight: 700;
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

      table {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <!-- COVER PAGE -->
  <div class="page cover-page">
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;">
      <h1 style="text-align: center;">Senior Project Team Overview</h1>
      <div class="subtitle" style="text-align: center;">Executive Summary & Commercial Dashboard</div>

      <div class="project-details-card">
        <div class="detail-row">
          <span class="detail-label">Project</span>
          <span class="detail-value">${data.projectName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Client</span>
          <span class="detail-value">${data.projectClient}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Subcontractor</span>
          <span class="detail-value">${data.supplierName}</span>
        </div>
      </div>

      <div class="stats-grid" style="margin-top: 40px;">
        <div class="stat-card">
          <div class="stat-card-value">$${(data.totalAmount / 1000).toFixed(0)}k</div>
          <div class="stat-card-label">Contract Value</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">$${(data.retentionAmount / 1000).toFixed(0)}k</div>
          <div class="stat-card-label">Retention</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">$${(data.netAmount / 1000).toFixed(0)}k</div>
          <div class="stat-card-label">Net Payable</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">${data.scopeSystems.length}</div>
          <div class="stat-card-label">Service Types</div>
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

  <!-- FINANCIAL & SCOPE BREAKDOWN PAGE -->
  <div class="page page-break">
    <header>
      ${generateLogoSection(data.organisationLogoUrl)}
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <div class="content-grid">
      <div class="card">
        <h3>Scope Distribution by Service Type</h3>
        <div class="pie-chart-container">
          ${pieChartSVG}
        </div>
        <div class="legend">
          ${data.scopeSystems.map((system, idx) => `
            <div class="legend-item">
              <div class="legend-color" style="background-color: ${getChartColor(idx)}"></div>
              <div class="legend-label">${system.service_type}</div>
              <div class="legend-percentage">${system.percentage.toFixed(1)}%</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <h3>Financial Breakdown</h3>
        <div class="cost-breakdown">
          <div class="cost-row">
            <span class="cost-label">Total Contract Value</span>
            <span class="cost-value">$${data.totalAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="cost-row">
            <span class="cost-label">Less: Retention (3%)</span>
            <span class="cost-value" style="color: #f59e0b;">-$${data.retentionAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="cost-row">
            <span class="cost-label">Net Amount Payable</span>
            <span class="cost-value" style="color: #16a34a;">$${data.netAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </div>

    <div style="margin-top: 32px;">
      <h3>Key Commercial Terms</h3>
      <div class="table-container">
        <table>
          <tbody>
            ${keyTermsHTML}
          </tbody>
        </table>
      </div>
    </div>

    <footer>
      <div>© ${new Date().getFullYear()} VerifyTrade. All rights reserved.</div>
      <div>Page 2</div>
    </footer>
  </div>

  <!-- RISK REGISTER PAGE -->
  <div class="page page-break">
    <header>
      ${generateLogoSection(data.organisationLogoUrl)}
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <h2>Risk Register & Mitigations</h2>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Risk Category</th>
            <th>Description</th>
            <th>Mitigation Strategy</th>
          </tr>
        </thead>
        <tbody>
          ${risksHTML}
        </tbody>
      </table>
    </div>

    <div style="margin-top: 40px; padding: 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; text-align: center;">
      <p style="font-size: 12px; color: #6b7280; line-height: 1.7;">
        <strong style="color: #111827;">Confidential:</strong> This document contains commercial and sensitive information. Distribution restricted to authorized project team members only.
      </p>
    </div>

    <footer>
      <div>© ${new Date().getFullYear()} VerifyTrade. All rights reserved.</div>
      <div>Page 3</div>
    </footer>
  </div>
</body>
</html>
  `.trim();
}

function generatePieChartSVG(systems: Array<{service_type: string; percentage: number}>): string {
  const size = 200;
  const center = size / 2;
  const radius = size / 2 - 10;

  let currentAngle = -90;
  const paths: string[] = [];

  systems.forEach((system, idx) => {
    const angle = (system.percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;

    const pathData = [
      `M ${center} ${center}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      'Z'
    ].join(' ');

    paths.push(`<path d="${pathData}" fill="${getChartColor(idx)}" stroke="white" stroke-width="2"/>`);

    currentAngle = endAngle;
  });

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      ${paths.join('\n')}
    </svg>
  `;
}

function getChartColor(index: number): string {
  const colors = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#84cc16'
  ];
  return colors[index % colors.length];
}

export function getDefaultSeniorReportData(): Partial<SeniorReportData> {
  return {
    keyTerms: [
      { term: 'Payment Terms', value: '20th following month, 22 working days' },
      { term: 'Retention', value: '3% standard retention held until practical completion' },
      { term: 'Liquidated Damages', value: 'None specified - back-to-back with head contract' },
      { term: 'Variations', value: 'Rate-based as per schedule of rates' },
      { term: 'Insurance', value: 'Public liability $10M, Professional indemnity as required' }
    ],
    risks: [
      {
        category: 'Programme Risk',
        description: 'Delays in preceding trades may impact fire stopping schedule',
        mitigation: 'Weekly coordination meetings, early warning system, float buffer in programme',
        severity: 'medium'
      },
      {
        category: 'Scope Clarity',
        description: 'Potential for additional penetrations not shown on drawings',
        mitigation: 'Allowance included for additional works, variation process established',
        severity: 'medium'
      },
      {
        category: 'Quality & Compliance',
        description: 'Non-compliant installations could fail fire engineer inspection',
        mitigation: 'Site supervision, QA checks, photo documentation, regular inspections',
        severity: 'high'
      },
      {
        category: 'Commercial',
        description: 'Payment delays or retention release disputes',
        mitigation: 'Clear payment terms agreed, retention bond option, regular invoice tracking',
        severity: 'low'
      },
      {
        category: 'Access & Coordination',
        description: 'Access limitations due to concurrent trades',
        mitigation: 'Access equipment allowance, coordination with other trades, flexible resourcing',
        severity: 'medium'
      }
    ]
  };
}
