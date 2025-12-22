export interface LineItem {
  description: string;
  service: string;
  material: string;
  quantity: number | string;
  unit: string;
}

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
  lineItems?: LineItem[];
  inclusions: string[];
  exclusions: string[];
  safetyNotes: string[];
  checklists: Array<{
    title: string;
    items: string[];
  }>;
  organisationLogoUrl?: string;
  supplierContact?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  supplierAddress?: string;
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

function categorizeLineItems(items: LineItem[]): Map<string, LineItem[]> {
  const categories = new Map<string, LineItem[]>();

  const categoryMap: Record<string, string> = {
    'Electrical': 'Electrical Cable Penetrations',
    'Plumbing': 'Plumbing Pipe Penetrations',
    'Fire Sprinkler': 'Fire Sprinkler Penetrations',
    'Fire': 'Fire Protection Systems',
    'Flush Box': 'Flush Boxes',
    'Flush Boxes': 'Flush Boxes'
  };

  items.forEach(item => {
    let category = 'Other Systems';

    const service = item.service.toLowerCase();
    const desc = item.description.toLowerCase();
    const material = item.material?.toLowerCase() || '';

    // Check for Flush Boxes FIRST (before Electrical)
    // This includes: flush boxes, powerpad, intumescent pads
    if (service.includes('flush box') ||
        desc.includes('flush box') ||
        desc.includes('powerpad') ||
        material.includes('powerpad') ||
        (desc.includes('intumescent') && desc.includes('pad')) ||
        (desc.includes('intumescent') && desc.includes('flush'))) {
      category = 'Flush Boxes';
    } else if (service.includes('electrical') || desc.includes('electrical') || desc.includes('cable')) {
      category = 'Electrical Cable Penetrations';
    } else if (service.includes('plumbing') || desc.includes('plumbing') || desc.includes('pipe')) {
      category = 'Plumbing Pipe Penetrations';
    } else if (service.includes('fire sprinkler') || desc.includes('fire sprinkler') || desc.includes('sprinkler')) {
      category = 'Fire Sprinkler Penetrations';
    } else if (service.includes('fire') && !desc.includes('flush box')) {
      category = 'Fire Protection Systems';
    }

    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)!.push(item);
  });

  return categories;
}

