const VERIFYTRADE_ORANGE = '#f97316';

interface RetentionTier {
  threshold_nzd: number | null;
  rate_percent: number;
}

interface RetentionCalculation {
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

interface PreletAppendixData {
  project_id: string;
  scope_summary?: string;
  pricing_basis?: string;
  inclusions?: any[];
  exclusions?: any[];
  commercial_assumptions?: any[];
  clarifications?: any[];
  known_risks?: any[];
  is_finalised?: boolean;
  finalised_at?: string;
  awarded_subcontractor?: string;
  awarded_total_ex_gst?: number;
  awarded_total_inc_gst?: number;
  awarded_pricing_basis?: string;
  award_date?: string;
  award_status?: string;
  quote_reference?: string;
  quote_revision?: string;
  scope_summary_snapshot?: string;
  systems_snapshot?: any[];
  attachments_snapshot?: any[];
  project?: any;
  supplierContact?: any;
  scopeSystems?: any[];
  allowances?: any[];
}

function calculateRetention(
  totalAmount: number,
  retentionPercentage: number,
  retentionMethod: 'flat' | 'sliding_scale' = 'flat',
  retentionTiers: RetentionTier[] | null = null
): RetentionCalculation {
  if (retentionMethod === 'flat' || !retentionTiers || retentionTiers.length === 0) {
    const retentionHeld = totalAmount * (retentionPercentage / 100);
    return {
      method: 'flat',
      totalAmount,
      retentionHeld,
      netPayable: totalAmount - retentionHeld,
      effectiveRate: retentionPercentage
    };
  }

  const sortedTiers = [...retentionTiers].sort((a, b) => {
    if (a.threshold_nzd === null) return 1;
    if (b.threshold_nzd === null) return -1;
    return a.threshold_nzd - b.threshold_nzd;
  });

  let totalRetention = 0;
  let remainingAmount = totalAmount;
  let previousThreshold = 0;
  const breakdown: RetentionCalculation['breakdown'] = [];

  for (let i = 0; i < sortedTiers.length; i++) {
    const tier = sortedTiers[i];
    const currentThreshold = tier.threshold_nzd ?? Infinity;

    if (remainingAmount <= 0) break;

    const amountInBand = Math.min(
      remainingAmount,
      currentThreshold - previousThreshold
    );

    if (amountInBand > 0) {
      const retentionForBand = amountInBand * (tier.rate_percent / 100);
      totalRetention += retentionForBand;

      const bandLabel = tier.threshold_nzd === null
        ? `Above ${formatCurrency(previousThreshold)}`
        : i === 0
        ? `Up to ${formatCurrency(currentThreshold)}`
        : `${formatCurrency(previousThreshold)} – ${formatCurrency(currentThreshold)}`;

      breakdown.push({
        bandLabel,
        amountInBand,
        rate: tier.rate_percent,
        retentionForBand
      });

      remainingAmount -= amountInBand;
    }

    if (tier.threshold_nzd !== null) {
      previousThreshold = tier.threshold_nzd;
    }
  }

  const effectiveRate = totalAmount > 0 ? (totalRetention / totalAmount) * 100 : 0;

  return {
    method: 'sliding_scale',
    totalAmount,
    retentionHeld: totalRetention,
    netPayable: totalAmount - totalRetention,
    effectiveRate,
    breakdown
  };
}

function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return '$0.00';
  return `$${amount.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPricingBasis(basis: string | undefined | null): string {
  if (!basis) return 'N/A';
  return basis.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(date: string | undefined | null): string {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-NZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function renderList(items: any[] | undefined | null, title: string): string {
  if (!items || items.length === 0) return '';

  const listItems = items.map(item => {
    const text = typeof item === 'string' ? item : (item.text || item.description || '');
    return `<li style="margin-bottom: 8px; line-height: 1.6;">${text}</li>`;
  }).join('');

  return `
    <div style="margin-bottom: 24px;">
      <h4 style="font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">
        ${title}
      </h4>
      <ul style="list-style-type: disc; padding-left: 24px; color: #374151;">
        ${listItems}
      </ul>
    </div>
  `;
}

function renderContractSummary(data: PreletAppendixData): string {
  if (!data.project) return '';

  const project = data.project;
  const supplier = data.supplierContact || {};

  return `
    <div style="margin-bottom: 32px; page-break-inside: avoid;">
      <h3 style="font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 16px; border-bottom: 3px solid ${VERIFYTRADE_ORANGE}; padding-bottom: 8px;">
        1. Contract Summary
      </h3>

