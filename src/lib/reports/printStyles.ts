/**
 * Unified Print Stylesheet System for PDF Generation
 *
 * This module provides a consistent, production-ready print layout system
 * that eliminates blank pages, prevents header/footer overlap, and ensures
 * tables break correctly across pages.
 *
 * Key Features:
 * - Fixed A4 page model with consistent margins
 * - Header/footer positioning that never overlaps content
 * - Smart page break control (no forced breaks on generic wrappers)
 * - Table-safe pagination with repeating headers
 * - Widow/orphan prevention
 * - CSS variables for consistent spacing and typography
 */

export const PRINT_CSS_VARIABLES = {
  // Page dimensions
  '--page-width': '210mm',
  '--page-height': '297mm',
  '--page-margin-top': '14mm',
  '--page-margin-right': '12mm',
  '--page-margin-bottom': '16mm',
  '--page-margin-left': '12mm',

  // Header/Footer heights
  '--header-height': '60px',
  '--footer-height': '40px',

  // Content padding (must match header/footer heights to prevent overlap)
  '--content-padding-top': '70px',
  '--content-padding-bottom': '50px',

  // Typography
  '--font-base': '14px',
  '--font-small': '12px',
  '--font-large': '16px',
  '--line-height-base': '1.6',
  '--line-height-heading': '1.2',

  // Spacing (8px system)
  '--spacing-xs': '4px',
  '--spacing-sm': '8px',
  '--spacing-md': '16px',
  '--spacing-lg': '24px',
  '--spacing-xl': '32px',
  '--spacing-2xl': '40px',
  '--spacing-3xl': '48px',

  // Colors
  '--color-primary': '#f97316',
  '--color-text': '#1f2937',
  '--color-text-light': '#6b7280',
  '--color-border': '#e5e7eb',
  '--color-background': '#ffffff',
};

/**
 * Generate CSS variables declaration
 */
export function getCssVariables(): string {
  return Object.entries(PRINT_CSS_VARIABLES)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n      ');
}

/**
 * Core Print Stylesheet
 *
 * This stylesheet is applied to ALL PDF exports and ensures consistent,
 * professional output without blank pages or layout issues.
 */
export const PRINT_STYLESHEET = `
  /* === CSS VARIABLES === */
  :root {
    ${getCssVariables()}
  }

  /* === RESET & BASE STYLES === */
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html, body {
    width: 100%;
    height: 100%;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Helvetica Neue', Arial, sans-serif;
    font-size: var(--font-base);
    line-height: var(--line-height-base);
    color: var(--color-text);
    background: var(--color-background);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* === FIXED PAGE MODEL === */
  @page {
    size: A4;
    margin: var(--page-margin-top) var(--page-margin-right) var(--page-margin-bottom) var(--page-margin-left);
  }

  /* Force exact colors in print */
  * {
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  /* === CONTENT CONTAINER === */
  .pdf-content {
    padding-top: var(--content-padding-top);
    padding-bottom: var(--content-padding-bottom);
    position: relative;
  }

  /* === HEADER & FOOTER POSITIONING === */
  /* Headers and footers are positioned to NEVER overlap content */
  .pdf-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--header-height);
    z-index: 1000;
    background: var(--color-background);
  }

  .pdf-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: var(--footer-height);
    z-index: 1000;
    background: var(--color-background);
  }

  /* === PAGE BREAK CONTROL === */
  /* CRITICAL: Only explicit .pdf-page-break markers create page breaks */
  /* NO forced page breaks on generic wrappers */

  .pdf-page-break {
    break-before: page;
    page-break-before: always;
  }

  /* Prevent breaks inside these elements */
  .pdf-avoid-break,
  .pdf-card,
  .pdf-section-card,
  .pdf-stat-card {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* === TABLE PAGINATION === */
  /* Tables break safely across pages with repeating headers */

  table {
    width: 100%;
    border-collapse: collapse;
    break-inside: auto;
    page-break-inside: auto;
  }

  thead {
    display: table-header-group;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  tbody {
    display: table-row-group;
  }

  tfoot {
    display: table-footer-group;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  tr {
    break-inside: avoid;
    page-break-inside: avoid;
    break-after: auto;
  }

  td, th {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* === TYPOGRAPHY === */
  h1, h2, h3, h4, h5, h6 {
    line-height: var(--line-height-heading);
    break-after: avoid;
    page-break-after: avoid;
    orphans: 3;
    widows: 3;
  }

  h1 { font-size: 2.5rem; font-weight: 800; margin-bottom: var(--spacing-lg); }
  h2 { font-size: 2rem; font-weight: 700; margin-bottom: var(--spacing-md); }
  h3 { font-size: 1.5rem; font-weight: 600; margin-bottom: var(--spacing-md); }
  h4 { font-size: 1.25rem; font-weight: 600; margin-bottom: var(--spacing-sm); }
  h5 { font-size: 1.1rem; font-weight: 600; margin-bottom: var(--spacing-sm); }
  h6 { font-size: 1rem; font-weight: 600; margin-bottom: var(--spacing-sm); }

  p, li {
    orphans: 3;
    widows: 3;
  }

  p {
    margin-bottom: var(--spacing-md);
  }

  /* === LISTS === */
  ul, ol {
    margin-bottom: var(--spacing-md);
    padding-left: var(--spacing-lg);
  }

  li {
    margin-bottom: var(--spacing-xs);
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* === IMAGES === */
  img {
    max-width: 100%;
    height: auto;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* === SECTIONS === */
  section {
    margin-bottom: var(--spacing-2xl);
  }

  /* === UTILITY CLASSES === */
  .pdf-text-center { text-align: center; }
  .pdf-text-right { text-align: right; }
  .pdf-text-small { font-size: var(--font-small); }
  .pdf-text-large { font-size: var(--font-large); }

  .pdf-mb-sm { margin-bottom: var(--spacing-sm); }
  .pdf-mb-md { margin-bottom: var(--spacing-md); }
  .pdf-mb-lg { margin-bottom: var(--spacing-lg); }
  .pdf-mb-xl { margin-bottom: var(--spacing-xl); }

  .pdf-mt-sm { margin-top: var(--spacing-sm); }
  .pdf-mt-md { margin-top: var(--spacing-md); }
  .pdf-mt-lg { margin-top: var(--spacing-lg); }
  .pdf-mt-xl { margin-top: var(--spacing-xl); }

  /* === PRINT-SPECIFIC OVERRIDES === */
  @media print {
    /* Ensure clean page breaks */
    body {
      margin: 0;
      padding: 0;
    }

    /* Hide screen-only elements */
    .no-print {
      display: none !important;
    }

    /* Ensure links are readable when printed */
    a {
      text-decoration: underline;
      color: inherit;
    }

    /* Prevent awkward breaks */
    blockquote, pre {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
`;

/**
 * Generate complete print stylesheet with optional custom CSS
 */
export function generatePrintStylesheet(customCss?: string): string {
  return `
    <style>
      ${PRINT_STYLESHEET}

      ${customCss || ''}
    </style>
  `;
}

/**
 * Wrap content with proper PDF structure including header and footer
 */
export function wrapPdfContent(options: {
  content: string;
  header?: string;
  footer?: string;
  customCss?: string;
}): string {
  const { content, header, footer, customCss } = options;

  return `
    ${generatePrintStylesheet(customCss)}

    ${header ? `<div class="pdf-header">${header}</div>` : ''}

    <div class="pdf-content">
      ${content}
    </div>

    ${footer ? `<div class="pdf-footer">${footer}</div>` : ''}
  `;
}
