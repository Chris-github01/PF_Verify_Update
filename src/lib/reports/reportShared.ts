/**
 * Shared rendering utilities used across all three report types.
 * No calculation logic — layout and formatting only.
 */

export const C = {
  DARK: '#111827',
  MID: '#374151',
  MUTED: '#6b7280',
  LIGHT_BG: '#f9fafb',
  BORDER: '#e5e7eb',
  GREEN: '#059669',
  GREEN_BG: '#ecfdf5',
  GREEN_BORDER: '#6ee7b7',
  AMBER: '#d97706',
  AMBER_BG: '#fffbeb',
  AMBER_BORDER: '#fcd34d',
  RED: '#dc2626',
  RED_BG: '#fef2f2',
  RED_BORDER: '#fca5a5',
  BLUE: '#2563eb',
  BLUE_BG: '#eff6ff',
  BLUE_BORDER: '#93c5fd',
  ORANGE: '#f97316',
  ORANGE_DARK: '#ea580c',
};

export function fmt(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

export function riskRatio(score: number, max: number): number {
  return max === 0 ? 0 : score / max;
}

export function riskColor(ratio: number): string {
  if (ratio < 0.3) return C.GREEN;
  if (ratio < 0.6) return C.AMBER;
  return C.RED;
}

export function riskLabel(ratio: number): string {
  if (ratio < 0.3) return 'Low';
  if (ratio < 0.6) return 'Moderate';
  return 'High';
}

export function coverageColor(pctVal: number): string {
  if (pctVal >= 85) return C.GREEN;
  if (pctVal >= 70) return C.AMBER;
  return C.RED;
}

export function positionLabel(pos: string): string {
  switch (pos) {
    case 'recommended': return 'Recommended';
    case 'narrow_margin': return 'Commercial Leader — Narrow Margin';
    case 'provisional': return 'Provisional — Validation Required';
    case 'no_recommendation': return 'No Recommendation Issued';
    default: return 'Under Review';
  }
}

export function positionBg(pos: string): string {
  switch (pos) {
    case 'recommended': return C.GREEN_BG;
    case 'narrow_margin': return C.AMBER_BG;
    case 'provisional': return C.BLUE_BG;
    case 'no_recommendation': return C.RED_BG;
    default: return C.LIGHT_BG;
  }
}

export function positionBorder(pos: string): string {
  switch (pos) {
    case 'recommended': return C.GREEN_BORDER;
    case 'narrow_margin': return C.AMBER_BORDER;
    case 'provisional': return C.BLUE_BORDER;
    case 'no_recommendation': return C.RED_BORDER;
    default: return C.BORDER;
  }
}

export function positionText(pos: string): string {
  switch (pos) {
    case 'recommended': return C.GREEN;
    case 'narrow_margin': return C.AMBER;
    case 'provisional': return C.BLUE;
    case 'no_recommendation': return C.RED;
    default: return C.MID;
  }
}

export function tierColor(tier?: string): string {
  switch (tier) {
    case 'low': return C.GREEN;
    case 'medium': return C.AMBER;
    case 'high': return C.RED;
    case 'critical': return '#7f1d1d';
    default: return C.MID;
  }
}

export function tierBg(tier?: string): string {
  switch (tier) {
    case 'low': return C.GREEN_BG;
    case 'medium': return C.AMBER_BG;
    case 'high': return C.RED_BG;
    case 'critical': return '#fef2f2';
    default: return C.LIGHT_BG;
  }
}

export function sharedHeader(logo: string | undefined, projectName: string, clientName: string | undefined, generatedAt: string, subtitle: string): string {
  const logoHtml = logo
    ? `<img src="${logo}" alt="Logo" style="height:44px;object-fit:contain;" />`
    : `<div style="display:flex;align-items:center;gap:10px;">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,${C.ORANGE} 0%,${C.ORANGE_DARK} 100%);border-radius:9px;display:flex;align-items:center;justify-content:center;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <span style="font-size:18px;font-weight:700;color:${C.DARK};">VerifyTrade</span>
      </div>`;

  return `<header style="display:flex;justify-content:space-between;align-items:center;padding-bottom:16px;margin-bottom:28px;border-bottom:3px solid ${C.ORANGE};">
    ${logoHtml}
    <div style="text-align:right;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${C.MUTED};">${subtitle}</div>
      <div style="font-size:13px;font-weight:700;color:${C.DARK};margin-top:3px;">${projectName}</div>
      ${clientName ? `<div style="font-size:11px;color:${C.MUTED};margin-top:2px;">${clientName}</div>` : ''}
      <div style="font-size:11px;color:${C.MUTED};margin-top:3px;">Prepared ${new Date(generatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
  </header>`;
}

export function sharedFooter(label: string, page: string, confidential: boolean): string {
  return `<footer style="margin-top:44px;padding-top:12px;border-top:1px solid ${C.BORDER};display:flex;justify-content:space-between;align-items:center;font-size:10px;color:${C.MUTED};">
    <span>${confidential ? 'COMMERCIAL IN CONFIDENCE — For authorised recipients only' : 'VerifyTrade Commercial Analysis'}</span>
    <span style="font-weight:600;">${label}</span>
    <span>Page ${page}</span>
  </footer>`;
}

export function sectionHeading(num: string, title: string): string {
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid ${C.BORDER};">
    <div style="width:28px;height:28px;background:${C.DARK};color:white;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${num}</div>
    <div style="font-size:17px;font-weight:700;color:${C.DARK};letter-spacing:-0.2px;">${title}</div>
  </div>`;
}

export function pill(text: string, bg: string, color: string): string {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:4px;background:${bg};color:${color};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${text}</span>`;
}

export function infoBox(text: string, borderColor: string, bg: string, textColor: string): string {
  return `<div style="background:${bg};border-left:4px solid ${borderColor};border-radius:0 8px 8px 0;padding:14px 18px;font-size:12px;color:${textColor};line-height:1.7;margin-bottom:16px;">${text}</div>`;
}

export function baseStyles(renderMode: 'screen' | 'pdf'): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', Arial, sans-serif;
      font-size: 14px; line-height: 1.6; color: #1f2937; background: white;
      -webkit-font-smoothing: antialiased;
    }
    @page { size: A4; margin: ${renderMode === 'pdf' ? '12mm 12mm 14mm 12mm' : '16mm 12mm'}; }
    * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .page { page-break-after: always; padding: 30px 34px 60px 34px; position: relative; box-sizing: border-box; }
    .page:last-child { page-break-after: auto; }
    table { break-inside: auto; width: 100%; border-collapse: collapse; }
    tr { break-inside: avoid; break-after: auto; }
    thead { display: table-header-group; }
    @media print { .page { padding: 22px 26px 52px 26px; } }
  `;
}

export function htmlWrap(title: string, styles: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${styles}</style>
</head>
<body>${body}</body>
</html>`;
}

export function openPrintWindow(html: string, filename: string): void {
  const win = window.open('', '_blank', 'width=1200,height=800');
  if (!win) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}.html`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    return;
  }
  const banner = `<div id="pb" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:${C.ORANGE};color:white;padding:11px 18px;font-family:sans-serif;font-size:13px;font-weight:600;display:flex;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,.2);">
    <span>${filename}</span><span>Select "Save as PDF" in the print dialog</span></div><div style="height:46px;"></div>`;
  const autoprint = `<script>window.onload=function(){var b=document.getElementById('pb');setTimeout(function(){if(b)b.style.display='none';window.print();},600);};<\/script>`;
  win.document.write(html.replace('<body>', `<body>${banner}`).replace('</html>', `${autoprint}</html>`));
  win.document.close();
}
