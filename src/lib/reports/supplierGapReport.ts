interface ScopeGap {
  system: string;
  category?: string;
  itemsCount: number;
  estimatedImpact: string;
  details: string[];
}

interface SupplierGapReportData {
  supplierName: string;
  projectName: string;
  clientName?: string;
  coveragePercent: number;
  itemsQuoted: number;
  totalItems: number;
  gaps: ScopeGap[];
  generatedDate: string;
  deadline: string;
}

const VERIFYTRADE_ORANGE = '#f97316';
const VERIFYTRADE_ORANGE_LIGHT = '#fed7aa';

export function generateSupplierGapReportHtml(data: SupplierGapReportData): string {
  const gapsHtml = data.gaps.length > 0
    ? data.gaps.map(gap => `
        <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin-bottom: 16px; border-radius: 4px;">
          <h3 style="margin: 0 0 8px 0; color: #991b1b; font-size: 16px; font-weight: 600;">
            ${gap.system}${gap.category ? ` - ${gap.category}` : ''}
          </h3>
          <p style="margin: 0 0 12px 0; color: #7f1d1d; font-size: 14px;">
            <strong>Estimated Impact:</strong> ${gap.estimatedImpact}
          </p>
          ${gap.details.length > 0 ? `
            <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #7f1d1d;">
              ${gap.details.map(detail => `<li style="margin-bottom: 4px;">${detail}</li>`).join('')}
            </ul>
          ` : ''}
        </div>
      `).join('')
    : `
      <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 20px; border-radius: 4px; text-align: center;">
        <p style="margin: 0; color: #166534; font-size: 16px; font-weight: 600;">
          ✓ No significant scope gaps identified in your submission
        </p>
        <p style="margin: 8px 0 0 0; color: #15803d; font-size: 14px;">
          Your quote demonstrates strong alignment with project requirements.
        </p>
      </div>
    `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scope Gap Analysis - ${data.supplierName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: #ffffff;
      padding: 40px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    .header {
      border-bottom: 4px solid ${VERIFYTRADE_ORANGE};
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .logo {
      font-size: 28px;
      font-weight: 800;
      color: ${VERIFYTRADE_ORANGE};
      margin-bottom: 12px;
    }
    h1 {
      font-size: 24px;
      color: #111827;
      margin-bottom: 8px;
    }
    .metadata {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 32px;
    }
    .metadata-item {
      display: flex;
      flex-direction: column;
    }
    .metadata-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .metadata-value {
      font-size: 16px;
      color: #111827;
      font-weight: 600;
    }
    .coverage-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 18px;
    }
    .coverage-high {
      background: #dcfce7;
      color: #166534;
    }
    .coverage-medium {
      background: #fef3c7;
      color: #92400e;
    }
    .coverage-low {
      background: #fee2e2;
      color: #991b1b;
    }
    .section {
      margin-bottom: 32px;
    }
    h2 {
      font-size: 20px;
      color: #111827;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e5e7eb;
    }
    .intro-box {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      padding: 20px;
      border-radius: 4px;
      margin-bottom: 24px;
    }
    .intro-box p {
      margin: 0 0 8px 0;
      color: #1e40af;
    }
    .intro-box p:last-child {
      margin-bottom: 0;
    }
    .footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }
    .compliance-note {
      background: #f3f4f6;
      padding: 16px;
      border-radius: 6px;
      font-size: 13px;
      color: #4b5563;
      margin-top: 24px;
    }
    @media print {
      body {
        padding: 20px;
      }
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="logo">Verify+</div>
      <h1>Scope Gap Analysis Report</h1>
      <p style="color: #6b7280; font-size: 14px;">Confidential - For ${data.supplierName} Only</p>
    </div>

    <!-- Metadata -->
    <div class="metadata">
      <div class="metadata-item">
        <span class="metadata-label">Supplier</span>
        <span class="metadata-value">${data.supplierName}</span>
      </div>
      <div class="metadata-item">
        <span class="metadata-label">Project</span>
        <span class="metadata-value">${data.projectName}</span>
      </div>
      ${data.clientName ? `
      <div class="metadata-item">
        <span class="metadata-label">Client</span>
        <span class="metadata-value">${data.clientName}</span>
      </div>
      ` : ''}
      <div class="metadata-item">
        <span class="metadata-label">Generated</span>
        <span class="metadata-value">${data.generatedDate}</span>
      </div>
      <div class="metadata-item">
        <span class="metadata-label">Scope Coverage</span>
        <span class="coverage-badge ${
          data.coveragePercent >= 90 ? 'coverage-high' :
          data.coveragePercent >= 70 ? 'coverage-medium' :
          'coverage-low'
        }">
          ${data.coveragePercent.toFixed(1)}%
        </span>
      </div>
      <div class="metadata-item">
        <span class="metadata-label">Items Quoted</span>
        <span class="metadata-value">${data.itemsQuoted} of ${data.totalItems}</span>
      </div>
    </div>

    <!-- Introduction -->
    <div class="section">
      <div class="intro-box">
        <p><strong>Purpose:</strong> This report identifies potential scope gaps in your quote submission to enable a complete "apples-to-apples" comparison with project requirements.</p>
        <p><strong>Important:</strong> This analysis is based solely on your submission and the baseline project scope. No information from other suppliers is included.</p>
        <p><strong>Deadline for Revisions:</strong> <strong>${data.deadline}</strong></p>
      </div>
    </div>

    <!-- Scope Gaps -->
    <div class="section">
      <h2>Identified Scope Gaps</h2>
      ${data.gaps.length > 0 ? `
        <p style="margin-bottom: 16px; color: #374151;">
          The following items or systems appear to be missing or incomplete in your quote. Please review and provide clarifications or additions as needed:
        </p>
      ` : ''}
      ${gapsHtml}
    </div>

    <!-- Next Steps -->
    <div class="section">
      <h2>Next Steps</h2>
      <ol style="margin-left: 20px; color: #374151;">
        <li style="margin-bottom: 12px;">
          <strong>Review</strong> each identified gap against your original submission and project drawings/specifications
        </li>
        <li style="margin-bottom: 12px;">
          <strong>Provide</strong> a revised quote addressing the gaps, or clarify if items were intentionally excluded with justification
        </li>
        <li style="margin-bottom: 12px;">
          <strong>Submit</strong> your response by <strong>${data.deadline}</strong> to ensure your quote is included in the final evaluation
        </li>
        <li style="margin-bottom: 12px;">
          <strong>Contact</strong> us if you have any questions or need clarification on any items
        </li>
      </ol>
    </div>

    <!-- Compliance Note -->
    <div class="compliance-note">
      <strong>Procurement Compliance:</strong> This clarification process is conducted in accordance with NZ Government Procurement Rules (Rule 40 - Post-tender clarifications). All suppliers with identified gaps receive similar opportunities to complete their submissions. This process focuses on scope completeness, not price negotiation, to ensure fair and transparent evaluation.
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>Generated by Verify+ | Confidential Document</p>
      <p style="margin-top: 8px;">This report contains information specific to ${data.supplierName}'s submission only</p>
    </div>
  </div>
</body>
</html>
  `;
}

export function downloadSupplierGapReport(html: string, supplierName: string, projectName: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = supplierName.replace(/[^a-z0-9]/gi, '_');
  const safeProject = projectName.replace(/[^a-z0-9]/gi, '_');
  a.download = `Scope_Gap_Report_${safeName}_${safeProject}_${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
