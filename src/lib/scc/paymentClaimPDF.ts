import type { ClaimLine, ClaimTotals } from './paymentClaimCalculations';
import type { ClaimHeader } from './paymentClaimExport';

const NZD = new Intl.NumberFormat('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n: number) => NZD.format(n);
const fmtDate = (d: string | null | undefined) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
};

function cell(content: string, style = '') {
  return `<td style="${style}">${content}</td>`;
}

function buildHeaderTable(claim: ClaimHeader): string {
  const payeeLines = (claim.payee_address || '').split('\n').filter(Boolean);
  const payerLines = (claim.payer_address || '').split('\n').filter(Boolean);

  const payerAddrRows = payerLines.map(l => `<tr><td style="border:1px solid #ccc;padding:4px 8px;text-align:center;color:#333;font-size:10px;">${l}</td></tr>`).join('');
  const payeeAddrRows = payeeLines.map(l => `<tr><td style="border:1px solid #ccc;padding:4px 8px;text-align:center;color:#333;font-size:10px;">${l}</td></tr>`).join('');

  return `
  <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:4px;">
    <tr>
      <td rowspan="6" style="width:30px;border:1px solid #ccc;padding:4px 2px;text-align:center;background:#f5f5f5;">
        <span style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:9px;font-weight:600;color:#333;letter-spacing:1px;">TO (Payer)</span>
      </td>
      <td style="width:110px;border:1px solid #ccc;padding:4px 8px;font-weight:600;background:#f5f5f5;color:#333;">Company/ Name</td>
      <td style="border:1px solid #ccc;padding:4px 8px;color:#333;">${claim.payer_company || ''}</td>
      <td rowspan="6" style="width:30px;border:1px solid #ccc;padding:4px 2px;text-align:center;background:#f5f5f5;">
        <span style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:9px;font-weight:600;color:#333;letter-spacing:1px;">From (Paye)</span>
      </td>
      <td style="width:110px;border:1px solid #ccc;padding:4px 8px;font-weight:600;background:#f5f5f5;color:#333;">Company/ Name</td>
      <td style="border:1px solid #ccc;padding:4px 8px;color:#333;">${claim.payee_company || ''}</td>
    </tr>
    <tr>
      <td rowspan="3" style="border:1px solid #ccc;padding:4px 8px;font-weight:600;background:#f5f5f5;color:#333;vertical-align:middle;">Address</td>
      ${payerAddrRows.length ? `<td style="border:1px solid #ccc;padding:0;">
        <table style="width:100%;border-collapse:collapse;">${payerAddrRows.slice(0,1).join('')}</table>
      </td>` : `<td style="border:1px solid #ccc;padding:4px 8px;"></td>`}
      <td rowspan="3" style="border:1px solid #ccc;padding:4px 8px;font-weight:600;background:#f5f5f5;color:#333;vertical-align:middle;">Address</td>
      ${payeeAddrRows.length ? `<td style="border:1px solid #ccc;padding:0;">
        <table style="width:100%;border-collapse:collapse;">${payeeAddrRows.slice(0,1).join('')}</table>
      </td>` : `<td style="border:1px solid #ccc;padding:4px 8px;"></td>`}
    </tr>
    ${payerAddrRows.slice(1).map((r, i) => `<tr>
      <td style="border:1px solid #ccc;padding:0;"><table style="width:100%;border-collapse:collapse;">${r}</table></td>
      <td style="border:1px solid #ccc;padding:0;"><table style="width:100%;border-collapse:collapse;">${payeeAddrRows[i + 1] || '<tr><td style="padding:4px 8px;"></td></tr>'}</table></td>
    </tr>`).join('')}
    <tr>
      <td style="border:1px solid #ccc;padding:4px 8px;font-weight:600;background:#f5f5f5;color:#333;">Attention</td>
      <td style="border:1px solid #ccc;padding:4px 8px;color:#0066cc;text-decoration:underline;">${claim.payer_attention || ''}</td>
      <td style="border:1px solid #ccc;padding:4px 8px;font-weight:600;background:#f5f5f5;color:#333;">Contact</td>
      <td style="border:1px solid #ccc;padding:4px 8px;color:#333;">${claim.payee_contact || ''}</td>
    </tr>
    <tr>
      <td style="border:1px solid #ccc;padding:4px 8px;font-weight:600;background:#f5f5f5;color:#333;">Project</td>
      <td style="border:1px solid #ccc;padding:4px 8px;color:#333;">${claim.project_name || ''}</td>
      <td style="border:1px solid #ccc;padding:4px 8px;font-weight:600;background:#f5f5f5;color:#333;">Trade</td>
      <td style="border:1px solid #ccc;padding:4px 8px;color:#333;">${claim.trade || ''}</td>
    </tr>
    <tr>
      <td style="border:1px solid #ccc;padding:4px 8px;font-weight:600;background:#f5f5f5;color:#333;">Site Location</td>
      <td style="border:1px solid #ccc;padding:4px 8px;color:#333;">${claim.site_location || ''}</td>
      <td style="border:1px solid #ccc;padding:4px 8px;font-weight:600;background:#f5f5f5;color:#333;">Our Ref</td>
      <td style="border:1px solid #ccc;padding:4px 8px;color:#333;">${claim.our_ref || ''}</td>
    </tr>
  </table>`;
}

