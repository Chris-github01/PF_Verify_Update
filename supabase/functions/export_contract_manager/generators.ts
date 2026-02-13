import { generateFastPreletAppendix } from './preletAppendixGenerator.ts';
import { SA_IMAGE_1_BASE64, SA_IMAGE_2_BASE64 } from './coverImages.ts';

export function generateJuniorPackHTML(): string {
  throw new Error('Junior pack not implemented in this version');
}

export function generateSeniorReportHTML(): string {
  throw new Error('Senior report not implemented in this version');
}

export function generatePreletAppendixHTML(
  projectName: string,
  supplierName: string,
  totalAmount: number,
  appendixData: any,
  organisationLogoUrl?: string
): string {
  console.log('[PRELET] Using FAST generator (optimized for speed)');
  return generateFastPreletAppendix(
    projectName,
    supplierName,
    appendixData,
    organisationLogoUrl
  );
}

export function generateSA2017AgreementHTML(
  agreement: any,
  template: any,
  fields: any[],
  fieldValues: Record<string, any>,
  project: any,
  organisationLogoUrl?: string
): string {
  console.log('[SA-2017] Generating comprehensive 51-page agreement PDF with exact visual replication');

  // Use embedded base64 images - no external dependencies
  const topImage = SA_IMAGE_1_BASE64;
  const bottomImage = SA_IMAGE_2_BASE64;

  // Define the proper section order matching SA-2017 standard
  const sectionOrder = [
    'Contract Identity',
    'Parties',
    'Background & Scope',
    'Bonds & Guarantees',
    'Insurance',
    'Variations',
    'Time',
    'Defects',
    'Payments',
    'Miscellaneous',
    'Additional Documents',
    'Special Conditions',
    'Signatures'
  ];

  const fieldsBySection: Record<string, any[]> = {};
  fields.forEach(field => {
    if (!fieldsBySection[field.section]) {
      fieldsBySection[field.section] = [];
    }
    fieldsBySection[field.section].push(field);
  });

  Object.keys(fieldsBySection).forEach(section => {
    fieldsBySection[section].sort((a, b) => (a.field_order || 0) - (b.field_order || 0));
  });

  const sections = sectionOrder.filter(section => fieldsBySection[section]?.length > 0);

  const escapeHtml = (text: string): string => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text || '').replace(/[&<>"']/g, m => map[m]);
  };

  const formatFieldValue = (field: any, value: any): string => {
    if (!value || !value.field_value) return '<span style="color: #94a3b8; font-style: italic;">Not specified</span>';

    const val = value.field_value;

    if (field.field_type === 'textarea') {
      return val.split('\n').map((line: string) => `<p style="margin-bottom: 0.5em;">${escapeHtml(line)}</p>`).join('');
    }

    if (field.field_type === 'number' || field.field_key?.includes('price') || field.field_key?.includes('amount') || field.field_key?.includes('value')) {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        return `$${num.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    }

    if (field.field_key?.includes('percentage')) {
      return `${val}%`;
    }

    if (field.field_type === 'date') {
      try {
        const date = new Date(val);
        return date.toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' });
      } catch {
        return escapeHtml(val);
      }
    }

    return escapeHtml(val);
  };

  const getFieldValue = (key: string): string => {
    const value = fieldValues[key];
    if (!value || !value.field_value) return '';
    return escapeHtml(value.field_value);
  };

  const getFieldValueRaw = (key: string): string => {
    const value = fieldValues[key];
    return value?.field_value || '';
  };

  const hasFieldValue = (key: string): boolean => {
    const value = fieldValues[key];
    return !!(value && value.field_value && value.field_value.trim() !== '');
  };

  const renderFieldDisplay = (label: string, key: string): string => {
    if (!hasFieldValue(key)) return '';
    return `
    <div class="field-display">
      <div class="field-label">${label}:</div>
      <div class="field-value">${getFieldValue(key)}</div>
    </div>`;
  };

  // Generate comprehensive SA-2017 document matching exact PDF layout
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SA-2017 Subcontract Agreement - ${agreement.agreement_number}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 25mm 25mm 25mm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      line-height: 1.4;
      color: #000;
      background: white;
    }

    .container {
      max-width: 100%;
      margin: 0 auto;
    }

    /* Cover Page - Exact Match */
    .cover-page {
      page-break-after: always;
      position: relative;
      min-height: 100vh;
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    .cover-content {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    /* Full Width Top Image */
    .cover-top-image {
      width: 100%;
      height: auto;
      display: block;
      margin: 0;
      padding: 0;
    }

    .cover-title-section {
      margin: 30px 80px 50px 80px;
    }

    .cover-main-title {
      font-size: 36pt;
      font-weight: bold;
      margin-bottom: 15px;
      color: #1e40af;
      letter-spacing: 0;
      line-height: 1.2;
    }

    .cover-subtitle {
      font-size: 28pt;
      font-weight: bold;
      margin-bottom: 0;
      color: #1e40af;
      line-height: 1.2;
    }

    .cover-form-section {
      margin: 0 80px 100px 80px;
    }

    .cover-form-row {
      display: flex;
      margin-bottom: 25px;
      align-items: baseline;
    }

    .cover-form-label {
      font-weight: bold;
      width: 150px;
      flex-shrink: 0;
      font-size: 12pt;
      color: #1e40af;
    }

    .cover-form-value {
      flex: 1;
      font-size: 12pt;
      border-bottom: 1px solid #333;
      padding-bottom: 4px;
      padding-left: 10px;
      min-height: 24px;
    }

    /* Full Width Bottom Image */
    .cover-bottom-image {
      width: 100%;
      height: auto;
      display: block;
      margin: 0;
      padding: 0;
      position: absolute;
      bottom: 0;
      left: 0;
    }


    /* Foreword Section */
    .foreword-page {
      page-break-after: always;
      padding: 20px 0;
    }

    .foreword-title {
      font-size: 16pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 20px;
      text-transform: uppercase;
    }

    .foreword-text {
      font-size: 10pt;
      line-height: 1.6;
      text-align: justify;
      margin-bottom: 12px;
    }

    /* Table of Contents */
    .toc-page {
      page-break-after: always;
      padding: 20px 0;
    }

    .toc-title {
      font-size: 16pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 25px;
      text-transform: uppercase;
    }

    .toc-section {
      margin-bottom: 15px;
    }

    .toc-item {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      border-bottom: 1px dotted #ccc;
      font-size: 10pt;
    }

    .toc-item-title {
      font-weight: normal;
    }

    .toc-item-page {
      font-weight: bold;
      min-width: 30px;
      text-align: right;
    }

    .toc-subsection {
      margin-left: 20px;
      margin-top: 5px;
    }

    /* Document Structure */
    h1 {
      font-size: 14pt;
      font-weight: bold;
      margin: 25px 0 15px 0;
      text-align: center;
      text-transform: uppercase;
      page-break-after: avoid;
    }

    h2 {
      font-size: 12pt;
      font-weight: bold;
      margin: 20px 0 12px 0;
      page-break-after: avoid;
      text-transform: uppercase;
    }

    h3 {
      font-size: 11pt;
      font-weight: bold;
      margin: 15px 0 10px 0;
      page-break-after: avoid;
    }

    h4 {
      font-size: 10pt;
      font-weight: bold;
      margin: 12px 0 8px 0;
      page-break-after: avoid;
    }

    .clause {
      margin-bottom: 12px;
      page-break-inside: avoid;
      font-size: 10pt;
      line-height: 1.5;
    }

    .clause-number {
      font-weight: bold;
      display: inline-block;
      min-width: 50px;
      vertical-align: top;
    }

    .clause-text {
      display: inline;
      text-align: justify;
    }

    .sub-clause {
      margin-left: 50px;
      margin-top: 10px;
    }

    .clause-indent {
      margin-left: 25px;
    }

    /* Recitals */
    .recitals {
      margin: 30px 0;
      font-style: italic;
    }

    .recital {
      margin-bottom: 15px;
      text-align: justify;
    }

    /* Agreement Terms */
    .terms-section {
      margin: 30px 0;
    }

    .definition-list {
      margin-left: 20px;
    }

    .definition-item {
      margin-bottom: 12px;
    }

    .definition-term {
      font-weight: bold;
      font-style: italic;
    }

    /* Field Display */
    .field-display {
      background: #f9f9f9;
      border-left: 4px solid #0066cc;
      padding: 10px 12px;
      margin: 8px 0;
      page-break-inside: avoid;
    }

    .field-label {
      font-weight: bold;
      font-size: 10pt;
      color: #333;
      margin-bottom: 5px;
    }

    .field-value {
      font-size: 11pt;
      line-height: 1.6;
    }

    /* Appendix Sections */
    .appendix-page {
      page-break-before: always;
      padding: 20px 0;
    }

    .appendix-title {
      font-size: 14pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 20px;
      text-transform: uppercase;
    }

    .appendix-subtitle {
      font-size: 11pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 25px;
    }

    .appendix-section {
      margin-bottom: 20px;
    }

    .appendix-heading {
      font-size: 11pt;
      font-weight: bold;
      margin: 15px 0 10px 0;
      text-decoration: underline;
    }

    /* Schedule/Table - Exact PDF Match */
    .schedule-table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      page-break-inside: avoid;
      font-size: 9pt;
    }

    .schedule-table th {
      background: #e8e8e8;
      color: #000;
      padding: 8px 10px;
      text-align: left;
      font-weight: bold;
      border: 1px solid #000;
      vertical-align: top;
    }

    .schedule-table td {
      padding: 8px 10px;
      border: 1px solid #000;
      vertical-align: top;
      background: white;
    }

    .schedule-table tr.shaded {
      background: #f5f5f5;
    }

    .schedule-row-header {
      font-weight: bold;
      background: #f0f0f0;
    }

    /* Checkbox styles */
    .checkbox-group {
      margin: 10px 0;
    }

    .checkbox-item {
      display: flex;
      align-items: center;
      margin: 5px 0;
      font-size: 10pt;
    }

    .checkbox {
      width: 14px;
      height: 14px;
      border: 1.5px solid #000;
      display: inline-block;
      margin-right: 8px;
      position: relative;
      flex-shrink: 0;
    }

    .checkbox.checked::after {
      content: '✓';
      position: absolute;
      top: -3px;
      left: 2px;
      font-size: 12pt;
      font-weight: bold;
    }

    /* Form fields */
    .form-field {
      margin: 12px 0;
      page-break-inside: avoid;
    }

    .form-field-label {
      font-weight: bold;
      margin-bottom: 5px;
      font-size: 10pt;
    }

    .form-field-value {
      border-bottom: 1px solid #000;
      min-height: 20px;
      padding: 2px 5px;
      font-size: 10pt;
    }

    .form-field-inline {
      display: inline-block;
      border-bottom: 1px solid #000;
      min-width: 150px;
      padding: 0 5px;
      margin: 0 5px;
    }

    /* Notes and Important Text */
    .note-box {
      background: #fffbeb;
      border: 1px solid #fbbf24;
      border-left: 4px solid #f59e0b;
      padding: 12px;
      margin: 15px 0;
      font-size: 9pt;
      page-break-inside: avoid;
    }

    .important-box {
      background: #eff6ff;
      border: 1px solid #3b82f6;
      border-left: 4px solid #2563eb;
      padding: 12px;
      margin: 15px 0;
      font-size: 9pt;
      page-break-inside: avoid;
    }

    .warning-box {
      background: #fef2f2;
      border: 1px solid #f87171;
      border-left: 4px solid #dc2626;
      padding: 12px;
      margin: 15px 0;
      font-size: 9pt;
      page-break-inside: avoid;
    }

    /* Lists */
    .bullet-list {
      margin: 10px 0 10px 30px;
    }

    .bullet-list li {
      margin: 5px 0;
      font-size: 10pt;
      line-height: 1.5;
    }

    .numbered-list {
      margin: 10px 0 10px 30px;
      counter-reset: item;
      list-style: none;
    }

    .numbered-list li {
      margin: 5px 0;
      font-size: 10pt;
      line-height: 1.5;
      counter-increment: item;
    }

    .numbered-list li:before {
      content: counter(item) ". ";
      font-weight: bold;
      margin-right: 5px;
    }

    /* Signature Block */
    .signature-section {
      margin-top: 50px;
      page-break-inside: avoid;
    }

    .signature-party-title {
      font-size: 11pt;
      font-weight: bold;
      margin-bottom: 20px;
      text-decoration: underline;
    }

    .signature-block {
      margin: 30px 0;
      page-break-inside: avoid;
    }

    .signature-field {
      margin: 15px 0;
    }

    .signature-line {
      border-bottom: 1.5px solid #000;
      width: 300px;
      margin-top: 40px;
      padding-top: 5px;
      font-size: 9pt;
      color: #666;
    }

    .signature-details {
      margin-top: 8px;
      font-size: 9pt;
    }

    /* Page Footers */
    .page-footer {
      position: fixed;
      bottom: 15mm;
      left: 25mm;
      right: 25mm;
      font-size: 7pt;
      color: #666;
      text-align: center;
      border-top: 1px solid #ccc;
      padding-top: 8px;
    }

    .copyright-footer {
      font-size: 7pt;
      color: #666;
      text-align: center;
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #ccc;
    }

    /* Document Footer */
    .document-footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #999;
      font-size: 8pt;
      color: #666;
      text-align: center;
    }

    /* Text Formatting */
    .bold {
      font-weight: bold;
    }

    .italic {
      font-style: italic;
    }

    .underline {
      text-decoration: underline;
    }

    .text-center {
      text-align: center;
    }

    .text-justify {
      text-align: justify;
    }

    /* Spacing utilities */
    .mb-1 { margin-bottom: 8px; }
    .mb-2 { margin-bottom: 12px; }
    .mb-3 { margin-bottom: 16px; }
    .mb-4 { margin-bottom: 20px; }
    .mt-1 { margin-top: 8px; }
    .mt-2 { margin-top: 12px; }
    .mt-3 { margin-top: 16px; }
    .mt-4 { margin-top: 20px; }

    /* Print Optimization */
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      .page-break {
        page-break-before: always;
      }
      h1, h2, h3 {
        page-break-after: avoid;
      }
      .clause, .field-display, .signature-block {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">

    <!-- COVER PAGE (Page 1) -->
    <div class="cover-page">
      <!-- Full Width Top Image -->
      <img src="${topImage}" alt="Cover Header" class="cover-top-image">

      <div class="cover-content">
        <!-- Title Section -->
        <div class="cover-title-section">
          <div class="cover-main-title">Subcontract agreement</div>
          <div class="cover-subtitle">SA - 2017</div>
        </div>

        <!-- Form Details -->
        <div class="cover-form-section">
          <div class="cover-form-row">
            <div class="cover-form-label">Project:</div>
            <div class="cover-form-value">${getFieldValue('project_name') || ''}</div>
          </div>
          <div class="cover-form-row">
            <div class="cover-form-label">Trade:</div>
            <div class="cover-form-value">${project?.trade || ''}</div>
          </div>
          <div class="cover-form-row">
            <div class="cover-form-label">Subcontractor:</div>
            <div class="cover-form-value">${getFieldValue('subcontractor_name') || ''}</div>
          </div>
          <div class="cover-form-row">
            <div class="cover-form-label">Reference:</div>
            <div class="cover-form-value">${agreement.agreement_number || ''}</div>
          </div>
        </div>
      </div>

      <!-- Full Width Bottom Image -->
      <img src="${bottomImage}" alt="Cover Footer" class="cover-bottom-image">
    </div>

    <!-- FOREWORD (Pages 2-3) -->
    <div class="foreword-page">
      <h1 class="foreword-title">Foreword</h1>

      <p class="foreword-text">
        This subcontract agreement (SA-2017) has been produced jointly by the Registered Master Builders Association
        of New Zealand and the New Zealand Specialist Trade Contractors Federation to meet the needs of the
        construction industry.
      </p>

      <p class="foreword-text">
        The agreement is designed for use between a head contractor and a subcontractor for the execution of
        specialist trade work forming part of a larger construction project. It is suitable for use on projects
        of any size and complexity.
      </p>

      <p class="foreword-text">
        <strong>Key Features:</strong>
      </p>

      <ul class="bullet-list">
        <li>Complies with the Construction Contracts Act 2002</li>
        <li>Provides a fair and balanced framework for both parties</li>
        <li>Includes comprehensive general conditions covering all aspects of the subcontract relationship</li>
        <li>Allows for customization through specific conditions and schedules</li>
        <li>Promotes good practice in health and safety, quality management, and dispute resolution</li>
      </ul>

      <p class="foreword-text">
        <strong>Using This Agreement:</strong>
      </p>

      <p class="foreword-text">
        This agreement consists of several parts:
      </p>

      <ul class="bullet-list">
        <li><strong>The Agreement Page</strong> - Sets out the essential terms including the parties, the works,
        price, and time for completion</li>
        <li><strong>Subcontract Specific Conditions</strong> - Details the specific requirements for this particular
        subcontract including payment terms, retention, insurance, and other key matters</li>
        <li><strong>General Conditions</strong> - Standard conditions that apply to all subcontracts using this form</li>
        <li><strong>Appendices</strong> - Schedules providing additional detail on scope of works, pricing,
        programmes, and other matters</li>
      </ul>

      <p class="foreword-text">
        The agreement should be read as a whole. In the event of any inconsistency between documents, the order
        of precedence is as follows:
      </p>

      <ol class="numbered-list">
        <li>The Agreement page and Subcontract Specific Conditions</li>
        <li>The Appendices and Schedules</li>
        <li>The General Conditions</li>
        <li>Any other documents expressly incorporated into the subcontract</li>
      </ol>

      <p class="foreword-text">
        <strong>Legal Advice:</strong>
      </p>

      <p class="foreword-text">
        While this agreement has been carefully prepared and reviewed by legal experts, it is a standard form
        document that may not suit every situation. Parties are advised to seek independent legal advice before
        entering into this agreement, particularly where:
      </p>

      <ul class="bullet-list">
        <li>The subcontract value is substantial</li>
        <li>The works involve significant technical complexity or risk</li>
        <li>Design responsibilities are being transferred to the subcontractor</li>
        <li>Special insurance or bonding arrangements are required</li>
      </ul>

      <p class="foreword-text">
        <strong>The Construction Contracts Act 2002:</strong>
      </p>

      <p class="foreword-text">
        This agreement is subject to the Construction Contracts Act 2002 (the Act). The Act provides important
        protections for parties to construction contracts, including:
      </p>

      <ul class="bullet-list">
        <li>The right to make and receive regular progress payments</li>
        <li>The right to suspend work if payment is not made</li>
        <li>The right to refer disputes to rapid adjudication</li>
        <li>Protection of retention money held by the head contractor</li>
      </ul>

      <p class="foreword-text">
        Both parties should familiarize themselves with their rights and obligations under the Act. Information
        is available from the Ministry of Business, Innovation and Employment website at www.mbie.govt.nz.
      </p>

      <p class="foreword-text">
        <strong>Industry Standards:</strong>
      </p>

      <p class="foreword-text">
        This agreement incorporates and refers to various industry standards and codes of practice. Where such
        standards are referenced, parties should ensure they understand the requirements and have the capability
        to comply.
      </p>

      <p class="foreword-text">
        The Registered Master Builders Association and the New Zealand Specialist Trade Contractors Federation
        recommend the use of qualified, licensed, and experienced contractors for all construction work.
      </p>

      <div class="copyright-footer">
        ©Registered Master Builders Association of New Zealand Inc/New Zealand Specialist Trade Contractors Federation Inc
      </div>
    </div>

    <!-- TABLE OF CONTENTS (Pages 4-5) -->
    <div class="toc-page">
      <h1 class="toc-title">Contents</h1>

      <div class="toc-section">
        <div class="toc-item">
          <div class="toc-item-title"><strong>Foreword</strong></div>
          <div class="toc-item-page">2</div>
        </div>
        <div class="toc-item">
          <div class="toc-item-title"><strong>Contents</strong></div>
          <div class="toc-item-page">4</div>
        </div>
        <div class="toc-item">
          <div class="toc-item-title"><strong>Subcontract Agreement</strong></div>
          <div class="toc-item-page">6</div>
        </div>
        <div class="toc-item">
          <div class="toc-item-title"><strong>Subcontract Specific Conditions</strong></div>
          <div class="toc-item-page">7</div>
        </div>
      </div>

      <div class="toc-section">
        <div class="toc-item">
          <div class="toc-item-title"><strong>Subcontract General Conditions</strong></div>
          <div class="toc-item-page">16</div>
        </div>
        <div class="toc-subsection">
          <div class="toc-item">
            <div class="toc-item-title">1. Interpretation and Definitions</div>
            <div class="toc-item-page">16</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">2. The Contracts</div>
            <div class="toc-item-page">18</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">3. Subcontractor's Bonds and Guarantees</div>
            <div class="toc-item-page">19</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">4. Sub-letting or Assigning</div>
            <div class="toc-item-page">20</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">5. General Obligations</div>
            <div class="toc-item-page">21</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">6. Design and Producer Statements</div>
            <div class="toc-item-page">26</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">7. Indemnity</div>
            <div class="toc-item-page">27</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">8. Insurance</div>
            <div class="toc-item-page">28</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">9. Variations</div>
            <div class="toc-item-page">30</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">10. Time</div>
            <div class="toc-item-page">32</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">11. Defects</div>
            <div class="toc-item-page">34</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">12. Payments</div>
            <div class="toc-item-page">35</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">13. Disputes and Remedies</div>
            <div class="toc-item-page">37</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">14. Default</div>
            <div class="toc-item-page">38</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">15. Urgent Work</div>
            <div class="toc-item-page">39</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">16. Service of Notices</div>
            <div class="toc-item-page">40</div>
          </div>
        </div>
      </div>

      <div class="toc-section">
        <div class="toc-item">
          <div class="toc-item-title"><strong>Appendices</strong></div>
          <div class="toc-item-page">41</div>
        </div>
        <div class="toc-subsection">
          <div class="toc-item">
            <div class="toc-item-title">Appendix A - Scope of Works</div>
            <div class="toc-item-page">42</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">Appendix B1 - Pricing Schedule (Lump Sum)</div>
            <div class="toc-item-page">44</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">Appendix B2 - Pricing Schedule (Rates)</div>
            <div class="toc-item-page">45</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">Appendix C - Programme</div>
            <div class="toc-item-page">46</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">Appendix D - Quality Plan</div>
            <div class="toc-item-page">47</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">Appendix E1 - Health and Safety Plan</div>
            <div class="toc-item-page">48</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">Appendix E2 - Site Safety Rules</div>
            <div class="toc-item-page">49</div>
          </div>
          <div class="toc-item">
            <div class="toc-item-title">Appendix E3 - Insurance Requirements</div>
            <div class="toc-item-page">50</div>
          </div>
        </div>
      </div>

      <div class="copyright-footer">
        ©Registered Master Builders Association of New Zealand Inc/New Zealand Specialist Trade Contractors Federation Inc
      </div>
    </div>

    <!-- AGREEMENT PAGE (Page 6) -->
    <div class="page-break"></div>
    <h1>Subcontract Agreement</h1>

    <div class="recitals">
      <p class="recital">
        <strong>THIS AGREEMENT</strong> is made on ${getFieldValue('contract_date')}
      </p>
      <p class="recital">
        <strong>BETWEEN:</strong>
      </p>
      <p class="recital">
        ${getFieldValue('head_contractor_name')} of ${getFieldValue('head_contractor_address')}
        (hereinafter called "the Head Contractor")
      </p>
      <p class="recital">
        <strong>AND:</strong>
      </p>
      <p class="recital">
        ${getFieldValue('subcontractor_name')} of ${getFieldValue('subcontractor_address')}
        (hereinafter called "the Subcontractor")
      </p>
    </div>

    <h2>Background</h2>
    <div class="clause">
      <span class="clause-number">A.</span>
      <span class="clause-text">
        The Head Contractor has entered into a contract (the "Head Contract") referenced as
        ${getFieldValue('head_contract_reference')} with respect to the project known as
        ${getFieldValue('project_name')}.
      </span>
    </div>
    <div class="clause">
      <span class="clause-number">B.</span>
      <span class="clause-text">
        The Head Contractor requires the Subcontractor to carry out certain works forming part of
        the Head Contract works, and the Subcontractor has agreed to carry out such works on the
        terms and conditions set out in this Agreement.
      </span>
    </div>
    <div class="clause">
      <span class="clause-number">C.</span>
      <span class="clause-text">
        This Agreement is subject to the Construction Contracts Act 2002 and the parties acknowledge
        that they have been advised of their rights under that Act, including the right to refer
        disputes to adjudication.
      </span>
    </div>

    <h2>Operative Provisions</h2>

    <h3>1. Contract Identity</h3>
    ${renderFieldDisplay('Contract Reference', 'contract_reference')}
    ${renderFieldDisplay('Contract Date', 'contract_date')}
    ${renderFieldDisplay('Project Name', 'project_name')}
    ${renderFieldDisplay('Project Location', 'project_location')}

    <!-- SUBCONTRACT SPECIFIC CONDITIONS (Pages 7-15) -->
    <div class="page-break"></div>
    <h1>Subcontract Specific Conditions</h1>

    <p class="mb-3" style="font-size: 10pt; text-align: justify;">
      The following Specific Conditions supplement and, where inconsistent, take precedence over the General
      Conditions. Complete all applicable sections. Where a section is not applicable, write "N/A".
    </p>

    <!-- Section 1: The Parties -->
    <h2>1. THE PARTIES</h2>

    <table class="schedule-table">
      <tr>
        <td style="width: 30%; font-weight: bold; background: #f0f0f0;">HEAD CONTRACTOR</td>
        <td style="width: 70%;"></td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Name:</td>
        <td>${getFieldValue('head_contractor_name')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Address:</td>
        <td>${getFieldValue('head_contractor_address')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Contact Person:</td>
        <td>${getFieldValue('head_contractor_contact')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Phone:</td>
        <td>${getFieldValue('head_contractor_phone')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Email:</td>
        <td>${getFieldValue('head_contractor_email')}</td>
      </tr>
    </table>

    <table class="schedule-table" style="margin-top: 20px;">
      <tr>
        <td style="width: 30%; font-weight: bold; background: #f0f0f0;">SUBCONTRACTOR</td>
        <td style="width: 70%;"></td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Name:</td>
        <td>${getFieldValue('subcontractor_name')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Address:</td>
        <td>${getFieldValue('subcontractor_address')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Contact Person:</td>
        <td>${getFieldValue('subcontractor_contact')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Phone:</td>
        <td>${getFieldValue('subcontractor_phone')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Email:</td>
        <td>${getFieldValue('subcontractor_email')}</td>
      </tr>
    </table>

    <!-- Section 2: The Project -->
    <h2 style="margin-top: 25px;">2. THE PROJECT</h2>

    <table class="schedule-table">
      <tr>
        <td style="width: 30%; font-weight: bold;">Project Name:</td>
        <td style="width: 70%;">${getFieldValue('project_name')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Project Location:</td>
        <td>${getFieldValue('project_location')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Head Contract Reference:</td>
        <td>${getFieldValue('head_contract_reference')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Principal/Client:</td>
        <td>${getFieldValue('principal_name')}</td>
      </tr>
    </table>

    <!-- Section 3: The Subcontract Works -->
    <h2 style="margin-top: 25px;">3. THE SUBCONTRACT WORKS</h2>

    <table class="schedule-table">
      <tr>
        <td style="width: 30%; font-weight: bold;">Trade Package:</td>
        <td style="width: 70%;">${project?.trade || 'N/A'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; vertical-align: top;">Description of Works:</td>
        <td>${getFieldValue('subcontract_works_description') || 'See Appendix A - Scope of Works'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; vertical-align: top;">Inclusions:</td>
        <td>${getFieldValue('scope_inclusions') || 'As detailed in contract documents'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; vertical-align: top;">Exclusions:</td>
        <td>${getFieldValue('exclusions') || 'As detailed in contract documents'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Drawings Reference:</td>
        <td>${getFieldValue('drawings_list') || 'As per project drawing register'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Specifications Reference:</td>
        <td>${getFieldValue('specifications_list') || 'As per project specifications'}</td>
      </tr>
    </table>

    <!-- Section 4: Contract Price -->
    <h2 style="margin-top: 25px;">4. CONTRACT PRICE</h2>

    <table class="schedule-table">
      <tr>
        <td style="width: 30%; font-weight: bold;">Contract Price (excl GST):</td>
        <td style="width: 70%;">${getFieldValue('contract_price')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Price Basis:</td>
        <td>
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('contract_price_basis') === 'Lump Sum' ? 'checked' : ''}"></div>
              <span>Lump Sum (See Appendix B1)</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('contract_price_basis') === 'Schedule of Rates' ? 'checked' : ''}"></div>
              <span>Schedule of Rates (See Appendix B2)</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('contract_price_basis') === 'Cost Plus' ? 'checked' : ''}"></div>
              <span>Cost Plus (Margin: ${getFieldValue('cost_plus_margin') || '____%'})</span>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="font-weight: bold;">GST Inclusive:</td>
        <td>${getFieldValue('gst_inclusive') || 'Yes - GST to be added to all amounts'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Price Includes:</td>
        <td>All labour, materials, plant, equipment, and services necessary for complete execution of the works</td>
      </tr>
    </table>

    <!-- Section 5: Time -->
    <h2 style="margin-top: 25px;">5. TIME</h2>

    <table class="schedule-table">
      <tr>
        <td style="width: 30%; font-weight: bold;">Commencement Date:</td>
        <td style="width: 70%;">${getFieldValue('commencement_date')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Completion Date:</td>
        <td>${getFieldValue('completion_date')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Contract Duration:</td>
        <td>${getFieldValue('contract_duration') || 'As per programme'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Programme Required:</td>
        <td>
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('programme_provided') === 'Yes' ? 'checked' : ''}"></div>
              <span>Yes - See Appendix C</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('programme_provided') === 'No' ? 'checked' : ''}"></div>
              <span>No - Works to be coordinated with Head Contractor's master programme</span>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Liquidated Damages:</td>
        <td>
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('liquidated_damages_applicable') === 'Yes' ? 'checked' : ''}"></div>
              <span>Applicable - Rate: ${getFieldValue('liquidated_damages_rate') || '$_______ per day'}</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('liquidated_damages_applicable') === 'No' ? 'checked' : ''}"></div>
              <span>Not Applicable</span>
            </div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Section 6: Payment Terms -->
    <h2 style="margin-top: 25px;">6. PAYMENT TERMS</h2>

    <table class="schedule-table">
      <tr>
        <td style="width: 30%; font-weight: bold;">Payment Claim Frequency:</td>
        <td style="width: 70%;">
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('payment_claim_frequency') === 'Monthly' ? 'checked' : ''}"></div>
              <span>Monthly</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('payment_claim_frequency') === 'Fortnightly' ? 'checked' : ''}"></div>
              <span>Fortnightly</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('payment_claim_frequency') === 'On Completion' ? 'checked' : ''}"></div>
              <span>On Completion</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('payment_claim_frequency') === 'Other' ? 'checked' : ''}"></div>
              <span>Other: ${getFieldValue('payment_claim_frequency_other') || '_____________'}</span>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Payment Claim Date:</td>
        <td>${getFieldValue('payment_claim_date') || 'By the 20th of each month'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Payment Terms:</td>
        <td>${getFieldValue('payment_terms_days') || '20'} working days from receipt of valid payment claim</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Buyer-Created Tax Invoice:</td>
        <td>
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('buyer_created_tax_invoice') === 'Yes' ? 'checked' : ''}"></div>
              <span>Yes - Head Contractor to issue tax invoices on behalf of Subcontractor</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('buyer_created_tax_invoice') === 'No' ? 'checked' : ''}"></div>
              <span>No - Subcontractor to provide tax invoices</span>
            </div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Section 7: Retention -->
    <h2 style="margin-top: 25px;">7. RETENTION</h2>

    <table class="schedule-table">
      <tr>
        <td style="width: 30%; font-weight: bold;">Retention Applicable:</td>
        <td style="width: 70%;">
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('retention_required') === 'Yes' ? 'checked' : ''}"></div>
              <span>Yes</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('retention_required') === 'No' ? 'checked' : ''}"></div>
              <span>No</span>
            </div>
          </div>
        </td>
      </tr>
      ${getFieldValueRaw('retention_required') === 'Yes' ? `
      <tr>
        <td style="font-weight: bold;">Retention Percentage:</td>
        <td>${getFieldValue('retention_percentage') || '5'}%</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Maximum Retention:</td>
        <td>${getFieldValue('max_retention_amount') || 'No maximum specified'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Release of First Half:</td>
        <td>Upon Practical Completion</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Release of Second Half:</td>
        <td>Upon expiry of Defects Liability Period and rectification of all defects</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Trust Account Required:</td>
        <td>If retention exceeds $100,000</td>
      </tr>
      ` : ''}
    </table>

    <!-- Section 8: Defects Liability -->
    <h2 style="margin-top: 25px;">8. DEFECTS LIABILITY</h2>

    <table class="schedule-table">
      <tr>
        <td style="width: 30%; font-weight: bold;">Defects Liability Period:</td>
        <td style="width: 70%;">${getFieldValue('defects_liability_period') || '12'} months from Practical Completion</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Notification Process:</td>
        <td>${getFieldValue('defects_notification_process') || 'Written notice to Subcontractor within 5 working days of discovery'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Rectification Period:</td>
        <td>${getFieldValue('defects_rectification_period') || 'Within reasonable time as specified by Head Contractor'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Warranties Required:</td>
        <td>${getFieldValue('warranty_requirements') || 'Manufacturer warranties for all equipment and materials'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Maintenance Manuals:</td>
        <td>
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('maintenance_manuals_required') === 'Yes' ? 'checked' : ''}"></div>
              <span>Required - To be provided on completion</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('maintenance_manuals_required') === 'No' ? 'checked' : ''}"></div>
              <span>Not Required</span>
            </div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Section 9: Insurance -->
    <h2 style="margin-top: 25px;">9. INSURANCE</h2>

    <table class="schedule-table">
      <tr>
        <td colspan="2" style="font-weight: bold; background: #f0f0f0;">PUBLIC LIABILITY INSURANCE</td>
      </tr>
      <tr>
        <td style="width: 30%; font-weight: bold;">Required:</td>
        <td style="width: 70%;">
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('public_liability_required') === 'Yes' ? 'checked' : ''}"></div>
              <span>Yes</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('public_liability_required') === 'No' ? 'checked' : ''}"></div>
              <span>No</span>
            </div>
          </div>
        </td>
      </tr>
      ${getFieldValueRaw('public_liability_required') === 'Yes' ? `
      <tr>
        <td style="font-weight: bold;">Minimum Cover:</td>
        <td>${getFieldValue('public_liability_amount') || '$10,000,000'}</td>
      </tr>
      ` : ''}
      <tr>
        <td colspan="2" style="font-weight: bold; background: #f0f0f0; padding-top: 15px;">CONTRACT WORKS INSURANCE</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Responsibility:</td>
        <td>
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('contract_works_insurance') === 'Head Contractor' ? 'checked' : ''}"></div>
              <span>Head Contractor to arrange</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('contract_works_insurance') === 'Subcontractor' ? 'checked' : ''}"></div>
              <span>Subcontractor to arrange</span>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="font-weight: bold; background: #f0f0f0; padding-top: 15px;">PROFESSIONAL INDEMNITY INSURANCE</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Required:</td>
        <td>
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('professional_indemnity_required') === 'Yes' ? 'checked' : ''}"></div>
              <span>Yes (if design services included)</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('professional_indemnity_required') === 'No' ? 'checked' : ''}"></div>
              <span>No / Not Applicable</span>
            </div>
          </div>
        </td>
      </tr>
      ${getFieldValueRaw('professional_indemnity_required') === 'Yes' ? `
      <tr>
        <td style="font-weight: bold;">Minimum Cover:</td>
        <td>${getFieldValue('professional_indemnity_amount') || '$2,000,000'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Period of Cover:</td>
        <td>${getFieldValue('professional_indemnity_period') || '7 years from completion'}</td>
      </tr>
      ` : ''}
      <tr>
        <td colspan="2" style="padding-top: 10px;">
          <div class="note-box">
            <strong>Note:</strong> Certificates of currency must be provided prior to commencement and upon renewal.
            All policies must note the Head Contractor's interest. See Appendix E3 for detailed insurance requirements.
          </div>
        </td>
      </tr>
    </table>

    <!-- Section 10: Bonds and Guarantees -->
    <h2 style="margin-top: 25px;">10. BONDS AND GUARANTEES</h2>

    <table class="schedule-table">
      <tr>
        <td style="width: 30%; font-weight: bold;">Performance Bond:</td>
        <td style="width: 70%;">
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('performance_bond_required') === 'Yes' ? 'checked' : ''}"></div>
              <span>Required</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('performance_bond_required') === 'No' ? 'checked' : ''}"></div>
              <span>Not Required</span>
            </div>
          </div>
        </td>
      </tr>
      ${getFieldValueRaw('performance_bond_required') === 'Yes' ? `
      <tr>
        <td style="font-weight: bold;">Bond Percentage:</td>
        <td>${getFieldValue('performance_bond_percentage') || '10'}% of Contract Price</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Bond Value:</td>
        <td>${getFieldValue('performance_bond_value')}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Expiry Date:</td>
        <td>${getFieldValue('performance_bond_expiry') || 'End of Defects Liability Period'}</td>
      </tr>
      ` : ''}
      <tr>
        <td style="font-weight: bold;">Parent Company Guarantee:</td>
        <td>
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('parent_company_guarantee') === 'Yes' ? 'checked' : ''}"></div>
              <span>Required</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('parent_company_guarantee') === 'No' ? 'checked' : ''}"></div>
              <span>Not Required</span>
            </div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Section 11: Variations -->
    <h2 style="margin-top: 25px;">11. VARIATIONS</h2>

    <table class="schedule-table">
      <tr>
        <td style="width: 30%; font-weight: bold;">Approval Required:</td>
        <td style="width: 70%;">Written authorization required for all variations</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Threshold for Quote:</td>
        <td>${getFieldValue('variation_approval_threshold') || 'All variations over $1,000'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Valuation Method:</td>
        <td>
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('variation_valuation_method')?.includes('Contract Rates') ? 'checked' : ''}"></div>
              <span>Contract rates where applicable</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('variation_valuation_method')?.includes('Fair Rates') ? 'checked' : ''}"></div>
              <span>Fair and reasonable rates</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('variation_valuation_method')?.includes('Daywork') ? 'checked' : ''}"></div>
              <span>Daywork (if agreed)</span>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Daywork Rates:</td>
        <td>
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('daywork_rates_agreed') === 'Yes' ? 'checked' : ''}"></div>
              <span>Agreed - ${getFieldValue('daywork_schedule') || 'See schedule'}</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('daywork_rates_agreed') === 'No' ? 'checked' : ''}"></div>
              <span>Not agreed - To be negotiated if required</span>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Overheads & Profit:</td>
        <td>${getFieldValue('variation_overhead_profit') || '15% on direct costs'}</td>
      </tr>
    </table>

    <!-- Section 12: Health and Safety -->
    <h2 style="margin-top: 25px;">12. HEALTH AND SAFETY</h2>

    <table class="schedule-table">
      <tr>
        <td style="width: 30%; font-weight: bold;">H&S Plan Required:</td>
        <td style="width: 70%;">
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('health_safety_plan_required') === 'Yes' ? 'checked' : ''}"></div>
              <span>Yes - See Appendix E1</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('health_safety_plan_required') === 'No' ? 'checked' : ''}"></div>
              <span>No - To comply with site H&S plan</span>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Site Safety Rules:</td>
        <td>See Appendix E2 - Must be acknowledged before site access</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">PCBU Responsibilities:</td>
        <td>Subcontractor acknowledges duties under Health and Safety at Work Act 2015</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Site Induction:</td>
        <td>Required for all personnel before commencing work</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Incident Reporting:</td>
        <td>All incidents, accidents and near-misses must be reported to Head Contractor immediately</td>
      </tr>
    </table>

    <!-- Section 13: Quality Assurance -->
    <h2 style="margin-top: 25px;">13. QUALITY ASSURANCE</h2>

    <table class="schedule-table">
      <tr>
        <td style="width: 30%; font-weight: bold;">Quality Plan Required:</td>
        <td style="width: 70%;">
          <div class="checkbox-group">
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('quality_assurance_required') === 'Yes' ? 'checked' : ''}"></div>
              <span>Yes - See Appendix D</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${getFieldValueRaw('quality_assurance_required') === 'No' ? 'checked' : ''}"></div>
              <span>No - Standard quality control applies</span>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Inspections:</td>
        <td>${getFieldValue('inspection_requirements') || 'As per project quality requirements'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Testing:</td>
        <td>${getFieldValue('testing_requirements') || 'As specified in contract documents'}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">Producer Statements:</td>
        <td>Required for all relevant building consent work</td>
      </tr>
    </table>

    <!-- Section 14: Special Conditions -->
    <h2 style="margin-top: 25px;">14. SPECIAL CONDITIONS</h2>

    ${hasFieldValue('special_conditions_text') ? `
    <div style="border: 1px solid #ccc; padding: 15px; min-height: 100px; background: white;">
      ${getFieldValue('special_conditions_text').split('\n').map((line: string) => `<p style="margin-bottom: 8px;">${escapeHtml(line)}</p>`).join('')}
    </div>
    ` : `
    <div style="border: 1px solid #ccc; padding: 15px; min-height: 100px; background: white; color: #999; font-style: italic;">
      No special conditions specified. If there are any additional terms or conditions specific to this
      subcontract that are not covered in the General Conditions, they should be clearly stated here.
    </div>
    `}

    <!-- Section 15: Contract Documents -->
    <h2 style="margin-top: 25px;">15. CONTRACT DOCUMENTS</h2>

    <p class="mb-2" style="font-size: 10pt;">
      The following documents form part of this Subcontract and shall be read together. In the event of
      any inconsistency, the order of precedence shall be as listed below:
    </p>

    <table class="schedule-table">
      <tr>
        <td style="width: 5%; text-align: center; font-weight: bold;">1.</td>
        <td style="width: 95%;">This Subcontract Agreement and Subcontract Specific Conditions</td>
      </tr>
      <tr>
        <td style="text-align: center; font-weight: bold;">2.</td>
        <td>Appendices A to E (as applicable)</td>
      </tr>
      <tr>
        <td style="text-align: center; font-weight: bold;">3.</td>
        <td>Subcontract General Conditions</td>
      </tr>
      <tr>
        <td style="text-align: center; font-weight: bold;">4.</td>
        <td>Project Drawings: ${getFieldValue('drawings_list') || 'As per drawing register'}</td>
      </tr>
      <tr>
        <td style="text-align: center; font-weight: bold;">5.</td>
        <td>Project Specifications: ${getFieldValue('specifications_list') || 'As per specification index'}</td>
      </tr>
      <tr>
        <td style="text-align: center; font-weight: bold;">6.</td>
        <td>Other Documents: ${getFieldValue('other_documents') || 'N/A'}</td>
      </tr>
    </table>

    <div class="important-box" style="margin-top: 20px;">
      <strong>Construction Contracts Act 2002:</strong> This Agreement is subject to the Construction Contracts
      Act 2002. Both parties acknowledge that they have been advised of their rights under the Act, including
      the right to make progress payments and to refer disputes to adjudication.
    </div>

    <div class="copyright-footer">
      ©Registered Master Builders Association of New Zealand Inc/New Zealand Specialist Trade Contractors Federation Inc
    </div>

    <!-- GENERAL CONDITIONS -->
    <h1 style="text-align: center; margin: 30px 0 20px 0;">GENERAL CONDITIONS</h1>

    <h2>1. INTERPRETATION AND DEFINITIONS</h2>

    <div class="clause">
      <span class="clause-number">1.1</span>
      <span class="clause-text">
        In this Agreement, unless the context otherwise requires:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 15px;">
      <p style="margin-bottom: 10px;"><strong>"Agreement"</strong> means this Subcontract Agreement including all schedules, appendices and documents incorporated by reference.</p>
      <p style="margin-bottom: 10px;"><strong>"Construction Contracts Act"</strong> means the Construction Contracts Act 2002 and any amendments or regulations made thereunder.</p>
      <p style="margin-bottom: 10px;"><strong>"Contract Price"</strong> means the price stated in this Agreement for the execution and completion of the Subcontract Works.</p>
      <p style="margin-bottom: 10px;"><strong>"Defects Liability Period"</strong> means the period specified in this Agreement during which the Subcontractor is liable to make good defects.</p>
      <p style="margin-bottom: 10px;"><strong>"Head Contract"</strong> means the contract between the Head Contractor and the Principal for the execution of works of which the Subcontract Works form part.</p>
      <p style="margin-bottom: 10px;"><strong>"Head Contractor"</strong> means the party named as the Head Contractor in this Agreement and includes its successors and permitted assigns.</p>
      <p style="margin-bottom: 10px;"><strong>"Practical Completion"</strong> means when the Subcontract Works have been completed except for minor defects and omissions that do not prevent the works from being used for their intended purpose.</p>
      <p style="margin-bottom: 10px;"><strong>"Subcontract Works"</strong> means the works described in this Agreement and all work necessary for the proper execution and completion thereof.</p>
      <p style="margin-bottom: 10px;"><strong>"Subcontractor"</strong> means the party named as the Subcontractor in this Agreement and includes its successors and permitted assigns.</p>
      <p style="margin-bottom: 10px;"><strong>"Variation"</strong> means any change, addition, omission or substitution to the Subcontract Works ordered by the Head Contractor.</p>
    </div>

    <div class="clause">
      <span class="clause-number">1.2</span>
      <span class="clause-text">
        Words importing the singular include the plural and vice versa. Headings are for convenience only and do not affect interpretation.
      </span>
    </div>

    <div class="page-break"></div>

    <h2>2. THE CONTRACTS</h2>

    <div class="clause">
      <span class="clause-number">2.1</span>
      <span class="clause-text">
        The Subcontractor acknowledges that the Subcontract Works form part of works to be executed under the Head Contract.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">2.2</span>
      <span class="clause-text">
        The Subcontractor shall be deemed to have full knowledge of all the provisions of the Head Contract insofar as they relate to the Subcontract Works and shall observe and comply with such provisions.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">2.3</span>
      <span class="clause-text">
        Where provisions of the Head Contract are incorporated into this Agreement by reference, such provisions shall be read as if "Head Contractor" were substituted for "Principal" or "Employer", and "Subcontractor" were substituted for "Contractor".
      </span>
    </div>

    <h2>3. SUBCONTRACTOR'S BONDS AND GUARANTEES</h2>

    <div class="clause">
      <span class="clause-number">3.1</span>
      <span class="clause-text">
        If specified in this Agreement, the Subcontractor shall provide a performance bond from an approved surety for the percentage of the Contract Price stated, in the form required by the Head Contractor.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">3.2</span>
      <span class="clause-text">
        The performance bond shall remain in force until the expiry of the Defects Liability Period and the rectification of all defects, or until such earlier time as the Head Contractor may agree in writing.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">3.3</span>
      <span class="clause-text">
        If specified in this Agreement, the Subcontractor shall provide a parent company guarantee or other security in the form and amount required by the Head Contractor.
      </span>
    </div>

    <h2>4. SUB-LETTING OR ASSIGNING</h2>

    <div class="clause">
      <span class="clause-number">4.1</span>
      <span class="clause-text">
        The Subcontractor shall not assign, novate or transfer this Agreement or any rights or obligations under it without the prior written consent of the Head Contractor.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">4.2</span>
      <span class="clause-text">
        The Subcontractor shall not sub-let any portion of the Subcontract Works without the prior written consent of the Head Contractor, which consent shall not be unreasonably withheld.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">4.3</span>
      <span class="clause-text">
        Any consent to sub-letting shall not relieve the Subcontractor from any liability or obligation under this Agreement, and the Subcontractor shall be responsible for the acts and omissions of all sub-contractors as if they were the acts and omissions of the Subcontractor.
      </span>
    </div>

    <div class="page-break"></div>

    <h2>5. GENERAL OBLIGATIONS</h2>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.1 Care of Works</h3>

    <div class="clause">
      <span class="clause-number">5.1.1</span>
      <span class="clause-text">
        The Subcontractor shall take full responsibility for the care of the Subcontract Works from commencement until Practical Completion.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.1.2</span>
      <span class="clause-text">
        The Subcontractor shall protect the Subcontract Works and all materials, goods, and equipment intended for incorporation into the works from loss or damage from any cause.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.1.3</span>
      <span class="clause-text">
        If any loss or damage occurs to the Subcontract Works, the Subcontractor shall notify the Head Contractor immediately and shall make good such loss or damage at its own cost, unless caused by the Head Contractor's negligence.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.1.4</span>
      <span class="clause-text">
        The Subcontractor shall protect and preserve any existing work, finishes, fixtures, and fittings that may be affected by the Subcontract Works.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.1.5</span>
      <span class="clause-text">
        The Subcontractor shall be liable for any damage caused to the Head Contract Works or to property of the Principal, the Head Contractor, or others arising from the execution of the Subcontract Works.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.2 Compliance with Legislation</h3>

    <div class="clause">
      <span class="clause-number">5.2.1</span>
      <span class="clause-text">
        The Subcontractor shall comply with all statutes, regulations, bylaws, and requirements of any statutory authority applicable to the Subcontract Works.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.2.2</span>
      <span class="clause-text">
        The Subcontractor shall obtain and pay for all permits, licenses, and consents required for the execution of the Subcontract Works, unless otherwise stated in this Agreement.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.2.3</span>
      <span class="clause-text">
        The Subcontractor shall comply with all applicable health and safety legislation, including the Health and Safety at Work Act 2015, and shall maintain all required documentation.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.3 Site Conditions and Inspection of Surfaces</h3>

    <div class="clause">
      <span class="clause-number">5.3.1</span>
      <span class="clause-text">
        The Subcontractor shall be deemed to have inspected and examined the site and its surroundings and to have satisfied itself as to the nature of the ground and subsoil, the form and nature of the site, the extent and nature of work and materials necessary for completion of the Subcontract Works, and the means of access to the site.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.3.2</span>
      <span class="clause-text">
        The Subcontractor shall inspect all surfaces to which work is to be applied and shall report any defects or unsuitable conditions to the Head Contractor before commencing work on such surfaces.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.4 Services</h3>

    <div class="clause">
      <span class="clause-number">5.4.1</span>
      <span class="clause-text">
        The Head Contractor shall provide access to water and electricity for the execution of the Subcontract Works. The Subcontractor shall pay for all water and electricity consumed unless otherwise agreed.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.4.2</span>
      <span class="clause-text">
        The Subcontractor shall provide all other services, facilities, and equipment necessary for the execution of the Subcontract Works.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.4.3</span>
      <span class="clause-text">
        The Subcontractor shall locate and protect all existing services on or adjacent to the site and shall immediately report any damage to such services to the Head Contractor.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.5 Scaffolding</h3>

    <div class="clause">
      <span class="clause-number">5.5.1</span>
      <span class="clause-text">
        Unless otherwise stated, the Subcontractor shall provide all scaffolding, hoarding, and safety equipment necessary for the execution of the Subcontract Works.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.5.2</span>
      <span class="clause-text">
        All scaffolding shall comply with applicable regulations and shall be erected and maintained by competent persons.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.5.3</span>
      <span class="clause-text">
        The Subcontractor shall provide safe access and working platforms for all persons who may need to inspect the Subcontract Works.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.5.4</span>
      <span class="clause-text">
        Where scaffolding is provided by the Head Contractor, the Subcontractor shall be responsible for any modifications or additions required for the Subcontract Works.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.5.5</span>
      <span class="clause-text">
        The Subcontractor shall remove all scaffolding upon completion of the Subcontract Works or when no longer required.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.6 Hoisting</h3>

    <div class="clause">
      <span class="clause-number">5.6.1</span>
      <span class="clause-text">
        Unless otherwise stated, the Subcontractor shall provide all plant and equipment necessary for hoisting and transporting materials, including cranes, hoists, and lifting equipment. Where hoisting facilities are provided by the Head Contractor, the Subcontractor shall coordinate use of such facilities.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.7 Use of Work or Facilities Provided by Others</h3>

    <div class="clause">
      <span class="clause-number">5.7.1</span>
      <span class="clause-text">
        The Subcontractor shall coordinate its work with other contractors and shall not interfere with or damage work executed by others. The Subcontractor shall be liable for any damage caused to work of others by the Subcontractor's operations.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.8 Cleaning</h3>

    <div class="clause">
      <span class="clause-number">5.8.1</span>
      <span class="clause-text">
        The Subcontractor shall keep the site clean and tidy and shall remove all rubbish, debris, and surplus materials resulting from the Subcontract Works on a regular basis.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.8.2</span>
      <span class="clause-text">
        The Subcontractor shall clean all work surfaces and shall protect finished work from damage or deterioration.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.8.3</span>
      <span class="clause-text">
        On completion of the Subcontract Works, the Subcontractor shall clean all areas affected by the works and shall remove all equipment, materials, and rubbish from the site.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.8.4</span>
      <span class="clause-text">
        If the Subcontractor fails to clean as required, the Head Contractor may carry out such cleaning and deduct the cost from monies due to the Subcontractor.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.9 Health and Safety</h3>

    <div class="clause">
      <span class="clause-number">5.9.1</span>
      <span class="clause-text">
        The Subcontractor acknowledges that it is a Person Conducting a Business or Undertaking (PCBU) under the Health and Safety at Work Act 2015 and shall comply with all duties and obligations under that Act.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.9.2</span>
      <span class="clause-text">
        The Subcontractor shall prepare and implement a health and safety plan for the Subcontract Works and shall provide a copy to the Head Contractor prior to commencing work.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.9.3</span>
      <span class="clause-text">
        The Subcontractor shall ensure that all workers are competent, properly trained, and provided with appropriate personal protective equipment.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.9.4</span>
      <span class="clause-text">
        The Subcontractor shall immediately report all accidents, incidents, and near misses to the Head Contractor and shall maintain all required health and safety records.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.9.5</span>
      <span class="clause-text">
        The Subcontractor shall comply with any site-specific health and safety requirements notified by the Head Contractor and shall attend all required health and safety meetings.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.10 Hours of Work</h3>

    <div class="clause">
      <span class="clause-number">5.10.1</span>
      <span class="clause-text">
        The Subcontractor shall execute the Subcontract Works during normal working hours unless otherwise agreed with the Head Contractor. Work outside normal hours or on weekends and public holidays shall require the Head Contractor's prior written consent.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.11 Quality Assurance</h3>

    <div class="clause">
      <span class="clause-number">5.11.1</span>
      <span class="clause-text">
        If specified in this Agreement, the Subcontractor shall implement and maintain a quality assurance system for the Subcontract Works and shall provide evidence of compliance when requested by the Head Contractor.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.12 Use of Alternative Materials or Products</h3>

    <div class="clause">
      <span class="clause-number">5.12.1</span>
      <span class="clause-text">
        The Subcontractor shall not substitute any materials or products specified in the contract documents without the prior written approval of the Head Contractor.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.12.2</span>
      <span class="clause-text">
        Any request for substitution shall be accompanied by full technical data demonstrating that the proposed substitute is equal to or better than the specified product.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.12.3</span>
      <span class="clause-text">
        The Head Contractor's approval of any substitution shall not relieve the Subcontractor from any obligations under this Agreement.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.13 Shop Drawings, As-Built Drawings, Operating Manuals</h3>

    <div class="clause">
      <span class="clause-number">5.13.1</span>
      <span class="clause-text">
        The Subcontractor shall prepare and submit shop drawings, fabrication drawings, samples, and other information as required for approval by the Head Contractor prior to fabrication or installation.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.13.2</span>
      <span class="clause-text">
        On completion, the Subcontractor shall provide as-built drawings, operation and maintenance manuals, warranties, and all other documentation required by the contract documents or reasonably requested by the Head Contractor.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.14 Communication Requirements</h3>

    <div class="clause">
      <span class="clause-number">5.14.1</span>
      <span class="clause-text">
        The Subcontractor shall provide a competent supervisor or foreman on site at all times when work is being executed.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.14.2</span>
      <span class="clause-text">
        The Subcontractor shall provide contact details for its nominated representative and shall ensure that this person is available to respond to communications from the Head Contractor.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.14.3</span>
      <span class="clause-text">
        All formal communications, instructions, and notices shall be in writing and delivered in accordance with the notice provisions of this Agreement.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.15 Attendance at Meetings</h3>

    <div class="clause">
      <span class="clause-number">5.15.1</span>
      <span class="clause-text">
        The Subcontractor shall attend all site meetings, coordination meetings, and other meetings as required by the Head Contractor. The Subcontractor's representative shall have authority to make decisions and commitments on behalf of the Subcontractor.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.16 Programme Requirements</h3>

    <div class="clause">
      <span class="clause-number">5.16.1</span>
      <span class="clause-text">
        If required by this Agreement, the Subcontractor shall prepare and submit a detailed programme showing the timing and sequence of the Subcontract Works. The Subcontractor shall update the programme as required and shall comply with any master programme issued by the Head Contractor.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.17 Quality Plan Requirements</h3>

    <div class="clause">
      <span class="clause-number">5.17.1</span>
      <span class="clause-text">
        If specified in this Agreement, the Subcontractor shall prepare and submit a quality plan detailing inspection and testing procedures, hold points, and quality control measures to be implemented for the Subcontract Works.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.18 Advance Notification</h3>

    <div class="clause">
      <span class="clause-number">5.18.1</span>
      <span class="clause-text">
        The Subcontractor shall give the Head Contractor reasonable advance notice of any work that is to be inspected or tested before being covered up or made inaccessible.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.18.2</span>
      <span class="clause-text">
        If the Subcontractor fails to give proper notice and covers up work before inspection, the Subcontractor shall uncover such work for inspection at its own cost and shall reinstate it to the Head Contractor's satisfaction.
      </span>
    </div>

    <h2>6. DESIGN AND PRODUCER STATEMENTS</h2>

    <div class="clause">
      <span class="clause-number">6.1</span>
      <span class="clause-text">
        Where the Subcontract Works include design work, the Subcontractor shall exercise all reasonable skill, care, and diligence in the preparation of such design work.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">6.2</span>
      <span class="clause-text">
        The Subcontractor shall provide all producer statements, design certificates, and other documentation required by the Building Act 2004 or other applicable legislation.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">6.3</span>
      <span class="clause-text">
        Where professional indemnity insurance is required, the Subcontractor shall maintain such insurance for the period specified and shall provide evidence of insurance to the Head Contractor.
      </span>
    </div>

    <h2>7. INDEMNITY</h2>

    <div class="clause">
      <span class="clause-number">7.1</span>
      <span class="clause-text">
        The Subcontractor shall indemnify and keep indemnified the Head Contractor from and against all actions, suits, claims, demands, losses, charges, costs, and expenses which the Head Contractor may suffer or incur arising from:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) Any breach of this Agreement by the Subcontractor;</p>
      <p style="margin-bottom: 8px;">(b) Any negligent act or omission of the Subcontractor or its employees, agents, or sub-contractors;</p>
      <p style="margin-bottom: 8px;">(c) Death or injury to any person or loss of or damage to any property caused by the Subcontractor;</p>
      <p style="margin-bottom: 8px;">(d) Any infringement of intellectual property rights in the execution of the Subcontract Works.</p>
    </div>

    <div class="clause">
      <span class="clause-number">7.2</span>
      <span class="clause-text">
        This indemnity shall survive termination or completion of this Agreement.
      </span>
    </div>

    <h2>8. INSURANCE</h2>

    <div class="clause">
      <span class="clause-number">8.1</span>
      <span class="clause-text">
        The Subcontractor shall effect and maintain the following insurances:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) Public liability insurance for the amount specified in this Agreement;</p>
      <p style="margin-bottom: 8px;">(b) Employer's liability insurance as required by the Accident Compensation Act 2001;</p>
      <p style="margin-bottom: 8px;">(c) Professional indemnity insurance (if design services are included) for the amount and period specified;</p>
      <p style="margin-bottom: 8px;">(d) Such other insurances as may be specified in this Agreement.</p>
    </div>

    <div class="clause">
      <span class="clause-number">8.2</span>
      <span class="clause-text">
        All insurance policies shall be effected with insurers approved by the Head Contractor and shall note the Head Contractor's interest.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">8.3</span>
      <span class="clause-text">
        The Subcontractor shall provide certificates of currency for all required insurances prior to commencing work and shall provide renewal certificates when policies are renewed.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">8.4</span>
      <span class="clause-text">
        The Subcontractor shall not cancel or reduce any insurance required by this Agreement without the Head Contractor's prior written consent.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">8.5</span>
      <span class="clause-text">
        Contract works insurance shall be arranged by the Head Contractor unless otherwise specified in this Agreement. Where the Subcontractor is required to effect contract works insurance, it shall do so for the full replacement value of the Subcontract Works.
      </span>
    </div>

    <h2>9. VARIATIONS</h2>

    <div class="clause">
      <span class="clause-number">9.1</span>
      <span class="clause-text">
        The Head Contractor may by written instruction direct the Subcontractor to execute variations to the Subcontract Works, including additions, omissions, substitutions, or changes to the sequence or timing of work.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">9.2</span>
      <span class="clause-text">
        The Subcontractor shall not execute any varied work without a written instruction from the Head Contractor.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">9.3</span>
      <span class="clause-text">
        Where a variation is instructed, the Subcontractor shall provide a quotation for the variation within the timeframe specified by the Head Contractor, showing the proposed adjustment to the Contract Price and any effect on the programme.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">9.4</span>
      <span class="clause-text">
        If agreement cannot be reached on the value of a variation, the variation shall be valued as follows:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) Where applicable, using rates and prices in this Agreement;</p>
      <p style="margin-bottom: 8px;">(b) Where no applicable rates exist, using fair and reasonable rates based on the actual cost of labour, materials, and plant plus the percentage for overheads and profit stated in this Agreement;</p>
      <p style="margin-bottom: 8px;">(c) Where agreed, on a daywork basis using the rates specified in this Agreement.</p>
    </div>

    <div class="clause">
      <span class="clause-number">9.5</span>
      <span class="clause-text">
        Omissions from the Subcontract Works shall be valued using the rates and prices in this Agreement, reduced by any savings in overheads and profit that the Subcontractor has made as a result of the omission.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">9.6</span>
      <span class="clause-text">
        The Subcontractor shall keep accurate records of all daywork and shall submit daywork sheets for approval by the Head Contractor on a daily basis.
      </span>
    </div>

    <h2>10. TIME</h2>

    <div class="clause">
      <span class="clause-number">10.1</span>
      <span class="clause-text">
        The Subcontractor shall commence the Subcontract Works on the date specified in this Agreement and shall proceed with due diligence and expedition to complete the works by the Completion Date.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">10.2</span>
      <span class="clause-text">
        Time shall be of the essence in this Agreement. If the Subcontractor fails to complete by the Completion Date, the Head Contractor may impose liquidated damages at the rate specified in this Agreement.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">10.3</span>
      <span class="clause-text">
        The Subcontractor shall be entitled to an extension of time if completion is delayed by:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) Variations instructed by the Head Contractor;</p>
      <p style="margin-bottom: 8px;">(b) Delays caused by the Head Contractor;</p>
      <p style="margin-bottom: 8px;">(c) Exceptionally adverse weather;</p>
      <p style="margin-bottom: 8px;">(d) Force majeure events;</p>
      <p style="margin-bottom: 8px;">(e) Any other cause beyond the Subcontractor's reasonable control.</p>
    </div>

    <div class="clause">
      <span class="clause-number">10.4</span>
      <span class="clause-text">
        The Subcontractor shall give written notice of any delay or potential delay within 5 working days of becoming aware of the delay, stating the cause and expected duration.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">10.5</span>
      <span class="clause-text">
        The Head Contractor shall assess any claim for extension of time and shall notify the Subcontractor of the decision in writing. Extensions of time shall be granted fairly and reasonably having regard to all relevant circumstances.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">10.6</span>
      <span class="clause-text">
        If the Head Contractor requires early completion or acceleration of the Subcontract Works, this shall be treated as a variation and the Subcontractor shall be entitled to additional payment for any acceleration costs.
      </span>
    </div>

    <h2>11. DEFECTS</h2>

    <div class="clause">
      <span class="clause-number">11.1</span>
      <span class="clause-text">
        The Subcontractor warrants that all work will be executed in a proper and workmanlike manner using materials and workmanship of the quality specified in the contract documents.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">11.2</span>
      <span class="clause-text">
        The Defects Liability Period shall commence on the date of Practical Completion and shall continue for the period specified in this Agreement.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">11.3</span>
      <span class="clause-text">
        If any defects appear during the Defects Liability Period, the Head Contractor shall notify the Subcontractor in writing and the Subcontractor shall rectify such defects within a reasonable time at its own cost.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">11.4</span>
      <span class="clause-text">
        If the Subcontractor fails to rectify defects within a reasonable time, the Head Contractor may carry out the necessary work and recover the cost from the Subcontractor.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">11.5</span>
      <span class="clause-text">
        The Subcontractor's liability for defects shall not be limited to the Defects Liability Period if the defect arises from breach of statutory duty or negligence.
      </span>
    </div>

    <h2>12. PAYMENTS</h2>

    <h3 style="font-size: 11pt; margin-top: 20px;">12.1 Payment Claims</h3>

    <div class="clause">
      <span class="clause-number">12.1.1</span>
      <span class="clause-text">
        The Subcontractor shall submit payment claims in accordance with the Construction Contracts Act 2002 at the intervals specified in this Agreement.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">12.1.2</span>
      <span class="clause-text">
        Each payment claim shall include:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) A detailed breakdown of work completed;</p>
      <p style="margin-bottom: 8px;">(b) A schedule of any variations;</p>
      <p style="margin-bottom: 8px;">(c) Supporting documentation as required;</p>
      <p style="margin-bottom: 8px;">(d) A statement that it is made under the Construction Contracts Act 2002.</p>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">12.2 Payment Schedule</h3>

    <div class="clause">
      <span class="clause-number">12.2.1</span>
      <span class="clause-text">
        The Head Contractor shall respond to each payment claim by providing a payment schedule within the timeframe specified in the Construction Contracts Act 2002.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">12.2.2</span>
      <span class="clause-text">
        If the Head Contractor proposes to pay less than the claimed amount, the payment schedule shall set out the reasons for the difference and the basis of calculation.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">12.3 Retention Money</h3>

    <div class="clause">
      <span class="clause-number">12.3.1</span>
      <span class="clause-text">
        If specified in this Agreement, the Head Contractor may withhold retention money in accordance with the Construction Contracts Act 2002.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">12.3.2</span>
      <span class="clause-text">
        Retention money shall be held on trust by the Head Contractor in accordance with the Act. If the amount held exceeds $100,000, it shall be deposited in a separate trust account.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">12.3.3</span>
      <span class="clause-text">
        Half of the retention shall be released upon Practical Completion, and the balance upon expiry of the Defects Liability Period, subject to rectification of all defects.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">12.4 Final Account</h3>

    <div class="clause">
      <span class="clause-number">12.4.1</span>
      <span class="clause-text">
        Within 20 working days of completion of the Defects Liability Period, the Subcontractor shall submit a final account showing the total amount claimed under this Agreement.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">12.4.2</span>
      <span class="clause-text">
        The Head Contractor shall assess the final account and shall issue a final payment schedule within 20 working days of receipt.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">12.4.3</span>
      <span class="clause-text">
        Payment of the final account (less any retention or amounts properly deducted) shall constitute full and final settlement of all amounts due under this Agreement.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">12.5 GST</h3>

    <div class="clause">
      <span class="clause-number">12.5.1</span>
      <span class="clause-text">
        All amounts stated in this Agreement are exclusive of GST unless otherwise specified. GST shall be added to all amounts payable.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">12.5.2</span>
      <span class="clause-text">
        If the parties have agreed that the Head Contractor may issue buyer-created tax invoices, the Head Contractor shall issue such invoices in accordance with the GST Act.
      </span>
    </div>

    <h2>13. DISPUTES AND REMEDIES</h2>

    <div class="clause">
      <span class="clause-number">13.1</span>
      <span class="clause-text">
        This Agreement is subject to the Construction Contracts Act 2002. Any party may refer a dispute arising under or in connection with this Agreement to adjudication in accordance with that Act.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">13.2</span>
      <span class="clause-text">
        Before referring a dispute to adjudication, the parties shall first attempt to resolve the dispute by negotiation.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">13.3</span>
      <span class="clause-text">
        If a dispute cannot be resolved by negotiation within 10 working days, either party may refer the dispute to adjudication by serving notice on the other party.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">13.4</span>
      <span class="clause-text">
        The parties shall comply with any adjudicator's determination unless and until the determination is overturned by subsequent arbitration or court proceedings.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">13.5</span>
      <span class="clause-text">
        Nothing in this clause shall prevent either party from seeking urgent interlocutory relief from a court.
      </span>
    </div>

    <h2>14. DEFAULT</h2>

    <div class="clause">
      <span class="clause-number">14.1</span>
      <span class="clause-text">
        The Subcontractor shall be in default if:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) The Subcontractor fails to proceed with due diligence and expedition;</p>
      <p style="margin-bottom: 8px;">(b) The Subcontractor fails to comply with any lawful instruction of the Head Contractor;</p>
      <p style="margin-bottom: 8px;">(c) The Subcontractor abandons the Subcontract Works;</p>
      <p style="margin-bottom: 8px;">(d) The Subcontractor becomes insolvent or bankrupt;</p>
      <p style="margin-bottom: 8px;">(e) The Subcontractor commits any other substantial breach of this Agreement.</p>
    </div>

    <div class="clause">
      <span class="clause-number">14.2</span>
      <span class="clause-text">
        If the Subcontractor is in default, the Head Contractor may give written notice requiring the default to be remedied within 5 working days.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">14.3</span>
      <span class="clause-text">
        If the Subcontractor fails to remedy the default within the specified time, the Head Contractor may:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) Suspend payment to the Subcontractor;</p>
      <p style="margin-bottom: 8px;">(b) Engage others to complete the Subcontract Works and recover the additional costs from the Subcontractor;</p>
      <p style="margin-bottom: 8px;">(c) Terminate this Agreement;</p>
      <p style="margin-bottom: 8px;">(d) Exercise any other rights available at law or under this Agreement.</p>
    </div>

    <div class="clause">
      <span class="clause-number">14.4</span>
      <span class="clause-text">
        If this Agreement is terminated for default, the Head Contractor shall not be liable to pay any further amounts to the Subcontractor until the Subcontract Works have been completed and the final cost ascertained. The Subcontractor shall be liable for any additional costs incurred by the Head Contractor.
      </span>
    </div>

    <h2>15. URGENT WORK</h2>

    <div class="clause">
      <span class="clause-number">15.1</span>
      <span class="clause-text">
        If urgent work is required to prevent loss or damage or to comply with health and safety requirements, and the Head Contractor cannot contact the Subcontractor, the Head Contractor may carry out such urgent work and recover the cost from the Subcontractor.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">15.2</span>
      <span class="clause-text">
        The Head Contractor shall notify the Subcontractor of any urgent work carried out as soon as reasonably practicable.
      </span>
    </div>

    <h2>16. SERVICE OF NOTICES</h2>

    <div class="clause">
      <span class="clause-number">16.1</span>
      <span class="clause-text">
        Any notice required to be given under this Agreement shall be in writing and may be delivered:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) By hand to the party's address stated in this Agreement;</p>
      <p style="margin-bottom: 8px;">(b) By pre-paid post to that address;</p>
      <p style="margin-bottom: 8px;">(c) By email to the email address stated in this Agreement.</p>
    </div>

    <div class="clause">
      <span class="clause-number">16.2</span>
      <span class="clause-text">
        A notice shall be deemed to have been received:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) If delivered by hand, on the date of delivery;</p>
      <p style="margin-bottom: 8px;">(b) If posted, on the third working day after posting;</p>
      <p style="margin-bottom: 8px;">(c) If sent by email, on the date sent (unless sent after 5pm or on a non-working day, in which case on the next working day).</p>
    </div>

    <div class="clause">
      <span class="clause-number">16.3</span>
      <span class="clause-text">
        Either party may change its address for service by giving written notice to the other party.
      </span>
    </div>

    <!-- APPENDICES SECTION -->
    <div class="page-break"></div>
    <h1>APPENDICES</h1>

    <p class="mb-3" style="font-size: 10pt; text-align: justify;">
      The following appendices form part of this Subcontract Agreement. Complete all applicable appendices
      and attach as required. If an appendix is not applicable, mark it as "N/A".
    </p>

    <!-- APPENDIX A - SCOPE OF WORKS -->
    <div class="appendix-page">
      <div class="appendix-title">APPENDIX A</div>
      <div class="appendix-subtitle">Scope of Works</div>

      <h3 class="appendix-heading">1. General Description</h3>
      <div style="border: 1px solid #ccc; padding: 12px; min-height: 80px; background: white; margin-bottom: 15px;">
        ${getFieldValue('subcontract_works_description') || 'Detailed description of the subcontract works to be inserted here.'}
      </div>

      <h3 class="appendix-heading">2. Work Included</h3>
      <div style="border: 1px solid #ccc; padding: 12px; min-height: 80px; background: white; margin-bottom: 15px;">
        ${getFieldValue('scope_inclusions') || `
        <ul class="bullet-list">
          <li>All labour, materials, plant and equipment necessary for complete execution of the works</li>
          <li>All work necessary to integrate with adjacent trades</li>
          <li>Cleaning and protection of work</li>
          <li>Testing and commissioning as specified</li>
          <li>As-built documentation and warranties</li>
        </ul>
        `}
      </div>

      <h3 class="appendix-heading">3. Work Excluded</h3>
      <div style="border: 1px solid #ccc; padding: 12px; min-height: 60px; background: white; margin-bottom: 15px;">
        ${getFieldValue('exclusions') || 'Exclusions to be clearly stated here to avoid disputes.'}
      </div>

      <h3 class="appendix-heading">4. Key Performance Requirements</h3>
      <div style="border: 1px solid #ccc; padding: 12px; min-height: 60px; background: white;">
        ${getFieldValue('performance_requirements') || 'Any specific performance standards, tolerances, or requirements.'}
      </div>

      <div class="copyright-footer">
        ©Registered Master Builders Association of New Zealand Inc/New Zealand Specialist Trade Contractors Federation Inc
      </div>
    </div>

    <!-- APPENDIX B1 - PRICING SCHEDULE (LUMP SUM) -->
    <div class="appendix-page">
      <div class="appendix-title">APPENDIX B1</div>
      <div class="appendix-subtitle">Pricing Schedule - Lump Sum</div>

      <p class="mb-3" style="font-size: 9pt;">
        This appendix applies where the Contract Price is a Lump Sum. Provide breakdown as required.
      </p>

      <table class="schedule-table">
        <thead>
          <tr>
            <th style="width: 50%;">Description</th>
            <th style="width: 25%; text-align: right;">Amount (excl GST)</th>
            <th style="width: 25%; text-align: right;">% of Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supply of Materials</td>
            <td style="text-align: right;">$</td>
            <td style="text-align: right;">%</td>
          </tr>
          <tr>
            <td>Labour</td>
            <td style="text-align: right;">$</td>
            <td style="text-align: right;">%</td>
          </tr>
          <tr>
            <td>Plant and Equipment</td>
            <td style="text-align: right;">$</td>
            <td style="text-align: right;">%</td>
          </tr>
          <tr>
            <td>Preliminaries</td>
            <td style="text-align: right;">$</td>
            <td style="text-align: right;">%</td>
          </tr>
          <tr>
            <td>Margin (Overheads & Profit)</td>
            <td style="text-align: right;">$</td>
            <td style="text-align: right;">%</td>
          </tr>
          <tr style="font-weight: bold; background: #f0f0f0;">
            <td>TOTAL CONTRACT PRICE (excl GST)</td>
            <td style="text-align: right;">${getFieldValue('contract_price')}</td>
            <td style="text-align: right;">100%</td>
          </tr>
          <tr>
            <td>GST @ 15%</td>
            <td style="text-align: right;">$</td>
            <td style="text-align: right;"></td>
          </tr>
          <tr style="font-weight: bold;">
            <td>TOTAL INCLUDING GST</td>
            <td style="text-align: right;">$</td>
            <td style="text-align: right;"></td>
          </tr>
        </tbody>
      </table>

      <div class="note-box" style="margin-top: 20px;">
        <strong>Note:</strong> This breakdown is for payment purposes only and does not limit the scope of works
        or create separate contracts for individual items.
      </div>

      <div class="copyright-footer">
        ©Registered Master Builders Association of New Zealand Inc/New Zealand Specialist Trade Contractors Federation Inc
      </div>
    </div>

    <!-- APPENDIX B2 - PRICING SCHEDULE (RATES) -->
    <div class="appendix-page">
      <div class="appendix-title">APPENDIX B2</div>
      <div class="appendix-subtitle">Pricing Schedule - Schedule of Rates</div>

      <p class="mb-3" style="font-size: 9pt;">
        This appendix applies where the Contract Price is based on a Schedule of Rates or quantities.
      </p>

      <table class="schedule-table">
        <thead>
          <tr>
            <th style="width: 5%;">Item</th>
            <th style="width: 35%;">Description</th>
            <th style="width: 10%;">Unit</th>
            <th style="width: 12%; text-align: right;">Quantity</th>
            <th style="width: 15%; text-align: right;">Rate</th>
            <th style="width: 18%; text-align: right;">Amount</th>
            <th style="width: 5%;"></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="7" style="font-weight: bold; background: #f5f5f5;">SECTION 1: [TRADE SECTION]</td>
          </tr>
          <tr>
            <td>1.1</td>
            <td>[Item description]</td>
            <td>m²</td>
            <td style="text-align: right;"></td>
            <td style="text-align: right;">$</td>
            <td style="text-align: right;">$</td>
            <td></td>
          </tr>
          <tr>
            <td>1.2</td>
            <td>[Item description]</td>
            <td>m</td>
            <td style="text-align: right;"></td>
            <td style="text-align: right;">$</td>
            <td style="text-align: right;">$</td>
            <td></td>
          </tr>
          <tr>
            <td colspan="5" style="text-align: right; font-weight: bold;">Section Subtotal:</td>
            <td style="text-align: right; font-weight: bold;">$</td>
            <td></td>
          </tr>
          <tr>
            <td colspan="7" style="height: 20px;"></td>
          </tr>
          <tr>
            <td colspan="5" style="text-align: right; font-weight: bold; background: #f0f0f0;">TOTAL (excl GST):</td>
            <td style="text-align: right; font-weight: bold; background: #f0f0f0;">$</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <div class="note-box" style="margin-top: 20px;">
        <strong>Note:</strong> Rates are fixed for the duration of the contract unless varied in accordance with
        the contract conditions. Quantities are provisional and payment will be based on actual measured quantities.
      </div>

      <div class="copyright-footer">
        ©Registered Master Builders Association of New Zealand Inc/New Zealand Specialist Trade Contractors Federation Inc
      </div>
    </div>

    <!-- APPENDIX C - PROGRAMME -->
    <div class="appendix-page">
      <div class="appendix-title">APPENDIX C</div>
      <div class="appendix-subtitle">Programme</div>

      <p class="mb-3" style="font-size: 9pt;">
        Attach detailed programme showing key dates, milestones, and coordination with other trades.
      </p>

      <table class="schedule-table">
        <thead>
          <tr>
            <th style="width: 40%;">Activity</th>
            <th style="width: 20%;">Start Date</th>
            <th style="width: 20%;">Finish Date</th>
            <th style="width: 20%;">Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Mobilisation</td>
            <td>${getFieldValue('commencement_date')}</td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>[Key Activity 1]</td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>[Key Activity 2]</td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>Practical Completion</td>
            <td></td>
            <td>${getFieldValue('completion_date')}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <h3 class="appendix-heading" style="margin-top: 20px;">Key Milestones</h3>
      <div style="border: 1px solid #ccc; padding: 12px; min-height: 60px; background: white;">
        List any critical milestones or hold points that must be achieved.
      </div>

      <h3 class="appendix-heading" style="margin-top: 15px;">Coordination Requirements</h3>
      <div style="border: 1px solid #ccc; padding: 12px; min-height: 60px; background: white;">
        Identify interfaces with other trades and coordination requirements.
      </div>

      <div class="copyright-footer">
        ©Registered Master Builders Association of New Zealand Inc/New Zealand Specialist Trade Contractors Federation Inc
      </div>
    </div>

    <!-- APPENDIX D - QUALITY PLAN -->
    <div class="appendix-page">
      <div class="appendix-title">APPENDIX D</div>
      <div class="appendix-subtitle">Quality Plan</div>

      <h3 class="appendix-heading">1. Quality Objectives</h3>
      <div style="border: 1px solid #ccc; padding: 12px; min-height: 50px; background: white; margin-bottom: 15px;">
        State quality objectives and standards to be achieved.
      </div>

      <h3 class="appendix-heading">2. Inspection and Test Plan</h3>
      <table class="schedule-table">
        <thead>
          <tr>
            <th style="width: 30%;">Activity</th>
            <th style="width: 20%;">Inspection Point</th>
            <th style="width: 20%;">Acceptance Criteria</th>
            <th style="width: 15%;">Hold Point</th>
            <th style="width: 15%;">Records Required</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>[Activity]</td>
            <td>[When to inspect]</td>
            <td>[Pass/fail criteria]</td>
            <td>Yes / No</td>
            <td>[Documentation]</td>
          </tr>
        </tbody>
      </table>

      <h3 class="appendix-heading" style="margin-top: 20px;">3. Non-Conformance Procedures</h3>
      <div style="border: 1px solid #ccc; padding: 12px; min-height: 50px; background: white;">
        Describe process for identifying, recording, and rectifying non-conformances.
      </div>

      <div class="copyright-footer">
        ©Registered Master Builders Association of New Zealand Inc/New Zealand Specialist Trade Contractors Federation Inc
      </div>
    </div>

    <!-- APPENDIX E1 - HEALTH AND SAFETY PLAN -->
    <div class="appendix-page">
      <div class="appendix-title">APPENDIX E1</div>
      <div class="appendix-subtitle">Health and Safety Plan</div>

      <h3 class="appendix-heading">1. Hazard Identification</h3>
      <table class="schedule-table">
        <thead>
          <tr>
            <th style="width: 30%;">Hazard</th>
            <th style="width: 25%;">Risk Level</th>
            <th style="width: 45%;">Control Measures</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Working at heights</td>
            <td>High</td>
            <td>Scaffolding, harnesses, edge protection as per regulations</td>
          </tr>
          <tr>
            <td>Manual handling</td>
            <td>Medium</td>
            <td>Mechanical aids, training, proper techniques</td>
          </tr>
          <tr>
            <td>[Trade-specific hazard]</td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <h3 class="appendix-heading" style="margin-top: 20px;">2. Safety Management</h3>
      <div style="border: 1px solid #ccc; padding: 12px; background: white; margin-bottom: 15px;">
        <p style="margin-bottom: 8px;"><strong>Site Safety Officer:</strong> _______________________________</p>
        <p style="margin-bottom: 8px;"><strong>Emergency Contact:</strong> _______________________________</p>
        <p style="margin-bottom: 8px;"><strong>First Aid:</strong> Location and trained personnel</p>
      </div>

      <h3 class="appendix-heading">3. Training Requirements</h3>
      <div style="border: 1px solid #ccc; padding: 12px; min-height: 50px; background: white;">
        All personnel must hold current site safety passport and trade-specific certifications.
      </div>

      <div class="copyright-footer">
        ©Registered Master Builders Association of New Zealand Inc/New Zealand Specialist Trade Contractors Federation Inc
      </div>
    </div>

    <!-- APPENDIX E2 - SITE SAFETY RULES -->
    <div class="appendix-page">
      <div class="appendix-title">APPENDIX E2</div>
      <div class="appendix-subtitle">Site Safety Rules</div>

      <p class="mb-3" style="font-size: 10pt; font-weight: bold;">
        All personnel must read, understand, and comply with these rules. Breaches may result in removal from site.
      </p>

      <h3 class="appendix-heading">Mandatory Requirements</h3>
      <ul class="bullet-list">
        <li>Site induction must be completed before commencing work</li>
        <li>PPE must be worn at all times: hard hat, high-vis vest, safety boots, safety glasses</li>
        <li>No work under the influence of alcohol or drugs</li>
        <li>Report all hazards, incidents, and near-misses immediately</li>
        <li>Follow all signage and barriers</li>
        <li>No unauthorized access to restricted areas</li>
      </ul>

      <h3 class="appendix-heading">Specific Safety Rules</h3>
      <ul class="bullet-list">
        <li>Working at height: Use appropriate fall protection equipment</li>
        <li>Electrical work: Only by qualified electricians with appropriate permits</li>
        <li>Hot works: Permit required, fire watch in place</li>
        <li>Excavation: Locate services before digging</li>
        <li>Lifting operations: Certified operators only, exclusion zones maintained</li>
      </ul>

      <h3 class="appendix-heading">Emergency Procedures</h3>
      <ul class="bullet-list">
        <li>Emergency assembly point: [Location to be specified]</li>
        <li>Emergency contact: [Number to be specified]</li>
        <li>First aid location: [Location to be specified]</li>
        <li>Evacuation: Follow warden instructions, report to assembly point</li>
      </ul>

      <div class="warning-box" style="margin-top: 20px;">
        <strong>Warning:</strong> Failure to comply with these safety rules may result in immediate removal
        from site and potential termination of the subcontract.
      </div>

      <div class="copyright-footer">
        ©Registered Master Builders Association of New Zealand Inc/New Zealand Specialist Trade Contractors Federation Inc
      </div>
    </div>

    <!-- APPENDIX E3 - INSURANCE REQUIREMENTS -->
    <div class="appendix-page">
      <div class="appendix-title">APPENDIX E3</div>
      <div class="appendix-subtitle">Insurance Requirements</div>

      <h3 class="appendix-heading">Summary of Required Insurance</h3>
      <table class="schedule-table">
        <thead>
          <tr>
            <th style="width: 30%;">Insurance Type</th>
            <th style="width: 25%;">Minimum Cover</th>
            <th style="width: 25%;">Period</th>
            <th style="width: 20%;">Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Public Liability</td>
            <td>${getFieldValue('public_liability_amount') || '$10,000,000'}</td>
            <td>Duration of works + 12 months</td>
            <td>Note HC interest</td>
          </tr>
          <tr>
            <td>Contract Works</td>
            <td>Full replacement value</td>
            <td>Duration of works</td>
            <td>If applicable</td>
          </tr>
          <tr>
            <td>Professional Indemnity</td>
            <td>${getFieldValue('professional_indemnity_amount') || 'N/A'}</td>
            <td>7 years from completion</td>
            <td>If design included</td>
          </tr>
          <tr>
            <td>Employer's Liability</td>
            <td>As per ACC requirements</td>
            <td>Duration of works</td>
            <td>Statutory requirement</td>
          </tr>
        </tbody>
      </table>

      <h3 class="appendix-heading" style="margin-top: 20px;">Certificate Requirements</h3>
      <div style="border: 1px solid #ccc; padding: 12px; background: white; margin-bottom: 15px;">
        <p style="margin-bottom: 8px;">✓ Certificates of currency must be provided before commencing work</p>
        <p style="margin-bottom: 8px;">✓ Updated certificates required upon renewal</p>
        <p style="margin-bottom: 8px;">✓ All policies must note Head Contractor's interest</p>
        <p style="margin-bottom: 8px;">✓ Policies must be with insurers approved by Head Contractor</p>
        <p style="margin-bottom: 8px;">✓ 30 days notice required for any policy cancellation or material change</p>
      </div>

      <h3 class="appendix-heading">Exclusions and Excesses</h3>
      <div style="border: 1px solid #ccc; padding: 12px; min-height: 50px; background: white;">
        Subcontractor responsible for all policy excesses. Any exclusions must be notified in writing.
      </div>

      <div class="copyright-footer">
        ©Registered Master Builders Association of New Zealand Inc/New Zealand Specialist Trade Contractors Federation Inc
      </div>
    </div>

    <!-- EXECUTION / SIGNATURE PAGE -->
    <div class="page-break"></div>
    <h1>Execution</h1>

    <div class="clause" style="margin-bottom: 40px;">
      <p>The parties have executed this Agreement as a deed on the date stated at the beginning of this Agreement.</p>
    </div>

    <div class="signature-section">
      <div class="signature-party-title">SIGNED by the Head Contractor:</div>
      <div class="signature-block">
        <div class="signature-field">
          <strong>Name:</strong> <span class="form-field-inline">${getFieldValue('head_contractor_signatory_name')}</span>
        </div>
        <div class="signature-field">
          <strong>Position:</strong> <span class="form-field-inline">${getFieldValue('head_contractor_signatory_title')}</span>
        </div>
        <div class="signature-line">
          Signature: _________________________________________
        </div>
        <div class="signature-details">
          Date: <span class="form-field-inline">${getFieldValue('head_contractor_signature_date')}</span>
        </div>
      </div>
    </div>

    <div class="signature-section">
      <div class="signature-party-title">SIGNED by the Subcontractor:</div>
      <div class="signature-block">
        <div class="signature-field">
          <strong>Name:</strong> <span class="form-field-inline">${getFieldValue('subcontractor_signatory_name')}</span>
        </div>
        <div class="signature-field">
          <strong>Position:</strong> <span class="form-field-inline">${getFieldValue('subcontractor_signatory_title')}</span>
        </div>
        <div class="signature-line">
          Signature: _________________________________________
        </div>
        <div class="signature-details">
          Date: <span class="form-field-inline">${getFieldValue('subcontractor_signature_date')}</span>
        </div>
      </div>
    </div>

    <div class="document-footer">
      <p>This Subcontract Agreement was generated on ${new Date().toLocaleDateString('en-NZ', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}</p>
      <p style="margin-top: 10px;">Agreement Reference: ${agreement.agreement_number}</p>
      <p style="margin-top: 5px; font-size: 8pt; color: #999;">
        This is a computer-generated document. Any amendments must be initialed by both parties.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}