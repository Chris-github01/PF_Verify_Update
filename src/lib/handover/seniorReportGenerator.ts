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
    @page {
      size: A4 landscape;
      margin: 15mm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 10pt;
      line-height: 1.4;
      color: #1e293b;
      background: white;
    }

    .header {
      background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);
      color: white;
      padding: 20px 30px;
      margin-bottom: 20px;
      border-radius: 8px;
    }

    .header h1 {
      font-size: 22pt;
      margin-bottom: 6px;
    }

    .header p {
      font-size: 11pt;
      opacity: 0.95;
    }

    .executive-summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }

    .summary-card {
      background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 12px;
    }

    .summary-label {
      font-size: 8pt;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .summary-value {
      font-size: 18pt;
      color: #7c3aed;
      font-weight: 700;
    }

    .content-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 20px;
    }

    .card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 15px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .card h2 {
      font-size: 13pt;
      color: #7c3aed;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e2e8f0;
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

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      background: #f1f5f9;
      color: #475569;
      font-size: 9pt;
      text-align: left;
      padding: 8px;
      border-bottom: 2px solid #cbd5e1;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
    }

    td {
      padding: 8px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 9pt;
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

    .cost-breakdown {
      background: #f8fafc;
      padding: 12px;
      border-radius: 6px;
      margin-top: 10px;
    }

    .cost-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #e2e8f0;
    }

    .cost-row:last-child {
      border-bottom: none;
      padding-top: 10px;
      margin-top: 6px;
      border-top: 2px solid #7c3aed;
      font-weight: 700;
    }

    .cost-label {
      color: #475569;
    }

    .cost-value {
      color: #1e293b;
      font-weight: 600;
    }

    .footer {
      margin-top: 20px;
      padding-top: 12px;
      border-top: 2px solid #e2e8f0;
      font-size: 8pt;
      color: #64748b;
      text-align: center;
    }

    .full-width {
      grid-column: 1 / -1;
    }

    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Senior Project Team Overview</h1>
    <p>Executive Summary & Commercial Dashboard</p>
  </div>

  <div class="executive-summary">
    <div class="summary-card">
      <div class="summary-label">Contract Value</div>
      <div class="summary-value">$${(data.totalAmount / 1000).toFixed(0)}k</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Retention</div>
      <div class="summary-value">$${(data.retentionAmount / 1000).toFixed(0)}k</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Net Payable</div>
      <div class="summary-value">$${(data.netAmount / 1000).toFixed(0)}k</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Service Types</div>
      <div class="summary-value">${data.scopeSystems.length}</div>
    </div>
  </div>

  <div class="content-grid">
    <div class="card">
      <h2>Scope Distribution by Service Type</h2>
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
      <h2>Financial Breakdown</h2>
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

      <h2 style="margin-top: 15px;">Key Commercial Terms</h2>
      <table>
        <tbody>
          ${keyTermsHTML}
        </tbody>
      </table>
    </div>

    <div class="card full-width">
      <h2>Risk Register & Mitigations</h2>
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
  </div>

  <div class="footer">
    <p>Generated by VerifyTrade - Contract Manager | ${new Date().toLocaleDateString('en-NZ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })}</p>
    <p>This document contains commercial and sensitive information. Distribution restricted to authorized project team members only.</p>
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