function buildClaimDatesTable(claim: ClaimHeader): string {
  return `
  <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:0;">
    <tr>
      <td style="width:25%;border:1px solid #ccc;padding:4px 8px;font-weight:600;background:#f5f5f5;color:#333;text-align:center;">Payment<br>Claim No</td>
      <td style="width:25%;border:1px solid #ccc;padding:4px 8px;font-weight:600;background:#f5f5f5;color:#333;text-align:center;">Claim<br>Period</td>
      <td style="width:25%;border:1px solid #ccc;padding:4px 8px;font-weight:600;background:#f5f5f5;color:#333;text-align:center;">Last Date for<br>submitting claim</td>
      <td style="width:25%;border:1px solid #ccc;padding:4px 8px;font-weight:600;background:#f5f5f5;color:#333;text-align:center;">Due date for payment</td>
    </tr>
    <tr>
      <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;color:#333;">${claim.claim_number || ''}</td>
      <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;color:#333;">${fmtDate(claim.claim_period_end) || claim.claim_period || ''}</td>
      <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;color:#333;">${fmtDate(claim.last_date_for_submitting)}</td>
      <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;color:#333;">${fmtDate(claim.due_date)}</td>
    </tr>
  </table>`;
}

function buildBaseContractTable(baseLines: ClaimLine[]): string {
  const MIN_ROWS = 12;
  const dataRows = baseLines.map(l => {
    const isBold = !l.item_no.includes('.');
    return `<tr>
      <td style="border:1px solid #ccc;padding:3px 6px;text-align:center;font-size:9px;color:#333;">${l.item_no}</td>
      <td style="border:1px solid #ccc;padding:3px 6px;font-size:9px;color:#333;${isBold ? 'font-weight:700;' : ''}">${l.description}</td>
      <td style="border:1px solid #ccc;padding:3px 6px;text-align:center;font-size:9px;color:#333;">${l.qty != null ? l.qty.toFixed(2) : ''}</td>
      <td style="border:1px solid #ccc;padding:3px 6px;text-align:center;font-size:9px;color:#333;">${l.unit || ''}</td>
      <td style="border:1px solid #ccc;padding:3px 6px;text-align:right;font-size:9px;color:#333;">${l.total ? '$ ' + fmt(l.total) : ''}</td>
      <td style="border:1px solid #ccc;padding:3px 6px;text-align:right;font-size:9px;color:#333;">${l.claim_to_date_pct ? l.claim_to_date_pct.toFixed(2) + '%' : ''}</td>
      <td style="border:1px solid #ccc;padding:3px 6px;text-align:right;font-size:9px;color:#333;">${l.claim_to_date_amount ? '$ ' + fmt(l.claim_to_date_amount) : ''}</td>
    </tr>`;
  });

  const emptyRows = Math.max(0, MIN_ROWS - baseLines.length);
  const blankRows = Array.from({ length: emptyRows }, () => `<tr>
    <td style="border:1px solid #ccc;padding:5px 6px;"></td>
    <td style="border:1px solid #ccc;padding:5px 6px;"></td>
    <td style="border:1px solid #ccc;padding:5px 6px;"></td>
    <td style="border:1px solid #ccc;padding:5px 6px;"></td>
    <td style="border:1px solid #ccc;padding:5px 6px;"></td>
    <td style="border:1px solid #ccc;padding:5px 6px;"></td>
    <td style="border:1px solid #ccc;padding:5px 6px;"></td>
  </tr>`).join('');

  const baseClaimTotal = baseLines.reduce((s, l) => s + (l.claim_to_date_amount || 0), 0);
  const baseContractTotal = baseLines.reduce((s, l) => s + (l.total || 0), 0);

  return `
  <table style="width:100%;border-collapse:collapse;font-size:9px;margin-top:0;">
    <thead>
      <tr>
        <td rowspan="99" style="width:18px;border:1px solid #ccc;padding:2px;text-align:center;background:#f5f5f5;vertical-align:middle;">
          <span style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:8px;font-weight:700;color:#333;letter-spacing:1px;">BASE CONTRACT</span>
        </td>
        <th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;color:#333;font-size:9px;text-align:center;width:45px;">Item</th>
        <th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;color:#333;font-size:9px;text-align:left;">Description</th>
        <th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;color:#333;font-size:9px;text-align:center;width:45px;">Qty</th>
        <th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;color:#333;font-size:9px;text-align:center;width:45px;">Rate</th>
        <th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;color:#333;font-size:9px;text-align:center;width:80px;">Total</th>
        <th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;color:#333;font-size:9px;text-align:center;width:50px;" colspan="1">Claim to Date<br><span style="font-weight:400;">%</span></th>
        <th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;color:#333;font-size:9px;text-align:center;width:80px;">$</th>
      </tr>
    </thead>
    <tbody>
      ${dataRows.join('')}
      ${blankRows}
      <tr>
        <td style="border:1px solid #ccc;padding:4px 6px;"></td>
        <td style="border:1px solid #ccc;padding:4px 6px;text-align:right;font-size:9px;color:#333;font-weight:700;" colspan="3">TOTAL BASE CONTRACT</td>
        <td style="border:1px solid #ccc;padding:4px 6px;text-align:right;font-size:9px;font-weight:700;color:#333;">$ ${fmt(baseContractTotal)}</td>
        <td style="border:1px solid #ccc;padding:4px 6px;"></td>
        <td style="border:1px solid #ccc;padding:4px 6px;text-align:right;font-size:9px;font-weight:700;color:#333;">$ ${fmt(baseClaimTotal)}</td>
      </tr>
    </tbody>
  </table>`;
}

