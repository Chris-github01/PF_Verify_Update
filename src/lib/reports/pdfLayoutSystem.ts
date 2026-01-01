/**
 * ✨ EXECUTIVE-GRADE PDF LAYOUT SYSTEM ✨
 *
 * Single source of truth for ALL PDF rendering across VerifyTrade
 * Deterministic, consistent, commercially presentable
 *
 * CRITICAL: This module establishes:
 * - Page dimensions and margins (A4 standard)
 * - Typography scale (executive-grade hierarchy)
 * - Professional spacing system
 * - Table styling and pagination
 * - Header/footer branding
 * - Print-safe colors and rendering
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
  // These MUST match across CSS @page, Gotenberg formData, and header/footer HTML
  MARGINS: {
    TOP_MM: 25,        // Reserves space for 20mm header + 5mm buffer
    BOTTOM_MM: 20,     // Reserves space for 16mm footer + 4mm buffer
    LEFT_MM: 15,       // Generous left margin for binding/professional feel
    RIGHT_MM: 15,      // Symmetric right margin
    // Converted to inches for Gotenberg API
    TOP_INCHES: 0.98,   // 25mm ≈ 0.98"
    BOTTOM_INCHES: 0.79, // 20mm ≈ 0.79"
    LEFT_INCHES: 0.59,   // 15mm ≈ 0.59"
    RIGHT_INCHES: 0.59,  // 15mm ≈ 0.59"
  },

  // Header/Footer Dimensions
  HEADER: {
    HEIGHT_MM: 20,
    PADDING_MM: 10,
    PADDING_TOP_MM: 4,
    PADDING_BOTTOM_MM: 6,
  },
  FOOTER: {
    HEIGHT_MM: 16,
    PADDING_MM: 8,
  },

  // Executive-Grade Typography Scale (in points)
  FONTS: {
    // Major headings
    H1: 32,      // Main report titles - bold, impactful
    H2: 22,      // Major section headers - clear hierarchy
    H3: 17,      // Subsection headers - professional weight
    H4: 14,      // Card titles / minor headers
    H5: 12,      // Table headers / labels

    // Body text
    BODY: 11,    // Standard paragraph text
    BODY_LARGE: 13, // Lead paragraphs / emphasis
    BODY_SMALL: 10,  // Supporting text

    // Specialty
    CAPTION: 9,  // Image captions / footnotes
    FOOTER: 8,   // Footer text
    TABLE: 10,   // Table cell text
  },

  // Professional Spacing System (8px base, generous for executive feel)
  SPACING: {
    XXXS: '4px',
    XXS: '6px',
    XS: '8px',
    SM: '12px',
    MD: '20px',
    LG: '32px',
    XL: '48px',
    XXL: '64px',
  },

  // VerifyTrade Brand Colors
  COLORS: {
    // Primary brand
    BRAND_ORANGE: '#f97316',
    BRAND_ORANGE_DARK: '#ea580c',
    BRAND_ORANGE_LIGHT: '#fed7aa',
    BRAND_ORANGE_ULTRA_LIGHT: '#ffedd5',

    // Grayscale (neutral, professional)
    GRAY_900: '#111827',
    GRAY_800: '#1f2937',
    GRAY_700: '#374151',
    GRAY_600: '#4b5563',
    GRAY_500: '#6b7280',
    GRAY_400: '#9ca3af',
    GRAY_300: '#d1d5db',
    GRAY_200: '#e5e7eb',
    GRAY_100: '#f3f4f6',
    GRAY_50: '#f9fafb',

    // Accent colors (print-safe)
    GREEN: '#16a34a',
    GREEN_LIGHT: '#86efac',
    BLUE: '#2563eb',
    BLUE_LIGHT: '#93c5fd',
    RED: '#dc2626',
    RED_LIGHT: '#fca5a5',
    YELLOW: '#ca8a04',
    YELLOW_LIGHT: '#fde047',
  },
};

//=============================================================================
// EXECUTIVE-GRADE PAGE SETUP CSS
//=============================================================================

export function generatePageSetupCSS(): string {
  const { MARGINS, FONTS, SPACING, COLORS } = PDF_CONSTANTS;

  return `
    /* ========================================
       PAGE SETUP - A4 OPTIMIZED
       ======================================== */

    @page {
      size: A4;
      /* CRITICAL: These margins MUST match Gotenberg formData parameters */
      /* They reserve space for Gotenberg's native header/footer system */
      margin: ${MARGINS.TOP_MM}mm ${MARGINS.RIGHT_MM}mm ${MARGINS.BOTTOM_MM}mm ${MARGINS.LEFT_MM}mm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      /* CRITICAL: Ensure colors print exactly as designed */
      print-color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Helvetica Neue', Arial, sans-serif;
      font-size: ${FONTS.BODY}pt;
      line-height: 1.6;
      color: ${COLORS.GRAY_900};
      background: white;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* ========================================
       EXECUTIVE TYPOGRAPHY SCALE
       ======================================== */

    h1 {
      font-size: ${FONTS.H1}pt;
      font-weight: 800;
      color: ${COLORS.GRAY_900};
      letter-spacing: -1px;
      line-height: 1.1;
      margin-bottom: ${SPACING.MD};
      margin-top: 0;
      break-after: avoid !important;
      page-break-after: avoid !important;
    }

    h2 {
      font-size: ${FONTS.H2}pt;
      font-weight: 700;
      color: ${COLORS.GRAY_900};
      letter-spacing: -0.5px;
      line-height: 1.2;
      margin-bottom: ${SPACING.SM};
      margin-top: ${SPACING.LG};
      padding-bottom: ${SPACING.XXS};
      border-bottom: 2px solid ${COLORS.BRAND_ORANGE};
      break-after: avoid !important;
      page-break-after: avoid !important;
    }

    h2:first-child {
      margin-top: 0;
    }

    h3 {
      font-size: ${FONTS.H3}pt;
      font-weight: 700;
      color: ${COLORS.GRAY_900};
      letter-spacing: -0.3px;
      line-height: 1.3;
      margin-bottom: ${SPACING.SM};
      margin-top: ${SPACING.MD};
      padding-bottom: ${SPACING.XXS};
      border-bottom: 1px solid ${COLORS.GRAY_200};
      break-after: avoid !important;
      page-break-after: avoid !important;
    }

    h4 {
      font-size: ${FONTS.H4}pt;
      font-weight: 700;
      color: ${COLORS.BRAND_ORANGE};
      letter-spacing: -0.2px;
      line-height: 1.3;
      margin-bottom: ${SPACING.XS};
      margin-top: ${SPACING.SM};
      break-after: avoid !important;
      page-break-after: avoid !important;
    }

    h5 {
      font-size: ${FONTS.H5}pt;
      font-weight: 600;
      color: ${COLORS.GRAY_700};
      letter-spacing: 0;
      line-height: 1.4;
      margin-bottom: ${SPACING.XS};
      margin-top: ${SPACING.SM};
      text-transform: uppercase;
      break-after: avoid !important;
      page-break-after: avoid !important;
    }

    p {
      margin-bottom: ${SPACING.SM};
      line-height: 1.7;
      color: ${COLORS.GRAY_700};
      orphans: 3;
      widows: 3;
    }

    strong, b {
      font-weight: 600;
      color: ${COLORS.GRAY_900};
    }

    em, i {
      font-style: italic;
      color: ${COLORS.GRAY_600};
    }

    /* ========================================
       INTELLIGENT PAGE BREAK RULES
       ======================================== */

    /* REMOVED: Manual .page divs - Gotenberg handles natural pagination */

    /* Never break inside these elements */
    .avoid-break,
    .card,
    .section-card,
    .stat-card,
    .recommendation-card,
    .system-card,
    .info-box,
    .warning-box,
    .metrics-box,
    .contract-summary-section,
    .scope-systems-section,
    .allowances-section,
    .award-section {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    /* Allow page breaks before major sections */
    .allow-break-before {
      break-before: auto;
      page-break-before: auto;
    }

    /* Force page break before (use sparingly) */
    .page-break {
      break-before: page !important;
      page-break-before: always !important;
    }

    /* Never break after headings - keep with following content */
    h1, h2, h3, h4, h5, h6 {
      break-after: avoid !important;
      page-break-after: avoid !important;
    }

    /* Keep at least 3 lines together at page breaks */
    p, li {
      orphans: 3;
      widows: 3;
    }

    /* ========================================
       PROFESSIONAL TABLE STYLING
       ======================================== */

    table {
      width: 100%;
      border-collapse: collapse;
      break-inside: auto;
      page-break-inside: auto;
      margin-bottom: ${SPACING.MD};
      background: white;
      font-size: ${FONTS.TABLE}pt;
    }

    /* CRITICAL: Repeat table header on every page */
    thead {
      display: table-header-group !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    thead tr {
      background: ${COLORS.GRAY_900} !important;
      color: white !important;
    }

    thead th {
      padding: ${SPACING.SM} ${SPACING.XS};
      font-weight: 600;
      font-size: ${FONTS.H5}pt;
      text-align: left;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      border-bottom: 2px solid ${COLORS.BRAND_ORANGE};
      color: white !important;
      background: ${COLORS.GRAY_900} !important;
    }

    /* CRITICAL: Never split a table row across pages */
    tbody tr {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      break-after: auto;
      border-bottom: 1px solid ${COLORS.GRAY_200};
    }

    tbody tr:nth-child(even) {
      background: ${COLORS.GRAY_50};
    }

    tbody tr:nth-child(odd) {
      background: white;
    }

    tbody td {
      padding: ${SPACING.XS} ${SPACING.XS};
      color: ${COLORS.GRAY_700};
      vertical-align: top;
      line-height: 1.5;
    }

    tbody td strong {
      color: ${COLORS.GRAY_900};
      font-weight: 600;
    }

    /* Keep first 6 data rows with header (prevents orphaned header) */
    tbody tr:nth-child(-n+6) {
      break-after: avoid;
      page-break-after: avoid;
    }

    /* Table footer styling */
    tfoot {
      display: table-footer-group;
      break-inside: avoid;
    }

    tfoot tr {
      background: ${COLORS.GRAY_100};
      border-top: 2px solid ${COLORS.GRAY_300};
      font-weight: 700;
    }

    tfoot td {
      padding: ${SPACING.SM} ${SPACING.XS};
      color: ${COLORS.GRAY_900};
      font-weight: 700;
    }

    /* Table text alignment utilities */
    .text-right {
      text-align: right;
    }

    .text-center {
      text-align: center;
    }

    .text-left {
      text-align: left;
    }

    /* ========================================
       IMAGES & MEDIA
       ======================================== */

    img {
      max-width: 100%;
      height: auto;
      break-inside: avoid;
      page-break-inside: avoid;
      display: block;
    }

    /* ========================================
       LISTS
       ======================================== */

    ul, ol {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-bottom: ${SPACING.SM};
      padding-left: 24px;
    }

    li {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-bottom: ${SPACING.XXS};
      line-height: 1.6;
      color: ${COLORS.GRAY_700};
    }

    li strong {
      color: ${COLORS.GRAY_900};
    }

    /* ========================================
       EXECUTIVE-GRADE CARD STYLING
       ======================================== */

    .card, .section-card {
      background: ${COLORS.GRAY_50};
      border: 1px solid ${COLORS.GRAY_200};
      border-radius: 8px;
      padding: ${SPACING.MD};
      margin-bottom: ${SPACING.MD};
      break-inside: avoid;
    }

    .info-box {
      background: ${COLORS.BLUE_LIGHT}20;
      border-left: 4px solid ${COLORS.BLUE};
      padding: ${SPACING.SM};
      margin-bottom: ${SPACING.SM};
      break-inside: avoid;
    }

    .warning-box {
      background: ${COLORS.YELLOW_LIGHT}20;
      border-left: 4px solid ${COLORS.YELLOW};
      padding: ${SPACING.SM};
      margin-bottom: ${SPACING.SM};
      break-inside: avoid;
    }

    .success-box {
      background: ${COLORS.GREEN_LIGHT}20;
      border-left: 4px solid ${COLORS.GREEN};
      padding: ${SPACING.SM};
      margin-bottom: ${SPACING.SM};
      break-inside: avoid;
    }

    /* ========================================
       UTILITY CLASSES
       ======================================== */

    .no-print {
      display: none !important;
    }

    .mt-0 { margin-top: 0 !important; }
    .mt-xs { margin-top: ${SPACING.XS}; }
    .mt-sm { margin-top: ${SPACING.SM}; }
    .mt-md { margin-top: ${SPACING.MD}; }
    .mt-lg { margin-top: ${SPACING.LG}; }

    .mb-0 { margin-bottom: 0 !important; }
    .mb-xs { margin-bottom: ${SPACING.XS}; }
    .mb-sm { margin-bottom: ${SPACING.SM}; }
    .mb-md { margin-bottom: ${SPACING.MD}; }
    .mb-lg { margin-bottom: ${SPACING.LG}; }

    .pt-xs { padding-top: ${SPACING.XS}; }
    .pb-xs { padding-bottom: ${SPACING.XS}; }
    .px-sm { padding-left: ${SPACING.SM}; padding-right: ${SPACING.SM}; }
    .py-sm { padding-top: ${SPACING.SM}; padding-bottom: ${SPACING.SM}; }

    /* ========================================
       PRINT-SPECIFIC OVERRIDES
       ======================================== */

    @media print {
      body {
        margin: 0 !important;
        padding: 0 !important;
      }

      .no-print {
        display: none !important;
      }

      .print-only {
        display: block !important;
      }

      /* Remove any fixed positioning (conflicts with Gotenberg) */
      * {
        position: static !important;
      }

      /* Ensure colors print correctly */
      thead, thead tr, thead th {
        background: ${COLORS.GRAY_900} !important;
        color: white !important;
        print-color-adjust: exact !important;
        -webkit-print-color-adjust: exact !important;
      }
    }

    @media screen {
      .print-only {
        display: none !important;
      }
    }
  `;
}

//=============================================================================
// EXECUTIVE-GRADE HEADER/FOOTER SYSTEM (GOTENBERG NATIVE)
//=============================================================================

export interface HeaderFooterConfig {
  projectName: string;
  documentTitle?: string;
  supplierName?: string;
  date?: string;
  organisationLogoUrl?: string;
}

/**
 * Generate executive-grade header HTML for Gotenberg
 * Uses Chromium placeholders (.pageNumber, .totalPages) for automatic population
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
      <div class="logo-container" style="display: flex; align-items: center; gap: 10px;">
        <img
          src="${organisationLogoUrl}"
          alt="Organisation Logo"
          style="max-width: 100px; max-height: 40px; object-fit: contain;"
        />
        <div style="width: 1px; height: 32px; background: ${COLORS.GRAY_300}; margin: 0 4px;"></div>
        <div style="font-size: 15px; font-weight: 700; color: ${COLORS.GRAY_900}; letter-spacing: -0.3px;">VerifyTrade</div>
      </div>
    `
    : `
      <div class="logo-container" style="display: flex; align-items: center; gap: 10px;">
        <div style="
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, ${COLORS.BRAND_ORANGE} 0%, ${COLORS.BRAND_ORANGE_DARK} 100%);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(249, 115, 22, 0.25);
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
          </svg>
        </div>
        <div style="font-size: 16px; font-weight: 700; color: ${COLORS.GRAY_900}; letter-spacing: -0.4px;">VerifyTrade</div>
      </div>
    `;

  return `
    <html>
      <head>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            font-size: 9pt;
            color: ${COLORS.GRAY_600};
            margin: 0;
            padding: ${HEADER.PADDING_TOP_MM}mm 15mm ${HEADER.PADDING_BOTTOM_MM}mm 15mm;
            height: ${HEADER.HEIGHT_MM}mm;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid ${COLORS.BRAND_ORANGE};
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
            font-size: 11pt;
            font-weight: 700;
            color: ${COLORS.GRAY_900};
            margin-bottom: 3px;
            letter-spacing: -0.2px;
          }
          .page-info {
            font-size: 9pt;
            color: ${COLORS.GRAY_500};
            font-weight: 500;
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
 * Generate executive-grade footer HTML for Gotenberg
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
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            font-size: 8pt;
            color: ${COLORS.GRAY_400};
            margin: 0;
            padding: ${FOOTER.PADDING_MM}mm 15mm;
            height: ${FOOTER.HEIGHT_MM}mm;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid ${COLORS.GRAY_200};
            background: white;
          }
          .left {
            font-weight: 600;
            color: ${COLORS.GRAY_600};
            font-size: 9pt;
          }
          .center {
            color: ${COLORS.BRAND_ORANGE};
            font-weight: 700;
            font-size: 9pt;
            letter-spacing: 0.3px;
          }
          .right {
            font-size: 8pt;
            color: ${COLORS.GRAY_400};
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <div class="left">${supplierName || ''}</div>
        <div class="center">VerifyTrade | www.verifytrade.co.nz</div>
        <div class="right">Confidential</div>
      </body>
    </html>
  `;
}

//=============================================================================
// HTML WRAPPER WITH DETERMINISTIC LAYOUT
//=============================================================================

/**
 * Wrap content with executive-grade layout system
 * NO manual .page divs - Gotenberg handles natural pagination
 */
export function wrapContentWithLayout(htmlContent: string): string {
  const layoutCSS = generatePageSetupCSS();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VerifyTrade Professional Report</title>
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
// CONTENT CLEANING & VALIDATION
//=============================================================================

/**
 * Remove legacy pagination artifacts
 * Cleans old manual .page divs, fixed positioning, forced breaks
 */
export function cleanLegacyPaginationArtifacts(html: string): string {
  let cleaned = html;

  // Remove manual .page wrapper divs (keep content inside)
  cleaned = cleaned.replace(/<div\s+class="page"[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/div>\s*<!--\s*\.page\s*-->/gi, '');

  // Remove manual footer elements (Gotenberg handles natively)
  cleaned = cleaned.replace(/<footer\s+class="pdf-footer"[^>]*>.*?<\/footer>/gis, '');
  cleaned = cleaned.replace(/<footer[^>]*>.*?<\/footer>/gis, '');

  // Remove page numbering JavaScript (Gotenberg handles with placeholders)
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?page-number[\s\S]*?<\/script>/gi, '');

  // Remove fixed positioning (conflicts with Gotenberg's flow-based rendering)
  cleaned = cleaned.replace(/position:\s*fixed;?/gi, 'position: static;');

  // Convert forced page breaks to auto (let Gotenberg decide naturally)
  cleaned = cleaned.replace(/page-break-after:\s*always;?/gi, 'page-break-after: auto;');
  cleaned = cleaned.replace(/break-after:\s*page;?/gi, 'break-after: auto;');

  return cleaned;
}

/**
 * Validate PDF layout and warn about legacy code
 */
export function validatePDFLayout(html: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check for legacy artifacts that should be cleaned
  if (html.includes('class="page"')) {
    warnings.push('⚠️ Found legacy .page divs - will be auto-cleaned');
  }

  if (html.includes('position: fixed') || html.includes('position:fixed')) {
    warnings.push('⚠️ Found fixed positioning - will be converted to static');
  }

  if (html.includes('.page-number') && !html.includes('.pageNumber')) {
    warnings.push('⚠️ Found old .page-number class - should use .pageNumber/.totalPages');
  }

  if (html.includes('page-break-after: always') || html.includes('page-break-after:always')) {
    warnings.push('⚠️ Found forced page breaks - will be converted to auto');
  }

  return {
    valid: warnings.length === 0,
    warnings
  };
}
