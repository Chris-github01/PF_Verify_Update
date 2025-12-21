/**
 * Unified Contract Manager Print Engine
 * Single source of truth for ALL Contract Manager PDF outputs
 */

const VERIFYTRADE_ORANGE = '#f97316';
const VERIFYTRADE_ORANGE_LIGHT = '#fed7aa';
const VERIFYTRADE_ORANGE_DARK = '#ea580c';

export interface NormalizedLineItem {
  description: string;
  service: string;
  type: string;
  material: string;
  quantity: string;
  unit: string;
  notes?: string;
}

export interface NormalizedSystem {
  service_type: string;
  coverage: 'full' | 'partial' | 'none';
  item_count: number;
  percentage?: number;
  items: NormalizedLineItem[];
}

export interface NormalizedAllowance {
  description: string;
  quantity: string;
  unit: string;
  rate: number | null;
  total: number;
  notes: string | null;
}

export interface ContractPackData {
  project: {
    name: string;
    client?: string;
    mainContractor?: string;
  };
  supplier: {
    name: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
  };
  financial: {
    totalAmount: number;
    retentionPercentage?: number;
    retentionAmount?: number;
    netAmount?: number;
    paymentTerms?: string;
    liquidatedDamages?: string;
  };
  projectManager?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  systems: NormalizedSystem[];
  inclusions: string[];
  exclusions: string[];
  allowances: NormalizedAllowance[];
  organisationLogoUrl?: string;
  awardReport?: any;
  appendixData?: any;
}

export type PackType = 'site_team' | 'senior_mgmt' | 'prelet_appendix';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

class ContractDataNormalizer {
  parseDetailString(detailStr: string): NormalizedLineItem {
    const bracketMatch = detailStr.match(/^(.+?)\s*\[(.+)\]$/);

    if (!bracketMatch) {
      return {
        description: detailStr,
        service: '—',
        type: '—',
        material: '—',
        quantity: '—',
        unit: '—'
      };
    }

    const description = bracketMatch[1].trim();
    const attributesStr = bracketMatch[2];

    const attributes: Record<string, string> = {};
    const attrParts = attributesStr.split('|').map(p => p.trim());

    attrParts.forEach(part => {
      const colonIndex = part.indexOf(':');
      if (colonIndex > 0) {
        const key = part.substring(0, colonIndex).trim().toLowerCase();
        const value = part.substring(colonIndex + 1).trim();
        attributes[key] = value;
      }
    });

    let quantity = '—';
    let unit = '—';

    if (attributes['qty']) {
      const qtyMatch = attributes['qty'].match(/^(\d+(?:\.\d+)?)\s*(.+)$/);
      if (qtyMatch) {
        quantity = qtyMatch[1];
        unit = qtyMatch[2];
      }
    }

    return {
      description,
      service: attributes['service'] || '—',
      type: attributes['type'] || '—',
      material: attributes['material'] || '—',
      quantity,
      unit,
      notes: attributes['frr'] || attributes['size']
        ? [attributes['frr'] && `FRR: ${attributes['frr']}`, attributes['size'] && `Size: ${attributes['size']}`]
            .filter(Boolean).join(', ')
        : undefined
    };
  }

  normalizeScopeSystem(rawSystem: any): NormalizedSystem {
    const normalizedItems: NormalizedLineItem[] = [];

    if (rawSystem.details && Array.isArray(rawSystem.details)) {
      rawSystem.details.forEach((detail: string) => {
        normalizedItems.push(this.parseDetailString(detail));
      });
    }

    return {
      service_type: rawSystem.service_type || 'Unknown',
      coverage: rawSystem.coverage || 'full',
      item_count: rawSystem.item_count || normalizedItems.length,
      percentage: rawSystem.percentage,
      items: normalizedItems
    };
  }

  normalizeAllowance(rawAllowance: any): NormalizedAllowance {
    return {
      description: rawAllowance.description || '',
      quantity: String(rawAllowance.quantity || ''),
      unit: rawAllowance.unit || '',
      rate: rawAllowance.rate,
      total: rawAllowance.total || 0,
      notes: rawAllowance.notes
    };
  }