function generateLineItemsHTML(items: LineItem[]): string {
  const categorized = categorizeLineItems(items);
  const sortOrder = [
    'Electrical Cable Penetrations',
    'Plumbing Pipe Penetrations',
    'Other Systems',
    'Fire Sprinkler Penetrations',
    'Flush Boxes',
    'Fire Protection Systems'
  ];

  let html = '<div class="line-items-section">';

  sortOrder.forEach(category => {
    if (categorized.has(category)) {
      const categoryItems = categorized.get(category)!;
      html += `
        <div class="category-section">
          <h3 class="category-title">
            <span class="checkmark">✓</span>
            ${category}
          </h3>
          <p class="category-count">${categoryItems.length} items</p>

          <div class="table-wrapper">
            <table class="line-items-table">
              <thead>
                <tr>
                  <th style="width: 40%">DESCRIPTION</th>
                  <th style="width: 20%">SERVICE TYPE</th>
                  <th style="width: 20%">MATERIAL</th>
                  <th style="width: 10%">QTY</th>
                  <th style="width: 10%">UNIT</th>
                </tr>
              </thead>
              <tbody>
                ${categoryItems.map(item => `
                  <tr>
                    <td>${item.description}</td>
                    <td>${item.service}</td>
                    <td>${item.material}</td>
                    <td class="text-center">${item.quantity}</td>
                    <td class="text-center">${item.unit}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
  });

  html += '</div>';
  return html;
}

export function generateJuniorPackHTML(data: JuniorPackData): string {
  const safetyNotesHTML = data.safetyNotes.map(note =>
    `<li class="safety-item">${note}</li>`
  ).join('');

  const scopeSystemsHTML = data.scopeSystems.map(system => `
    <div class="system-card">
      <h4>${system.service_type}</h4>
      <p class="item-count-large">${system.item_count}</p>
      <p class="item-label">Items</p>
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

  const lineItemsHTML = data.lineItems && data.lineItems.length > 0
    ? generateLineItemsHTML(data.lineItems)
    : '';

  const inclusionsHTML = data.inclusions.length > 0 ? `
    <div class="inclusions-section">
      <h3>Scope Inclusions</h3>
      <ul class="inclusions-list">
        ${data.inclusions.map(inc => `<li>${inc}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  const exclusionsHTML = data.exclusions.length > 0 ? `
    <div class="exclusions-section">
      <h3>Scope Exclusions</h3>
      <p class="exclusions-intro">Not Included in Scope</p>
      <ul class="exclusions-list">
        ${data.exclusions.map(exc => `<li>⚠ ${exc}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  const contactHTML = (data.supplierContact || data.supplierEmail || data.supplierPhone || data.supplierAddress) ? `
    <div class="contact-section">
      <h3>Subcontractor Contact Details</h3>
      <div class="contact-card">
        ${data.supplierContact ? `<p><strong>Contact:</strong> ${data.supplierContact}</p>` : ''}
        ${data.supplierEmail ? `<p><strong>Email:</strong> ${data.supplierEmail}</p>` : ''}
        ${data.supplierPhone ? `<p><strong>Phone:</strong> ${data.supplierPhone}</p>` : ''}
        ${data.supplierAddress ? `<p><strong>Address:</strong> ${data.supplierAddress}</p>` : ''}
      </div>
    </div>
  ` : '';

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
      margin: 15mm 12mm;
    }

    .page {
      page-break-after: always;
      padding: 20px 30px 60px 30px;
      position: relative;
      box-sizing: border-box;
      min-height: 0;
    }

    .page:last-child {
      page-break-after: auto;
    }

    /* === HEADER & FOOTER === */
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 2px solid ${VERIFYTRADE_ORANGE};
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
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 10px 30px;
      border-top: 1px solid #e5e7eb;
      background: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
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
      font-size: 28px;
      font-weight: 700;
      color: #111827;
      letter-spacing: -0.5px;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #f3f4f6;
    }

    h3 {
      font-size: 20px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 14px;
    }

    h4 {
      font-size: 16px;
      font-weight: 600;
      color: #4b5563;
      margin-bottom: 10px;
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
      padding: 16px 20px;
      margin: 20px 0;
      line-height: 1.6;
    }

    .warning-box h3 {
      font-weight: 700;
      font-size: 14px;
      color: #92400e;
      margin-bottom: 10px;
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
      padding: 24px;
      transition: all 0.3s ease;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 140px;
    }

    .system-card:hover {
      border-color: ${VERIFYTRADE_ORANGE};
      box-shadow: 0 4px 12px rgba(249, 115, 22, 0.15);
    }

    .system-card h4 {
      color: ${VERIFYTRADE_ORANGE};
      font-size: 16px;
      margin-bottom: 16px;
      font-weight: 600;
    }

    .item-count {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 12px;
      font-weight: 500;
    }

    .item-count-large {
      font-size: 48px;
      color: #111827;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 4px;
    }

    .item-label {
      font-size: 14px;
      color: #6b7280;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
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
      padding: 18px;
      margin-bottom: 16px;
    }

    .checklist-section h3 {
      font-size: 16px;
      color: #111827;
      margin-bottom: 12px;
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

    /* === LINE ITEMS TABLE === */
    .line-items-section {
      margin: 20px 0;
    }

    .category-section {
      margin-bottom: 28px;
      page-break-inside: auto;
      break-inside: auto;
    }

    .category-title {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 20px;
      color: #111827;
      margin-bottom: 8px;
      font-weight: 600;
      page-break-after: avoid;
      break-after: avoid;
    }

    .category-title .checkmark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: #10b981;
      color: white;
      border-radius: 50%;
      font-weight: 700;
      font-size: 16px;
    }

    .category-count {
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 16px;
      page-break-after: avoid;
      break-after: avoid;
    }

    .table-wrapper {
      overflow-x: auto;
      margin-bottom: 24px;
    }

    .line-items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      background: white;
      border: 1px solid #e5e7eb;
      page-break-inside: auto;
      break-inside: auto;
    }

    .line-items-table thead {
      background: ${VERIFYTRADE_ORANGE};
      color: white;
      display: table-header-group;
    }

    .line-items-table th {
      padding: 10px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid ${VERIFYTRADE_ORANGE_DARK};
    }

    .line-items-table tbody {
      page-break-inside: auto;
    }

    .line-items-table tbody tr {
      border-bottom: 1px solid #f3f4f6;
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-after: auto;
      break-after: auto;
    }

    .line-items-table tbody tr:last-child {
      border-bottom: none;
    }

    .line-items-table tbody tr:hover {
      background: #f9fafb;
    }

    .line-items-table td {
      padding: 8px 6px;
      color: #374151;
      line-height: 1.4;
      vertical-align: top;
    }

    .line-items-table .text-center {
      text-align: center;
    }

    /* === CONTACT SECTION === */
    .contact-section {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0;
    }

    .contact-section h3 {
      color: #0c4a6e;
      margin-bottom: 12px;
    }

    .contact-card p {
      margin: 6px 0;
      color: #0f172a;
      font-size: 13px;
    }

    .contact-card strong {
      color: #0369a1;
      margin-right: 6px;
    }

    /* === INCLUSIONS SECTION === */
    .inclusions-section {
      background: #f0fdf4;
      border-left: 4px solid #10b981;
      border-radius: 0 12px 12px 0;
      padding: 20px;
      margin: 20px 0;
    }

    .inclusions-section h3 {
      color: #065f46;
      margin-bottom: 12px;
    }

    .inclusions-list {
      list-style: none;
      padding-left: 0;
    }

    .inclusions-list li {
      padding: 10px 0;
      padding-left: 28px;
      position: relative;
      color: #064e3b;
      border-bottom: 1px solid #d1fae5;
      line-height: 1.6;
    }

    .inclusions-list li:last-child {
      border-bottom: none;
    }

    .inclusions-list li:before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #10b981;
      font-weight: 700;
      font-size: 18px;
    }

    /* === EXCLUSIONS SECTION === */
    .exclusions-section {
      background: #fef2f2;
      border-left: 4px solid #ef4444;
      border-radius: 0 12px 12px 0;
      padding: 20px;
      margin: 20px 0;
    }

    .exclusions-section h3 {
      color: #991b1b;
      margin-bottom: 10px;
    }

    .exclusions-intro {
      font-weight: 600;
      color: #7f1d1d;
      margin-bottom: 12px;
      font-size: 14px;
    }

    .exclusions-list {
      list-style: none;
      padding-left: 0;
    }

    .exclusions-list li {
      padding: 10px 0;
      color: #7f1d1d;
      border-bottom: 1px solid #fecaca;
      line-height: 1.6;
    }

    .exclusions-list li:last-child {
      border-bottom: none;
    }

    /* === PAGE BREAK CONTROL === */
    .page-break-inside-avoid {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* === PRINT STYLES === */
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
        margin: 0 !important;
        padding: 0 !important;
        padding-bottom: 20mm !important; /* Reserve space for fixed footer */
      }

      .page {
        min-height: auto !important;
        height: auto !important;
        padding-bottom: 40px;
      }

      .page:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }

      .page-break {
        page-break-after: always;
        break-after: page;
      }

      /* Allow tables to break across pages */
      .line-items-table {
        page-break-inside: auto !important;
        break-inside: auto !important;
      }

      /* Repeat table headers on each page */
      .line-items-table thead {
        display: table-header-group !important;
      }

      /* Prevent row breaks but allow table breaks */
      .line-items-table tbody tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: auto !important;
        break-after: auto !important;
      }

      /* Keep small sections together */
      .checklist-section, .contact-section, .warning-box {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      /* Category headers stay with at least first row */
      .category-title, .category-count {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }

      /* Prevent orphaned headings */
      h2, h3 {
        page-break-after: avoid !important;
        break-after: avoid !important;
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

    ${contactHTML}

    <footer>
      <div>© ${new Date().getFullYear()} VerifyTrade. All rights reserved.</div>
      <div>Page 2</div>
    </footer>
  </div>

  ${lineItemsHTML ? `
  <!-- LINE ITEMS DETAILS PAGE(S) -->
  <div class="page">
    <header>
      ${generateLogoSection(data.organisationLogoUrl)}
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <h2>Detailed Line Items</h2>
    ${lineItemsHTML}
  </div>
  ` : ''}

  <!-- SAFETY & INSTALLATION PAGE -->
  <div class="page page-break">
    <header>
      ${generateLogoSection(data.organisationLogoUrl)}
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <div class="warning-box">
      <h3>Safety & Installation Notes</h3>
      <ul>
        ${safetyNotesHTML}
      </ul>
    </div>

    <h2>Site Handover Checklists</h2>
    ${checklistsHTML}
  </div>

  ${inclusionsHTML || exclusionsHTML ? `
  <!-- INCLUSIONS & EXCLUSIONS PAGE -->
  <div class="page page-break">
    <header>
      ${generateLogoSection(data.organisationLogoUrl)}
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    ${inclusionsHTML}
    ${exclusionsHTML}
  </div>
  ` : ''}

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
      'Use appropriate PPE: Hard hat, safety glasses, high-vis vest, safety boots',
      'Follow manufacturer\'s instructions for all fire protection materials'
    ],
    checklists: [
      {
        title: 'Pre-Start Checklist',
        items: [
          'Site induction completed',
          'SWMS reviewed and signed',
          'All required materials and equipment on site'
        ]
      },
      {
        title: 'Installation Checklist',
        items: [
          'Verify penetration dimensions against drawings',
          'Check FRR requirements',
          'Apply products as per manufacturer specifications'
        ]
      },
      {
        title: 'Quality Control',
        items: [
          'Photograph all completed penetrations',
          'Complete QA documentation for each penetration',
          'Ensure PS3 documentation is prepared'
        ]
      }
    ]
  };
}
