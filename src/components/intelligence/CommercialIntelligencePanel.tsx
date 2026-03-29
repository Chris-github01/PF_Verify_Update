import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { runCommercialIntelligence, fetchIntelligenceViews } from '../../lib/intelligence/commercialIntelligenceOrchestrator';
import type { SupplierIntelligenceView, RawQuoteItem } from '../../lib/intelligence/types';
import CommercialSummaryCard from './CommercialSummaryCard';

interface Props {
  projectId: string;
  tradeType?: string;
  onViewsChange?: (views: SupplierIntelligenceView[]) => void;
}

interface QuoteRow {
  id: string;
  supplier_name: string;
  total_price: number | null;
  total_amount: number | null;
  organisation_id: string;
  trade: string;
}

type PanelStatus = 'idle' | 'loading' | 'running' | 'done' | 'error';

function formatCurrency(v: number | null): string {
  if (v === null) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v);
}

function OverallHeader({
  views,
  onRunAnalysis,
  status,
}: {
  views: SupplierIntelligenceView[];
  onRunAnalysis: () => void;
  status: PanelStatus;
}) {
  const passCount = views.filter((v) => v.gateResult?.gateStatus === 'pass').length;
  const warnCount = views.filter((v) => v.gateResult?.gateStatus === 'warn').length;
  const failCount = views.filter((v) => v.gateResult?.gateStatus === 'fail').length;
  const cheapestGated = views.find((v) => v.isCheapestButGated);

  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h2 className="text-base font-bold text-white">Commercial Intelligence</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          AI-assisted scope analysis, behaviour profiling and decision gating
        </p>
        {views.length > 0 && (
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {passCount > 0 && (
              <span className="text-xs text-emerald-400 font-medium">{passCount} pass</span>
            )}
            {warnCount > 0 && (
              <span className="text-xs text-amber-400 font-medium">{warnCount} warn</span>
            )}
            {failCount > 0 && (
              <span className="text-xs text-red-400 font-medium">{failCount} fail</span>
            )}
            {cheapestGated && (
              <span className="text-xs text-orange-400 font-medium">
                Lowest price is not recommendable
              </span>
            )}
          </div>
        )}
      </div>
      <button
        onClick={onRunAnalysis}
        disabled={status === 'running' || status === 'loading'}
        className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
      >
        {(status === 'running' || status === 'loading') ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Analysing...
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            {views.length > 0 ? 'Re-run Analysis' : 'Run Analysis'}
          </>
        )}
      </button>
    </div>
  );
}

export default function CommercialIntelligencePanel({ projectId, tradeType = 'general', onViewsChange }: Props) {
  const [views, setViews] = useState<SupplierIntelligenceView[]>([]);
  const [status, setStatus] = useState<PanelStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);

  useEffect(() => {
    loadProjectData();
  }, [projectId]);

  async function loadProjectData() {
    setStatus('loading');
    try {
      const { data: proj } = await supabase
        .from('projects')
        .select('organisation_id')
        .eq('id', projectId)
        .maybeSingle();

      if (!proj) { setStatus('error'); setErrorMsg('Project not found.'); return; }
      setOrganisationId(proj.organisation_id);

      const { data: quotesData } = await supabase
        .from('quotes')
        .select('id, supplier_name, total_price, total_amount, organisation_id, trade')
        .eq('project_id', projectId)
        .eq('is_selected', true)
        .eq('is_latest', true);

      if (!quotesData || quotesData.length === 0) {
        setStatus('idle');
        return;
      }
      setQuotes(quotesData);

      const existingViews = await fetchIntelligenceViews(
        projectId,
        proj.organisation_id,
        tradeType,
        quotesData.map((q) => ({
          id: q.id,
          supplierName: q.supplier_name,
          submittedTotal: q.total_price ?? q.total_amount,
        })),
      );

      const hasAnyData = existingViews.some((v) => v.scopeSummary !== null);
      if (hasAnyData) {
        setViews(existingViews);
        onViewsChange?.(existingViews);
        setStatus('done');
      } else {
        setStatus('idle');
      }
    } catch (err) {
      console.error('[CommercialIntelligencePanel] loadProjectData error:', err);
      setStatus('error');
      setErrorMsg('Failed to load project data.');
    }
  }

  const runAnalysis = useCallback(async () => {
    if (!organisationId || quotes.length === 0) return;
    setStatus('running');
    setErrorMsg(null);

    try {
      const supplierPayloads = await Promise.all(
        quotes.map(async (q) => {
          const { data: items } = await supabase
            .from('quote_items')
            .select('id, description, raw_text, raw_description, total_price, unit_price, quantity, is_excluded, scope_category, source, validation_flags')
            .eq('quote_id', q.id);

          return {
            supplierName: q.supplier_name,
            quoteId: q.id,
            submittedTotal: q.total_price ?? q.total_amount,
            normalisedTotal: null,
            items: (items ?? []) as RawQuoteItem[],
          };
        }),
      );

      const results = await runCommercialIntelligence({
        projectId,
        organisationId,
        tradeType,
        suppliers: supplierPayloads,
      });

      setViews(results);
      onViewsChange?.(results);
      setStatus('done');
    } catch (err) {
      console.error('[CommercialIntelligencePanel] runAnalysis error:', err);
      setStatus('error');
      setErrorMsg('Analysis failed. Please try again.');
    }
  }, [organisationId, quotes, projectId, tradeType]);

  const noQuotes = status !== 'loading' && status !== 'running' && quotes.length === 0;

  return (
    <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5">
      <OverallHeader views={views} onRunAnalysis={runAnalysis} status={status} />

      {errorMsg && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-900/20 border border-red-500/20 text-xs text-red-400">
          {errorMsg}
        </div>
      )}

      {noQuotes && (
        <div className="text-center py-10">
          <div className="w-10 h-10 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm text-slate-400">No selected quotes found for this project.</p>
          <p className="text-xs text-slate-500 mt-1">Add and select quotes to run commercial intelligence analysis.</p>
        </div>
      )}

      {(status === 'loading' || status === 'running') && views.length === 0 && (
        <div className="text-center py-10">
          <div className="flex items-center justify-center gap-2 text-slate-400">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-sm">{status === 'running' ? 'Running commercial intelligence analysis...' : 'Loading...'}</span>
          </div>
        </div>
      )}

      {status === 'idle' && quotes.length > 0 && views.length === 0 && (
        <div className="text-center py-10">
          <div className="w-12 h-12 bg-sky-500/10 border border-sky-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-300 mb-1">Ready to analyse {quotes.length} supplier{quotes.length !== 1 ? 's' : ''}</p>
          <p className="text-xs text-slate-400 mb-4">
            Run scope classification, behaviour profiling, and decision gating across all quotes.
          </p>
          <button
            onClick={runAnalysis}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors"
          >
            Run Commercial Intelligence
          </button>
        </div>
      )}

      {views.length > 0 && (
        <div className="space-y-3">
          {views.map((view) => (
            <CommercialSummaryCard
              key={view.quoteId}
              view={view}
              isExpanded={view.isCheapestButGated || view.gateResult?.gateStatus === 'fail'}
            />
          ))}
        </div>
      )}
    </div>
  );
}