  normalizeData(rawData: any): ContractPackData {
    const systems = (rawData.systems || []).map((sys: any) =>
      this.normalizeScopeSystem(sys)
    );

    const totalItems = systems.reduce((sum, sys) => sum + sys.item_count, 0);
    systems.forEach(system => {
      system.percentage = totalItems > 0 ? (system.item_count / totalItems) * 100 : 0;
    });

    return {
      project: rawData.project || {},
      supplier: rawData.supplier || {},
      financial: rawData.financial || {},
      projectManager: rawData.projectManager,
      systems,
      inclusions: rawData.inclusions || [],
      exclusions: rawData.exclusions || [],
      allowances: (rawData.allowances || []).map((a: any) => this.normalizeAllowance(a)),
      organisationLogoUrl: rawData.organisationLogoUrl,
      awardReport: rawData.awardReport,
      appendixData: rawData.appendixData
    };
  }
}

class ContractPDFLayout {
  generateCSS(): string {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        color: #1f2937;
        background: white;
        padding: 0;
        -webkit-font-smoothing: antialiased;
      }

      @page {
        size: A4;
        margin: 16mm 12mm 18mm 12mm;
      }

      .page {
        padding: 20px 32px 32px 32px;
        position: relative;
        min-height: 240mm;
      }

      .page:not(:last-child) {
        page-break-after: always;
        break-after: page;
      }

