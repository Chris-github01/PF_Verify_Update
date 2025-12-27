export interface LineItem {
  description: string;
  service: string;
  material: string;
  quantity: number | string;
  unit: string;
  unitPrice?: number;
  totalPrice?: number;
}

export interface RetentionCalculation {
  method: 'flat' | 'sliding_scale';
  totalAmount: number;
  retentionHeld: number;
  netPayable: number;
  effectiveRate: number;
  breakdown?: Array<{
    bandLabel: string;
    amountInBand: number;
    rate: number;
    retentionForBand: number;
  }>;
}

export interface SeniorReportData {
  projectName: string;
  projectClient: string;
  supplierName: string;
  totalAmount: number;
  retentionAmount: number;
  retentionPercentage: number;
  netAmount: number;
  retentionMethod?: 'flat' | 'sliding_scale';
  retentionCalculation?: RetentionCalculation;
  publicLiabilityInsurance?: number;
  motorVehicleInsurance?: number;
  subcontractorContacts?: {
    subcontractorName?: string;
    quantitySurveyor?: { name: string; phone: string; email: string };
    projectManager?: { name: string; phone: string; email: string };
    siteManager?: { name: string; phone: string; email: string };
    healthSafety?: { name: string; phone: string; email: string };
    accounts?: { name: string; phone: string; email: string };
    documentController?: { name: string; phone: string; email: string };
  };
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
  lineItems?: LineItem[];
  supplierContact?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  quoteComparison?: Array<{
    supplierName: string;
    amount: number;
    isAwarded: boolean;
    difference: number;
  }>;
  costBreakdown?: Array<{
    serviceType: string;
    coverage: string;
    itemCount: number;
    estimatedCost: number;
  }>;
  cashflowProjection?: Array<{
    month: string;
    amount: number;
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

function categorizeLineItems(items: LineItem[]): Map<string, LineItem[]> {
  const categories = new Map<string, LineItem[]>();

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
      category = 'Electrical';
    } else if (service.includes('plumbing') || desc.includes('plumbing') || desc.includes('pipe')) {
      category = 'Plumbing';
    } else if (service.includes('fire') || desc.includes('fire')) {
      category = 'Fire';
    } else if (service.includes('intumescent') || desc.includes('coating')) {
      category = 'Intumescent Coatings';
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
  const sortOrder = ['Electrical', 'Plumbing', 'Other Systems', 'Fire', 'Intumescent Coatings', 'Flush Boxes'];

  let html = '<div class="line-items-section">';

  sortOrder.forEach(category => {
    if (categorized.has(category)) {
      const categoryItems = categorized.get(category)!;
      const categoryTotal = categoryItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

      html += `
        <div class="category-section">
          <h3 class="category-title">
            <span class="checkmark">✓</span>
            ${category}
          </h3>
          <p class="category-count">${categoryItems.length} items${categoryTotal > 0 ? ` • $${categoryTotal.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}` : ''}</p>

          <div class="table-wrapper">
            <table class="line-items-table">
              <thead>
                <tr>
                  <th style="width: 35%">DESCRIPTION</th>
                  <th style="width: 15%">SERVICE</th>
                  <th style="width: 15%">MATERIAL</th>
                  <th style="width: 10%">QTY</th>
                  <th style="width: 10%">UNIT</th>
                  ${categoryTotal > 0 ? '<th style="width: 15%; text-align: right;">TOTAL</th>' : ''}
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
                    ${categoryTotal > 0 ? `<td class="text-right">$${(item.totalPrice || 0).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</td>` : ''}
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

function generateRetentionSummary(data: SeniorReportData): string {
  const retentionMethod = data.retentionMethod || 'flat';
  const retentionCalc = data.retentionCalculation;

  if (!retentionCalc) {
    return '';
  }

  const formatNZD = (value: number) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  let detailsHTML = '';

  if (retentionMethod === 'flat') {
    detailsHTML = `
      <p style="margin: 16px 0; font-size: 14px; color: #374151; line-height: 1.6;">
        A retention of <strong>${retentionCalc.effectiveRate.toFixed(1)}%</strong> shall be deducted from each payment claim and held in accordance with the subcontract.
      </p>
    `;
  } else {
    const breakdownRows = retentionCalc.breakdown?.map(band => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${band.bandLabel}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatNZD(band.amountInBand)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${band.rate.toFixed(1)}%</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">${formatNZD(band.retentionForBand)}</td>
      </tr>
    `).join('') || '';

    detailsHTML = `
      <p style="margin: 16px 0; font-size: 14px; color: #374151; line-height: 1.6;">
        Retention shall be applied on a <strong>sliding scale basis</strong> as follows:
      </p>
      <div style="margin: 20px 0; overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; background: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #111827; border-bottom: 2px solid #e5e7eb;">Contract Value Band</th>
              <th style="padding: 12px; text-align: right; font-weight: 600; color: #111827; border-bottom: 2px solid #e5e7eb;">Amount in Band</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #111827; border-bottom: 2px solid #e5e7eb;">Retention %</th>
              <th style="padding: 12px; text-align: right; font-weight: 600; color: #111827; border-bottom: 2px solid #e5e7eb;">Retention Held</th>
            </tr>
          </thead>
          <tbody>
            ${breakdownRows}
          </tbody>
        </table>
      </div>
    `;
  }

  return `
    <div style="margin-top: 32px; padding: 24px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px;">
      <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 700; color: #0c4a6e;">
        Retention (Commercial Terms)
      </h3>
      <div style="margin-bottom: 16px;">
        <div style="display: inline-block; padding: 6px 12px; background: #dbeafe; border: 1px solid #93c5fd; border-radius: 6px; font-size: 12px; font-weight: 600; color: #1e40af;">
          Method: ${retentionMethod === 'flat' ? 'Flat Retention' : 'Sliding Scale Retention'}
        </div>
      </div>
      <div style="margin-top: 16px;">
        <p style="margin: 0; font-size: 13px; color: #6b7280;"><strong>Retention Details:</strong></p>
        ${detailsHTML}
      </div>
      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #bae6fd;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <span style="font-size: 15px; color: #374151; font-weight: 600;">Effective Retention Held:</span>
          <span style="font-size: 15px; color: #ea580c; font-weight: 700;">${formatNZD(retentionCalc.retentionHeld)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="font-size: 15px; color: #374151; font-weight: 600;">Net Payable After Retention:</span>
          <span style="font-size: 15px; color: #16a34a; font-weight: 700;">${formatNZD(retentionCalc.netPayable)}</span>
        </div>
      </div>
      ${data.publicLiabilityInsurance || data.motorVehicleInsurance ? `
      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #bae6fd;">
        <p style="margin: 0 0 12px 0; font-size: 13px; color: #6b7280;"><strong>Insurance Requirements:</strong></p>
        ${data.publicLiabilityInsurance ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="font-size: 14px; color: #374151;">Public Liability Insurance:</span>
          <span style="font-size: 14px; color: #374151; font-weight: 600;">${formatNZD(data.publicLiabilityInsurance)}</span>
        </div>
        ` : ''}
        ${data.motorVehicleInsurance ? `
        <div style="display: flex; justify-content: space-between;">
          <span style="font-size: 14px; color: #374151;">Motor Vehicle Insurance:</span>
          <span style="font-size: 14px; color: #374151; font-weight: 600;">${formatNZD(data.motorVehicleInsurance)}</span>
        </div>
        ` : ''}
      </div>
      ` : ''}
    </div>
  `;
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

  const lineItemsHTML = data.lineItems && data.lineItems.length > 0
    ? generateLineItemsHTML(data.lineItems)
    : '';

  const scopeSystemsHTML = data.scopeSystems.map(system => `
    <div class="system-card-compact">
      <h4>${system.service_type}</h4>
      <p class="item-count-large">${system.item_count}</p>
      <p class="item-label">Items</p>
    </div>
  `).join('');

  const hasAnyContacts = data.supplierContact || data.supplierEmail || data.supplierPhone || data.supplierAddress ||
    (data.subcontractorContacts && (
      data.subcontractorContacts.quantitySurveyor?.name ||
      data.subcontractorContacts.projectManager?.name ||
      data.subcontractorContacts.siteManager?.name ||
      data.subcontractorContacts.healthSafety?.name ||
      data.subcontractorContacts.accounts?.name ||
      data.subcontractorContacts.documentController?.name
    ));

  const contactHTML = hasAnyContacts ? `
    <div class="contact-section">
      <h3>Subcontractor Contact Details</h3>

      ${(data.supplierContact || data.supplierEmail || data.supplierPhone || data.supplierAddress) ? `
        <div class="contact-grid" style="margin-bottom: 24px;">
          ${data.supplierContact ? `<div><strong>Main Contact:</strong> ${data.supplierContact}</div>` : ''}
          ${data.supplierEmail ? `<div><strong>Email:</strong> ${data.supplierEmail}</div>` : ''}
          ${data.supplierPhone ? `<div><strong>Phone:</strong> ${data.supplierPhone}</div>` : ''}
          ${data.supplierAddress ? `<div><strong>Address:</strong> ${data.supplierAddress}</div>` : ''}
        </div>
      ` : ''}

      ${data.subcontractorContacts ? `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 16px;">
          ${data.subcontractorContacts.quantitySurveyor?.name ? `
            <div style="padding: 12px; background: #f8fafc; border-left: 3px solid #3b82f6; border-radius: 4px;">
              <div style="font-weight: 700; color: #1e40af; margin-bottom: 8px; font-size: 13px;">Quantity Surveyor (Commercial)</div>
              <div style="font-size: 14px; color: #1e293b; margin-bottom: 4px;">${data.subcontractorContacts.quantitySurveyor.name}</div>
              ${data.subcontractorContacts.quantitySurveyor.email ? `<div style="font-size: 12px; color: #64748b;">${data.subcontractorContacts.quantitySurveyor.email}</div>` : ''}
              ${data.subcontractorContacts.quantitySurveyor.phone ? `<div style="font-size: 12px; color: #64748b;">${data.subcontractorContacts.quantitySurveyor.phone}</div>` : ''}
            </div>
          ` : ''}

          ${data.subcontractorContacts.projectManager?.name ? `
            <div style="padding: 12px; background: #f8fafc; border-left: 3px solid #10b981; border-radius: 4px;">
              <div style="font-weight: 700; color: #047857; margin-bottom: 8px; font-size: 13px;">Project Manager</div>
              <div style="font-size: 14px; color: #1e293b; margin-bottom: 4px;">${data.subcontractorContacts.projectManager.name}</div>
              ${data.subcontractorContacts.projectManager.email ? `<div style="font-size: 12px; color: #64748b;">${data.subcontractorContacts.projectManager.email}</div>` : ''}
              ${data.subcontractorContacts.projectManager.phone ? `<div style="font-size: 12px; color: #64748b;">${data.subcontractorContacts.projectManager.phone}</div>` : ''}
            </div>
          ` : ''}

          ${data.subcontractorContacts.siteManager?.name ? `
            <div style="padding: 12px; background: #f8fafc; border-left: 3px solid #f59e0b; border-radius: 4px;">
              <div style="font-weight: 700; color: #b45309; margin-bottom: 8px; font-size: 13px;">Site Manager</div>
              <div style="font-size: 14px; color: #1e293b; margin-bottom: 4px;">${data.subcontractorContacts.siteManager.name}</div>
              ${data.subcontractorContacts.siteManager.email ? `<div style="font-size: 12px; color: #64748b;">${data.subcontractorContacts.siteManager.email}</div>` : ''}
              ${data.subcontractorContacts.siteManager.phone ? `<div style="font-size: 12px; color: #64748b;">${data.subcontractorContacts.siteManager.phone}</div>` : ''}
            </div>
          ` : ''}

          ${data.subcontractorContacts.healthSafety?.name ? `
            <div style="padding: 12px; background: #f8fafc; border-left: 3px solid #ef4444; border-radius: 4px;">
              <div style="font-weight: 700; color: #b91c1c; margin-bottom: 8px; font-size: 13px;">Health & Safety Officer</div>
              <div style="font-size: 14px; color: #1e293b; margin-bottom: 4px;">${data.subcontractorContacts.healthSafety.name}</div>
              ${data.subcontractorContacts.healthSafety.email ? `<div style="font-size: 12px; color: #64748b;">${data.subcontractorContacts.healthSafety.email}</div>` : ''}
              ${data.subcontractorContacts.healthSafety.phone ? `<div style="font-size: 12px; color: #64748b;">${data.subcontractorContacts.healthSafety.phone}</div>` : ''}
            </div>
          ` : ''}

          ${data.subcontractorContacts.accounts?.name ? `
            <div style="padding: 12px; background: #f8fafc; border-left: 3px solid #8b5cf6; border-radius: 4px;">
              <div style="font-weight: 700; color: #6d28d9; margin-bottom: 8px; font-size: 13px;">Accounts</div>
              <div style="font-size: 14px; color: #1e293b; margin-bottom: 4px;">${data.subcontractorContacts.accounts.name}</div>
              ${data.subcontractorContacts.accounts.email ? `<div style="font-size: 12px; color: #64748b;">${data.subcontractorContacts.accounts.email}</div>` : ''}
              ${data.subcontractorContacts.accounts.phone ? `<div style="font-size: 12px; color: #64748b;">${data.subcontractorContacts.accounts.phone}</div>` : ''}
            </div>
          ` : ''}

          ${data.subcontractorContacts.documentController?.name ? `
            <div style="padding: 12px; background: #f8fafc; border-left: 3px solid #14b8a6; border-radius: 4px;">
              <div style="font-weight: 700; color: #0f766e; margin-bottom: 8px; font-size: 13px;">Document Controller</div>
              <div style="font-size: 14px; color: #1e293b; margin-bottom: 4px;">${data.subcontractorContacts.documentController.name}</div>
              ${data.subcontractorContacts.documentController.email ? `<div style="font-size: 12px; color: #64748b;">${data.subcontractorContacts.documentController.email}</div>` : ''}
              ${data.subcontractorContacts.documentController.phone ? `<div style="font-size: 12px; color: #64748b;">${data.subcontractorContacts.documentController.phone}</div>` : ''}
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  ` : '';

  const quoteComparisonHTML = data.quoteComparison && data.quoteComparison.length > 1 ? `
    <div class="card">
      <h3>Quote Comparison</h3>
      <div class="quote-comparison-table-wrapper">
        <table class="quote-comparison-table">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Quote Amount</th>
              <th>Variance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.quoteComparison.map(quote => `
              <tr class="${quote.isAwarded ? 'awarded-row' : ''}">
                <td><strong>${quote.supplierName}</strong></td>
                <td>$${quote.amount.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="${quote.difference > 0 ? 'negative' : quote.difference < 0 ? 'positive' : ''}">
                  ${quote.difference > 0 ? '+' : ''}${quote.difference.toFixed(1)}%
                </td>
                <td>${quote.isAwarded ? '<span class="status-badge awarded">✓ Awarded</span>' : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p class="benchmark-note">
        ${data.quoteComparison.filter(q => !q.isAwarded && q.difference < 0).length > 0
          ? '⚠ Lower quotes were received. Ensure the awarded supplier offers the best value based on quality, coverage, and terms.'
          : '✓ The awarded supplier provided the most competitive quote.'}
      </p>
    </div>
  ` : '';

  const costBreakdownHTML = data.costBreakdown && data.costBreakdown.length > 0 ? `
    <div class="card">
      <h3>Cost Breakdown by Service Type</h3>
      <div class="cost-breakdown-table-wrapper">
        <table class="cost-breakdown-table">
          <thead>
            <tr>
              <th>Service Type</th>
              <th>Coverage</th>
              <th>Items</th>
              <th>Estimated Cost</th>
              <th>% of Total</th>
            </tr>
          </thead>
          <tbody>
            ${data.costBreakdown.map(item => {
              const percentage = data.totalAmount > 0 ? (item.estimatedCost / data.totalAmount) * 100 : 0;
              return `
                <tr>
                  <td><strong>${item.serviceType}</strong></td>
                  <td>${item.coverage}</td>
                  <td>${item.itemCount}</td>
                  <td>$${item.estimatedCost.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>${percentage.toFixed(1)}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : '';

  const cashflowHTML = data.cashflowProjection && data.cashflowProjection.length > 0 ? `
    <div class="card full-width">
      <h3>Cashflow Forecast</h3>
      <div class="cashflow-table-wrapper">
        <table class="cashflow-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Forecast Amount</th>
            </tr>
          </thead>
          <tbody>
            ${data.cashflowProjection.map(month => `
              <tr>
                <td class="cashflow-month">${month.month}</td>
                <td class="cashflow-value">$${month.amount.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            `).join('')}
            <tr class="cashflow-total">
              <td class="cashflow-month"><strong>Total Forecast</strong></td>
              <td class="cashflow-value"><strong>$${data.cashflowProjection.reduce((sum, m) => sum + m.amount, 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  ` : '';

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
      font-size: 32px;
      font-weight: 800;
      color: #111827;
      letter-spacing: -0.8px;
      line-height: 1.1;
      margin-bottom: 12px;
    }

    .subtitle {
      font-size: 16px;
      color: #6b7280;
      font-weight: 400;
      margin-bottom: 32px;
    }

    /* === TYPOGRAPHY === */
    h2 {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      letter-spacing: -0.5px;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #f3f4f6;
    }

    h3 {
      font-size: 16px;
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

    /* === METRICS CARDS === */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
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
      font-size: 16px;
      font-weight: 800;
      color: ${VERIFYTRADE_ORANGE};
      margin-bottom: 8px;
      line-height: 1.2;
      word-break: break-word;
      overflow-wrap: break-word;
      hyphens: none;
    }

    .stat-card-label {
      font-size: 11px;
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

    /* === SCOPE SYSTEMS GRID === */
    .systems-grid-compact {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin: 20px 0;
    }

    .system-card-compact {
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 120px;
    }

    .system-card-compact h4 {
      color: ${VERIFYTRADE_ORANGE};
      font-size: 14px;
      margin-bottom: 12px;
      font-weight: 600;
    }

    .item-count-large {
      font-size: 36px;
      color: #111827;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 4px;
    }

    .item-label {
      font-size: 12px;
      color: #6b7280;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* === LINE ITEMS === */
    .line-items-section {
      margin: 20px 0;
    }

    .category-section {
      margin-bottom: 24px;
      page-break-inside: auto;
      break-inside: auto;
    }

    .category-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 18px;
      color: #111827;
      margin-bottom: 6px;
      font-weight: 600;
      page-break-after: avoid;
      break-after: avoid;
    }

    .category-title .checkmark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: #10b981;
      color: white;
      border-radius: 50%;
      font-weight: 700;
      font-size: 14px;
    }

    .category-count {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 12px;
      page-break-after: avoid;
      break-after: avoid;
    }

    .table-wrapper {
      overflow-x: auto;
      margin-bottom: 20px;
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

    .line-items-table tbody tr:nth-child(even) {
      background: #f9fafb;
    }

    .line-items-table td {
      padding: 8px 6px;
      color: #374151;
      line-height: 1.4;
    }

    .text-center {
      text-align: center;
    }

    .text-right {
      text-align: right;
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

    .contact-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      color: #0f172a;
      font-size: 13px;
    }

    .contact-grid strong {
      color: #0369a1;
      margin-right: 6px;
    }

    /* === QUOTE COMPARISON TABLE === */
    .quote-comparison-table-wrapper {
      overflow-x: auto;
      margin-top: 16px;
    }

    .quote-comparison-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .quote-comparison-table thead {
      background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
      color: white;
    }

    .quote-comparison-table th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .quote-comparison-table td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
    }

    .quote-comparison-table tr.awarded-row {
      background: #f0fdf4;
    }

    .quote-comparison-table td.positive {
      color: #16a34a;
      font-weight: 600;
    }

    .quote-comparison-table td.negative {
      color: #dc2626;
      font-weight: 600;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }

    .status-badge.awarded {
      background: #16a34a;
      color: white;
    }

    /* === COST BREAKDOWN TABLE === */
    .cost-breakdown-table-wrapper {
      overflow-x: auto;
      margin-top: 16px;
    }

    .cost-breakdown-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .cost-breakdown-table thead {
      background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
      color: white;
    }

    .cost-breakdown-table th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .cost-breakdown-table td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
    }

    .benchmark-note {
      margin-top: 16px;
      padding: 12px;
      background: #f9fafb;
      border-radius: 8px;
      font-size: 13px;
      color: #374151;
    }

    /* === CASHFLOW TABLE === */
    .cashflow-table-wrapper {
      overflow-x: auto;
      margin-top: 16px;
    }

    .cashflow-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .cashflow-table thead {
      background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
    }

    .cashflow-table thead th {
      padding: 14px 16px;
      text-align: left;
      font-weight: 700;
      font-size: 12px;
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .cashflow-table thead th:last-child {
      text-align: right;
    }

    .cashflow-table tbody tr {
      border-bottom: 1px solid #f3f4f6;
    }

    .cashflow-table tbody tr:nth-child(even) {
      background: #f9fafb;
    }

    .cashflow-table tbody tr:hover {
      background: #f3f4f6;
    }

    .cashflow-table .cashflow-month {
      padding: 12px 16px;
      color: #374151;
      font-weight: 500;
    }

    .cashflow-table .cashflow-value {
      padding: 12px 16px;
      color: #111827;
      font-weight: 600;
      text-align: right;
    }

    .cashflow-table .cashflow-total {
      background: ${VERIFYTRADE_ORANGE_LIGHT};
      border-top: 2px solid ${VERIFYTRADE_ORANGE};
    }

    .cashflow-table .cashflow-total .cashflow-value {
      color: ${VERIFYTRADE_ORANGE_DARK};
      font-size: 15px;
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

      /* Allow line items tables to break across pages */
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

      /* Keep other tables together */
      .table-container table {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      /* Keep cards together */
      .card, .stat-card, .contact-section {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      /* Category headers stay with content */
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
      <h1 style="text-align: center;">Senior Project Team Overview</h1>
      <div class="subtitle" style="text-align: center;">Executive Summary & Commercial Dashboard</div>

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

      <div class="stats-grid" style="margin-top: 40px;">
        <div class="stat-card">
          <div class="stat-card-value">$${data.totalAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="stat-card-label">Contract Value</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">$${data.retentionAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="stat-card-label">Retention</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">$${data.netAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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
      <div style="color: ${VERIFYTRADE_ORANGE}; font-weight: 600;">Generated by VerifyTrade www.verifytrade.co.nz</div>
    </footer>
  </div>

  <!-- SCOPE OF WORKS OVERVIEW PAGE -->
  <div class="page page-break">
    <header>
      ${generateLogoSection(data.organisationLogoUrl)}
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <h2>Scope of Works Overview</h2>
    <div class="systems-grid-compact">
      ${scopeSystemsHTML}
    </div>

    ${contactHTML}

    <footer>
      <div>© ${new Date().getFullYear()} VerifyTrade. All rights reserved.</div>
    </footer>
  </div>

  ${lineItemsHTML ? `
  <!-- LINE ITEMS DETAILS PAGE -->
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

  <!-- FINANCIAL & COMMERCIAL ANALYSIS PAGE -->
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
            <span class="cost-label">Less: Retention (${data.retentionPercentage}%)</span>
            <span class="cost-value" style="color: #f59e0b;">-$${data.retentionAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="cost-row">
            <span class="cost-label">Net Amount Payable</span>
            <span class="cost-value" style="color: #16a34a;">$${data.netAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      ${quoteComparisonHTML}
      ${costBreakdownHTML}
    </div>

    ${cashflowHTML}
  </div>

  <!-- COMMERCIAL TERMS PAGE -->
  <div class="page page-break">
    <header>
      ${generateLogoSection(data.organisationLogoUrl)}
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong>
      </div>
    </header>

    <h2>Key Commercial Terms</h2>
    <div class="table-container">
      <table>
        <tbody>
          ${keyTermsHTML}
        </tbody>
      </table>
    </div>

    ${generateRetentionSummary(data)}
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

    <div style="margin-top: 32px; padding: 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; text-align: center;">
      <p style="font-size: 12px; color: #6b7280; line-height: 1.7;">
        <strong style="color: #111827;">Confidential:</strong> This document contains commercial and sensitive information. Distribution restricted to authorized project team members only.
      </p>
    </div>
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
