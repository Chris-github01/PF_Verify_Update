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
  quoteId?: string;
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
    additionalSections,
    organisationLogoUrl,
    renderMode = 'screen',
    approvedQuoteId
  } = options;

  const totalSystems = suppliers[0]?.totalItems || 0;
  const supplierCount = suppliers.length;

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
      margin: ${renderMode === 'pdf' ? '12mm 12mm 14mm 12mm' : '20mm 15mm'};
    }

    * {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .page {
      page-break-after: always;
      min-height: ${renderMode === 'pdf' ? 'auto' : '100vh'};
      padding: 40px;
    }

    .page:last-child {
      page-break-after: auto;
    }

    .avoid-break {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .page-break {
      break-before: page;
      page-break-before: always;
    }

    img {
      max-width: 100%;
      height: auto;
    }

    table {
      break-inside: auto;
    }

    tr {
      break-inside: avoid;
      break-after: auto;
    }

    thead {
      display: table-header-group;
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

    /* === TYPOGRAPHY === */
    h1 {
      font-size: 46px;
      font-weight: 800;
      color: #111827;
      letter-spacing: -1.2px;
      line-height: 1.1;
      margin-bottom: 12px;
    }

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

    .subtitle {
      font-size: 22px;
      color: #6b7280;
      font-weight: 400;
      margin-bottom: 48px;
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
      gap: 18px;
      margin: 36px 0;
    }

    .methodology-step {
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 14px;
      padding: 24px 16px;
      text-align: center;
      transition: all 0.3s ease;
    }

    .methodology-step:hover {
      border-color: ${VERIFYTRADE_ORANGE};
      box-shadow: 0 4px 12px rgba(249, 115, 22, 0.15);
    }

    .step-number {
      width: 52px;
      height: 52px;
      margin: 0 auto 14px;
      border-radius: 50%;
      background: linear-gradient(135deg, ${VERIFYTRADE_ORANGE} 0%, ${VERIFYTRADE_ORANGE_DARK} 100%);
      color: white;
      font-size: 22px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 3px 8px rgba(249, 115, 22, 0.3);
    }

    .step-title {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      line-height: 1.4;
    }

    /* === INFO BOXES === */
    .info-box {
      background: #f9fafb;
      border-left: 4px solid #d1d5db;
      border-radius: 0 8px 8px 0;
      padding: 20px 24px;
      margin: 24px 0;
      line-height: 1.8;
    }

    .info-box.what-happened {
      border-left-color: #60a5fa;
      background: #eff6ff;
    }

    .info-box.what-means {
      border-left-color: #a78bfa;
      background: #f5f3ff;
    }

    .info-box-title {
      font-weight: 700;
      font-size: 15px;
      color: #111827;
      margin-bottom: 8px;
    }

    .info-box-content {
      color: #4b5563;
      font-size: 14px;
    }

    /* === CHECKMARK LIST === */
    .checkmark-list {
      list-style: none;
      padding: 0;
      margin: 24px 0;
    }

    .checkmark-list li {
      display: flex;
      align-items: flex-start;
      margin-bottom: 16px;
      line-height: 1.7;
    }

    .checkmark-list li:before {
      content: "✓";
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: #10b981;
      color: white;
      border-radius: 50%;
      margin-right: 12px;
      flex-shrink: 0;
      font-weight: 700;
      font-size: 14px;
    }

    /* === METRICS BOX === */
    .metrics-box {
      background: #f9fafb;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 24px;
      margin: 32px 0;
    }

    .metrics-title {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }

    .metric-item {
      text-align: center;
    }

    .metric-value {
      font-size: 28px;
      font-weight: 800;
      color: ${VERIFYTRADE_ORANGE};
      display: block;
      margin-bottom: 6px;
    }

    .metric-label {
      font-size: 12px;
      color: #6b7280;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* === ITEMIZED COMPARISON SECTION === */
    .itemized-section {
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 28px;
      margin: 32px 0;
    }

    .itemized-section h3 {
      margin-bottom: 12px;
    }

    .itemized-description {
      color: #6b7280;
      font-size: 14px;
      line-height: 1.7;
      margin-bottom: 24px;
    }

    .button-group {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s ease;
      cursor: pointer;
      border: 2px solid;
    }

    .btn-primary {
      background: ${VERIFYTRADE_ORANGE};
      color: white;
      border-color: ${VERIFYTRADE_ORANGE};
    }

    .btn-primary:hover {
      background: ${VERIFYTRADE_ORANGE_DARK};
      border-color: ${VERIFYTRADE_ORANGE_DARK};
    }

    .btn-secondary {
      background: white;
      color: #374151;
      border-color: #d1d5db;
    }

    .btn-secondary:hover {
      background: #f9fafb;
      border-color: #9ca3af;
    }

    /* === ACTION TAG === */
    .action-tag {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .action-tag.approved {
      background: #d1fae5;
      color: #065f46;
    }

    .action-tag.pending {
      background: #fef3c7;
      color: #92400e;
    }

    .action-tag.unsuccessful {
      background: #fee2e2;
      color: #991b1b;
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
  ${methodology ? generateMethodologyPages(methodology, organisationLogoUrl) : ''}
  ${generateRecommendationsPage(options)}
  ${generateSupplierComparisonPage(options)}
  ${additionalSections ? additionalSections.map(section => generateCustomSection(section, organisationLogoUrl)).join('') : ''}
</body>
</html>`;
}

/**
 * Generate Logo Section for Headers
 * Displays organization logo (if available) alongside VerifyTrade branding
 */
function generateLogoSection(organisationLogoUrl?: string, size: 'small' | 'large' = 'small'): string {
  const logoSize = size === 'large' ? 72 : 52;
  const iconSize = size === 'large' ? 40 : 28;
  const textSize = size === 'large' ? 32 : 'inherit';

  if (organisationLogoUrl) {
    // Show organization logo + VerifyTrade text
    return `
      <div class="logo-section">
        <img
          src="${organisationLogoUrl}"
          alt="Organisation Logo"
          crossorigin="anonymous"
          style="max-width: 140px; max-height: ${logoSize}px; object-fit: contain;"
        />
        <div style="border-left: 2px solid #e5e7eb; height: ${logoSize}px; margin: 0 12px;"></div>
        <div class="logo-text" style="font-size: ${textSize};">VerifyTrade</div>
      </div>`;
  } else {
    // Show VerifyTrade logo + text only
    return `
      <div class="logo-section">
        <div class="logo-icon" ${size === 'large' ? `style="width: ${logoSize}px; height: ${logoSize}px;"` : ''}>
          <svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
          </svg>
        </div>
        <div class="logo-text" style="font-size: ${textSize};">VerifyTrade</div>
      </div>`;
  }
}

/**
 * Generate Cover Page (Page 1)
 */
function generateCoverPage(options: ModernPdfOptions): string {
  const { projectName, clientName, generatedAt, suppliers, organisationLogoUrl } = options;
  const totalSystems = suppliers[0]?.totalItems || 0;
  const supplierCount = suppliers.length;

  return `
  <div class="page cover-page">
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;">
      <h1 style="text-align: center;">Award Recommendation Report</h1>
      <div class="subtitle" style="text-align: center;">Project Analysis & Supplier Evaluation</div>

      <div style="text-align: center; color: #6b7280; font-size: 16px; margin: 32px 0; line-height: 1.8;">
        <strong style="color: #111827;">Project:</strong> ${projectName} &nbsp;&nbsp;|&nbsp;&nbsp;
        <strong style="color: #111827;">Mode:</strong> Model &nbsp;&nbsp;|&nbsp;&nbsp;
        <strong style="color: #111827;">Suppliers:</strong> ${supplierCount} &nbsp;&nbsp;|&nbsp;&nbsp;
        <strong style="color: #111827;">Systems:</strong> ${totalSystems}
      </div>

      <div style="margin-top: 60px;">
        ${generateLogoSection(organisationLogoUrl, 'large')}
        <div style="font-size: 13px; color: #6b7280; margin-top: 12px; text-align: center;">
          Generated ${new Date(generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>
    </div>

    <footer style="text-align: right; margin-top: auto;">
      <div style="color: ${VERIFYTRADE_ORANGE}; font-weight: 600;">Generated by VerifyTrade</div>
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
 * Generate Methodology Pages (Pages 2-3)
 */
function generateMethodologyPages(steps: string[], organisationLogoUrl?: string): string {
  return `
  <div class="page page-break">
    <header>
      ${generateLogoSection(organisationLogoUrl, 'small')}
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <h2>Report Overview & Methodology</h2>

    <div class="executive-summary">
      <strong style="display: block; margin-bottom: 12px; font-size: 16px; color: #111827;">How This Report Works</strong>
      This comprehensive award recommendation report evaluates supplier quotes through a rigorous five-stage analysis process. Our methodology ensures objective, data-driven supplier selection based on price competitiveness, technical compliance, scope coverage, and risk assessment.
    </div>

    <h3 style="margin-top: 40px;">Five-Stage Evaluation Process</h3>

    <div class="methodology-grid">
      ${steps.slice(0, 5).map((step, index) => `
        <div class="methodology-step">
          <div class="step-number">${index + 1}</div>
          <div class="step-title">${step}</div>
        </div>
      `).join('')}
    </div>

    <div style="margin-top: 48px;">
      <h4>Stage 1: Quote Import & Validation</h4>
      <div class="info-box what-happened">
        <div class="info-box-title">What Happened</div>
        <div class="info-box-content">
          All supplier quotes were imported and parsed using advanced extraction algorithms. Each line item was validated for completeness and mathematical accuracy.
        </div>
      </div>
      <div class="info-box what-means">
        <div class="info-box-title">What This Means</div>
        <div class="info-box-content">
          You can trust the data quality. All prices, quantities, and descriptions have been verified and normalized for accurate comparison.
        </div>
      </div>
    </div>

    <footer>
      <div>© ${new Date().getFullYear()} VerifyTrade. All rights reserved.</div>
      <div>Page 2</div>
    </footer>
  </div>

  <div class="page page-break">
    <header>
      ${generateLogoSection(organisationLogoUrl, 'small')}
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <h2>Scoring & Weighting Criteria</h2>

    <div style="margin-top: 24px;">
      <h4>Multi-Criteria Decision Analysis (MCDA)</h4>
      <p style="color: #6b7280; line-height: 1.8; margin-bottom: 28px;">
        Each supplier is evaluated across four key dimensions with weighted scoring to identify the optimal choice:
      </p>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-card-value">40%</div>
          <div class="stat-card-label">Price Competitiveness</div>
          <p style="font-size: 12px; color: #6b7280; margin-top: 12px; line-height: 1.5;">
            Inverse linear scaling. Lowest price = 10 points.
          </p>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">25%</div>
          <div class="stat-card-label">Technical Compliance</div>
          <p style="font-size: 12px; color: #6b7280; margin-top: 12px; line-height: 1.5;">
            Based on specification adherence and risk factors.
          </p>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">20%</div>
          <div class="stat-card-label">Scope Coverage</div>
          <p style="font-size: 12px; color: #6b7280; margin-top: 12px; line-height: 1.5;">
            Percentage of baseline items quoted by supplier.
          </p>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">15%</div>
          <div class="stat-card-label">Risk Assessment</div>
          <p style="font-size: 12px; color: #6b7280; margin-top: 12px; line-height: 1.5;">
            Based on missing items and risk flags identified.
          </p>
        </div>
      </div>

      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 20px 24px; margin-top: 32px;">
        <strong style="color: #92400e; font-size: 14px;">Weighted Score Formula:</strong>
        <div style="font-family: monospace; color: #78350f; margin-top: 8px; font-size: 13px; line-height: 1.6;">
          Score = (Price × 0.40) + (Compliance × 0.25) + (Coverage × 0.20) + (Risk × 0.15)
        </div>
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
 * Generate Recommendations Page (Page 4)
 */
function generateRecommendationsPage(options: ModernPdfOptions): string {
  const { recommendations, suppliers, organisationLogoUrl } = options;
  const topSupplier = suppliers[0];
  const totalSystems = suppliers[0]?.totalItems || 0;
  const avgCoverage = suppliers.reduce((sum, s) => sum + s.coveragePercent, 0) / suppliers.length;

  return `
  <div class="page page-break">
    <header>
      ${generateLogoSection(organisationLogoUrl, 'small')}
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <h2>Award Recommendations</h2>

    <div class="recommendations-grid">
      ${recommendations.map(rec => generateRecommendationCard(rec)).join('')}
    </div>

    <div class="metrics-box">
      <div class="metrics-title">Key Metrics</div>
      <div class="metrics-grid">
        <div class="metric-item">
          <span class="metric-value">${suppliers.length}</span>
          <span class="metric-label">Quotes Evaluated</span>
        </div>
        <div class="metric-item">
          <span class="metric-value">${totalSystems}</span>
          <span class="metric-label">Systems Compared</span>
        </div>
        <div class="metric-item">
          <span class="metric-value">${avgCoverage.toFixed(0)}%</span>
          <span class="metric-label">Avg Coverage</span>
        </div>
      </div>
    </div>

    <div style="margin-top: 40px;">
      <h3>Why This Recommendation?</h3>
      <ul class="checkmark-list">
        <li><strong>Best Overall Value:</strong> ${topSupplier.supplierName} achieves the highest weighted score (${topSupplier.weightedScore?.toFixed(1) || 'N/A'}/10) across all evaluation criteria.</li>
        <li><strong>Comprehensive Coverage:</strong> Quotes ${topSupplier.coveragePercent.toFixed(1)}% of required scope (${topSupplier.itemsQuoted}/${topSupplier.totalItems} items), minimizing variation risk.</li>
        <li><strong>Optimal Balance:</strong> Provides competitive pricing while maintaining strong technical compliance and minimal delivery risk.</li>
      </ul>
    </div>

    <footer>
      <div>© ${new Date().getFullYear()} VerifyTrade. All rights reserved.</div>
      <div>Page 4</div>
    </footer>
  </div>
  `;
}

/**
 * Generate Supplier Comparison Page (Page 5)
 */
function generateSupplierComparisonPage(options: ModernPdfOptions): string {
  const { suppliers, organisationLogoUrl } = options;
  const totalItems = suppliers[0]?.totalItems || 0;

  return `
  <div class="page page-break">
    <header>
      ${generateLogoSection(organisationLogoUrl, 'small')}
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <h2>Supplier Comparison Summary</h2>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Supplier</th>
            <th>Total Price</th>
            <th>Systems Covered</th>
            <th>Coverage %</th>
            <th>Risk Score</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${suppliers.map((supplier, index) => {
            let statusTag = '<span class="action-tag pending">Pending</span>';
            if (approvedQuoteId && supplier.quoteId) {
              if (supplier.quoteId === approvedQuoteId) {
                statusTag = '<span class="action-tag approved">Approved</span>';
              } else {
                statusTag = '<span class="action-tag unsuccessful">Unsuccessful</span>';
              }
            }
            return `
            <tr class="${supplier.quoteId === approvedQuoteId ? 'rank-1' : ''}">
              <td><strong>${supplier.supplierName}</strong></td>
              <td class="price-cell">$${supplier.adjustedTotal.toLocaleString()}</td>
              <td>${supplier.itemsQuoted} / ${supplier.totalItems}</td>
              <td>${supplier.coveragePercent.toFixed(1)}%</td>
              <td>${(10 - supplier.riskScore).toFixed(1)}/10</td>
              <td>
                ${statusTag}
              </td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="itemized-section">
      <h3>Itemized Comparison</h3>
      <p class="itemized-description">
        ${totalItems} line items available for detailed comparison. Access the full itemized breakdown with side-by-side pricing, quantities, and variance analysis.
      </p>
      <div class="button-group">
        <div class="btn btn-primary">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          View Full Itemized Comparison
        </div>
        <div class="btn btn-secondary">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export Itemized Excel
        </div>
      </div>
    </div>

    <footer>
      <div>© ${new Date().getFullYear()} VerifyTrade. All rights reserved.</div>
      <div>Page 5</div>
    </footer>
  </div>
  `;
}

/**
 * Generate Custom Section
 */
function generateCustomSection(section: { title: string; content: string }, organisationLogoUrl?: string): string {
  return `
  <div class="page page-break">
    <header>
      ${generateLogoSection(organisationLogoUrl, 'small')}
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

/**
 * Generate PDF by opening HTML in new window with auto-print dialog
 * This provides a seamless UX - opens report and immediately shows print-to-PDF dialog
 */
export function generatePdfWithPrint(htmlContent: string, filename: string): void {
  // Add auto-print script and instructions to the HTML
  const htmlWithAutoPrint = htmlContent.replace(
    '</body>',
    `
    <script>
      // Auto-trigger print dialog when page loads
      window.onload = function() {
        setTimeout(function() {
          window.print();
        }, 1000);
      };

      // Show instructions banner
      window.addEventListener('DOMContentLoaded', function() {
        const banner = document.createElement('div');
        banner.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: #f97316; color: white; padding: 16px; text-align: center; font-size: 16px; font-weight: 600; z-index: 10000; box-shadow: 0 2px 8px rgba(0,0,0,0.2);';
        banner.innerHTML = '📄 Print Dialog Opening... Select "Save as PDF" as your destination printer to save this report';
        document.body.insertBefore(banner, document.body.firstChild);

        // Hide banner when printing
        window.addEventListener('beforeprint', function() {
          banner.style.display = 'none';
        });

        window.addEventListener('afterprint', function() {
          banner.style.display = 'block';
          banner.innerHTML = '✅ Print dialog closed. You can close this window now.';
          banner.style.background = '#059669';
        });
      });
    </script>
    </body>
    `
  );

  // Open in new window
  const printWindow = window.open('', '_blank', 'width=1200,height=800');
  if (printWindow) {
    printWindow.document.write(htmlWithAutoPrint);
    printWindow.document.close();
    printWindow.document.title = filename.replace('.pdf', '').replace('.html', '');
  } else {
    // Fallback to download if popup blocked
    console.warn('Popup blocked. Falling back to HTML download.');
    const htmlFilename = filename.replace('.pdf', '.html');
    downloadPdfHtml(htmlContent, htmlFilename);
  }
}
