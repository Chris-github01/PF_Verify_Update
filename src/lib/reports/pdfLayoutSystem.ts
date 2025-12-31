/**
 * ✨ UNIFIED PDF LAYOUT SYSTEM ✨
 *
 * Deterministic, consistent PDF layout across all VerifyTrade reports
 * Designed specifically for Gotenberg Chromium-based PDF generation
 *
 * CRITICAL: This module establishes SINGLE SOURCE OF TRUTH for:
 * - Page dimensions and margins
 * - Typography scale and spacing
 * - Page break rules and pagination
 * - Header/footer system
 *
 * NO DATA CHANGES - PRESENTATION ONLY
 */

//=============================================================================
// CONSTANTS - SINGLE SOURCE OF TRUTH
//=============================================================================

export const PDF_CONSTANTS = {
  // Page Setup (A4)
  PAGE: {
    WIDTH_MM: 210,
    HEIGHT_MM: 297,
    WIDTH_INCHES: 8.27,
    HEIGHT_INCHES: 11.69,
  },

  // Margins (optimized for Gotenberg + header/footer)
  MARGINS: {
    TOP_MM: 22,        // Reserves space for 18mm header + 4mm buffer
    BOTTOM_MM: 18,     // Reserves space for 14mm footer + 4mm buffer
    LEFT_MM: 12,
    RIGHT_MM: 12,
    // Converted to inches for Gotenberg
    TOP_INCHES: 0.87,
    BOTTOM_INCHES: 0.71,
    LEFT_INCHES: 0.47,
    RIGHT_INCHES: 0.47,
  },

  // Header/Footer Dimensions
  HEADER: {
    HEIGHT_MM: 18,
    PADDING_MM: 8,
  },
  FOOTER: {
    HEIGHT_MM: 14,
    PADDING_MM: 6,
  },

  // Typography Scale (in points)
  FONTS: {
    H1: 46,
    H2: 28,
    H3: 20,
    H4: 16,
    BODY: 11,
    CAPTION: 9,
    FOOTER: 8,
  },

  // Spacing System (8px base)
  SPACING: {
    XS: '8px',
    SM: '16px',
    MD: '24px',
    LG: '32px',
    XL: '48px',
  },

  // Colors
  COLORS: {
    BRAND_ORANGE: '#f97316',
    BRAND_ORANGE_DARK: '#ea580c',
    BRAND_ORANGE_LIGHT: '#fed7aa',
    GRAY_900: '#111827',
    GRAY_700: '#374151',
    GRAY_600: '#4b5563',
    GRAY_500: '#6b7280',
    GRAY_400: '#9ca3af',
    GRAY_300: '#d1d5db',
    GRAY_200: '#e5e7eb',
    GRAY_100: '#f3f4f6',
    GRAY_50: '#f9fafb',
  },
};

//=============================================================================
// DETERMINISTIC PAGE SETUP CSS
//=============================================================================

