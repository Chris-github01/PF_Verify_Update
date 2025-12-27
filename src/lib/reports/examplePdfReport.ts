/**
 * Example PDF Report using the Unified PDF System
 *
 * This demonstrates how to create a clean, professional PDF report
 * without blank pages or layout issues.
 */

import { wrapPdfTemplate, createPdfSection, createPdfTable, createPdfCard } from './pdfTemplateWrapper';
import { generateAndDownloadPdf } from './pdfGenerator';

export interface ExampleReportData {
  projectName: string;
  clientName?: string;
  suppliers: Array<{
    name: string;
    price: number;
    score: number;
    coverage: number;
  }>;
  summary: string;
  recommendations: string[];
}

/**
 * Generate a complete example report
 */
export async function generateExampleReport(data: ExampleReportData): Promise<void> {
  // Build content using helper functions
  const content = buildReportContent(data);

  // Wrap with template (adds header, footer, print stylesheet)
  const html = wrapPdfTemplate(content, {
    title: 'Award Recommendation Report',
    subtitle: 'Supplier Evaluation & Analysis',
    projectName: data.projectName,
    clientName: data.clientName,
    generatedAt: new Date().toISOString(),
    showPageNumbers: true,
    // organisationLogoUrl: 'https://...', // Optional logo
  });

  // Generate and download PDF (QA checks run automatically)
  await generateAndDownloadPdf({
    htmlContent: html,
    filename: 'award_recommendation_report',
    projectName: data.projectName,
    reportType: 'Award Report',
  });
}

/**
 * Build report content structure
 */
function buildReportContent(data: ExampleReportData): string {
  return `
    ${buildCoverSection(data)}
    ${buildExecutiveSummary(data)}
    ${buildSupplierComparison(data)}
    ${buildRecommendations(data)}
    ${buildAppendix(data)}
  `;
}

/**
 * Cover page section
 */
function buildCoverSection(data: ExampleReportData): string {
  return createPdfSection({
    content: `
      <div style="text-align: center; padding: 80px 40px;">
        <h1 style="font-size: 3rem; margin-bottom: 24px;">
          Award Recommendation Report
        </h1>
        <p style="font-size: 1.5rem; color: #6b7280; margin-bottom: 48px;">
          ${data.projectName}
        </p>
        ${data.clientName ? `
          <p style="font-size: 1.2rem; color: #9ca3af;">
            Client: ${data.clientName}
          </p>
        ` : ''}
        <p style="font-size: 1rem; color: #9ca3af; margin-top: 80px;">
          ${new Date().toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })}
        </p>
      </div>
    `,
    avoidBreak: true,
  });
}

/**
 * Executive summary section
 */
function buildExecutiveSummary(data: ExampleReportData): string {
  return createPdfSection({
    title: 'Executive Summary',
    content: `
      ${createPdfCard({
        style: 'highlight',
        content: `
          <p style="font-size: 1.1rem; line-height: 1.8;">
            ${data.summary}
          </p>
        `,
      })}

      <div class="pdf-mb-lg">
        <h3 class="pdf-mb-md">Key Metrics</h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center;">
            <div style="font-size: 2rem; font-weight: 700; color: #f97316;">
              ${data.suppliers.length}
            </div>
            <div style="font-size: 0.9rem; color: #6b7280; margin-top: 8px;">
              Suppliers Evaluated
            </div>
          </div>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center;">
            <div style="font-size: 2rem; font-weight: 700; color: #f97316;">
              ${Math.round(data.suppliers.reduce((sum, s) => sum + s.coverage, 0) / data.suppliers.length)}%
            </div>
            <div style="font-size: 0.9rem; color: #6b7280; margin-top: 8px;">
              Average Coverage
            </div>
          </div>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center;">
            <div style="font-size: 2rem; font-weight: 700; color: #f97316;">
              ${Math.round(data.suppliers.reduce((sum, s) => sum + s.score, 0) / data.suppliers.length)}
            </div>
            <div style="font-size: 0.9rem; color: #6b7280; margin-top: 8px;">
              Average Score
            </div>
          </div>
        </div>
      </div>
    `,
    pageBreakBefore: true, // Start on new page
  });
}