function buildVariationsTable(varLines: ClaimLine[]): string {
  const MIN_ROWS = 10;
  const dataRows = varLines.map(l => {
    const isBold = !l.item_no.includes('.');
    return `<tr>
      <td style="border:1px solid #ccc;padding:3px 6px;text-align:center;font-size:9px;color:#333;">${l.item_no}</td>
      <td style="border:1px solid #ccc;padding:3px 6px;font-size:9px;color:#333;${isBold ? 'font-weight:700;' : ''}">${l.description}</td>
      <td style="border:1px solid #ccc;padding:3px 6px;text-align:center;font-size:9px;color:#333;">${l.qty != null ? l.qty.toFixed(2) : ''}</td>
      <td style="border:1px solid #ccc;padding:3px 6px;text-align:center;font-size:9px;color:#333;">${l.unit || ''}</td>
      <td style="border:1px solid #ccc;padding:3px 6px;text-align:right;font-size:9px;color:#333;">${l.total ? '$ ' + fmt(l.total) : ''}</td>
      <td style="border:1px solid #ccc;padding:3px 6px;text-align:right;font-size:9px;color:#333;">${l.claim_to_date_pct ? l.claim_to_date_pct.toFixed(1) + '%' : ''}</td>
      <td style="border:1px solid #ccc;padding:3px 6px;text-align:right;font-size:9px;color:#333;">${l.claim_to_date_amount ? '$ ' + fmt(l.claim_to_date_amount) : ''}</td>
    </tr>`;
  });

  const emptyRows = Math.max(0, MIN_ROWS - varLines.length);
  const blankRows = Array.from({ length: emptyRows }, () => `<tr>
    <td style="border:1px solid #ccc;padding:5px 6px;"></td>
    <td style="border:1px solid #ccc;padding:5px 6px;"></td>
    <td style="border:1px solid #ccc;padding:5px 6px;"></td>
    <td style="border:1px solid #ccc;padding:5px 6px;"></td>
    <td style="border:1px solid #ccc;padding:5px 6px;"></td>
    <td style="border:1px solid #ccc;padding:5px 6px;"></td>
    <td style="border:1px solid #ccc;padding:5px 6px;"></td>
  </tr>`).join('');

  const varClaimTotal = varLines.reduce((s, l) => s + (l.claim_to_date_amount || 0), 0);
  const varContractTotal = varLines.reduce((s, l) => s + (l.total || 0), 0);

  return `
  <table style="width:100%;border-collapse:collapse;font-size:9px;margin-top:6px;">
    <thead>
      <tr>
        <td rowspan="99" style="width:18px;border:1px solid #ccc;padding:2px;text-align:center;background:#f5f5f5;vertical-align:middle;">
          <span style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:8px;font-weight:700;color:#333;letter-spacing:1px;">VARIATIONS</span>
        </td>
        <th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;color:#333;font-size:9px;text-align:center;width:55px;">Var No</th>
        <th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;color:#333;font-size:9px;text-align:left;">Description</th>
        <th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;color:#333;font-size:9px;text-align:center;width:45px;">Qty</th>
        <th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;color:#333;font-size:9px;text-align:center;width:45px;">Rate</th>
        <th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;color:#333;font-size:9px;text-align:center;width:90px;">Variation<br>Amount</th>
        <th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;color:#333;font-size:9px;text-align:center;width:50px;">Claim to Date<br><span style="font-weight:400;">%</span></th>
        <th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;color:#333;font-size:9px;text-align:center;width:80px;">$</th>
      </tr>
    </thead>
    <tbody>
      ${dataRows.join('')}
      ${blankRows}
      <tr>
        <td style="border:1px solid #ccc;padding:4px 6px;"></td>
        <td style="border:1px solid #ccc;padding:4px 6px;text-align:right;font-size:9px;color:#333;font-weight:700;" colspan="3">TOTAL VARIATIONS</td>
        <td style="border:1px solid #ccc;padding:4px 6px;text-align:right;font-size:9px;font-weight:700;color:#333;">$ ${fmt(varContractTotal)}</td>
        <td style="border:1px solid #ccc;padding:4px 6px;"></td>
        <td style="border:1px solid #ccc;padding:4px 6px;text-align:right;font-size:9px;font-weight:700;color:#333;">$ ${fmt(varClaimTotal)}</td>
      </tr>
    </tbody>
  </table>`;
}