export function generatePageSetupCSS(): string {
  const { MARGINS, FONTS, SPACING, COLORS } = PDF_CONSTANTS;

  return `
    /* ========================================
       PAGE SETUP - GOTENBERG OPTIMIZED
       ======================================== */

    @page {
      size: A4;
      /* CRITICAL: These margins MUST match Gotenberg formData parameters */
      /* They reserve space for Gotenberg's native header/footer */
      margin: ${MARGINS.TOP_MM}mm ${MARGINS.RIGHT_MM}mm ${MARGINS.BOTTOM_MM}mm ${MARGINS.LEFT_MM}mm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      /* Ensure colors print correctly */
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
      color-adjust: exact;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
      font-size: ${FONTS.BODY}pt;
      line-height: 1.5;
      color: ${COLORS.GRAY_900};
      background: white;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* ========================================
       TYPOGRAPHY SCALE
       ======================================== */

    h1 {
      font-size: ${FONTS.H1}pt;
      font-weight: 800;
      color: ${COLORS.GRAY_900};
      letter-spacing: -1.2px;
      line-height: 1.1;
      margin-bottom: ${SPACING.SM};
      break-after: avoid;
      page-break-after: avoid;
    }

    h2 {
      font-size: ${FONTS.H2}pt;
      font-weight: 700;
      color: ${COLORS.GRAY_900};
      letter-spacing: -0.5px;
      margin-bottom: ${SPACING.MD};
      margin-top: ${SPACING.LG};
      padding-bottom: ${SPACING.XS};
      border-bottom: 2px solid ${COLORS.GRAY_100};
      break-after: avoid;
      page-break-after: avoid;
    }

    h3 {
      font-size: ${FONTS.H3}pt;
      font-weight: 700;
      color: ${COLORS.GRAY_900};
      margin-bottom: ${SPACING.SM};
      margin-top: ${SPACING.MD};
      letter-spacing: -0.3px;
      break-after: avoid;
      page-break-after: avoid;
    }

    h4 {
      font-size: ${FONTS.H4}pt;
      font-weight: 700;
      color: ${COLORS.BRAND_ORANGE};
      margin-bottom: ${SPACING.XS};
      margin-top: ${SPACING.SM};
      letter-spacing: -0.2px;
      break-after: avoid;
      page-break-after: avoid;
    }

    p {
      margin-bottom: ${SPACING.SM};
      line-height: 1.7;
      color: ${COLORS.GRAY_700};
      orphans: 3;
      widows: 3;
    }

    /* ========================================
       PAGE BREAK RULES
       ======================================== */

    /* REMOVED: Manual .page divs - let Gotenberg handle natural flow */

    /* Prevent breaks inside these elements */
    .avoid-break,
    .card,
    .section-card,
    .stat-card,
    .recommendation-card,
    .system-card,
    .info-box,
    .warning-box,
    .metrics-box {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* Allow page breaks before these if needed */
    .allow-break-before {
      break-before: auto;
      page-break-before: auto;
    }

    /* Force page break before */
    .page-break {
      break-before: page;
      page-break-before: always;
    }

    /* Never break after headings */
    h1, h2, h3, h4, h5, h6 {
      break-after: avoid !important;
      page-break-after: avoid !important;
    }

    /* Prevent orphans and widows */
    p, li {
      orphans: 3;
      widows: 3;
    }

    /* ========================================
       TABLE PAGINATION
       ======================================== */

    table {
      width: 100%;
      border-collapse: collapse;
      break-inside: auto;
      page-break-inside: auto;
      margin-bottom: ${SPACING.SM};
    }

    /* Repeat table header on every page */
    thead {
      display: table-header-group;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* Never split a table row */
    tr {
      break-inside: avoid;
      page-break-inside: avoid;
      break-after: auto;
    }

    /* Keep first 6 rows with header */
    tr:nth-child(-n+6) {
      break-after: avoid;
      page-break-after: avoid;
    }

    td, th {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    tfoot {
      display: table-footer-group;
    }

    /* ========================================
       IMAGES & MEDIA
       ======================================== */

    img {
      max-width: 100%;
      height: auto;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* ========================================
       LISTS
       ======================================== */

    ul, ol {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-bottom: ${SPACING.SM};
      padding-left: 20px;
    }

    li {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-bottom: ${SPACING.XS};
    }

    /* ========================================
       UTILITY CLASSES
       ======================================== */

    .text-center {
      text-align: center;
    }

    .no-print {
      display: none;
    }

    @media screen {
      .print-only {
        display: none;
      }
    }

    @media print {
      .print-only {
        display: block;
      }

      .no-print {
        display: none !important;
      }

      /* Remove any fixed positioning in print */
      * {
        position: static !important;
      }

      body {
        margin: 0 !important;
        padding: 0 !important;
      }
    }
  `;
}

//=============================================================================
// HEADER/FOOTER SYSTEM (GOTENBERG NATIVE)
//=============================================================================

export interface HeaderFooterConfig {
  projectName: string;
  documentTitle?: string;
  supplierName?: string;
  date?: string;
  organisationLogoUrl?: string;
}

/**
 * Generate Gotenberg-compatible header HTML
 * Uses Chromium placeholders for page numbers
 */