      <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <h4 style="font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 12px;">Project Details</h4>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Project Name</div>
            <div style="font-size: 14px; color: #111827; font-weight: 600;">${project.name || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Client</div>
            <div style="font-size: 14px; color: #111827;">${project.client || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Main Contractor</div>
            <div style="font-size: 14px; color: #111827;">${project.main_contractor_name || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Pricing Basis</div>
            <div style="font-size: 14px; color: #111827; font-weight: 600;">${formatPricingBasis(data.awarded_pricing_basis)}</div>
          </div>
        </div>
      </div>

      <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <h4 style="font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 12px;">Subcontractor Details</h4>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Company Name</div>
            <div style="font-size: 14px; color: #111827; font-weight: 600;">${data.awarded_subcontractor || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Contact Name</div>
            <div style="font-size: 14px; color: #111827;">${supplier.contact_name || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Email</div>
            <div style="font-size: 14px; color: #111827;">${supplier.contact_email || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Phone</div>
            <div style="font-size: 14px; color: #111827;">${supplier.contact_phone || 'N/A'}</div>
          </div>
          ${supplier.address ? `
          <div style="grid-column: 1 / -1;">
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Address</div>
            <div style="font-size: 14px; color: #111827;">${supplier.address}</div>
          </div>
          ` : ''}
        </div>
      </div>

      <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <h4 style="font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 12px;">Project Management</h4>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Project Manager</div>
            <div style="font-size: 14px; color: #111827;">${project.project_manager_name || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Manager Email</div>
            <div style="font-size: 14px; color: #111827;">${project.project_manager_email || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Manager Phone</div>
            <div style="font-size: 14px; color: #111827;">${project.project_manager_phone || 'N/A'}</div>
          </div>
        </div>
      </div>

      <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px;">
        <h4 style="font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 12px;">Commercial Terms</h4>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Payment Terms</div>
            <div style="font-size: 14px; color: #111827;">${project.payment_terms || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Retention</div>
            <div style="font-size: 14px; color: #111827;">${project.retention_percentage ? project.retention_percentage + '%' : 'N/A'}</div>
          </div>
          <div style="grid-column: 1 / -1;">
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; font-weight: 600;">Liquidated Damages</div>
            <div style="font-size: 14px; color: #111827;">${project.liquidated_damages || 'N/A'}</div>
          </div>
        </div>
      </div>

      ${renderRetentionSummary(project, data.awarded_total_ex_gst)}
    </div>
  `;
}

function renderRetentionSummary(project: any, awardedTotal: number | undefined): string {
  if (!awardedTotal) return '';

  const retentionMethod = project.retention_method || 'flat';
  const retentionPercentage = project.retention_percentage || 5;
  const retentionTiers = project.retention_tiers || [];

  const retentionCalc = calculateRetention(
    awardedTotal,
    retentionPercentage,
    retentionMethod,
    retentionTiers.length > 0 ? retentionTiers : null
  );

  let detailsHTML = '';

  if (retentionMethod === 'flat') {
    detailsHTML = `
      <p style="margin: 12px 0; font-size: 13px; color: #374151; line-height: 1.6;">
        A retention of <strong>${retentionCalc.effectiveRate.toFixed(1)}%</strong> shall be deducted from each payment claim and held in accordance with the subcontract.
      </p>
    `;
  } else {
    const breakdownRows = retentionCalc.breakdown?.map(band => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${band.bandLabel}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 12px;">${formatCurrency(band.amountInBand)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 12px;">${band.rate.toFixed(1)}%</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; font-size: 12px;">${formatCurrency(band.retentionForBand)}</td>
      </tr>
    `).join('') || '';

    detailsHTML = `
      <p style="margin: 12px 0; font-size: 13px; color: #374151; line-height: 1.6;">
        Retention shall be applied on a <strong>sliding scale basis</strong> as follows:
      </p>
      <table style="width: 100%; border-collapse: collapse; background: white; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; margin: 12px 0;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px; text-align: left; font-weight: 600; font-size: 11px; color: #6b7280; border-bottom: 2px solid #e5e7eb; text-transform: uppercase;">Contract Value Band</th>
            <th style="padding: 8px; text-align: right; font-weight: 600; font-size: 11px; color: #6b7280; border-bottom: 2px solid #e5e7eb; text-transform: uppercase;">Amount in Band</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; font-size: 11px; color: #6b7280; border-bottom: 2px solid #e5e7eb; text-transform: uppercase;">Retention %</th>
            <th style="padding: 8px; text-align: right; font-weight: 600; font-size: 11px; color: #6b7280; border-bottom: 2px solid #e5e7eb; text-transform: uppercase;">Retention Held</th>
          </tr>
        </thead>
        <tbody>
          ${breakdownRows}
        </tbody>
      </table>
    `;
  }

  return `
    <div style="margin-top: 24px; padding: 20px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; page-break-inside: avoid;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
        <h4 style="font-size: 15px; font-weight: 700; color: #0c4a6e; margin: 0;">Retention (Commercial Terms)</h4>
        <div style="display: inline-block; padding: 4px 10px; background: #dbeafe; border: 1px solid #93c5fd; border-radius: 4px; font-size: 11px; font-weight: 600; color: #1e40af; text-transform: uppercase;">
          ${retentionMethod === 'flat' ? 'Flat Retention' : 'Sliding Scale'}
        </div>
      </div>
      <div style="margin-bottom: 8px;">
        <p style="margin: 0; font-size: 12px; color: #6b7280; font-weight: 600;">Retention Details:</p>
        ${detailsHTML}
      </div>
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #bae6fd;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="font-size: 13px; color: #374151; font-weight: 600;">Effective Retention Held:</span>
          <span style="font-size: 13px; color: #ea580c; font-weight: 700;">${formatCurrency(retentionCalc.retentionHeld)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="font-size: 13px; color: #374151; font-weight: 600;">Net Payable After Retention:</span>
          <span style="font-size: 13px; color: #16a34a; font-weight: 700;">${formatCurrency(retentionCalc.netPayable)}</span>
        </div>
      </div>
    </div>
  `;
}

function renderScopeSystems(data: PreletAppendixData): string {
  if (!data.scopeSystems || data.scopeSystems.length === 0) return '';

  const systemsHtml = data.scopeSystems.map((system: any) => `
    <div style="margin-bottom: 20px; page-break-inside: avoid;">
      <div style="background: #f3f4f6; border-left: 4px solid ${VERIFYTRADE_ORANGE}; padding: 12px 16px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h5 style="font-size: 14px; font-weight: 700; color: #111827; margin: 0;">${system.service_type}</h5>
          <div style="display: flex; gap: 16px; align-items: center;">
            <div style="font-size: 12px; color: #6b7280;">${system.item_count} items</div>
            <div style="font-size: 14px; font-weight: 700; color: #111827;">${formatCurrency(system.total)}</div>
          </div>
        </div>
      </div>
      ${system.items && system.items.length > 0 ? `
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
              <th style="text-align: left; padding: 8px; font-weight: 600; color: #6b7280;">Description</th>
              <th style="text-align: right; padding: 8px; font-weight: 600; color: #6b7280; width: 80px;">Qty</th>
              <th style="text-align: left; padding: 8px; font-weight: 600; color: #6b7280; width: 60px;">Unit</th>
              <th style="text-align: right; padding: 8px; font-weight: 600; color: #6b7280; width: 100px;">Rate</th>
              <th style="text-align: right; padding: 8px; font-weight: 600; color: #6b7280; width: 120px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${system.items.map((item: any, idx: number) => `
              <tr style="border-bottom: 1px solid #e5e7eb; ${idx % 2 === 0 ? 'background: #ffffff;' : 'background: #f9fafb;'}">
                <td style="padding: 8px; color: #374151;">${item.description || 'N/A'}</td>
                <td style="padding: 8px; text-align: right; color: #374151;">${item.quantity || ''}</td>
                <td style="padding: 8px; color: #374151;">${item.unit || ''}</td>
                <td style="padding: 8px; text-align: right; color: #374151;">${item.rate ? formatCurrency(item.rate) : ''}</td>
                <td style="padding: 8px; text-align: right; font-weight: 600; color: #111827;">${formatCurrency(item.total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
    </div>
  `).join('');

  const totalValue = data.scopeSystems.reduce((sum, sys) => sum + (sys.total || 0), 0);

  return `
    <div style="margin-bottom: 32px; page-break-inside: avoid;">
      <h3 style="font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 16px; border-bottom: 3px solid ${VERIFYTRADE_ORANGE}; padding-bottom: 8px;">
        2. Scope & Systems Breakdown
      </h3>
      <p style="font-size: 13px; color: #6b7280; margin-bottom: 20px; line-height: 1.6;">
        Detailed breakdown of all systems and work packages included in this contract.
      </p>
      ${systemsHtml}
      <div style="background: #111827; color: white; padding: 16px; border-radius: 8px; margin-top: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 14px; font-weight: 600;">Total Scope Value</div>
          <div style="font-size: 18px; font-weight: 700;">${formatCurrency(totalValue)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderAllowances(data: PreletAppendixData): string {
  if (!data.allowances || data.allowances.length === 0) return '';

  const allowancesHtml = data.allowances.map((allowance: any, idx: number) => `
    <tr style="border-bottom: 1px solid #e5e7eb; ${idx % 2 === 0 ? 'background: #ffffff;' : 'background: #f9fafb;'}">
      <td style="padding: 10px; color: #374151; font-weight: 500;">
        ${allowance.description || 'N/A'}
        ${allowance.is_provisional ? '<span style="background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 6px; font-weight: 600;">PROVISIONAL</span>' : ''}
      </td>
      <td style="padding: 10px; text-align: center; color: #374151;">${allowance.quantity || ''}</td>
      <td style="padding: 10px; text-align: center; color: #374151;">${allowance.unit || ''}</td>
      <td style="padding: 10px; text-align: right; color: #374151;">${allowance.rate ? formatCurrency(allowance.rate) : 'N/A'}</td>
      <td style="padding: 10px; text-align: right; font-weight: 600; color: #111827;">${formatCurrency(allowance.total)}</td>
    </tr>
    ${allowance.notes ? `
    <tr style="border-bottom: 1px solid #e5e7eb; ${idx % 2 === 0 ? 'background: #ffffff;' : 'background: #f9fafb;'}">
      <td colspan="5" style="padding: 6px 10px 10px 10px;">
        <div style="font-size: 11px; color: #6b7280; font-style: italic;">Note: ${allowance.notes}</div>
      </td>
    </tr>
    ` : ''}
  `).join('');

  const totalAllowances = data.allowances.reduce((sum, a) => sum + (a.total || 0), 0);
  const provisionalCount = data.allowances.filter(a => a.is_provisional).length;

  return `
    <div style="margin-bottom: 32px; page-break-inside: avoid;">
      <h3 style="font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 16px; border-bottom: 3px solid ${VERIFYTRADE_ORANGE}; padding-bottom: 8px;">
        4. Allowances, Provisional Sums & Prime Costs
      </h3>
      <p style="font-size: 13px; color: #6b7280; margin-bottom: 20px; line-height: 1.6;">
        Detailed breakdown of all allowances, provisional sums, and prime costs included in the contract value.
        ${provisionalCount > 0 ? `<strong>${provisionalCount} provisional sum(s)</strong> requiring approval before expenditure.` : ''}
      </p>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 2px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #111827; color: white;">
            <th style="text-align: left; padding: 12px; font-weight: 600;">Description</th>
            <th style="text-align: center; padding: 12px; font-weight: 600; width: 80px;">Qty</th>
            <th style="text-align: center; padding: 12px; font-weight: 600; width: 80px;">Unit</th>
            <th style="text-align: right; padding: 12px; font-weight: 600; width: 120px;">Rate</th>
            <th style="text-align: right; padding: 12px; font-weight: 600; width: 140px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${allowancesHtml}
        </tbody>
        <tfoot>
          <tr style="background: #f9fafb; border-top: 2px solid #e5e7eb;">
            <td colspan="4" style="padding: 12px; font-weight: 700; color: #111827; text-align: right;">Total Allowances</td>
            <td style="padding: 12px; font-weight: 700; color: #111827; text-align: right; font-size: 15px;">${formatCurrency(totalAllowances)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderAwardOverview(data: PreletAppendixData): string {
  if (!data.is_finalised || !data.awarded_subcontractor) return '';

  const systemsHtml = data.systems_snapshot && data.systems_snapshot.length > 0
    ? `
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px; font-weight: 600;">Systems Included</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${data.systems_snapshot.map((sys: any) => `
            <div style="background: #f3f4f6; padding: 6px 12px; border-radius: 6px; font-size: 12px; color: #111827;">
              ${sys.service_type} (${sys.item_count} items)
            </div>
          `).join('')}
        </div>
      </div>
    `
    : '';

  return `
    <div style="background: #fef3c7; border: 2px solid ${VERIFYTRADE_ORANGE}; border-radius: 8px; padding: 24px; margin-bottom: 32px; page-break-inside: avoid;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
        <h3 style="font-size: 18px; font-weight: 700; color: #111827; margin: 0;">
          Awarded Quote Overview
        </h3>
        <span style="background: #fed7aa; color: #ea580c; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 600;">
          IMMUTABLE SNAPSHOT
        </span>
      </div>
      <p style="font-size: 12px; color: #92400e; margin-bottom: 16px;">
        This award overview was captured at finalization and cannot be changed.
      </p>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
        <div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Awarded Subcontractor</div>
          <div style="font-size: 14px; color: #111827; font-weight: 600;">${data.awarded_subcontractor || 'N/A'}</div>
        </div>
        <div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Award Date</div>
          <div style="font-size: 14px; color: #111827;">${formatDate(data.award_date)}</div>
        </div>
        <div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Total (ex GST)</div>
          <div style="font-size: 14px; color: #111827; font-weight: 700;">${formatCurrency(data.awarded_total_ex_gst)}</div>
        </div>
        <div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Total (inc GST)</div>
          <div style="font-size: 14px; color: #111827; font-weight: 700;">${formatCurrency(data.awarded_total_inc_gst)}</div>
        </div>
        <div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Pricing Basis</div>
          <div style="font-size: 14px; color: #111827; font-weight: 600;">${formatPricingBasis(data.awarded_pricing_basis)}</div>
        </div>
        <div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Award Status</div>
          <div style="font-size: 14px; color: #10b981; font-weight: 600;">${data.award_status || 'N/A'}</div>
        </div>
        <div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Quote Reference</div>
          <div style="font-size: 14px; color: #111827; font-family: monospace;">${data.quote_reference || 'N/A'}</div>
        </div>
        <div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Quote Revision</div>
          <div style="font-size: 14px; color: #111827; font-family: monospace;">${data.quote_revision || 'N/A'}</div>
        </div>
      </div>
      ${data.scope_summary_snapshot ? `
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px; font-weight: 600;">Scope Summary</div>
          <div style="font-size: 14px; color: #111827; line-height: 1.6;">${data.scope_summary_snapshot}</div>
        </div>
      ` : ''}
      ${systemsHtml}
    </div>
  `;
}

export function generateFastPreletAppendix(
  projectName: string,
  supplierName: string,
  appendixData: PreletAppendixData,
  organisationLogoUrl?: string
): string {
  const now = new Date().toLocaleDateString('en-NZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const logoHtml = organisationLogoUrl
    ? `<img src="${organisationLogoUrl}" alt="Organisation Logo" style="max-height: 60px; max-width: 200px; object-fit: contain;" />`
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pre-let Minute Appendix - ${projectName}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #111827;
      background: white;
    }
    .page {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      background: white;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 3px solid ${VERIFYTRADE_ORANGE};
    }
    .logo-section {
      flex: 1;
    }
    .generated-by {
      text-align: right;
      font-size: 11px;
      color: #6b7280;
    }
    .title-section {
      text-align: center;
      margin-bottom: 48px;
    }
    h1 {
      font-size: 32px;
      font-weight: 800;
      color: #111827;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 16px;
      color: #6b7280;
      font-weight: 500;
    }
    .info-box {
      background: #f9fafb;
      border: 2px solid #e5e7eb;
      border-left: 4px solid ${VERIFYTRADE_ORANGE};
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .info-row {
      display: grid;
      grid-template-columns: 200px 1fr;
      gap: 12px;
      margin-bottom: 8px;
    }
    .info-label {
      font-weight: 600;
      color: #6b7280;
    }
    .info-value {
      color: #111827;
      font-weight: 500;
    }
    .section {
      margin-bottom: 32px;
    }
    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 12px;
      border-bottom: 2px solid ${VERIFYTRADE_ORANGE};
      padding-bottom: 8px;
    }
    .footer {
      margin-top: 64px;
      padding-top: 24px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
    }
    .footer-notice {
      background: #dbeafe;
      border: 2px solid #3b82f6;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      text-align: left;
      color: #1e40af;
      line-height: 1.6;
    }
    @media print {
      .page {
        padding: 0;
      }
      body {
        background: white;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="logo-section">
        ${logoHtml}
      </div>
      <div class="generated-by">
        Generated by <strong>VerifyTrade</strong><br/>${now}
      </div>
    </div>

    <div class="title-section">
      <h1>Pre-let Minute Appendix</h1>
      <div class="subtitle">Commercial and scope clarifications for subcontract award</div>
    </div>

    ${renderAwardOverview(appendixData)}

    ${renderContractSummary(appendixData)}

    ${renderScopeSystems(appendixData)}

    <div style="margin-bottom: 32px;">
      <h3 style="font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 16px; border-bottom: 3px solid ${VERIFYTRADE_ORANGE}; padding-bottom: 8px;">
        3. Inclusions & Exclusions
      </h3>

      <div style="page-break-before: always; page-break-after: always; page-break-inside: avoid;">
        ${renderList(appendixData.inclusions, 'Scope Inclusions')}
      </div>

      <div style="page-break-before: always; page-break-after: always; page-break-inside: avoid;">
        ${renderList(appendixData.exclusions, 'Scope Exclusions')}
      </div>

      ${renderList(appendixData.commercial_assumptions, 'Commercial Assumptions')}
      ${renderList(appendixData.clarifications, 'Subcontractor Clarifications')}
      ${renderList(appendixData.known_risks, 'Known Risks & Hold Points')}
    </div>

    ${renderAllowances(appendixData)}

    <div class="footer">
      <div class="footer-notice">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-right: 8px;">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        This appendix will be attached to signed pre-letting minutes and read in conjunction with the main pre-letting minutes and subcontract agreement.
      </div>
      <div>
        Generated by VerifyTrade • Quote Audit Engine • v1.9
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}