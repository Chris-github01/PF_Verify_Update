import { AuditKPIs } from '../audit/auditCalculations';

export interface MonthlyReportOptions {
  organisationName?: string;
  projectName?: string;
  module?: string;
  startDate: string;
  endDate: string;
}

export function generateMonthlyReportHTML(kpis: AuditKPIs, options: MonthlyReportOptions): string {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-NZ').format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-NZ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const reportDate = new Date().toLocaleDateString('en-NZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const scopeFilter = options.organisationName
    ? `Organisation: ${options.organisationName}${options.projectName ? ` / Project: ${options.projectName}` : ''}`
    : 'All Organisations';

  const moduleFilter = options.module ? ` / Module: ${options.module}` : ' / All Modules';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Executive Monthly Report - ${reportDate}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1e293b;
      background: white;
    }

    .container {
      max-width: 850px;
      margin: 0 auto;
      padding: 40px;
    }

    .header {
      text-align: center;
      margin-bottom: 50px;
      padding-bottom: 30px;
      border-bottom: 3px solid #0A66C2;
    }

    .header h1 {
      font-size: 32pt;
      font-weight: 700;
      color: #0A66C2;
      margin-bottom: 10px;
    }

    .header .subtitle {
      font-size: 14pt;
      color: #64748b;
      margin-bottom: 5px;
    }

    .header .date {
      font-size: 11pt;
      color: #94a3b8;
    }

    .section {
      margin-bottom: 40px;
      page-break-inside: avoid;
    }

    .section-title {
      font-size: 18pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e2e8f0;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }

    .kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
    }

    .kpi-label {
      font-size: 10pt;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .kpi-value {
      font-size: 28pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 5px;
    }

    .kpi-subtitle {
      font-size: 9pt;
      color: #64748b;
    }

    .highlight-box {
      background: #f0f9ff;
      border-left: 4px solid #0A66C2;
      padding: 20px;
      margin: 20px 0;
    }

    .highlight-box h3 {
      font-size: 14pt;
      color: #0A66C2;
      margin-bottom: 10px;
    }

    .highlight-box p {
      color: #334155;
      line-height: 1.8;
    }

    .savings-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-top: 20px;
    }

    .savings-card {
      background: white;
      border: 2px solid #10b981;
      border-radius: 8px;
      padding: 20px;
    }

    .savings-card.cost {
      border-color: #0A66C2;
    }

    .savings-label {
      font-size: 10pt;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .savings-value {
      font-size: 24pt;
      font-weight: 700;
      color: #10b981;
      margin-bottom: 10px;
    }

    .savings-card.cost .savings-value {
      color: #0A66C2;
    }

    .savings-detail {
      font-size: 9pt;
      color: #64748b;
      margin-top: 10px;
    }

    .risk-chart {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-top: 20px;
    }

    .risk-bar {
      text-align: center;
    }

    .risk-bar-visual {
      height: 150px;
      background: #f1f5f9;
      border-radius: 8px;
      margin-bottom: 10px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 5px;
    }

    .risk-bar-fill {
      width: 40px;
      border-radius: 4px 4px 0 0;
      min-height: 10px;
    }

    .risk-bar-fill.low { background: #10b981; }
    .risk-bar-fill.medium { background: #f59e0b; }
    .risk-bar-fill.high { background: #f97316; }
    .risk-bar-fill.critical { background: #ef4444; }

    .risk-count {
      font-size: 20pt;
      font-weight: 700;
      color: #0f172a;
    }

    .risk-label {
      font-size: 9pt;
      color: #64748b;
      margin-top: 5px;
    }

    .insights-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-top: 20px;
    }

    .insight-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
    }

    .insight-title {
      font-size: 12pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 15px;
    }

    .insight-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #f1f5f9;
    }

    .insight-item:last-child {
      border-bottom: none;
    }

    .insight-name {
      font-size: 10pt;
      color: #475569;
    }

    .insight-value {
      font-size: 10pt;
      font-weight: 600;
      color: #0f172a;
    }

    .footer {
      margin-top: 60px;
      padding-top: 30px;
      border-top: 2px solid #e2e8f0;
      text-align: center;
      color: #94a3b8;
      font-size: 9pt;
    }

    .footer .logo {
      font-size: 14pt;
      font-weight: 700;
      color: #0A66C2;
      margin-bottom: 10px;
    }

    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      .container {
        max-width: 100%;
      }

      .section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Executive Monthly Report</h1>
      <div class="subtitle">${scopeFilter}${moduleFilter}</div>
      <div class="subtitle">Period: ${formatDate(options.startDate)} - ${formatDate(options.endDate)}</div>
      <div class="date">Generated on ${reportDate}</div>
    </div>

    <div class="section">
      <h2 class="section-title">Executive Summary</h2>
      <div class="highlight-box">
        <h3>Key Highlights</h3>
        <p>
          During this reporting period, the system processed <strong>${formatNumber(kpis.totalQuotes)} quotes</strong>
          containing <strong>${formatNumber(kpis.totalLineItems)} line items</strong>, achieving a
          <strong>${kpis.parseSuccessRate.toFixed(1)}% parse success rate</strong>.
          ${kpis.totalAuditsCompleted > 0
            ? `A total of <strong>${formatNumber(kpis.totalAuditsCompleted)} audits</strong> were completed with an average processing time of <strong>${Math.round(kpis.avgTimeToAudit / 60)} minutes</strong> per audit.`
            : 'No audits were completed during this period.'
          }
        </p>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Key Performance Indicators</h2>
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total Quotes Processed</div>
          <div class="kpi-value">${formatNumber(kpis.totalQuotes)}</div>
          <div class="kpi-subtitle">${kpis.quotesSuccessfullyParsed} parsed successfully</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">Parse Success Rate</div>
          <div class="kpi-value">${kpis.parseSuccessRate.toFixed(1)}%</div>
          <div class="kpi-subtitle">${formatNumber(kpis.totalLineItems)} line items</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">Audits Completed</div>
          <div class="kpi-value">${formatNumber(kpis.totalAuditsCompleted)}</div>
          <div class="kpi-subtitle">${kpis.totalAuditsCompleted > 0 ? `Avg ${Math.round(kpis.avgTimeToAudit / 60)}m per audit` : 'No audits completed'}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">Average Confidence</div>
          <div class="kpi-value">${kpis.avgParseConfidence > 0 ? kpis.avgParseConfidence.toFixed(1) + '%' : 'N/A'}</div>
          <div class="kpi-subtitle">Extraction accuracy</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Value Generated</h2>
      <div class="savings-grid">
        <div class="savings-card">
          <div class="savings-label">Time Savings</div>
          <div class="savings-value">${formatNumber(Math.round(kpis.timeSavings.hoursSaved))} hrs</div>
          <div class="savings-detail">
            <strong>Labour Value:</strong> ${formatCurrency(kpis.timeSavings.labourSavingsNZD)}
            <br>
            Based on automated quote review and scope matrix generation
          </div>
        </div>

        <div class="savings-card cost">
          <div class="savings-label">Estimated Cost Avoided</div>
          <div class="savings-value">${formatCurrency(kpis.costSavings.expected)}</div>
          <div class="savings-detail">
            <strong>Range:</strong> ${formatCurrency(kpis.costSavings.conservative)} - ${formatCurrency(kpis.costSavings.aggressive)}
            <br>
            Risk mitigation through comprehensive audits
          </div>
        </div>
      </div>
    </div>

    ${kpis.totalAuditsCompleted > 0 ? `
    <div class="section">
      <h2 class="section-title">Risk Assessment Distribution</h2>
      <div class="risk-chart">
        <div class="risk-bar">
          <div class="risk-bar-visual">
            <div class="risk-bar-fill low" style="height: ${Math.max((kpis.riskDistribution.low / kpis.totalAuditsCompleted) * 100, 7)}%"></div>
          </div>
          <div class="risk-count">${kpis.riskDistribution.low}</div>
          <div class="risk-label">Low Risk<br>(&lt;40)</div>
        </div>

        <div class="risk-bar">
          <div class="risk-bar-visual">
            <div class="risk-bar-fill medium" style="height: ${Math.max((kpis.riskDistribution.medium / kpis.totalAuditsCompleted) * 100, 7)}%"></div>
          </div>
          <div class="risk-count">${kpis.riskDistribution.medium}</div>
          <div class="risk-label">Medium<br>(40-70)</div>
        </div>

        <div class="risk-bar">
          <div class="risk-bar-visual">
            <div class="risk-bar-fill high" style="height: ${Math.max((kpis.riskDistribution.high / kpis.totalAuditsCompleted) * 100, 7)}%"></div>
          </div>
          <div class="risk-count">${kpis.riskDistribution.high}</div>
          <div class="risk-label">High<br>(70-90)</div>
        </div>

        <div class="risk-bar">
          <div class="risk-bar-visual">
            <div class="risk-bar-fill critical" style="height: ${Math.max((kpis.riskDistribution.critical / kpis.totalAuditsCompleted) * 100, 7)}%"></div>
          </div>
          <div class="risk-count">${kpis.riskDistribution.critical}</div>
          <div class="risk-label">Critical<br>(≥90)</div>
        </div>
      </div>
    </div>
    ` : ''}

    ${(kpis.topGapTypes.length > 0 || kpis.topManufacturers.length > 0) ? `
    <div class="section">
      <h2 class="section-title">Key Insights</h2>
      <div class="insights-grid">
        ${kpis.topGapTypes.length > 0 ? `
        <div class="insight-card">
          <div class="insight-title">Top Gap Types</div>
          ${kpis.topGapTypes.slice(0, 5).map(gap => `
            <div class="insight-item">
              <span class="insight-name">${gap.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
              <span class="insight-value">${gap.count}</span>
            </div>
          `).join('')}
        </div>
        ` : ''}

        ${kpis.topManufacturers.length > 0 ? `
        <div class="insight-card">
          <div class="insight-title">Top Manufacturers</div>
          ${kpis.topManufacturers.slice(0, 5).map(mfg => `
            <div class="insight-item">
              <span class="insight-name">${mfg.manufacturer}</span>
              <span class="insight-value">${mfg.count}</span>
            </div>
          `).join('')}
        </div>
        ` : ''}
      </div>
    </div>
    ` : ''}

    <div class="footer">
      <div class="logo">VerifyPlus</div>
      <div>Comprehensive Quote Analysis & Audit Intelligence</div>
      <div style="margin-top: 10px;">Report generated automatically by VerifyPlus Platform</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export function downloadMonthlyReport(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
