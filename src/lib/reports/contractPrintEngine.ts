/**
 * Unified Contract Manager Print Engine
 * Single source of truth for ALL Contract Manager PDF outputs
 *
 * REFACTORED: Now uses theme system and pagination engine
 * PRESENTATION ONLY - NO DATA LOGIC CHANGES
 */

import { getThemeForPackType, applyThemeToHTML, type PDFTheme } from './pdfThemes';
import { generatePDFHeader, generatePDFFooter, generatePageNumberingScript } from './pdfHeaderFooter';

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
  is_provisional?: boolean;
  ps_type?: string | null;
  ps_reason?: string | null;
  ps_trigger?: string | null;
  ps_approval_role?: string | null;
  ps_evidence_required?: string | null;
  ps_spend_method?: string | null;
  ps_cap?: number | null;
  ps_rate_basis?: string | null;
  ps_spend_to_date?: number;
  ps_conversion_rule?: string | null;
  ps_status?: string | null;
  ps_standardised?: boolean;
  ps_notes_internal?: string | null;
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
    // NEW FORMAT: Description | Service | Type | Material | Qty | Unit
    const pipeParts = detailStr.split('|').map(p => p.trim());

    if (pipeParts.length === 6) {
      // New pipe-delimited format
      return {
        description: pipeParts[0],
        service: pipeParts[1] || '—',
        type: pipeParts[2] || '—',
        material: pipeParts[3] || '—',
        quantity: pipeParts[4] || '—',
        unit: pipeParts[5] || '—'
      };
    }

    // OLD FORMAT (backwards compatibility): Description [service: X | type: Y | material: Z | qty: 4 ea]
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
      notes: rawAllowance.notes,
      is_provisional: rawAllowance.is_provisional || false,
      ps_type: rawAllowance.ps_type,
      ps_reason: rawAllowance.ps_reason,
      ps_trigger: rawAllowance.ps_trigger,
      ps_approval_role: rawAllowance.ps_approval_role,
      ps_evidence_required: rawAllowance.ps_evidence_required,
      ps_spend_method: rawAllowance.ps_spend_method,
      ps_cap: rawAllowance.ps_cap,
      ps_rate_basis: rawAllowance.ps_rate_basis,
      ps_spend_to_date: rawAllowance.ps_spend_to_date || 0,
      ps_conversion_rule: rawAllowance.ps_conversion_rule,
      ps_status: rawAllowance.ps_status,
      ps_standardised: rawAllowance.ps_standardised,
      ps_notes_internal: rawAllowance.ps_notes_internal
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
  private theme: PDFTheme;

  constructor(packType: PackType) {
    this.theme = getThemeForPackType(packType);
  }

  generateCSS(): string {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: ${this.theme.fonts.family};
        font-size: ${this.theme.fonts.tableBody}pt;
        line-height: 1.5;
        color: #1f2937;
        background: white;
        padding: 0;
        -webkit-font-smoothing: antialiased;
      }

      @page {
        size: A4;
        margin: 16mm 12mm 18mm 12mm;
      }

      /* === PAGINATION RULES === */
      .page {
        padding: 20px 32px 60px 32px;
        position: relative;
        min-height: auto;
        box-sizing: border-box;
      }

      .page:not(:last-child) {
        page-break-after: always;
        break-after: page;
      }

      /* Prevent section breaks at bottom 20% of page */
      .section-title {
        break-after: avoid;
        page-break-after: avoid;
      }

      /* === HEADER === */
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 2px solid ${VERIFYTRADE_ORANGE};
      }

      /* === FOOTER === */
      footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 10px 32px;
        border-top: 1px solid #e5e7eb;
        background: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 9px;
        color: #6b7280;
      }

      /* === TABLE PAGINATION === */
      table {
        page-break-inside: auto;
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 16px;
      }

      /* Rule 2: Repeat table headers on every page */
      thead {
        display: table-header-group;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      tbody {
        page-break-inside: auto;
      }

      /* Rule 1 & 3: Never split header from first 6 rows */
      tr {
        page-break-inside: avoid;
        break-inside: avoid;
        break-after: auto;
      }

      tr:nth-child(-n+6) {
        break-after: avoid;
        page-break-after: avoid;
      }

      td, th {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      /* === SECTION CONTAINERS === */
      .system-card {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: ${this.theme.density === 'high' ? '12px' : '16px'};
        margin-bottom: ${this.theme.sectionSpacing};
        page-break-inside: avoid;
        break-inside: avoid;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      }

      /* Rule 6: No section starts in bottom 20% of page */
      .system-card {
        break-before: auto;
        page-break-before: auto;
      }

      /* Prevent orphan sections */
      .system-card:last-of-type {
        min-height: 80px;
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

      /* === SECTION HIERARCHY === */
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
        margin-top: 32px;
        padding-bottom: 8px;
        border-bottom: 2px solid #f3f4f6;
        break-after: avoid;
        page-break-after: avoid;
      }

      h3 {
        font-size: ${this.theme.fonts.sectionTitle}pt;
        font-weight: 700;
        color: #111827;
        margin-bottom: 12px;
        margin-top: 24px;
        letter-spacing: -0.3px;
        break-after: avoid;
        page-break-after: avoid;
      }

      h4 {
        color: ${VERIFYTRADE_ORANGE};
        font-size: ${this.theme.fonts.sectionTitle}pt;
        font-weight: 700;
        margin-bottom: 8px;
        margin-top: 20px;
        letter-spacing: -0.2px;
        break-after: avoid;
        page-break-after: avoid;
      }

      /* Section badges (replaces per-row icons) */
      .section-badge {
        display: ${this.theme.showSectionBadges ? 'inline-flex' : 'none'};
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        background: #f0fdf4;
        border: 1px solid #86efac;
        border-radius: 6px;
        font-size: ${this.theme.fonts.caption}pt;
        font-weight: 600;
        color: #15803d;
        margin-left: 10px;
        vertical-align: middle;
      }

      /* Sub-info (e.g., "28 items") */
      .section-subinfo {
        font-size: ${this.theme.fonts.caption}pt;
        color: #6b7280;
        font-weight: 500;
        margin-top: 4px;
        margin-bottom: 12px;
      }

      /* Remove per-row icons */
      .row-icon {
        display: none;
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
          margin: 0 !important;
          padding-top: 0 !important;
          padding-bottom: 22mm !important; /* Reserve space for fixed footer */
        }

        /* Remove fixed heights in print mode */
        .page {
          min-height: auto !important;
          height: auto !important;
        }

        .page:last-child {
          page-break-after: auto !important;
          break-after: auto !important;
        }

        /* Ensure system cards don't break */
        .system-card {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }

        /* Keep allowance sections together */
        .allowance-section, .ps-card {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
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
  private layout: ContractPDFLayout;
  private packType: PackType;

  constructor(packType: PackType) {
    this.packType = packType;
    this.layout = new ContractPDFLayout(packType);
  }

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
          <div style="color: ${VERIFYTRADE_ORANGE}; font-weight: 600;">Generated by VerifyTrade www.verifytrade.co.nz</div>
        </footer>
      </div>
    `;
  }

  buildScopeTable(system: NormalizedSystem, theme: PDFTheme): string {
    if (system.items.length === 0) {
      return '';
    }

    const headerFontSize = theme.fonts.tableHeader;
    const bodyFontSize = theme.fonts.tableBody;
    const rowPadding = theme.rowPadding;

    // REMOVED: per-row checkmark column (✓)
    // ADDED: Clean table without row icons

    return `
      <div style="background: #f9fafb; border-radius: 8px; padding: ${theme.density === 'high' ? '12px' : '16px'}; overflow-x: auto; margin-top: 12px;">
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: linear-gradient(135deg, #1f2937 0%, #374151 100%);">
              <th style="padding: ${rowPadding}; text-align: left; font-weight: 700; font-size: ${headerFontSize}pt; color: white; text-transform: uppercase; letter-spacing: 0.5px;">Description</th>
              <th style="padding: ${rowPadding}; text-align: left; font-weight: 700; font-size: ${headerFontSize}pt; color: white; text-transform: uppercase; letter-spacing: 0.5px; width: 90px;">Service</th>
              <th style="padding: ${rowPadding}; text-align: left; font-weight: 700; font-size: ${headerFontSize}pt; color: white; text-transform: uppercase; letter-spacing: 0.5px; width: 100px;">Type</th>
              <th style="padding: ${rowPadding}; text-align: left; font-weight: 700; font-size: ${headerFontSize}pt; color: white; text-transform: uppercase; letter-spacing: 0.5px; width: 90px;">Material</th>
              <th style="padding: ${rowPadding}; text-align: right; font-weight: 700; font-size: ${headerFontSize}pt; color: white; text-transform: uppercase; letter-spacing: 0.5px; width: 70px;">Qty</th>
              <th style="padding: ${rowPadding}; text-align: left; font-weight: 700; font-size: ${headerFontSize}pt; color: white; text-transform: uppercase; letter-spacing: 0.5px; width: 60px;">Unit</th>
            </tr>
          </thead>
          <tbody>
            ${system.items.map((item, idx) => `
              <tr style="border-bottom: 1px solid #e5e7eb; ${idx % 2 === 0 ? 'background: #f9fafb;' : 'background: white;'}">
                <td style="padding: ${rowPadding}; font-size: ${bodyFontSize}pt; color: #374151; line-height: 1.4;">${item.description}</td>
                <td style="padding: ${rowPadding}; font-size: ${bodyFontSize}pt; color: #6b7280;">${item.service}</td>
                <td style="padding: ${rowPadding}; font-size: ${bodyFontSize}pt; color: #6b7280;">${item.type}</td>
                <td style="padding: ${rowPadding}; font-size: ${bodyFontSize}pt; color: #6b7280;">${item.material}</td>
                <td style="padding: ${rowPadding}; font-size: ${bodyFontSize}pt; color: #374151; text-align: right; font-weight: 600;">${item.quantity}</td>
                <td style="padding: ${rowPadding}; font-size: ${bodyFontSize}pt; color: #6b7280;">${item.unit}</td>
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
    const generatedDate = new Date().toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    return `
      <div class="page">
        <header>
          ${this.layout.generateLogoSection(logoUrl)}
        </header>
        ${systems.map(sys => `
          <div class="system-card">
            <h4>
              ${sys.service_type}
              <span class="section-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Verified
              </span>
            </h4>
            <div class="section-subinfo">
              ${sys.item_count} ${sys.item_count === 1 ? 'item' : 'items'}
            </div>
            ${this.buildScopeTable(sys, this.theme)}
          </div>
        `).join('')}
        <footer>
          <div style="flex: 1; text-align: left; font-weight: 600; color: #374151;">
            <!-- Supplier name populated in generation -->
          </div>
          <div style="flex: 1; text-align: center;">
            <span style="color: ${VERIFYTRADE_ORANGE}; font-weight: 600;">Generated by VerifyTrade www.verifytrade.co.nz</span>
            <span style="margin: 0 8px;">|</span>
            <span>${generatedDate}</span>
          </div>
          <div style="flex: 1; text-align: right;" class="page-number">
            <!-- Page X of Y injected via script -->
          </div>
        </footer>
      </div>
    `;
  }

  buildInclusionsExclusionsSection(data: ContractPackData): string {
    if (data.inclusions.length === 0 && data.exclusions.length === 0) {
      return '';
    }

    const year = new Date().getFullYear();

    // Helper to format item with optional reference
    const formatItem = (item: any) => {
      const text = typeof item === 'string' ? item : item.text || item;
      const reference = typeof item === 'object' ? item.reference : null;
      if (reference) {
        return `${text} <span style="background: #e5e7eb; color: #374151; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-family: monospace; font-weight: 600;">Ref: ${reference}</span>`;
      }
      return text;
    };

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
              <li><input type="checkbox" disabled> ${formatItem(inc)}</li>
            `).join('')}
          </ul>
        ` : ''}
        ${data.exclusions.length > 0 ? `
          <h2 style="margin-top: 32px;">Scope Exclusions</h2>
          <div class="warning-box">
            <h3>Not Included in Scope</h3>
            <ul style="list-style: none; padding: 0;">
              ${data.exclusions.map(exc => `
                <li class="safety-item">${formatItem(exc)}</li>
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

  buildAppendixExtrasSection(appendixData: any): string {
    const hasCommercial = appendixData.commercial_assumptions && appendixData.commercial_assumptions.length > 0;
    const hasClarifications = appendixData.clarifications && appendixData.clarifications.length > 0;
    const hasRisks = appendixData.known_risks && appendixData.known_risks.length > 0;

    if (!hasCommercial && !hasClarifications && !hasRisks) {
      return '';
    }

    const year = new Date().getFullYear();

    // Helper to format item with optional reference
    const formatItem = (item: any) => {
      const text = typeof item === 'string' ? item : item.text || item;
      const reference = typeof item === 'object' ? item.reference : null;
      if (reference) {
        return `${text} <span style="background: #e5e7eb; color: #374151; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-family: monospace; font-weight: 600;">Ref: ${reference}</span>`;
      }
      return text;
    };

    return `
      <div class="page">
        <header>
          ${this.layout.generateLogoSection(appendixData.organisationLogoUrl)}
          <div class="generated-by">Generated by <strong>VerifyTrade</strong></div>
        </header>
        ${hasCommercial ? `
          <h2>Commercial Assumptions</h2>
          <div style="background: #eff6ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
            <ul style="margin: 0; padding-left: 20px;">
              ${appendixData.commercial_assumptions.map((assumption: any) => `
                <li style="color: #1e40af; margin-bottom: 8px; line-height: 1.6;">${formatItem(assumption)}</li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
        ${hasClarifications ? `
          <h2 style="margin-top: ${hasCommercial ? '32px' : '0'};">Clarifications</h2>
          <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
            <ul style="margin: 0; padding-left: 20px;">
              ${appendixData.clarifications.map((clarification: any) => `
                <li style="color: #92400e; margin-bottom: 8px; line-height: 1.6;">${formatItem(clarification)}</li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
        ${hasRisks ? `
          <h2 style="margin-top: ${hasCommercial || hasClarifications ? '32px' : '0'};">Known Risks</h2>
          <div style="background: #fee2e2; border: 2px solid #ef4444; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
            <ul style="margin: 0; padding-left: 20px;">
              ${appendixData.known_risks.map((risk: any) => `
                <li style="color: #991b1b; margin-bottom: 8px; line-height: 1.6;">${formatItem(risk)}</li>
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

  buildCommercialBenchmarkingSection(data: ContractPackData): string {
    const year = new Date().getFullYear();
    const formatCurrency = (value: number) => {
      return `$${value.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    if (!data.awardReport) {
      return '';
    }

    const awardData = data.awardReport;
    const suppliers = awardData.suppliers || [];

    if (suppliers.length === 0) {
      return '';
    }

    const selectedSupplier = suppliers.find((s: any) => s.name === data.supplier.name) || suppliers[0];
    const alternativeSuppliers = suppliers.filter((s: any) => s.name !== selectedSupplier.name).slice(0, 2);

    return `
      <div class="page">
        <header>
          ${this.layout.generateLogoSection(data.organisationLogoUrl)}
          <div class="generated-by">Generated by <strong>VerifyTrade</strong></div>
        </header>
        <h2>Commercial Analysis & Benchmarking</h2>
        <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <h3 style="color: ${VERIFYTRADE_ORANGE}; margin-top: 0; margin-bottom: 16px;">Supplier Comparison</h3>
          <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
            <thead>
              <tr style="background: linear-gradient(135deg, #1f2937 0%, #374151 100%);">
                <th style="padding: 12px; text-align: left; font-weight: 700; font-size: 11pt; color: white; text-transform: uppercase;">Supplier</th>
                <th style="padding: 12px; text-align: right; font-weight: 700; font-size: 11pt; color: white; text-transform: uppercase;">Quoted Value</th>
                <th style="padding: 12px; text-align: center; font-weight: 700; font-size: 11pt; color: white; text-transform: uppercase;">Coverage</th>
                <th style="padding: 12px; text-align: center; font-weight: 700; font-size: 11pt; color: white; text-transform: uppercase;">Weighted Score</th>
                <th style="padding: 12px; text-align: center; font-weight: 700; font-size: 11pt; color: white; text-transform: uppercase;">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              <tr style="background: #f0fdf4; border: 2px solid #86efac;">
                <td style="padding: 14px; font-weight: 700; color: #111827;">
                  ${selectedSupplier.name}
                  <div style="font-size: 10pt; color: #15803d; font-weight: 600; margin-top: 4px;">✓ AWARDED</div>
                </td>
                <td style="padding: 14px; text-align: right; font-weight: 700; color: #111827;">${formatCurrency(selectedSupplier.total || 0)}</td>
                <td style="padding: 14px; text-align: center;">
                  <div style="display: inline-block; padding: 6px 12px; background: #dcfce7; border-radius: 6px; font-weight: 600; color: #15803d;">
                    ${Math.round((selectedSupplier.coverage || 0) * 100)}%
                  </div>
                </td>
                <td style="padding: 14px; text-align: center; font-weight: 700; font-size: 16pt; color: ${VERIFYTRADE_ORANGE};">
                  ${(selectedSupplier.weightedScore || 0).toFixed(1)}
                </td>
                <td style="padding: 14px; text-align: center;">
                  <div style="display: inline-block; padding: 6px 16px; background: #15803d; border-radius: 6px; font-weight: 700; color: white;">
                    RECOMMENDED
                  </div>
                </td>
              </tr>
              ${alternativeSuppliers.map((supplier: any, idx: number) => `
                <tr style="background: ${idx % 2 === 0 ? 'white' : '#f9fafb'}; border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 12px; font-weight: 600; color: #374151;">${supplier.name}</td>
                  <td style="padding: 12px; text-align: right; font-weight: 600; color: #374151;">${formatCurrency(supplier.total || 0)}</td>
                  <td style="padding: 12px; text-align: center;">
                    <div style="display: inline-block; padding: 6px 12px; background: #f3f4f6; border-radius: 6px; font-weight: 600; color: #6b7280;">
                      ${Math.round((supplier.coverage || 0) * 100)}%
                    </div>
                  </td>
                  <td style="padding: 12px; text-align: center; font-weight: 700; font-size: 14pt; color: #6b7280;">
                    ${(supplier.weightedScore || 0).toFixed(1)}
                  </td>
                  <td style="padding: 12px; text-align: center; color: #6b7280; font-style: italic;">Not selected</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="background: white; border: 2px solid #e5e7eb; border-left: 4px solid ${VERIFYTRADE_ORANGE}; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <h3 style="color: ${VERIFYTRADE_ORANGE}; margin-top: 0; margin-bottom: 12px;">Key Insights</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #374151; line-height: 1.6;">
              <strong style="color: ${VERIFYTRADE_ORANGE};">✓</strong> ${selectedSupplier.name} provides the highest weighted score based on price, coverage, and compliance factors
            </li>
            <li style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #374151; line-height: 1.6;">
              <strong style="color: ${VERIFYTRADE_ORANGE};">✓</strong> Scope coverage of ${Math.round((selectedSupplier.coverage || 0) * 100)}% demonstrates comprehensive understanding of project requirements
            </li>
            <li style="padding: 10px 0; color: #374151; line-height: 1.6;">
              <strong style="color: ${VERIFYTRADE_ORANGE};">✓</strong> Commercial recommendation aligns with quality and delivery requirements
            </li>
          </ul>
        </div>
        <footer>
          <div>© ${year} VerifyTrade. All rights reserved.</div>
          <div class="page-number"></div>
        </footer>
      </div>
    `;
  }

  buildCashFlowForecastSection(data: ContractPackData): string {
    const year = new Date().getFullYear();
    const formatCurrency = (value: number) => {
      return `$${value.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const retentionPercentage = data.financial.retentionPercentage || 5;
    const totalAmount = data.financial.totalAmount;
    const retentionAmount = totalAmount * (retentionPercentage / 100);
    const netAmount = totalAmount - retentionAmount;

    const cashFlowSchedule = [
      { month: 1, percentage: 15, description: 'Mobilization & Initial Works' },
      { month: 2, percentage: 30, description: 'Main Installation Phase' },
      { month: 3, percentage: 30, description: 'Continued Installation' },
      { month: 4, percentage: 20, description: 'Completion & Testing' },
      { month: 5, percentage: 5, description: 'Handover & Defects' }
    ];

    let cumulative = 0;
    const scheduleWithCalculations = cashFlowSchedule.map(item => {
      const monthAmount = (totalAmount * item.percentage) / 100;
      cumulative += monthAmount;
      return {
        ...item,
        amount: monthAmount,
        cumulative: cumulative
      };
    });

    return `
      <div class="page">
        <header>
          ${this.layout.generateLogoSection(data.organisationLogoUrl)}
          <div class="generated-by">Generated by <strong>VerifyTrade</strong></div>
        </header>
        <h2>Financial Breakdown & Cash Flow Forecast</h2>
        <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <h3 style="color: ${VERIFYTRADE_ORANGE}; margin-top: 0; margin-bottom: 16px;">Payment Schedule (5-Month Program)</h3>
          <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
            <thead>
              <tr style="background: linear-gradient(135deg, #1f2937 0%, #374151 100%);">
                <th style="padding: 12px; text-align: center; font-weight: 700; font-size: 11pt; color: white; text-transform: uppercase;">Month</th>
                <th style="padding: 12px; text-align: left; font-weight: 700; font-size: 11pt; color: white; text-transform: uppercase;">Description</th>
                <th style="padding: 12px; text-align: center; font-weight: 700; font-size: 11pt; color: white; text-transform: uppercase;">Progress</th>
                <th style="padding: 12px; text-align: right; font-weight: 700; font-size: 11pt; color: white; text-transform: uppercase;">Payment</th>
                <th style="padding: 12px; text-align: right; font-weight: 700; font-size: 11pt; color: white; text-transform: uppercase;">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              ${scheduleWithCalculations.map((item, idx) => `
                <tr style="background: ${idx % 2 === 0 ? '#f9fafb' : 'white'}; border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 12px; text-align: center; font-weight: 700; color: ${VERIFYTRADE_ORANGE}; font-size: 14pt;">
                    ${item.month}
                  </td>
                  <td style="padding: 12px; color: #374151; font-weight: 500;">${item.description}</td>
                  <td style="padding: 12px; text-align: center;">
                    <div style="display: inline-block; padding: 6px 12px; background: #dcfce7; border-radius: 6px; font-weight: 700; color: #15803d;">
                      ${item.percentage}%
                    </div>
                  </td>
                  <td style="padding: 12px; text-align: right; font-weight: 700; color: #111827; font-size: 11pt;">
                    ${formatCurrency(item.amount)}
                  </td>
                  <td style="padding: 12px; text-align: right; font-weight: 600; color: #6b7280; font-size: 10pt;">
                    ${formatCurrency(item.cumulative)}
                  </td>
                </tr>
              `).join('')}
              <tr style="background: #fff7ed; border-top: 3px solid ${VERIFYTRADE_ORANGE};">
                <td colspan="3" style="padding: 14px; font-weight: 700; color: #111827; text-align: right; text-transform: uppercase;">
                  Total Contract Value
                </td>
                <td style="padding: 14px; text-align: right; font-weight: 800; color: ${VERIFYTRADE_ORANGE}; font-size: 14pt;">
                  ${formatCurrency(totalAmount)}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
          <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px;">
            <h4 style="color: #6b7280; margin-top: 0; margin-bottom: 12px; font-size: 12pt; text-transform: uppercase;">Retention Details</h4>
            <div style="display: grid; gap: 8px;">
              <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                <span style="color: #6b7280; font-weight: 600;">Retention Rate:</span>
                <span style="color: #111827; font-weight: 700;">${retentionPercentage}%</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                <span style="color: #6b7280; font-weight: 600;">Retention Amount:</span>
                <span style="color: #111827; font-weight: 700;">${formatCurrency(retentionAmount)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                <span style="color: #6b7280; font-weight: 600;">Net Payable:</span>
                <span style="color: ${VERIFYTRADE_ORANGE}; font-weight: 800; font-size: 12pt;">${formatCurrency(netAmount)}</span>
              </div>
            </div>
          </div>
          <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px;">
            <h4 style="color: #6b7280; margin-top: 0; margin-bottom: 12px; font-size: 12pt; text-transform: uppercase;">Retention Release</h4>
            <div style="color: #374151; line-height: 1.6; font-size: 11pt;">
              <p style="margin: 0 0 10px 0;">Retention will be released in two stages:</p>
              <ul style="margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 8px;"><strong>50%</strong> upon Practical Completion</li>
                <li><strong>50%</strong> at end of Defects Liability Period</li>
              </ul>
            </div>
          </div>
        </div>
        ${data.financial.paymentTerms ? `
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 16px 20px; margin-bottom: 24px;">
            <div style="font-weight: 700; color: #92400e; margin-bottom: 8px; font-size: 11pt;">Payment Terms</div>
            <div style="color: #78350f; font-size: 11pt;">${data.financial.paymentTerms}</div>
          </div>
        ` : ''}
        <footer>
          <div>© ${year} VerifyTrade. All rights reserved.</div>
          <div class="page-number"></div>
        </footer>
      </div>
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
      ${this.buildCommercialBenchmarkingSection(data)}
      ${this.buildCashFlowForecastSection(data)}
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

    // Build Awarded Quote Overview section
    const awardOverviewHtml = appendixData.awarded_subcontractor ? `
      <div style="background: #fffbeb; border: 2px solid #fbbf24; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
        <h3 style="color: ${VERIFYTRADE_ORANGE}; margin-top: 0; display: flex; align-items: center; gap: 8px;">
          <span>📋</span> Awarded Quote Overview
          <span style="background: ${VERIFYTRADE_ORANGE}; color: white; font-size: 10px; padding: 4px 8px; border-radius: 4px; font-weight: 700;">IMMUTABLE SNAPSHOT</span>
        </h3>
        <p style="color: #78350f; font-size: 12px; margin-bottom: 16px; font-style: italic;">
          Auto-populated from Award Report. Locked at finalization as immutable record.
        </p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div>
            <div style="font-size: 11px; color: #78350f; text-transform: uppercase; margin-bottom: 4px;">Awarded Subcontractor</div>
            <div style="color: #111827; font-weight: 700;">${appendixData.awarded_subcontractor}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #78350f; text-transform: uppercase; margin-bottom: 4px;">Award Date</div>
            <div style="color: #111827;">${appendixData.award_date ? new Date(appendixData.award_date).toLocaleDateString('en-NZ') : 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #78350f; text-transform: uppercase; margin-bottom: 4px;">Total (ex GST)</div>
            <div style="color: #111827; font-weight: 700;">${formatCurrency(appendixData.awarded_total_ex_gst || 0)}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #78350f; text-transform: uppercase; margin-bottom: 4px;">Total (inc GST)</div>
            <div style="color: #111827; font-weight: 700;">${formatCurrency(appendixData.awarded_total_inc_gst || 0)}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #78350f; text-transform: uppercase; margin-bottom: 4px;">Pricing Basis</div>
            <div style="color: #111827;">${pricingBasisLabels[appendixData.awarded_pricing_basis] || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #78350f; text-transform: uppercase; margin-bottom: 4px;">Award Status</div>
            <div style="color: #16a34a; font-weight: 600;">${appendixData.award_status || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #78350f; text-transform: uppercase; margin-bottom: 4px;">Quote Reference</div>
            <div style="color: #111827; font-family: monospace;">${appendixData.quote_reference || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #78350f; text-transform: uppercase; margin-bottom: 4px;">Quote Revision</div>
            <div style="color: #111827; font-family: monospace;">${appendixData.quote_revision || 'N/A'}</div>
          </div>
        </div>
        ${appendixData.scope_summary_snapshot ? `
          <div style="border-top: 1px solid #fbbf24; padding-top: 16px; margin-top: 16px;">
            <div style="font-size: 11px; color: #78350f; text-transform: uppercase; margin-bottom: 8px;">Scope Summary</div>
            <div style="color: #374151; line-height: 1.6;">${appendixData.scope_summary_snapshot}</div>
          </div>
        ` : ''}
        ${appendixData.systems_snapshot && appendixData.systems_snapshot.length > 0 ? `
          <div style="border-top: 1px solid #fbbf24; padding-top: 16px; margin-top: 16px;">
            <div style="font-size: 11px; color: #78350f; text-transform: uppercase; margin-bottom: 8px;">Systems Included</div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${appendixData.systems_snapshot.map((sys: any) => `
                <span style="background: #fed7aa; padding: 6px 12px; border-radius: 6px; font-size: 12px; color: #78350f;">
                  ${sys.service_type} (${sys.item_count} items)
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${appendixData.attachments_snapshot && appendixData.attachments_snapshot.length > 0 ? `
          <div style="border-top: 1px solid #fbbf24; padding-top: 16px; margin-top: 16px;">
            <div style="font-size: 11px; color: #78350f; text-transform: uppercase; margin-bottom: 8px;">Attachments</div>
            <ul style="list-style: none; padding: 0; margin: 0;">
              ${appendixData.attachments_snapshot.map((att: any) => `
                <li style="color: #374151; font-size: 13px; margin-bottom: 4px;">
                  📄 ${att.name} ${att.type ? `<span style="color: #78350f; font-size: 11px;">(${att.type})</span>` : ''}
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    ` : '';

    return `
      ${this.buildCoverPage(data, 'prelet_appendix')}
      <div class="page">
        <header>
          ${this.layout.generateLogoSection(data.organisationLogoUrl)}
          <div class="generated-by">Generated by <strong>VerifyTrade</strong><br/>${generatedDate}</div>
        </header>
        ${awardOverviewHtml}
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
        ${this.buildAppendixExtrasSection(appendixData)}
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
  const packBuilder = new ContractPackBuilder(packType);
  const layout = new ContractPDFLayout(packType);

  const normalizedData = normalizer.normalizeData(rawData);

  const bodyContent = packBuilder.build(packType, normalizedData);

  const cleanedContent = validator.removeEmptySections(bodyContent);

  // Add page numbering script
  const pageNumberScript = generatePageNumberingScript();

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
  ${pageNumberScript}
</body>
</html>`;

  const validation = validator.validate(html);

  return { html, validation };
}
