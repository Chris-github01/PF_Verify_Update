/**
 * PDF Template Wrapper System
 *
 * Provides a standardized wrapper for all PDF reports with:
 * - Consistent header/footer that never overlaps content
 * - Logo support
 * - Page numbering
 * - Document metadata
 * - Responsive layout
 */

import { wrapPdfContent } from './printStyles';

export interface PdfTemplateOptions {
  title: string;
  subtitle?: string;
  projectName?: string;
  clientName?: string;
  contractNumber?: string;
  generatedAt?: string;
  organisationLogoUrl?: string;
  showPageNumbers?: boolean;
  customCss?: string;
}

/**
 * Brand colors for VerifyTrade
 */
const BRAND_COLORS = {
  primary: '#f97316',
  primaryLight: '#fed7aa',
  primaryDark: '#ea580c',
  text: '#1f2937',
  textLight: '#6b7280',
  border: '#e5e7eb',
};

/**
 * Generate logo section (supports both custom org logos and default VerifyTrade logo)
 */
function generateLogoSection(logoUrl?: string, size: 'small' | 'large' = 'large'): string {
  const dimensions = size === 'large' ? { icon: 52, text: 26 } : { icon: 40, text: 20 };

  if (logoUrl) {
    return `
      <div style="display: flex; align-items: center; gap: 12px;">
        <img
          src="${logoUrl}"
          alt="Organisation Logo"
          style="max-height: ${dimensions.icon}px; max-width: 200px; object-fit: contain;"
        />
      </div>
    `;
  }

  // Default VerifyTrade branding
  return `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="
        width: ${dimensions.icon}px;
        height: ${dimensions.icon}px;
        background: linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.primaryDark} 100%);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 8px rgba(249, 115, 22, 0.25);
      ">
        <svg width="${dimensions.icon * 0.6}" height="${dimensions.icon * 0.6}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M9 11l3 3L22 4"></path>
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
        </svg>
      </div>
      <span style="
        font-size: ${dimensions.text}px;
        font-weight: 700;
        color: ${BRAND_COLORS.text};
        letter-spacing: -0.5px;
      ">VerifyTrade</span>
    </div>
  `;
}

/**
 * Generate PDF header
 */
function generateHeader(options: PdfTemplateOptions): string {
  const { organisationLogoUrl, generatedAt } = options;

  return `
    <div style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 40px;
      border-bottom: 3px solid ${BRAND_COLORS.primary};
      background: white;
    ">
      ${generateLogoSection(organisationLogoUrl, 'small')}

      ${generatedAt ? `
        <div style="text-align: right; font-size: 11px; color: ${BRAND_COLORS.textLight};">
          Generated: ${new Date(generatedAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Generate PDF footer with page numbers
 */
function generateFooter(options: PdfTemplateOptions): string {
  const { projectName, showPageNumbers = true } = options;

  return `
    <div style="
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 40px;
      border-top: 1px solid ${BRAND_COLORS.border};
      font-size: 10px;
      color: ${BRAND_COLORS.textLight};
      background: white;
    ">
      <div>
        ${projectName ? `<strong>${projectName}</strong> · ` : ''}
        Confidential
      </div>

      ${showPageNumbers ? `
        <div class="pdf-page-number"></div>
      ` : ''}

      <div>
        Powered by <strong style="color: ${BRAND_COLORS.primary};">VerifyTrade</strong>
      </div>
    </div>

    <script>
      // Add page numbers dynamically
      document.addEventListener('DOMContentLoaded', function() {
        const pageNumbers = document.querySelectorAll('.pdf-page-number');
        pageNumbers.forEach((el, index) => {
          el.textContent = 'Page ' + (index + 1);
        });
      });
    </script>
  `;
}

/**
 * Generate complete HTML document for PDF
 */
export function wrapPdfTemplate(content: string, options: PdfTemplateOptions): string {
  const { title, subtitle, customCss } = options;

  const header = generateHeader(options);
  const footer = generateFooter(options);

  const wrappedContent = wrapPdfContent({
    content,
    header,
    footer,
    customCss,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${subtitle ? `<meta name="description" content="${subtitle}">` : ''}
</head>
<body>
  ${wrappedContent}
</body>
</html>`;
}

/**
 * Create a section with optional page break
 */
export function createPdfSection(options: {
  title?: string;
  content: string;
  pageBreakBefore?: boolean;
  avoidBreak?: boolean;
}): string {
  const { title, content, pageBreakBefore = false, avoidBreak = true } = options;

  const classes = [
    avoidBreak ? 'pdf-avoid-break' : '',
    pageBreakBefore ? 'pdf-page-break' : '',
  ].filter(Boolean).join(' ');

  return `
    <section class="${classes}">
      ${title ? `<h2 style="margin-bottom: 24px;">${title}</h2>` : ''}
      ${content}
    </section>
  `;
}

/**
 * Create a card/panel element
 */
export function createPdfCard(options: {
  title?: string;
  content: string;
  style?: 'default' | 'highlight' | 'warning';
}): string {
  const { title, content, style = 'default' } = options;

  const styles = {
    default: {
      background: '#ffffff',
      border: `1px solid ${BRAND_COLORS.border}`,
      borderLeft: `4px solid ${BRAND_COLORS.primary}`,
    },
    highlight: {
      background: '#fef3c7',
      border: `1px solid #fbbf24`,
      borderLeft: `4px solid #f59e0b`,
    },
    warning: {
      background: '#fee2e2',
      border: `1px solid #fca5a5`,
      borderLeft: `4px solid #ef4444`,
    },
  };

  const cardStyle = styles[style];

  return `
    <div class="pdf-card" style="
      background: ${cardStyle.background};
      border: ${cardStyle.border};
      border-left: ${cardStyle.borderLeft};
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 24px;
    ">
      ${title ? `<h4 style="margin-bottom: 12px;">${title}</h4>` : ''}
      ${content}
    </div>
  `;
}

/**
 * Create a table with proper pagination support
 */
export function createPdfTable(options: {
  headers: string[];
  rows: string[][];
  caption?: string;
  zebra?: boolean;
}): string {
  const { headers, rows, caption, zebra = true } = options;

  return `
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      ${caption ? `<caption style="text-align: left; font-weight: 600; margin-bottom: 12px;">${caption}</caption>` : ''}

      <thead>
        <tr style="background: ${BRAND_COLORS.primary}; color: white;">
          ${headers.map(h => `
            <th style="
              padding: 12px;
              text-align: left;
              font-weight: 600;
              border-bottom: 2px solid ${BRAND_COLORS.primaryDark};
            ">${h}</th>
          `).join('')}
        </tr>
      </thead>

      <tbody>
        ${rows.map((row, idx) => `
          <tr style="${zebra && idx % 2 === 1 ? `background: #f9fafb;` : ''}">
            ${row.map(cell => `
              <td style="
                padding: 10px 12px;
                border-bottom: 1px solid ${BRAND_COLORS.border};
              ">${cell}</td>
            `).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