/**
 * Supplier comparison table
 */
function buildSupplierComparison(data: ExampleReportData): string {
  // Sort by score (highest first)
  const sorted = [...data.suppliers].sort((a, b) => b.score - a.score);

  return createPdfSection({
    title: 'Supplier Comparison',
    content: createPdfTable({
      caption: 'Comparative Analysis of All Suppliers',
      headers: ['Rank', 'Supplier Name', 'Total Price', 'Weighted Score', 'Coverage'],
      rows: sorted.map((supplier, idx) => [
        `${idx + 1}`,
        supplier.name,
        `$${supplier.price.toLocaleString()}`,
        `${supplier.score.toFixed(1)}/100`,
        `${supplier.coverage.toFixed(1)}%`,
      ]),
      zebra: true,
    }),
    pageBreakBefore: true,
  });
}

/**
 * Recommendations section
 */
function buildRecommendations(data: ExampleReportData): string {
  return createPdfSection({
    title: 'Recommendations',
    content: `
      ${data.recommendations.map((rec, idx) => createPdfCard({
        title: `Recommendation ${idx + 1}`,
        content: `<p>${rec}</p>`,
        style: idx === 0 ? 'highlight' : 'default',
      })).join('')}

      <div class="pdf-mt-xl">
        <h4>Next Steps</h4>
        <ol style="line-height: 2;">
          <li>Review this report with key stakeholders</li>
          <li>Conduct due diligence on recommended supplier(s)</li>
          <li>Negotiate final terms and conditions</li>
          <li>Execute contract and begin mobilization</li>
        </ol>
      </div>
    `,
    pageBreakBefore: true,
  });
}

/**
 * Appendix section
 */
function buildAppendix(data: ExampleReportData): string {
  return createPdfSection({
    title: 'Appendix',
    content: `
      <h3>Methodology</h3>
      <p>
        This report uses a weighted scoring methodology to evaluate suppliers across
        multiple criteria including price, compliance, coverage, and risk factors.
      </p>

      <h4 class="pdf-mt-lg">Scoring Weights</h4>
      <ul>
        <li><strong>Price (40%):</strong> Lower is better</li>
        <li><strong>Compliance (25%):</strong> Based on risk factors</li>
        <li><strong>Coverage (20%):</strong> Percentage of scope covered</li>
        <li><strong>Risk (15%):</strong> Number of scope gaps</li>
      </ul>

      <h4 class="pdf-mt-lg">Confidentiality</h4>
      <p class="pdf-text-small">
        This report contains confidential and proprietary information. Distribution
        is limited to authorized personnel only.
      </p>
    `,
    pageBreakBefore: true,
  });
}

/**
 * Example usage in a component
 */
export async function handleExportButtonClick() {
  const sampleData: ExampleReportData = {
    projectName: 'Residential Tower - Phase 1',
    clientName: 'ABC Construction Ltd',
    suppliers: [
      { name: 'FireSafe Solutions', price: 145000, score: 87.5, coverage: 98.2 },
      { name: 'Safety First Ltd', price: 152000, score: 82.3, coverage: 95.1 },
      { name: 'Guardian Fire Systems', price: 138000, score: 79.8, coverage: 91.5 },
    ],
    summary: `Following a comprehensive evaluation of three qualified fire safety contractors,
              FireSafe Solutions has been identified as the recommended supplier. This recommendation
              balances competitive pricing with excellent scope coverage and low risk profile.`,
    recommendations: [
      `Award contract to FireSafe Solutions at $145,000. This represents the best value
       proposition with 98.2% scope coverage and highest weighted score of 87.5/100.`,
      `Ensure all scope gaps identified in the analysis are addressed during contract
       negotiation and mobilization phase.`,
      `Implement regular progress monitoring to maintain quality standards and timeline adherence.`,
    ],
  };

  await generateExampleReport(sampleData);
}
