import { supabase } from '../../lib/supabase';

export interface VaultPdf {
  quote_id: string;
  file_url: string;
  filename: string;
  supplier: string;
  trade: string;
  actual_total: number | null;
}

export interface BulkRunRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  total_files: number;
  duplicates_skipped: number;
  queued_unique: number;
  processed_count: number;
  failed_count: number;
  v2_better_count: number;
  equal_count: number;
  v1_better_count: number;
  avg_v1_runtime_ms: number;
  avg_v2_runtime_ms: number;
  status: string;
  current_file: string | null;
  progress_percent: number;
  error_message: string | null;
}

export async function fetchVaultPdfs(): Promise<VaultPdf[]> {
  const { data, error } = await supabase.rpc('get_admin_quotes', {
    p_organisation_id: null,
    p_project_id: null,
    p_limit: 5000,
    p_offset: 0,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows
    .map((q) => ({
      quote_id: String(q.id ?? ''),
      file_url: String(q.file_url ?? ''),
      filename: String(q.filename ?? ''),
      supplier: String(q.supplier_name ?? 'Unknown'),
      trade: String(q.trade ?? 'unknown'),
      actual_total:
        q.total_amount == null || q.total_amount === ''
          ? null
          : Number(q.total_amount),
    }))
    .filter((p) => p.file_url && p.filename);
}

export function dedupeVaultPdfs(pdfs: VaultPdf[]): {
  unique: VaultPdf[];
  duplicates: number;
} {
  const seen = new Map<string, VaultPdf>();
  let duplicates = 0;
  for (const p of pdfs) {
    const key = `${p.supplier.toLowerCase().trim()}|${p.filename.toLowerCase().trim()}|${
      p.actual_total ?? ''
    }`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.set(key, p);
  }
  return { unique: [...seen.values()], duplicates };
}

export async function createBulkRun(params: {
  totalFiles: number;
  duplicates: number;
  queued: number;
}): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('parser_bulk_runs')
    .insert({
      total_files: params.totalFiles,
      duplicates_skipped: params.duplicates,
      queued_unique: params.queued,
      status: 'running',
      started_by: user?.id ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function fetchBulkRun(runId: string): Promise<BulkRunRow | null> {
  const { data, error } = await supabase
    .from('parser_bulk_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle();
  if (error) throw error;
  return data as BulkRunRow | null;
}

export async function cancelBulkRun(runId: string): Promise<void> {
  await supabase
    .from('parser_bulk_runs')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', runId);
}

export async function completeBulkRun(runId: string): Promise<void> {
  await supabase
    .from('parser_bulk_runs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', runId);
}

async function invokeEdgeFunction(
  runId: string,
  pdf: VaultPdf,
  attempt: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('bulk_compare_vault_pdf', {
      body: {
        run_id: runId,
        file_url: pdf.file_url,
        filename: pdf.filename,
        supplier: pdf.supplier,
        trade: pdf.trade,
        quote_id: pdf.quote_id || null,
        actual_total: pdf.actual_total,
      },
    });
    if (error) return { ok: false, error: error.message };
    if (data && data.success === false && attempt === 0) {
      return { ok: false, error: data.reason ?? 'failed' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function orchestrateBulkRun(
  runId: string,
  pdfs: VaultPdf[],
  opts: {
    concurrency?: number;
    isCancelled: () => boolean;
  },
): Promise<void> {
  const concurrency = opts.concurrency ?? 5;
  let index = 0;

  const worker = async () => {
    while (true) {
      if (opts.isCancelled()) return;
      const i = index++;
      if (i >= pdfs.length) return;
      const pdf = pdfs[i];
      const first = await invokeEdgeFunction(runId, pdf, 0);
      if (!first.ok && !opts.isCancelled()) {
        await invokeEdgeFunction(runId, pdf, 1);
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, pdfs.length) }, () => worker());
  await Promise.all(workers);
}
