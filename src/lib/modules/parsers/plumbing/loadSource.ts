import { supabase } from '../../../supabase';
import type { PlumbingSourceRow } from './types';

export interface LoadSourceResult {
  rows: PlumbingSourceRow[];
  documentTotal: number | null;
  supplierName: string | null;
  sourceLabel: string;
  metadata: Record<string, unknown>;
}

export async function loadPlumbingSource(
  sourceType: 'quote' | 'parsing_job',
  sourceId: string
): Promise<LoadSourceResult> {
  if (sourceType === 'quote') {
    return loadFromQuote(sourceId);
  }
  return loadFromParsingJob(sourceId);
}

async function loadFromQuote(quoteId: string): Promise<LoadSourceResult> {
  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .select('id, supplier_name, total_amount, trade, project_id, status')
    .eq('id', quoteId)
    .maybeSingle();

  if (qErr) throw new Error(`Failed to load quote: ${qErr.message}`);
  if (!quote) throw new Error(`Quote not found: ${quoteId}`);

  const { data: items, error: iErr } = await supabase
    .from('quote_items')
    .select('description, qty, unit, rate, total_price, scope_category, service_type')
    .eq('quote_id', quoteId)
    .order('id');

  if (iErr) throw new Error(`Failed to load quote items: ${iErr.message}`);

  const rows: PlumbingSourceRow[] = (items ?? []).map((item) => ({
    description: item.description,
    qty: item.qty,
    unit: item.unit,
    rate: item.rate,
    total: item.total_price,
  }));

  return {
    rows,
    documentTotal: quote.total_amount ?? null,
    supplierName: quote.supplier_name ?? null,
    sourceLabel: `${quote.supplier_name ?? 'Unknown'} (${quoteId.slice(0, 8)})`,
    metadata: {
      trade: (quote as Record<string, unknown>).trade,
      projectId: quote.project_id,
      status: quote.status,
    },
  };
}

async function loadFromParsingJob(jobId: string): Promise<LoadSourceResult> {
  const { data: job, error: jErr } = await supabase
    .from('parsing_jobs')
    .select('id, supplier_name, status, metadata_json')
    .eq('id', jobId)
    .maybeSingle();

  if (jErr) throw new Error(`Failed to load parsing job: ${jErr.message}`);
  if (!job) throw new Error(`Parsing job not found: ${jobId}`);

  const { data: chunks, error: cErr } = await supabase
    .from('parsing_chunks')
    .select('parsed_data')
    .eq('job_id', jobId)
    .order('chunk_index');

  if (cErr) throw new Error(`Failed to load parsing chunks: ${cErr.message}`);

  const rows: PlumbingSourceRow[] = [];
  for (const chunk of chunks ?? []) {
    const parsed = chunk.parsed_data as Record<string, unknown> | null;
    if (!parsed) continue;
    const items = (parsed.items ?? parsed.rows ?? []) as PlumbingSourceRow[];
    rows.push(...items);
  }

  const meta = job.metadata_json as Record<string, unknown> | null;

  return {
    rows,
    documentTotal: (meta?.documentTotal as number | null) ?? null,
    supplierName: job.supplier_name ?? null,
    sourceLabel: `${job.supplier_name ?? 'Parsing job'} (${jobId.slice(0, 8)})`,
    metadata: {
      jobId,
      status: job.status,
      ...(meta ?? {}),
    },
  };
}

export async function listRecentPlumbingQuotes(limit = 20) {
  const { data } = await supabase
    .from('quotes')
    .select('id, supplier_name, total_amount, status, project_id, created_at')
    .eq('trade', 'plumbing')
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []) as Array<{
    id: string;
    supplier_name: string | null;
    total_amount: number | null;
    status: string;
    project_id: string;
    created_at: string;
  }>;
}
