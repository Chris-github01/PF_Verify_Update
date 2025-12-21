/**
 * Centralized PDF CSS Styles
 * Used across all report types for consistent Gotenberg rendering
 */

export const PDF_PRINT_STYLES = `
/* === PAGE SETUP === */
@page {
  size: A4;
  margin: 12mm 12mm 14mm 12mm;
}

/* === PRINT COLOR PRESERVATION === */
* {
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
  color-adjust: exact;
}

/* === PAGE BREAKS === */
.avoid-break {
  break-inside: avoid;
  page-break-inside: avoid;
}

.page-break {
  break-before: page;
  page-break-before: always;
}

.page-break-after {
  break-after: page;
  page-break-after: always;
}

/* === RESPONSIVE IMAGES === */
img {
  max-width: 100%;
  height: auto;
  break-inside: avoid;
  page-break-inside: avoid;
}

/* === TABLE HANDLING === */
table {
  break-inside: auto;
  page-break-inside: auto;
  width: 100%;
}

tr {
  break-inside: avoid;
  page-break-inside: avoid;
  break-after: auto;
}

thead {
  display: table-header-group;
  break-inside: avoid;
  page-break-inside: avoid;
}

tfoot {
  display: table-footer-group;
}

tbody tr {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* === PREVENT ORPHANS & WIDOWS === */
p, li, h1, h2, h3, h4, h5, h6 {
  orphans: 3;
  widows: 3;
}

h1, h2, h3, h4, h5, h6 {
  break-after: avoid;
  page-break-after: avoid;
}

/* === CARD/SECTION BREAKS === */
.card, .section-card, .stat-card {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* === PRINT-SPECIFIC UTILITIES === */
@media print {
  .no-print {
    display: none !important;
  }

  .print-only {
    display: block !important;
  }

  /* Prevent awkward breaks */
  ul, ol {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* Keep list items together */
  li {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}

/* === SCREEN-ONLY STYLES === */
@media screen {
  .print-only {
    display: none !important;
  }
}
`;

export const VERIFYTRADE_COLORS = {
  orange: '#f97316',
  orangeLight: '#fed7aa',
  orangeDark: '#ea580c',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',
  green50: '#f0fdf4',
  green500: '#22c55e',
  green600: '#16a34a',
  blue50: '#eff6ff',
  blue500: '#3b82f6',
  blue600: '#2563eb',
  yellow50: '#fefce8',
  yellow500: '#eab308',
  red50: '#fef2f2',
  red500: '#ef4444'
};

/**
 * Inject PDF styles into HTML content based on render mode
 */
export function injectPdfStyles(htmlContent: string, renderMode: 'screen' | 'pdf' = 'screen'): string {
  if (renderMode === 'pdf') {
    const styleTag = `
<style>
${PDF_PRINT_STYLES}
</style>`;

    return htmlContent.replace('</head>', `${styleTag}</head>`);
  }

  return htmlContent;
}

/**
 * Wrap content sections to prevent page breaks
 */
export function wrapAvoidBreak(content: string): string {
  return `<div class="avoid-break">${content}</div>`;
}

/**
 * Add page break before content
 */
export function addPageBreak(content: string): string {
  return `<div class="page-break">${content}</div>`;
}