function buildSummarySection(claim: ClaimHeader, totals: ClaimTotals): string {
  const retentionPct = (claim.retention_rate_tier1 * 100).toFixed(2);
  const retentionAmt = Math.abs(totals.retentionAmount);

  return `
  <table style="width:100%;border-collapse:collapse;font-size:9px;margin-top:6px;">
    <tr>
      <td style="width:30%;border:none;padding:0;vertical-align:top;">
        <div style="font-weight:700;font-size:9px;color:#333;margin-bottom:6px;">ACCOUNT INFO</div>
        <div style="font-size:9px;color:#333;line-height:1.8;">
          Direct Credit: ${claim.bank_name || 'BNZ Account'}<br>
          Account Name: ${claim.account_name || ''}<br>
          Account No: ${claim.account_number || ''}
        </div>
      </td>
      <td style="width:2%;border:none;"></td>
      <td style="width:68%;border:none;padding:0;vertical-align:top;">
        <table style="width:100%;border-collapse:collapse;font-size:9px;">
          <tr>
            <td rowspan="8" style="width:20px;border:1px solid #ccc;padding:2px;text-align:center;background:#f5f5f5;vertical-align:middle;">
              <span style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:8px;font-weight:700;color:#333;letter-spacing:1px;">SUMMARY</span>
            </td>
            <td style="border:1px solid #ccc;padding:4px 8px;font-weight:700;color:#333;font-size:9px;">TOTAL (<em>A + B</em>)</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;color:#333;">$</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;font-weight:700;color:#333;width:90px;">${fmt(totals.totalC)}</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;color:#333;">$</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;font-weight:700;color:#333;width:90px;">${fmt(totals.baseTotal + totals.variationsTotal)}</td>
          </tr>
          <tr>
            <td style="border:1px solid #ccc;padding:4px 8px;color:#333;font-size:9px;">LESS: Retention (if applicable)</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;color:#333;">${retentionPct} %</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;color:#c00;font-weight:700;">-</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;color:#c00;font-weight:700;"></td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;color:#c00;font-weight:700;">${retentionAmt > 0 ? fmt(retentionAmt) : ''}</td>
          </tr>
          <tr>
            <td style="border:1px solid #ccc;padding:4px 8px;color:#333;font-size:9px;">ADD: Retentions Released (Refer Sub-Agreement)</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;color:#333;">(PART/FULL)</td>
            <td style="border:1px solid #ccc;padding:4px 8px;"></td>
            <td style="border:1px solid #ccc;padding:4px 8px;"></td>
            <td style="border:1px solid #ccc;padding:4px 8px;"></td>
          </tr>
          <tr>
            <td style="border:1px solid #ccc;padding:4px 8px;font-weight:700;color:#333;font-size:9px;">Net Claim to Date</td>
            <td style="border:1px solid #ccc;padding:4px 8px;"></td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;color:#333;">$</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;font-weight:700;color:#333;">${fmt(totals.netClaimToDateE)}</td>
            <td style="border:1px solid #ccc;padding:4px 8px;"></td>
          </tr>
          <tr>
            <td style="border:1px solid #ccc;padding:4px 8px;color:#333;font-size:9px;">Less Previous Net Claimed Amount${claim.claim_period ? ' - ' + claim.claim_period : ''}</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;font-style:italic;color:#333;">Total 'E' from last claim</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;color:#333;">$</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;color:#333;">${fmt(claim.previous_net_claimed || 0)}</td>
            <td style="border:1px solid #ccc;padding:4px 8px;"></td>
          </tr>
          <tr>
            <td style="border:1px solid #ccc;padding:4px 8px;font-weight:700;color:#333;font-size:9px;">CLAIMED AMOUNT THIS PERIOD (excluding GST)</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;font-style:italic;color:#333;font-weight:700;">E - F</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;color:#c00;font-weight:700;">-</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;color:#c00;font-weight:700;">${totals.claimedThisPeriodExGst < 0 ? fmt(Math.abs(totals.claimedThisPeriodExGst)) : ''}</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;font-weight:700;color:#c00;">${totals.claimedThisPeriodExGst >= 0 ? fmt(totals.claimedThisPeriodExGst) : ''}</td>
          </tr>
          <tr>
            <td style="border:1px solid #ccc;padding:4px 8px;color:#333;font-size:9px;">Goods &amp; Service Tax (GST)</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;font-style:italic;color:#333;">15 %</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;color:#c00;">-</td>
            <td style="border:1px solid #ccc;padding:4px 8px;text-align:right;font-size:9px;color:#c00;">${fmt(Math.abs(totals.gstAmount))}</td>
            <td style="border:1px solid #ccc;padding:4px 8px;"></td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function buildFinalRow(totals: ClaimTotals): string {
  return `
  <table style="width:100%;border-collapse:collapse;font-size:9px;margin-top:6px;page-break-inside:avoid;">
    <tr>
      <td style="width:30%;border:none;padding:0;"></td>
      <td style="width:2%;border:none;"></td>
      <td style="width:68%;border:none;padding:0;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="width:20px;border:1px solid #333;padding:2px;background:#111;"></td>
            <td style="border:1px solid #333;padding:6px 8px;font-weight:700;color:#fff;background:#111;font-size:9px;">CLAIMED AMOUNT THIS PERIOD (Including GST)</td>
            <td style="border:1px solid #333;padding:6px 8px;text-align:right;font-size:9px;font-weight:700;color:#fff;background:#111;">$</td>
            <td style="border:1px solid #333;padding:6px 8px;text-align:right;font-size:9px;color:#c00;background:#111;font-weight:700;">-</td>
            <td style="border:1px solid #333;padding:6px 8px;text-align:right;font-size:9px;font-weight:700;color:#fff;background:#111;width:90px;">${fmt(Math.abs(totals.claimedThisPeriodIncGst))}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

const LEGAL_NOTICE_HTML = `
<div style="font-family:Arial,sans-serif;font-size:9.5px;color:#222;line-height:1.7;max-width:700px;margin:0 auto;padding:24px;">
  <p style="text-align:center;font-weight:600;font-size:10px;margin-bottom:4px;">Form 1: Information that must accompany all payment claims</p>
  <p style="text-align:center;font-style:italic;font-size:9.5px;margin-bottom:4px;">Section 20, Construction Contracts Act 2002</p>
  <p style="text-align:center;font-weight:700;font-size:10px;margin-bottom:16px;">Important notice</p>

  <p style="font-weight:700;margin-bottom:2px;">What is this?</p>
  <p>This notice is attached to a claim for a payment (a <strong>payment claim</strong>) under the Construction Contracts Act 2002 (the <strong>Act</strong>).</p>
  <p>The person who sent this payment claim (the <strong>claimant</strong>) is claiming to be entitled to a payment for, or in relation to, the construction work carried out to date under a construction contract.</p>
  <p>Whether that person is entitled to a payment, and how much they are entitled to, will depend on whether you have a construction contract and what you have agreed between yourselves about payments. If you haven't agreed on payments, there are default provisions in the Act.</p>

  <p style="font-weight:700;margin-bottom:2px;">What should I do with this payment claim?</p>
  <p>You can either—</p>
  <p>• pay the amount claimed in the payment claim (in full) on or before the due date for payment; or</p>
  <p>• if you dispute the payment claim, send the claimant a written payment schedule that complies with section 21 of the Act (a payment schedule) stating the amount you are prepared to pay instead (which could be nothing).</p>
  <p>The due date for a payment is the date agreed between you and the claimant. That due date must be set out in the payment claim. If you haven't agreed on a due date, then the Act says that a payment is due within 20 working days after the payment claim is served on you. (For the purposes of the Act, a <strong>working day</strong> is any day other than a Saturday, a Sunday, a public holiday, or any day from 24 December to 5 January.)</p>

  <p style="font-weight:700;margin-bottom:2px;">When do I have to act?</p>
  <p>You should act promptly. Otherwise, you may lose the right to object.</p>

  <p style="font-weight:700;margin-bottom:2px;">What if I do nothing?</p>
  <p>If you don't pay the amount claimed by the due date for payment or send a payment schedule indicating what you will pay instead, the claimant can go to court to recover the unpaid amount from you as a debt owed. In addition, the court may decide that you have to pay the claimant's costs for bringing the court case.</p>

  <p style="font-weight:700;margin-bottom:2px;">Can I say that I will not pay, or pay less than, the claimed amount?</p>
  <p>Yes, by sending a written payment schedule.</p>
  <p><strong>Note:</strong> If you do not send a written payment schedule, the claimant can bring court proceedings against you or refer the matter to adjudication (or both).</p>

  <p style="font-weight:700;margin-bottom:2px;">How do I say I will not pay, or pay less than, the claimed amount?</p>
  <p>To say that you will pay nothing or indicate what you will pay instead, you must send the claimant a written payment schedule.</p>
  <p>You must indicate the amount that you are prepared to pay, which could be nothing. This amount is called the <strong>scheduled amount.</strong></p>
  <p>If the scheduled amount is less than the claimed amount, you must explain in the payment schedule—</p>
  <p>• how you calculated the scheduled amount; and</p>
  <p>• why the scheduled amount is less than the claimed amount; and</p>
  <p>• your reason or reasons for not paying the full amount claimed.</p>
  <p><strong>Note:</strong> The written payment schedule must also state which payment claim the payment schedule relates to.</p>
  <p><strong>Note:</strong> If you state in the payment schedule that you will pay less than the claimed amount or pay nothing at all, the claimant may refer the dispute about how much is owing for adjudication.</p>

  <p style="font-weight:700;margin-bottom:2px;">How long do I have?</p>
  <p>You must send a payment schedule by the date agreed in the contract or, if no date was agreed, within 20 working days after the payment claim was served on you.</p>

  <p style="font-weight:700;margin-bottom:2px;">If I say I will pay another amount instead, when do I have to pay it?</p>
  <p>You must still pay the scheduled amount by the due date for payment.</p>

  <p style="font-weight:700;margin-bottom:2px;">What if I don't pay the scheduled amount when I say I will?</p>
  <p>If you send a payment schedule but do not pay the scheduled amount by the due date, the claimant can go to court to recover the unpaid amount from you as a debt owed or refer the matter to adjudication (or both).</p>
  <p><strong>Note:</strong> A court may also require you to pay the claimant's costs.</p>

  <p style="font-weight:700;margin-bottom:2px;">Advice</p>
  <p><strong>Important: If there is anything in this notice that you do not understand or if you want advice about what to do, you should consult a lawyer immediately.</strong></p>

  <p style="text-align:center;font-weight:600;margin-top:16px;">Construction Contracts Amendment Regulations 2015</p>
</div>`;

export function exportPaymentClaimPDF(
  claim: ClaimHeader,
  lines: ClaimLine[],
  totals: ClaimTotals,
  logoUrl?: string | null
): void {
  const baseLines = lines.filter(l => l.line_type === 'base');
  const varLines = lines.filter(l => l.line_type === 'variation');

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="logo" style="max-height:60px;max-width:200px;object-fit:contain;" />`
    : `<div style="font-size:22px;font-weight:900;color:#111;letter-spacing:-1px;">${claim.payee_company || 'COMPANY'}</div>`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Payment Claim ${claim.claim_number || ''}</title>
<style>
  @page { size: A4; margin: 12mm 12mm 12mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #222; background: #fff; }
  .page { width: 100%; }
  .page-break { page-break-before: always; }
  table { border-collapse: collapse; }
  th, td { vertical-align: middle; }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER: Logo + Title -->
  <table style="width:100%;border:1px solid #ccc;border-bottom:none;margin-bottom:0;">
    <tr>
      <td style="padding:10px 14px;width:60%;border-right:1px solid #ccc;vertical-align:bottom;">
        ${logoHtml}
        <div style="font-size:8px;font-weight:600;color:#666;letter-spacing:1px;margin-top:4px;">${claim.payee_company ? 'PASSIVE SOLUTIONS. ACTIVE RESULTS' : ''}</div>
      </td>
      <td style="padding:10px 14px;text-align:center;vertical-align:middle;">
        <div style="font-size:14px;font-weight:700;font-style:italic;color:#111;letter-spacing:1px;">PAYMENT CLAIM</div>
      </td>
    </tr>
  </table>

  <!-- TO/FROM HEADER TABLE -->
  ${buildHeaderTable(claim)}

  <!-- CLAIM DATES ROW -->
  ${buildClaimDatesTable(claim)}

  <!-- BASE CONTRACT TABLE -->
  ${buildBaseContractTable(baseLines)}

  <!-- VARIATIONS TABLE -->
  ${buildVariationsTable(varLines)}

  <!-- SUMMARY SECTION -->
  ${buildSummarySection(claim, totals)}

  <!-- FINAL TOTAL ROW -->
  ${buildFinalRow(totals)}

</div>

<!-- PAGE 2: Legal Notice -->
<div class="page page-break">
  ${LEGAL_NOTICE_HTML}
</div>

</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=1200');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    setTimeout(() => {
      win.focus();
      win.print();
    }, 400);
  };
}
