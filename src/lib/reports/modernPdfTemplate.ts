/**
 * Modern Professional PDF Template for Award Reports
 * Generates clean, executive-style PDF exports with VerifyTrade branding
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
  riskScore: number;
  coveragePercent: number;
  itemsQuoted: number;
  totalItems: number;
  weightedScore?: number;
  notes?: string[];
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
}

const VERIFYTRADE_ORANGE = '#f97316';
const VERIFYTRADE_ORANGE_LIGHT = '#fed7aa';
const VERIFYTRADE_ORANGE_DARK = '#ea580c';

/**
 * Generate modern HTML template with professional styling
 */
export function generateModernPdfHtml(options: ModernPdfOptions): string {
  const {
    projectName,
    clientName,
    generatedAt,
    recommendations,
    suppliers,
    executiveSummary,
    methodology,
    additionalSections
  } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Award Recommendation Report - ${projectName}</title>
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
      min-height: 100vh;
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
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, ${VERIFYTRADE_ORANGE} 0%, ${VERIFYTRADE_ORANGE_DARK} 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 6px rgba(249, 115, 22, 0.2);
    }

    .logo-text {
      font-size: 24px;
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

    /* === TYPOGRAPHY === */
    h1 {
      font-size: 42px;
      font-weight: 800;
      color: #111827;
      letter-spacing: -1px;
      line-height: 1.1;
      margin-bottom: 12px;
    }

    h2 {
      font-size: 28px;
      font-weight: 700;
      color: #111827;
      letter-spacing: -0.5px;
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 2px solid #f3f4f6;
    }

    h3 {
      font-size: 20px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 16px;
    }

    .subtitle {
      font-size: 20px;
      color: #6b7280;
      font-weight: 400;
      margin-bottom: 40px;
    }

    /* === EXECUTIVE DASHBOARD (Page 1) === */
    .cover-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      min-height: 80vh;
      padding: 60px 40px;
    }

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

    /* === RECOMMENDATION CARDS === */
    .recommendations-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin: 48px 0;
    }

    .recommendation-card {
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 16px;
      padding: 28px 24px;
      text-align: center;
      position: relative;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
      transition: all 0.3s ease;
    }

    .recommendation-card.best-value {
      border-color: #10b981;
      background: linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%);
    }

    .recommendation-card.lowest-risk {
      border-color: #3b82f6;
      background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);
    }

    .recommendation-card.balanced {
      border-color: ${VERIFYTRADE_ORANGE};
      background: linear-gradient(135deg, #fff7ed 0%, #ffffff 100%);
    }

    .recommendation-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto 16px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
    }

    .best-value .recommendation-icon {
      background: #10b981;
      color: white;
    }

    .lowest-risk .recommendation-icon {
      background: #3b82f6;
      color: white;
    }

    .balanced .recommendation-icon {
      background: ${VERIFYTRADE_ORANGE};
      color: white;
    }

    .recommendation-type {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
      color: #6b7280;
    }

    .recommendation-supplier {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 16px;
      line-height: 1.2;
    }

    .recommendation-stats {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      padding: 6px 0;
    }

    .stat-label {
      color: #6b7280;
      font-weight: 500;
    }

    .stat-value {
      color: #111827;
      font-weight: 700;
    }

    /* === MODERN TABLE === */
    .table-container {
      margin: 32px 0;
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

    tbody tr.rank-1 td:first-child {
      background: ${VERIFYTRADE_ORANGE};
      color: white;
      font-weight: 700;
      border-radius: 6px;
    }

    tbody tr.rank-1 {
      background: linear-gradient(90deg, ${VERIFYTRADE_ORANGE_LIGHT} 0%, transparent 100%);
      font-weight: 600;
    }

    .price-cell {
      font-weight: 700;
      color: #059669;
      font-size: 14px;
    }

    .rank-badge {
      display: inline-block;
      width: 32px;
      height: 32px;
      line-height: 32px;
      text-align: center;
      border-radius: 8px;
      background: #e5e7eb;
      color: #374151;
      font-weight: 700;
      font-size: 13px;
    }

    .rank-1-badge {
      background: ${VERIFYTRADE_ORANGE};
      color: white;
    }

    /* === METHODOLOGY SECTION === */
    .methodology-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 16px;
      margin: 32px 0;
    }

    .methodology-step {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px 16px;
      text-align: center;
    }

    .step-number {
      width: 48px;
      height: 48px;
      margin: 0 auto 12px;
      border-radius: 50%;
      background: linear-gradient(135deg, ${VERIFYTRADE_ORANGE} 0%, ${VERIFYTRADE_ORANGE_DARK} 100%);
      color: white;
      font-size: 20px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .step-title {
      font-size: 12px;
      font-weight: 600;
      color: #374151;
      line-height: 1.3;
    }

    /* === CONTENT SECTIONS === */
    .content-section {
      margin: 40px 0;
    }

    .executive-summary {
      background: #f9fafb;
      border-left: 4px solid ${VERIFYTRADE_ORANGE};
      border-radius: 0 8px 8px 0;
      padding: 24px 28px;
      margin: 24px 0;
      font-size: 15px;
      line-height: 1.7;
      color: #374151;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
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

    /* === UTILITIES === */
    .text-center {
      text-align: center;
    }

    .mt-4 {
      margin-top: 16px;
    }

    .mb-4 {
      margin-bottom: 16px;
    }

    .divider {
      height: 1px;
      background: #e5e7eb;
      margin: 32px 0;
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

      .recommendation-card {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  ${generateCoverPage(options)}
  ${generateSupplierComparison(suppliers)}
  ${executiveSummary ? generateExecutiveSummaryPage(executiveSummary, suppliers) : ''}
  ${methodology ? generateMethodologyPage(methodology) : ''}
  ${additionalSections ? additionalSections.map(section => generateCustomSection(section)).join('') : ''}
</body>
</html>`;
}

/**
 * Generate Cover Page (Page 1)
 */
function generateCoverPage(options: ModernPdfOptions): string {
  const { projectName, clientName, generatedAt, recommendations } = options;

  return `
  <div class="page cover-page">
    <header>
      <div class="logo-section">
        <div class="logo-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
          </svg>
        </div>
        <div class="logo-text">VerifyTrade</div>
      </div>
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong><br>
        ${new Date(generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </header>

    <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
      <h1>Award Recommendation Report</h1>
      <div class="subtitle">Project Analysis & Supplier Evaluation</div>

      <div class="project-details-card">
        <div class="detail-row">
          <span class="detail-label">Project Name</span>
          <span class="detail-value">${projectName}</span>
        </div>
        ${clientName ? `
        <div class="detail-row">
          <span class="detail-label">Client</span>
          <span class="detail-value">${clientName}</span>
        </div>` : ''}
        <div class="detail-row">
          <span class="detail-label">Report Date</span>
          <span class="detail-value">${new Date(generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Suppliers Evaluated</span>
          <span class="detail-value">${recommendations.length} Suppliers</span>
        </div>
      </div>

      <h2 style="margin-top: 48px; border: none; text-align: center; font-size: 22px;">Evaluation Results</h2>

      <div class="recommendations-grid">
        ${recommendations.map(rec => generateRecommendationCard(rec)).join('')}
      </div>
    </div>

    <footer>
      <div>© ${new Date().getFullYear()} VerifyTrade. All rights reserved.</div>
      <div>Page 1</div>
    </footer>
  </div>
  `;
}

/**
 * Generate Recommendation Card
 */
function generateRecommendationCard(rec: RecommendationCard): string {
  const typeLabels = {
    best_value: 'Best Value',
    lowest_risk: 'Lowest Risk',
    balanced: 'Balanced Choice'
  };

  const icons = {
    best_value: '✓',
    lowest_risk: '🛡',
    balanced: '⚖'
  };

  return `
    <div class="recommendation-card ${rec.type.replace('_', '-')}">
      <div class="recommendation-icon">${icons[rec.type]}</div>
      <div class="recommendation-type">${typeLabels[rec.type]}</div>
      <div class="recommendation-supplier">${rec.supplierName}</div>
      <div class="recommendation-stats">
        <div class="stat-row">
          <span class="stat-label">Price</span>
          <span class="stat-value">$${rec.price.toLocaleString()}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Coverage</span>
          <span class="stat-value">${rec.coverage.toFixed(1)}%</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Risk Score</span>
          <span class="stat-value">${(10 - rec.riskScore).toFixed(1)}/10</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Overall Score</span>
          <span class="stat-value" style="color: ${VERIFYTRADE_ORANGE}; font-size: 16px;">${rec.score.toFixed(1)}/10</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate Supplier Comparison Table (Page 2)
 */
function generateSupplierComparison(suppliers: SupplierRow[]): string {
  return `
  <div class="page page-break">
    <header>
      <div class="logo-section">
        <div class="logo-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
          </svg>
        </div>
        <div class="logo-text">VerifyTrade</div>
      </div>
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <h2>Supplier Comparison Summary</h2>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Supplier Name</th>
            <th>Adjusted Total</th>
            <th>Risk Score</th>
            <th>Coverage</th>
            <th>Items Quoted</th>
            ${suppliers[0]?.weightedScore !== undefined ? '<th>Weighted Score</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${suppliers.map(supplier => `
            <tr class="rank-${supplier.rank}">
              <td>
                <span class="rank-badge ${supplier.rank === 1 ? 'rank-1-badge' : ''}">${supplier.rank}</span>
              </td>
              <td><strong>${supplier.supplierName}</strong></td>
              <td class="price-cell">$${supplier.adjustedTotal.toLocaleString()}</td>
              <td>${(10 - supplier.riskScore).toFixed(1)}/10</td>
              <td>${supplier.coveragePercent.toFixed(1)}%</td>
              <td>${supplier.itemsQuoted} / ${supplier.totalItems}</td>
              ${supplier.weightedScore !== undefined ? `<td><strong>${supplier.weightedScore.toFixed(2)}</strong></td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${suppliers[0]?.notes?.length ? `
    <div class="content-section">
      <h3>Key Notes</h3>
      <ul style="padding-left: 24px; margin-top: 16px; line-height: 1.8;">
        ${suppliers.slice(0, 3).map(s =>
          s.notes && s.notes.length > 0
            ? `<li><strong>${s.supplierName}:</strong> ${s.notes[0]}</li>`
            : ''
        ).filter(Boolean).join('')}
      </ul>
    </div>` : ''}

    <footer>
      <div>© ${new Date().getFullYear()} VerifyTrade. All rights reserved.</div>
      <div>Page 2</div>
    </footer>
  </div>
  `;
}

/**
 * Generate Executive Summary Page
 */
function generateExecutiveSummaryPage(summary: string, suppliers: SupplierRow[]): string {
  const topSupplier = suppliers[0];

  return `
  <div class="page page-break">
    <header>
      <div class="logo-section">
        <div class="logo-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
          </svg>
        </div>
        <div class="logo-text">VerifyTrade</div>
      </div>
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <h2>Executive Summary</h2>

    <div class="executive-summary">
      ${summary}
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-card-value">${suppliers.length}</div>
        <div class="stat-card-label">Suppliers Evaluated</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-value">$${topSupplier.adjustedTotal.toLocaleString()}</div>
        <div class="stat-card-label">Recommended Price</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-value">${topSupplier.coveragePercent.toFixed(0)}%</div>
        <div class="stat-card-label">Scope Coverage</div>
      </div>
    </div>

    <footer>
      <div>© ${new Date().getFullYear()} VerifyTrade. All rights reserved.</div>
      <div>Page 3</div>
    </footer>
  </div>
  `;
}

/**
 * Generate Methodology Page
 */
function generateMethodologyPage(steps: string[]): string {
  return `
  <div class="page page-break">
    <header>
      <div class="logo-section">
        <div class="logo-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
          </svg>
        </div>
        <div class="logo-text">VerifyTrade</div>
      </div>
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <h2>Evaluation Methodology</h2>

    <div class="methodology-grid">
      ${steps.slice(0, 5).map((step, index) => `
        <div class="methodology-step">
          <div class="step-number">${index + 1}</div>
          <div class="step-title">${step}</div>
        </div>
      `).join('')}
    </div>

    ${steps.length > 5 ? `
    <div class="content-section">
      <h3>Additional Steps</h3>
      <ul style="padding-left: 24px; margin-top: 16px; line-height: 1.8;">
        ${steps.slice(5).map(step => `<li>${step}</li>`).join('')}
      </ul>
    </div>` : ''}

    <footer>
      <div>© ${new Date().getFullYear()} VerifyTrade. All rights reserved.</div>
      <div>Page 4</div>
    </footer>
  </div>
  `;
}

/**
 * Generate Custom Section
 */
function generateCustomSection(section: { title: string; content: string }): string {
  return `
  <div class="page page-break">
    <header>
      <div class="logo-section">
        <div class="logo-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
          </svg>
        </div>
        <div class="logo-text">VerifyTrade</div>
      </div>
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <h2>${section.title}</h2>

    <div class="content-section">
      ${section.content}
    </div>

    <footer>
      <div>© ${new Date().getFullYear()} VerifyTrade. All rights reserved.</div>
    </footer>
  </div>
  `;
}

/**
 * Download HTML as file
 */
export function downloadPdfHtml(htmlContent: string, filename: string): void {
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
