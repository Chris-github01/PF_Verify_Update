/**
 * PDF Theme System
 * Defines two distinct presentation themes: Senior (Commercial) and Junior (Site)
 *
 * CRITICAL: These are PRESENTATION-ONLY settings. No data logic changes.
 */

export type PDFThemeType = 'senior' | 'junior';

export interface PDFTheme {
  name: string;
  audience: string;
  purpose: string;

  // Typography
  fonts: {
    family: string;
    sectionTitle: number;    // pt
    tableHeader: number;     // pt
    tableBody: number;       // pt
    caption: number;         // pt
  };

  // Density & Spacing
  density: 'high' | 'medium';
  rowPadding: string;        // CSS padding value
  sectionSpacing: string;    // margin-bottom for sections

  // Visual Elements
  showRowIcons: boolean;
  showSectionBadges: boolean;
  colorUsage: 'minimal' | 'moderate';

  // Table Behavior
  preferMultiPageTables: boolean;
  groupRepetitiveItems: boolean;
  showInstructionalText: boolean;

  // Layout
  maxItemsPerSection: number;
  useAppendices: boolean;
}

export const SENIOR_THEME: PDFTheme = {
  name: 'Senior / Commercial Pack',
  audience: 'QSs, Commercial Managers, Clients',
  purpose: 'Review, comparison, defensibility',

  fonts: {
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    sectionTitle: 15,
    tableHeader: 10,
    tableBody: 9,
    caption: 8
  },

  density: 'high',
  rowPadding: '8px 10px',
  sectionSpacing: '24px',

  showRowIcons: false,
  showSectionBadges: true,
  colorUsage: 'minimal',

  preferMultiPageTables: true,
  groupRepetitiveItems: false,
  showInstructionalText: false,

  maxItemsPerSection: 999,
  useAppendices: false
};

export const JUNIOR_THEME: PDFTheme = {
  name: 'Site / Junior Pack',
  audience: 'Installers, Supervisors, QA teams',
  purpose: 'Execution, compliance, clarity',

  fonts: {
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    sectionTitle: 16,
    tableHeader: 11,
    tableBody: 10,
    caption: 9
  },

  density: 'medium',
  rowPadding: '10px 12px',
  sectionSpacing: '32px',

  showRowIcons: false, // Per requirements: icons only at section level
  showSectionBadges: true,
  colorUsage: 'moderate',

  preferMultiPageTables: false,
  groupRepetitiveItems: true,
  showInstructionalText: true,

  maxItemsPerSection: 50, // Prefer summaries over long lists
  useAppendices: true
};

/**
 * Get theme by pack type
 */
export function getThemeForPackType(packType: 'site_team' | 'senior_mgmt' | 'prelet_appendix'): PDFTheme {
  switch (packType) {
    case 'site_team':
      return JUNIOR_THEME;
    case 'senior_mgmt':
    case 'prelet_appendix':
      return SENIOR_THEME;
    default:
      return SENIOR_THEME;
  }
}

/**
 * Generate CSS for theme
 */
export function generateThemeCSS(theme: PDFTheme): string {
  return `
    /* === THEME: ${theme.name} === */
    /* Audience: ${theme.audience} */
    /* Purpose: ${theme.purpose} */

    body {
      font-family: ${theme.fonts.family};
      font-size: ${theme.fonts.tableBody}pt;
      line-height: 1.5;
    }

    /* Section Titles */
    .section-title {
      font-size: ${theme.fonts.sectionTitle}pt;
      font-weight: 700;
      margin-bottom: ${theme.sectionSpacing};
      margin-top: 32px;
      color: #111827;
      letter-spacing: -0.3px;
    }

    /* Section Badge (replaces per-row icons) */
    .section-badge {
      display: ${theme.showSectionBadges ? 'inline-flex' : 'none'};
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      background: #f0fdf4;
      border: 1px solid #86efac;
      border-radius: 6px;
      font-size: ${theme.fonts.caption}pt;
      font-weight: 600;
      color: #15803d;
      margin-left: 12px;
    }

    /* Sub-info line (e.g., "28 items") */
    .section-subinfo {
      font-size: ${theme.fonts.caption}pt;
      color: #6b7280;
      font-weight: 500;
      margin-top: 4px;
    }

    /* Table Headers */
    table thead th {
      font-size: ${theme.fonts.tableHeader}pt;
      font-weight: 700;
      padding: ${theme.rowPadding};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Table Body */
    table tbody td {
      font-size: ${theme.fonts.tableBody}pt;
      padding: ${theme.rowPadding};
      line-height: 1.4;
    }

    /* Row Icons (hidden per theme) */
    .row-icon {
      display: ${theme.showRowIcons ? 'inline' : 'none'};
    }

    /* Section Spacing */
    .system-card,
    .section-container {
      margin-bottom: ${theme.sectionSpacing};
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* Density-specific adjustments */
    ${theme.density === 'high' ? `
      table {
        border-spacing: 0;
      }

      tr {
        border-bottom: 1px solid #f3f4f6;
      }
    ` : `
      table {
        border-spacing: 0 2px;
      }

      tr {
        border-bottom: 1px solid #e5e7eb;
      }
    `}

    /* Color Usage */
    ${theme.colorUsage === 'minimal' ? `
      .accent-color {
        color: #111827;
      }

      .background-accent {
        background: #f9fafb;
      }
    ` : `
      .accent-color {
        color: #f97316;
      }

      .background-accent {
        background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
      }
    `}
  `;
}

/**
 * Apply theme to HTML content
 */
export function applyThemeToHTML(html: string, theme: PDFTheme): string {
  const themeCSS = generateThemeCSS(theme);

  // Inject theme CSS into <head>
  if (html.includes('</head>')) {
    return html.replace('</head>', `<style>${themeCSS}</style></head>`);
  }

  // Fallback: prepend as inline style
  return `<style>${themeCSS}</style>${html}`;
}
