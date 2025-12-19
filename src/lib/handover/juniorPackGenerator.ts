export interface JuniorPackData {
  projectName: string;
  projectClient: string;
  supplierName: string;
  scopeSystems: Array<{
    service_type: string;
    coverage: string;
    item_count: number;
    details: string[];
  }>;
  inclusions: string[];
  exclusions: string[];
  safetyNotes: string[];
  checklists: Array<{
    title: string;
    items: string[];
  }>;
}

export function generateJuniorPackHTML(data: JuniorPackData): string {
  const safetyNotesHTML = data.safetyNotes.map(note =>
    `<li class="safety-item">${note}</li>`
  ).join('');

  const scopeSystemsHTML = data.scopeSystems.map(system => `
    <div class="system-card">
      <h4>${system.service_type}</h4>
      <p class="item-count">${system.item_count} items</p>
      <ul class="detail-list">
        ${system.details.slice(0, 3).map(detail => `<li>${detail}</li>`).join('')}
      </ul>
    </div>
  `).join('');

  const checklistsHTML = data.checklists.map(checklist => `
    <div class="checklist-section">
      <h3>${checklist.title}</h3>
      <ul class="checklist">
        ${checklist.items.map(item => `<li><input type="checkbox" disabled> ${item}</li>`).join('')}
      </ul>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Junior Site Team Handover Pack - ${data.projectName}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 15mm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #1e293b;
      background: white;
    }

    .header {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 20px 30px;
      margin-bottom: 20px;
      border-radius: 8px;
    }

    .header h1 {
      font-size: 24pt;
      margin-bottom: 8px;
    }

    .header p {
      font-size: 12pt;
      opacity: 0.95;
    }

    .meta {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin-bottom: 25px;
    }

    .meta-item {
      background: #f1f5f9;
      padding: 12px 15px;
      border-radius: 6px;
      border-left: 4px solid #3b82f6;
    }

    .meta-label {
      font-size: 9pt;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .meta-value {
      font-size: 12pt;
      color: #0f172a;
      font-weight: 600;
    }

    .section {
      margin-bottom: 25px;
      page-break-inside: avoid;
    }

    .section h2 {
      font-size: 16pt;
      color: #1e40af;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e2e8f0;
    }

    .warning-box {
      background: #fef3c7;
      border-left: 5px solid #f59e0b;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
    }

    .warning-box h3 {
      color: #92400e;
      font-size: 13pt;
      margin-bottom: 8px;
    }

    .warning-box ul {
      list-style: none;
      padding-left: 0;
    }

    .safety-item {
      padding: 6px 0;
      padding-left: 25px;
      position: relative;
      color: #78350f;
    }

    .safety-item:before {
      content: "⚠";
      position: absolute;
      left: 0;
      color: #f59e0b;
      font-weight: bold;
    }

    .systems-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin-top: 15px;
    }

    .system-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 12px;
    }

    .system-card h4 {
      color: #1e40af;
      font-size: 12pt;
      margin-bottom: 6px;
    }

    .item-count {
      font-size: 9pt;
      color: #64748b;
      margin-bottom: 8px;
    }

    .detail-list {
      list-style: none;
      font-size: 10pt;
      color: #475569;
    }

    .detail-list li {
      padding: 3px 0;
      padding-left: 15px;
      position: relative;
    }

    .detail-list li:before {
      content: "•";
      position: absolute;
      left: 0;
      color: #3b82f6;
    }

    .checklist-section {
      background: #f1f5f9;
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 15px;
    }

    .checklist-section h3 {
      font-size: 13pt;
      color: #0f172a;
      margin-bottom: 10px;
    }

    .checklist {
      list-style: none;
    }

    .checklist li {
      padding: 8px 0;
      font-size: 10pt;
      border-bottom: 1px solid #e2e8f0;
    }

    .checklist li:last-child {
      border-bottom: none;
    }

    .checklist input[type="checkbox"] {
      margin-right: 10px;
      width: 16px;
      height: 16px;
      vertical-align: middle;
    }

    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 2px solid #e2e8f0;
      font-size: 9pt;
      color: #64748b;
      text-align: center;
    }

    @media print {
      .page-break {
        page-break-before: always;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Junior Site Team Handover Pack</h1>
    <p>Practical Guide for On-Site Installation & Quality Control</p>
  </div>

  <div class="meta">
    <div class="meta-item">
      <div class="meta-label">Project</div>
      <div class="meta-value">${data.projectName}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Client</div>
      <div class="meta-value">${data.projectClient}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Subcontractor</div>
      <div class="meta-value">${data.supplierName}</div>
    </div>
  </div>

  <div class="section">
    <h2>Scope of Works Overview</h2>
    <div class="systems-grid">
      ${scopeSystemsHTML}
    </div>
  </div>

  <div class="warning-box">
    <h3>Safety & Installation Notes</h3>
    <ul>
      ${safetyNotesHTML}
    </ul>
  </div>

  <div class="page-break"></div>

  <div class="section">
    <h2>Site Handover Checklists</h2>
    ${checklistsHTML}
  </div>

  <div class="footer">
    <p>Generated by VerifyTrade - Contract Manager | ${new Date().toLocaleDateString('en-NZ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })}</p>
    <p>This document is for site team reference only and does not contain commercial or pricing information.</p>
  </div>
</body>
</html>
  `.trim();
}

export function getDefaultJuniorPackData(): Partial<JuniorPackData> {
  return {
    safetyNotes: [
      'All personnel must complete site induction before commencing work',
      'Ensure SWMS (Safe Work Method Statement) is reviewed and signed',
      'Use appropriate PPE: Hard hat, safety glasses, high-vis vest, safety boots',
      'Work at heights requires appropriate access equipment and fall protection',
      'Report any health and safety concerns immediately to site supervisor',
      'Follow manufacturer\'s instructions for all fire protection materials',
      'Ensure adequate ventilation when working with sealants and intumescent products'
    ],
    checklists: [
      {
        title: 'Pre-Start Checklist',
        items: [
          'Site induction completed',
          'SWMS reviewed and signed',
          'All required materials and equipment on site',
          'Access to work areas confirmed',
          'Fire engineering drawings reviewed',
          'Quality control procedures understood'
        ]
      },
      {
        title: 'Installation Checklist',
        items: [
          'Verify penetration dimensions against drawings',
          'Check FRR (Fire Resistance Rating) requirements',
          'Ensure surfaces are clean and free from debris',
          'Apply products as per manufacturer specifications',
          'Install in accordance with tested systems',
          'Label all penetrations with system reference'
        ]
      },
      {
        title: 'Quality Control Checklist',
        items: [
          'Photograph all completed penetrations',
          'Record system references and FRR achieved',
          'Verify compliance with fire engineering report',
          'Complete QA documentation for each penetration',
          'Prepare for independent inspection if required',
          'Ensure PS3 documentation is prepared'
        ]
      },
      {
        title: 'Completion & Handover',
        items: [
          'All works completed as per scope',
          'All penetrations labeled and photographed',
          'QA documentation package complete',
          'Site cleaned and made good',
          'Defects list prepared if applicable',
          'Handover documentation submitted to main contractor'
        ]
      }
    ]
  };
}