export function generateGotenbergHeader(config: HeaderFooterConfig): string {
  const { projectName, documentTitle, organisationLogoUrl } = config;
  const { HEADER, COLORS } = PDF_CONSTANTS;
  const today = config.date || new Date().toLocaleDateString('en-NZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const logoSection = organisationLogoUrl
    ? `
      <img
        src="${organisationLogoUrl}"
        alt="Logo"
        style="max-width: 80px; max-height: 32px; object-fit: contain;"
      />
      <div style="width: 1px; height: 28px; background: ${COLORS.GRAY_200}; margin: 0 8px;"></div>
      <div style="font-size: 14px; font-weight: 700; color: ${COLORS.GRAY_900};">VerifyTrade</div>
    `
    : `
      <div style="
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, ${COLORS.BRAND_ORANGE} 0%, ${COLORS.BRAND_ORANGE_DARK} 100%);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
        </svg>
      </div>
      <div style="font-size: 14px; font-weight: 700; color: ${COLORS.GRAY_900}; margin-left: 8px;">VerifyTrade</div>
    `;

  return `
    <html>
      <head>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 9pt;
            color: ${COLORS.GRAY_700};
            margin: 0;
            padding: ${HEADER.PADDING_MM}mm 12mm;
            height: ${HEADER.HEIGHT_MM}mm;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid ${COLORS.BRAND_ORANGE};
            background: white;
          }
          .left {
            display: flex;
            align-items: center;
            gap: 0;
          }
          .right {
            text-align: right;
          }
          .doc-title {
            font-size: 10pt;
            font-weight: 600;
            color: ${COLORS.GRAY_700};
            margin-bottom: 2px;
          }
          .page-info {
            font-size: 8pt;
            color: ${COLORS.GRAY_500};
          }
        </style>
      </head>
      <body>
        <div class="left">${logoSection}</div>
        <div class="right">
          ${documentTitle ? `<div class="doc-title">${documentTitle}</div>` : ''}
          <div class="page-info">
            ${projectName} | ${today} | Page <span class="pageNumber"></span> of <span class="totalPages"></span>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Generate Gotenberg-compatible footer HTML
 */
export function generateGotenbergFooter(config: HeaderFooterConfig): string {
  const { supplierName } = config;
  const { FOOTER, COLORS } = PDF_CONSTANTS;

  return `
    <html>
      <head>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 8pt;
            color: ${COLORS.GRAY_400};
            margin: 0;
            padding: ${FOOTER.PADDING_MM}mm 12mm;
            height: ${FOOTER.HEIGHT_MM}mm;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid ${COLORS.GRAY_200};
            background: white;
          }
          .left {
            font-weight: 600;
            color: ${COLORS.GRAY_700};
          }
          .center {
            color: ${COLORS.BRAND_ORANGE};
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="left">${supplierName || ''}</div>
        <div class="center">Generated by VerifyTrade www.verifytrade.co.nz</div>
      </body>
    </html>
  `;
}

//=============================================================================
// COMPLETE HTML WRAPPER
//=============================================================================

/**
 * Wrap content with deterministic layout system
 * NO manual .page divs - let Gotenberg handle pagination naturally
 */
export function wrapContentWithLayout(htmlContent: string): string {
  const layoutCSS = generatePageSetupCSS();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VerifyTrade PDF Report</title>
  <style>
${layoutCSS}
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
}

//=============================================================================
// CONTENT CLEANING
//=============================================================================

/**
 * Remove old-style manual pagination artifacts
 * Removes .page divs, manual footers, etc.
 */
export function cleanLegacyPaginationArtifacts(html: string): string {
  let cleaned = html;

  // Remove manual .page divs (keep content)
  cleaned = cleaned.replace(/<div\s+class="page"[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/div>\s*<!--\s*\.page\s*-->/gi, '');

  // Remove manual footer elements (Gotenberg handles this)
  cleaned = cleaned.replace(/<footer\s+class="pdf-footer"[^>]*>.*?<\/footer>/gis, '');
  cleaned = cleaned.replace(/<footer[^>]*>.*?<\/footer>/gis, '');

  // Remove old page number scripts
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?page-number[\s\S]*?<\/script>/gi, '');

  // Remove fixed positioning styles (conflicts with Gotenberg)
  cleaned = cleaned.replace(/position:\s*fixed;?/gi, 'position: static;');

  // Remove manual page breaks that force unnecessary pagination
  cleaned = cleaned.replace(/page-break-after:\s*always;?/gi, 'page-break-after: auto;');
  cleaned = cleaned.replace(/break-after:\s*page;?/gi, 'break-after: auto;');

  return cleaned;
}

/**
 * Validate PDF layout
 */
export function validatePDFLayout(html: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check for legacy artifacts
  if (html.includes('class="page"')) {
    warnings.push('Found legacy .page divs - these will be cleaned automatically');
  }

  if (html.includes('position: fixed')) {
    warnings.push('Found fixed positioning - this will be converted to static');
  }

  if (html.includes('.page-number') && !html.includes('.pageNumber')) {
    warnings.push('Found old page numbering class - update to use .pageNumber/.totalPages');
  }

  return {
    valid: warnings.length === 0,
    warnings
  };
}