      section:not(:last-child) {
        break-before: page;
      }

      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 24px;
        padding-bottom: 12px;
        border-bottom: 3px solid ${VERIFYTRADE_ORANGE};
      }

      footer {
        margin-top: 32px;
        padding-top: 12px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        color: #9ca3af;
      }

      table {
        page-break-inside: auto;
        width: 100%;
        border-collapse: collapse;
      }

      tr {
        page-break-inside: avoid;
        break-inside: avoid;
        page-break-after: auto;
      }

      td, th {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      thead {
        display: table-header-group;
      }

      tbody {
        page-break-inside: auto;
      }

      .system-card {
        background: white;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 16px;
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .logo-section { display: flex; align-items: center; gap: 12px; }
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

      h1 {
        font-size: 46px;
        font-weight: 800;
        color: #111827;
        letter-spacing: -1.2px;
        line-height: 1.1;
        margin-bottom: 12px;
      }

      h2 {
        font-size: 28px;
        font-weight: 700;
        color: #111827;
        letter-spacing: -0.5px;
        margin-bottom: 20px;
        padding-bottom: 8px;
        border-bottom: 2px solid #f3f4f6;
      }

      h3 {
        font-size: 20px;
        font-weight: 600;
        color: #374151;
        margin-bottom: 14px;
      }

      h4 {
        color: ${VERIFYTRADE_ORANGE};
        font-size: 16px;
        margin-bottom: 6px;
      }

      .cover-page {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        min-height: 80vh;
      }

      .subtitle {
        font-size: 22px;
        color: #6b7280;
        font-weight: 400;
        margin-bottom: 48px;
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

      .detail-row {
        display: flex;
        justify-content: space-between;
        padding: 12px 0;
        border-bottom: 1px solid #e5e7eb;
      }

      .detail-row:last-child {
        border-bottom: none;
      }

      .detail-label {
        font-weight: 600;
        color: #6b7280;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .detail-value {
        font-weight: 600;
        color: #111827;
        font-size: 15px;
      }

      .warning-box {
        background: #fef3c7;
        border-left: 4px solid #f59e0b;
        border-radius: 0 8px 8px 0;
        padding: 16px 20px;
        margin: 16px 0;
        line-height: 1.7;
        page-break-inside: avoid;
      }

      .warning-box h3 {
        font-weight: 700;
        font-size: 15px;
        color: #92400e;
        margin-bottom: 10px;
      }

      .safety-item {
        display: flex;
        align-items: flex-start;
        margin-bottom: 10px;
        line-height: 1.6;
        color: #78350f;
      }

      .safety-item:before {
        content: "⚠";
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        background: #f59e0b;
        color: white;
        border-radius: 50%;
        margin-right: 10px;
        flex-shrink: 0;
        font-weight: 700;
        font-size: 13px;
      }

      .checklist {
        list-style: none;
        padding-left: 0;
      }

      .checklist li {
        padding: 10px 0;
        font-size: 13px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        color: #374151;
      }

      .checklist li:last-child {
        border-bottom: none;
      }

      .checklist input[type="checkbox"] {
        margin-right: 10px;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      @media print {
        body {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
      }
    `;
  }

  generateLogoSection(organisationLogoUrl?: string): string {
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
}

class ContractPDFValidator {
  validate(html: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const emptyPagePattern = /<div class="page"[^>]*>\s*<\/div>/g;
    const emptyPages = html.match(emptyPagePattern);
    if (emptyPages && emptyPages.length > 0) {
      errors.push(`Found ${emptyPages.length} empty page(s)`);
    }

    const unparsedServicePattern = /\[Service:\s*[^\]]+\|/g;
    const unparsedFields = html.match(unparsedServicePattern);
    if (unparsedFields && unparsedFields.length > 0) {
      warnings.push(`Found ${unparsedFields.length} unparsed field(s) with raw attribute tokens`);
    }

    const emptyTablePattern = /<table[^>]*>\s*<thead>.*?<\/thead>\s*<tbody>\s*<\/tbody>\s*<\/table>/g;
    const emptyTables = html.match(emptyTablePattern);
    if (emptyTables && emptyTables.length > 0) {
      warnings.push(`Found ${emptyTables.length} empty table(s)`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  removeEmptySections(html: string): string {
    html = html.replace(/<div class="page"[^>]*>\s*<\/div>/g, '');

    html = html.replace(/<div class="system-card"[^>]*>\s*<\/div>/g, '');

    return html;
  }
}

class ContractPackBuilder {
  private layout = new ContractPDFLayout();

  buildCoverPage(data: ContractPackData, packType: PackType): string {
    const year = new Date().getFullYear();
    const generatedDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const titles = {
      site_team: 'Junior Site Team Handover Pack',
      senior_mgmt: 'Senior Project Team Overview',
      prelet_appendix: 'Pre-let Minute Appendix'
    };

    const subtitles = {
      site_team: 'Practical Guide for On-Site Installation & Quality Control',
      senior_mgmt: 'Executive Summary & Commercial Dashboard',
      prelet_appendix: 'Commercial and scope clarifications for subcontract award'
    };

    return `
      <div class="page cover-page">
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;">
          <h1 style="text-align: center;">${titles[packType]}</h1>
          <div class="subtitle" style="text-align: center;">${subtitles[packType]}</div>
          <div class="project-details-card">
            <div class="detail-row">
              <span class="detail-label">Project</span>
              <span class="detail-value">${data.project.name}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Subcontractor</span>
              <span class="detail-value">${data.supplier.name}</span>
            </div>
          </div>
          <div style="margin-top: 60px;">
            ${this.layout.generateLogoSection(data.organisationLogoUrl)}
            <div style="font-size: 13px; color: #6b7280; margin-top: 12px; text-align: center;">
              Generated ${generatedDate}
            </div>
          </div>
        </div>
        <footer style="text-align: right; margin-top: auto;">
          <div style="color: ${VERIFYTRADE_ORANGE}; font-weight: 600;">Generated by VerifyTrade</div>
        </footer>
      </div>
    `;
  }

  buildScopeTable(system: NormalizedSystem): string {
    if (system.items.length === 0) {
      return '';
    }

    return `
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px; overflow-x: auto; margin-top: 12px;">
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: linear-gradient(135deg, #1f2937 0%, #374151 100%);">
              <th style="padding: 12px 10px; text-align: left; font-weight: 700; font-size: 11px; color: white; text-transform: uppercase; letter-spacing: 0.5px; width: 40px;">✓</th>
              <th style="padding: 12px 10px; text-align: left; font-weight: 700; font-size: 11px; color: white; text-transform: uppercase; letter-spacing: 0.5px;">Description</th>
              <th style="padding: 12px 10px; text-align: left; font-weight: 700; font-size: 11px; color: white; text-transform: uppercase; letter-spacing: 0.5px; width: 90px;">Service</th>
              <th style="padding: 12px 10px; text-align: left; font-weight: 700; font-size: 11px; color: white; text-transform: uppercase; letter-spacing: 0.5px; width: 100px;">Type</th>
              <th style="padding: 12px 10px; text-align: left; font-weight: 700; font-size: 11px; color: white; text-transform: uppercase; letter-spacing: 0.5px; width: 90px;">Material</th>
              <th style="padding: 12px 10px; text-align: right; font-weight: 700; font-size: 11px; color: white; text-transform: uppercase; letter-spacing: 0.5px; width: 70px;">Qty</th>
              <th style="padding: 12px 10px; text-align: left; font-weight: 700; font-size: 11px; color: white; text-transform: uppercase; letter-spacing: 0.5px; width: 60px;">Unit</th>
            </tr>
          </thead>
          <tbody>
            ${system.items.map((item, idx) => `
              <tr style="border-bottom: 1px solid #e5e7eb; ${idx % 2 === 0 ? 'background: #f9fafb;' : 'background: white;'}">
                <td style="padding: 12px 10px; text-align: center;">
                  <span style="color: #10b981; font-weight: 700; font-size: 14px;">✓</span>
                </td>
                <td style="padding: 12px 10px; font-size: 13px; color: #374151; line-height: 1.5;">${item.description}</td>
                <td style="padding: 12px 10px; font-size: 13px; color: #6b7280;">${item.service}</td>
                <td style="padding: 12px 10px; font-size: 13px; color: #6b7280;">${item.type}</td>
                <td style="padding: 12px 10px; font-size: 13px; color: #6b7280;">${item.material}</td>
                <td style="padding: 12px 10px; font-size: 13px; color: #374151; text-align: right; font-weight: 600;">${item.quantity}</td>
                <td style="padding: 12px 10px; font-size: 13px; color: #6b7280;">${item.unit}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  buildScopeSections(data: ContractPackData): string {
    const MAX_ITEMS_PER_PAGE = 20;
    let pages: string[] = [];
    let currentPageSystems: NormalizedSystem[] = [];
    let currentPageItemCount = 0;

    data.systems.forEach((system, index) => {
      const itemCount = system.items.length;

      if (currentPageItemCount + itemCount > MAX_ITEMS_PER_PAGE && currentPageSystems.length > 0) {
        pages.push(this.buildScopePageContent(currentPageSystems, data.organisationLogoUrl));
        currentPageSystems = [];
        currentPageItemCount = 0;
      }

      currentPageSystems.push(system);
      currentPageItemCount += itemCount;
    });

    if (currentPageSystems.length > 0) {
      pages.push(this.buildScopePageContent(currentPageSystems, data.organisationLogoUrl));
    }

    return pages.join('\n');
  }

  buildScopePageContent(systems: NormalizedSystem[], logoUrl?: string): string {
    const year = new Date().getFullYear();

    return `
      <div class="page">
        <header>
          ${this.layout.generateLogoSection(logoUrl)}
          <div class="generated-by">Generated by <strong>VerifyTrade</strong></div>
        </header>
        ${systems.map(sys => `
          <div class="system-card">
            <h4>${sys.service_type}</h4>
            <p style="font-size: 12px; color: #6b7280; margin-bottom: 10px; font-weight: 500;">
              ${sys.item_count} items
            </p>
            ${this.buildScopeTable(sys)}
          </div>
        `).join('')}
        <footer>
          <div>© ${year} VerifyTrade. All rights reserved.</div>
          <div class="page-number"></div>
        </footer>
      </div>
    `;
  }

  buildInclusionsExclusionsSection(data: ContractPackData): string {
    if (data.inclusions.length === 0 && data.exclusions.length === 0) {
      return '';
    }

    const year = new Date().getFullYear();

    return `
      <div class="page">
        <header>
          ${this.layout.generateLogoSection(data.organisationLogoUrl)}
          <div class="generated-by">Generated by <strong>VerifyTrade</strong></div>
        </header>
        ${data.inclusions.length > 0 ? `
          <h2>Scope Inclusions</h2>
          <ul class="checklist">
            ${data.inclusions.map(inc => `
              <li><input type="checkbox" disabled> ${inc}</li>
            `).join('')}
          </ul>
        ` : ''}
        ${data.exclusions.length > 0 ? `
          <h2 style="margin-top: 32px;">Scope Exclusions</h2>
          <div class="warning-box">
            <h3>Not Included in Scope</h3>
            <ul style="list-style: none; padding: 0;">
              ${data.exclusions.map(exc => `
                <li class="safety-item">${exc}</li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
        <footer>
          <div>© ${year} VerifyTrade. All rights reserved.</div>
          <div class="page-number"></div>
        </footer>
      </div>
    `;
  }

  buildSiteTeamPack(data: ContractPackData): string {
    const year = new Date().getFullYear();

    return `
      ${this.buildCoverPage(data, 'site_team')}
      ${this.buildScopeSections(data)}
      <div class="page">
        <header>
          ${this.layout.generateLogoSection(data.organisationLogoUrl)}
          <div class="generated-by">Generated by <strong>VerifyTrade</strong></div>
        </header>
        <div class="warning-box">
          <h3>Safety & Installation Notes</h3>
          <ul style="list-style: none; padding: 0;">
            <li class="safety-item">All personnel must complete site induction before commencing work</li>
            <li class="safety-item">Use appropriate PPE: Hard hat, safety glasses, high-vis vest, safety boots</li>
            <li class="safety-item">Follow manufacturer's instructions for all fire protection materials</li>
          </ul>
        </div>
        <footer>
          <div>© ${year} VerifyTrade. All rights reserved.</div>
          <div class="page-number"></div>
        </footer>
      </div>
      <div class="page">
        <header>
          ${this.layout.generateLogoSection(data.organisationLogoUrl)}
          <div class="generated-by">Generated by <strong>VerifyTrade</strong></div>
        </header>
        <h2>Site Handover Checklists</h2>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; margin-bottom: 14px;">
          <h3 style="font-size: 17px; color: #111827; margin-bottom: 12px; font-weight: 600;">Pre-Start Checklist</h3>
          <ul class="checklist">
            <li><input type="checkbox" disabled> Site induction completed</li>
            <li><input type="checkbox" disabled> SWMS reviewed and signed</li>
            <li><input type="checkbox" disabled> All required materials and equipment on site</li>
          </ul>
        </div>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; margin-bottom: 14px;">
          <h3 style="font-size: 17px; color: #111827; margin-bottom: 12px; font-weight: 600;">Installation Checklist</h3>
          <ul class="checklist">
            <li><input type="checkbox" disabled> Verify penetration dimensions against drawings</li>
            <li><input type="checkbox" disabled> Check FRR requirements</li>
            <li><input type="checkbox" disabled> Apply products as per manufacturer specifications</li>
          </ul>
        </div>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; margin-bottom: 14px;">
          <h3 style="font-size: 17px; color: #111827; margin-bottom: 12px; font-weight: 600;">Quality Control</h3>
          <ul class="checklist">
            <li><input type="checkbox" disabled> Photograph all completed penetrations</li>
            <li><input type="checkbox" disabled> Complete QA documentation for each penetration</li>
            <li><input type="checkbox" disabled> Ensure PS3 documentation is prepared</li>
          </ul>
        </div>
        <footer>
          <div>© ${year} VerifyTrade. All rights reserved.</div>
          <div class="page-number"></div>
        </footer>
      </div>
      ${this.buildInclusionsExclusionsSection(data)}
    `;
  }

  buildSeniorManagementPack(data: ContractPackData): string {
    const year = new Date().getFullYear();
    const formatCurrency = (value: number) => {
      return `$${value.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const retentionPercentage = data.financial.retentionPercentage || 3;
    const retentionAmount = data.financial.totalAmount * (retentionPercentage / 100);
    const netAmount = data.financial.totalAmount - retentionAmount;

    return `
      ${this.buildCoverPage(data, 'senior_mgmt')}
      ${this.buildScopeSections(data)}
      <div class="page">
        <header>
          ${this.layout.generateLogoSection(data.organisationLogoUrl)}
          <div class="generated-by">Generated by <strong>VerifyTrade</strong></div>
        </header>
        <h2>Executive Contract Summary</h2>
        <div style="display: grid; gap: 24px;">
          <div style="background: white; border: 2px solid #e5e7eb; border-radius: 12px; padding: 24px;">
            <h3 style="color: ${VERIFYTRADE_ORANGE}; margin-bottom: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Project Information</h3>
            <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 12px; font-size: 14px;">
              ${data.project.client ? `
                <div style="color: #6b7280; font-weight: 600;">Client:</div>
                <div style="color: #111827;">${data.project.client}</div>
              ` : ''}
              ${data.project.mainContractor ? `
                <div style="color: #6b7280; font-weight: 600;">Main Contractor:</div>
                <div style="color: #111827;">${data.project.mainContractor}</div>
              ` : ''}
              ${data.projectManager?.name ? `
                <div style="color: #6b7280; font-weight: 600;">Project Manager:</div>
                <div style="color: #111827;">${data.projectManager.name}</div>
              ` : ''}
              ${data.projectManager?.email ? `
                <div style="color: #6b7280; font-weight: 600;">PM Email:</div>
                <div style="color: #111827;">${data.projectManager.email}</div>
              ` : ''}
              ${data.projectManager?.phone ? `
                <div style="color: #6b7280; font-weight: 600;">PM Phone:</div>
                <div style="color: #111827;">${data.projectManager.phone}</div>
              ` : ''}
            </div>
          </div>
          <div style="background: white; border: 2px solid #e5e7eb; border-radius: 12px; padding: 24px;">
            <h3 style="color: ${VERIFYTRADE_ORANGE}; margin-bottom: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Subcontractor Contact Details</h3>
            <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 12px; font-size: 14px;">
              <div style="color: #6b7280; font-weight: 600;">Company:</div>
              <div style="color: #111827;">${data.supplier.name}</div>
              ${data.supplier.contactName ? `
                <div style="color: #6b7280; font-weight: 600;">Contact Person:</div>
                <div style="color: #111827;">${data.supplier.contactName}</div>
              ` : ''}
              ${data.supplier.contactEmail ? `
                <div style="color: #6b7280; font-weight: 600;">Email:</div>
                <div style="color: #111827;">${data.supplier.contactEmail}</div>
              ` : ''}
              ${data.supplier.contactPhone ? `
                <div style="color: #6b7280; font-weight: 600;">Phone:</div>
                <div style="color: #111827;">${data.supplier.contactPhone}</div>
              ` : ''}
              ${data.supplier.address ? `
                <div style="color: #6b7280; font-weight: 600;">Address:</div>
                <div style="color: #111827;">${data.supplier.address}</div>
              ` : ''}
            </div>
          </div>
          <div style="background: white; border: 2px solid #e5e7eb; border-radius: 12px; padding: 24px;">
            <h3 style="color: ${VERIFYTRADE_ORANGE}; margin-bottom: 16px;">Commercial Terms</h3>
            <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 12px; font-size: 14px;">
              <div style="color: #6b7280; font-weight: 600;">Contract Value:</div>
              <div style="color: #111827; font-weight: 700;">${formatCurrency(data.financial.totalAmount)}</div>
              <div style="color: #6b7280; font-weight: 600;">Retention:</div>
              <div style="color: #111827;">${retentionPercentage}% (${formatCurrency(retentionAmount)})</div>
              ${data.financial.paymentTerms ? `
                <div style="color: #6b7280; font-weight: 600;">Payment Terms:</div>
                <div style="color: #111827;">${data.financial.paymentTerms}</div>
              ` : ''}
              ${data.financial.liquidatedDamages ? `
                <div style="color: #6b7280; font-weight: 600;">Liquidated Damages:</div>
                <div style="color: #111827;">${data.financial.liquidatedDamages}</div>
              ` : ''}
            </div>
          </div>
        </div>
        <footer>
          <div>© ${year} VerifyTrade. All rights reserved.</div>
          <div class="page-number"></div>
        </footer>
      </div>
      ${this.buildInclusionsExclusionsSection(data)}
    `;
  }

  buildPreletAppendix(data: ContractPackData): string {
    const year = new Date().getFullYear();
    const formatCurrency = (value: number) => {
      return `$${value.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const appendixData = data.appendixData || {};
    const generatedDate = new Date().toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const pricingBasisLabels: Record<string, string> = {
      'lump_sum': 'Lump Sum',
      'schedule_of_rates': 'Schedule of Rates',
      'cost_plus': 'Cost Plus',
      'unit_rates': 'Unit Rates'
    };

    const pricingBasisLabel = pricingBasisLabels[appendixData.pricing_basis] || 'Lump Sum';

    return `
      ${this.buildCoverPage(data, 'prelet_appendix')}
      <div class="page">
        <header>
          ${this.layout.generateLogoSection(data.organisationLogoUrl)}
          <div class="generated-by">Generated by <strong>VerifyTrade</strong><br/>${generatedDate}</div>
        </header>
        <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-left: 4px solid ${VERIFYTRADE_ORANGE}; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
          <div style="display: grid; grid-template-columns: 200px 1fr; gap: 12px;">
            <div style="font-weight: 600; color: #6b7280;">Project:</div>
            <div style="color: #111827; font-weight: 500;">${data.project.name}</div>
            <div style="font-weight: 600; color: #6b7280;">Subcontractor:</div>
            <div style="color: #111827; font-weight: 500;">${data.supplier.name}</div>
            <div style="font-weight: 600; color: #6b7280;">Contract Value:</div>
            <div style="color: #111827; font-weight: 700;">${formatCurrency(data.financial.totalAmount)}</div>
            <div style="font-weight: 600; color: #6b7280;">Pricing Basis:</div>
            <div style="color: #111827; font-weight: 500;">${pricingBasisLabel}</div>
          </div>
        </div>
        ${appendixData.scope_summary ? `
          <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-left: 4px solid ${VERIFYTRADE_ORANGE}; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
            <h3 style="color: ${VERIFYTRADE_ORANGE}; margin-top: 0;">Priced Scope Summary</h3>
            <p style="color: #374151; line-height: 1.8; white-space: pre-wrap;">${appendixData.scope_summary}</p>
          </div>
        ` : ''}
        ${this.buildInclusionsExclusionsSection(data)}
        <footer>
          <div>© ${year} VerifyTrade. All rights reserved.</div>
          <div class="page-number"></div>
        </footer>
      </div>
    `;
  }

  build(packType: PackType, data: ContractPackData): string {
    switch (packType) {
      case 'site_team':
        return this.buildSiteTeamPack(data);
      case 'senior_mgmt':
        return this.buildSeniorManagementPack(data);
      case 'prelet_appendix':
        return this.buildPreletAppendix(data);
      default:
        throw new Error(`Unknown pack type: ${packType}`);
    }
  }
}

export function generateContractPDF(
  packType: PackType,
  rawData: any
): { html: string; validation: ValidationResult } {
  const normalizer = new ContractDataNormalizer();
  const validator = new ContractPDFValidator();
  const packBuilder = new ContractPackBuilder();
  const layout = new ContractPDFLayout();

  const normalizedData = normalizer.normalizeData(rawData);

  const bodyContent = packBuilder.build(packType, normalizedData);

  const cleanedContent = validator.removeEmptySections(bodyContent);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contract Manager - ${packType}</title>
  <style>
    ${layout.generateCSS()}
  </style>
</head>
<body>
  ${cleanedContent}
</body>
</html>`;

  const validation = validator.validate(html);

  return { html, validation };
}
