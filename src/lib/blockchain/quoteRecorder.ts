import { recordOnBlockchain } from './icpClient';
import { generateQuoteFingerprint, generateReportFingerprint } from './hashGenerator';
import { supabase } from '../supabase';

export async function recordQuoteOnBlockchain(
  quoteId: string,
  organisationId: string,
  userId: string
): Promise<string> {
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select(`
      *,
      quote_items (
        description,
        quantity,
        unit,
        unit_price,
        total_price
      )
    `)
    .eq('id', quoteId)
    .single();

  if (quoteError || !quote) {
    throw new Error('Failed to fetch quote for blockchain recording');
  }

  const fingerprint = generateQuoteFingerprint({
    supplier_name: quote.supplier_name,
    quote_reference: quote.quote_reference,
    total_amount: quote.total_amount,
    items_count: quote.items_count,
    import_date: quote.import_date,
    items: quote.quote_items
  });

  const record = await recordOnBlockchain(
    'quote_finalized',
    quoteId,
    fingerprint,
    {
      organisation_id: organisationId,
      user_id: userId,
      supplier_name: quote.supplier_name,
      quote_reference: quote.quote_reference,
      import_date: quote.import_date
    }
  );

  await supabase
    .from('quotes')
    .update({ blockchain_record_id: record.id })
    .eq('id', quoteId);

  return record.id;
}

export async function recordReportOnBlockchain(
  reportId: string,
  projectId: string,
  organisationId: string,
  userId: string
): Promise<string> {
  const { data: report, error: reportError } = await supabase
    .from('award_reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (reportError || !report) {
    throw new Error('Failed to fetch report for blockchain recording');
  }

  const fingerprint = generateReportFingerprint({
    project_id: report.project_id,
    params_json: report.params_json,
    result_json: report.result_json,
    generated_at: report.generated_at
  });

  const record = await recordOnBlockchain(
    'report_generated',
    reportId,
    fingerprint,
    {
      organisation_id: organisationId,
      user_id: userId,
      project_id: projectId,
      generated_at: report.generated_at
    }
  );

  await supabase
    .from('award_reports')
    .update({ blockchain_record_id: record.id })
    .eq('id', reportId);

  return record.id;
}

export async function recordAwardDecisionOnBlockchain(
  projectId: string,
  approvedQuoteId: string,
  organisationId: string,
  userId: string,
  decisionNotes?: string
): Promise<string> {
  const { data: quote } = await supabase
    .from('quotes')
    .select('supplier_name, total_amount')
    .eq('id', approvedQuoteId)
    .single();

  const decisionData = {
    projectId,
    approvedQuoteId,
    supplierName: quote?.supplier_name,
    totalAmount: quote?.total_amount,
    decisionDate: new Date().toISOString(),
    decisionNotes
  };

  const record = await recordOnBlockchain(
    'award_decision',
    projectId,
    decisionData,
    {
      organisation_id: organisationId,
      user_id: userId,
      project_id: projectId,
      approved_quote_id: approvedQuoteId,
      decision_date: new Date().toISOString()
    }
  );

  return record.id;
}

export async function recordContractSignedOnBlockchain(
  projectId: string,
  approvedQuoteId: string,
  organisationId: string,
  userId: string,
  contractDetails: {
    signedDate: string;
    contractValue: number;
    signatories: string[];
  }
): Promise<string> {
  const contractData = {
    projectId,
    approvedQuoteId,
    ...contractDetails
  };

  const record = await recordOnBlockchain(
    'contract_signed',
    projectId,
    contractData,
    {
      organisation_id: organisationId,
      user_id: userId,
      project_id: projectId,
      approved_quote_id: approvedQuoteId,
      signed_date: contractDetails.signedDate
    }
  );

  return record.id;
}
