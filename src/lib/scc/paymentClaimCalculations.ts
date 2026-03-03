export interface ClaimLine {
  id: string;
  line_type: 'base' | 'variation';
  item_no: string;
  description: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  total: number;
  claim_to_date_pct: number;
  claim_to_date_amount: number;
  sort_order: number;
}

export interface ClaimTotals {
  baseTotal: number;
  variationsTotal: number;
  totalC: number;
  retentionAmount: number;
  netClaimToDateE: number;
  claimedThisPeriodExGst: number;
  gstAmount: number;
  claimedThisPeriodIncGst: number;
  amountPayableExGst: number;
  amountPayableIncGst: number;
}

export function calcRetention(
  total: number,
  r1: number,
  r2: number,
  r3: number
): number {
  const t1 = Math.min(total, 200000);
  const t2 = Math.min(Math.max(total - 200000, 0), 800000);
  const t3 = Math.max(total - 1000000, 0);
  return -(t1 * r1 + t2 * r2 + t3 * r3);
}

export function computeClaimTotals(
  lines: ClaimLine[],
  r1: number,
  r2: number,
  r3: number,
  retentionReleased: number,
  previousNetClaimed: number,
  netPaymentCertified: number
): ClaimTotals {
  const baseTotal = lines
    .filter(l => l.line_type === 'base')
    .reduce((s, l) => s + (l.claim_to_date_amount || 0), 0);

  const variationsTotal = lines
    .filter(l => l.line_type === 'variation')
    .reduce((s, l) => s + (l.claim_to_date_amount || 0), 0);

  const totalC = baseTotal + variationsTotal;
  const retentionAmount = calcRetention(totalC, r1, r2, r3);
  const netClaimToDateE = totalC + retentionAmount + retentionReleased;
  const claimedThisPeriodExGst = netClaimToDateE - previousNetClaimed;
  const gstAmount = Math.round(claimedThisPeriodExGst * 0.15 * 100) / 100;
  const claimedThisPeriodIncGst = claimedThisPeriodExGst + gstAmount;

  const amountPayableExGst = netClaimToDateE - netPaymentCertified;
  const amountPayableIncGst = amountPayableExGst + Math.round(amountPayableExGst * 0.15 * 100) / 100;

  return {
    baseTotal,
    variationsTotal,
    totalC,
    retentionAmount,
    netClaimToDateE,
    claimedThisPeriodExGst,
    gstAmount,
    claimedThisPeriodIncGst,
    amountPayableExGst,
    amountPayableIncGst,
  };
}

export function computeLineTotal(
  qty: number | null,
  rate: number | null,
  contractTotal: number
): number {
  if (qty !== null && rate !== null) return qty * rate;
  return contractTotal;
}

export const LEGAL_NOTICE = `FORM 1 — PAYMENT CLAIM
(Section 20 Construction Contracts Act 2002)

This is a payment claim made under the Construction Contracts Act 2002.

The person named as Payee claims payment of the amount stated in this document from the person named as Payer.

The Payer must respond to this payment claim by:
(a) paying the claimed amount by the due date for payment; or
(b) giving the Payee a payment schedule in accordance with section 21 of the Construction Contracts Act 2002.

If the Payer does not pay the claimed amount or give the Payee a payment schedule by the due date, the Payer will be liable to pay the claimed amount plus interest.

If the Payer gives a payment schedule stating a scheduled amount that is less than the claimed amount, the Payer must pay the scheduled amount by the due date for payment.

If the Payer does not pay the whole or any part of the scheduled amount by the due date for payment, the Payee may recover the unpaid portion of the scheduled amount as a debt due to the Payee in any court.

The Payee may also have other options available under the Construction Contracts Act 2002, including applying for adjudication.`;
