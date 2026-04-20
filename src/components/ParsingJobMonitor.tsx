import { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTrade } from '../lib/tradeContext';

interface ParsingJobMetadata {
  parser_version?: string;
  document_class?: string;
  parser_used?: string;
  total_source?: string;
  confidence?: number;
  validation_risk?: string;
  warnings?: string[];
  grand_total?: number;
  optional_total?: number;
  main_total?: number;
  excluded_total?: number;
  row_sum?: number;
  consensus_totals?: {
    main_total?: number;
    optional_total?: number;
    excluded_total?: number;
    grand_total?: number;
    resolution_source?: string;
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
    summed_main?: number;
    summed_optional?: number;
    summed_excluded?: number;
    labelled?: {
      grand_total?: number | null;
      main_total?: number | null;
      optional_total?: number | null;
      excluded_total?: number | null;
      subtotal?: number | null;
      labels_found?: Array<{ label: string; value: number; kind: string }>;
    };
    notes?: string[];
  } | null;
  item_count_base?: number;
  item_count_optional?: number;
  item_count_excluded?: number;
  duration_ms?: number;
  failure_reason?: string;
  failure_code?: string;
  parser_reasons?: string[];
  grand_total_found?: number;
  will_skip_llm?: boolean;
  prior_llm_fail_reason?: string;
  gpt_value_review?: {
    used?: boolean;
    skipped_reason?: string | null;
    trigger_reasons?: string[];
    trigger_debug?: Array<{ id: string; name: string; threshold: string; measured: string | number | boolean | null; fired: boolean }>;
    fallback_to_deterministic?: boolean;
    mark_for_review?: boolean;
    document_confidence?: number | null;
    items_returned?: number;
    elapsed_ms?: number | null;
    cost_estimate_usd?: number | null;
    error?: string | null;
    error_detail?: string | null;
    http_status?: number | null;
    raw_response_preview?: string | null;
  } | null;
}

interface TraceEntry {
  parser: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  status: 'success' | 'failed' | 'timeout' | 'skipped';
  reason?: string;
}

interface TraceJson {
  parser_attempt_order?: TraceEntry[];
  final_parser_used?: string;
  fallback_triggered?: boolean;
  llm_chunks_started?: number;
  llm_chunks_completed?: number;
}

interface ParsingJob {
  id: string;
  supplier_name: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error_message: string | null;
  result_data: {
    items?: any[];
    item_count_base?: number;
    item_count_optional?: number;
    item_count_excluded?: number;
    grand_total?: number;
    parser_used?: string;
    parser_version?: string;
  } | null;
  metadata?: ParsingJobMetadata | null;
  parsed_lines?: any[];
  quote_id: string | null;
  created_at: string;
  updated_at: string;
  is_latest?: boolean;
  // new observability columns
  current_stage?: string | null;
  attempt_count?: number | null;
  primary_parser?: string | null;
  fallback_parser?: string | null;
  final_parser_used?: string | null;
  last_error?: string | null;
  last_error_code?: string | null;
  trace_json?: TraceJson | null;
  llm_attempted?: boolean | null;
  llm_fail_reason?: string | null;
}

interface ParsingJobMonitorProps {
  projectId: string;
  onJobCompleted?: (jobId: string, quoteId: string) => void;
  dashboardMode?: 'original' | 'revisions';
}

const STAGE_LABEL_MAP: Record<string, string> = {
  'Running LLM Structural Pass': 'Analysing document structure...',
  'Running LLM Extraction Pass': 'Extracting line items (LLM)...',
  'Running LLM Extraction Pass (retry)': 'Retrying LLM extraction...',
  'Running LLM Extraction Pass (short prompt)': 'Running compact LLM pass...',
  'LLM Timeout — Switching to Fallback': 'LLM timed out — switching to regex...',
  'Running Regex Recovery': 'Running regex fallback parser...',
  'Running Spreadsheet Parser': 'Parsing spreadsheet data...',
  'Finalizing Totals': 'Finalising totals and validation...',
  'Completed': 'Completed',
  'Failed — No Items Extracted': 'Failed — no line items found',
  'Failed — Fatal Error': 'Failed — unexpected error',
  'Queued — Retrying': 'Queued for retry...',
  'Queued — Regex Recovery (LLM skipped)': 'Queued — regex recovery (LLM skipped)',
};

function getStageLabel(stage: string | null | undefined, progress: number): string {
  if (!stage) {
    if (progress < 10) return 'Starting up...';
    if (progress < 30) return 'Loading document...';
    if (progress < 60) return 'Processing...';
    return 'Finalising...';
  }
  return STAGE_LABEL_MAP[stage] ?? stage;
}

function TraceReportPanel({ trace, job }: { trace: TraceJson; job: ParsingJob }) {
  const [open, setOpen] = useState(false);
  const attempts = trace.parser_attempt_order ?? [];

  const statusColor = (s: TraceEntry['status']) => {
    if (s === 'success') return 'text-green-400';
    if (s === 'timeout') return 'text-orange-400';
    if (s === 'skipped') return 'text-slate-500';
    return 'text-red-400';
  };

  const statusLabel = (s: TraceEntry['status']) => {
    if (s === 'success') return 'OK';
    if (s === 'timeout') return 'TIMEOUT';
    if (s === 'skipped') return 'SKIPPED';
    return 'FAILED';
  };

  return (
    <div className="mt-2 ml-7">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
      >
        <Activity size={12} />
        Parser Report
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="mt-1.5 font-mono text-xs bg-slate-900/60 border border-slate-700 rounded px-3 py-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <div className="text-slate-500">primary_parser</div>
            <div className="text-slate-200">{job.primary_parser ?? trace.parser_attempt_order?.[0]?.parser ?? '—'}</div>
            <div className="text-slate-500">final_parser_used</div>
            <div className="text-slate-200">
              {(() => {
                const meta = job.metadata ?? null;
                const gpt = meta?.gpt_value_review;
                const base = trace.final_parser_used ?? job.final_parser_used ?? '—';
                if (gpt?.used && !gpt.fallback_to_deterministic) {
                  return base.includes('gpt_value_review') ? base : `${base}+gpt_value_review`;
                }
                return base;
              })()}
            </div>
            <div className="text-slate-500">fallback_triggered</div>
            <div className={trace.fallback_triggered ? 'text-orange-400' : 'text-slate-400'}>
              {trace.fallback_triggered ? 'Yes' : 'No'}
            </div>
            {job.metadata?.gpt_value_review && (() => {
              const gpt = job.metadata!.gpt_value_review!;
              let label = '';
              let color = 'text-slate-300';
              if (gpt.used && !gpt.fallback_to_deterministic) {
                label = `applied (conf=${gpt.document_confidence?.toFixed(2) ?? 'n/a'}, items=${gpt.items_returned ?? 0}, ${gpt.elapsed_ms}ms)`;
                color = 'text-green-400';
              } else if (gpt.used && gpt.fallback_to_deterministic) {
                label = `fallback: ${gpt.error ?? 'output worse than deterministic'}`;
                color = 'text-orange-400';
              } else if (gpt.skipped_reason) {
                label = `skipped: ${gpt.skipped_reason}`;
                color = 'text-slate-400';
              } else {
                label = 'not run';
                color = 'text-slate-500';
              }
              return (
                <>
                  <div className="text-slate-500">gpt_value_review</div>
                  <div className={color}>{label}</div>
                  {gpt.trigger_reasons && gpt.trigger_reasons.length > 0 && (
                    <>
                      <div className="text-slate-500">gpt_triggers</div>
                      <div className="text-slate-300 break-all">
                        {gpt.trigger_reasons.join(' | ')}
                      </div>
                    </>
                  )}
                  {gpt.error_detail && (
                    <>
                      <div className="text-slate-500">gpt_error_detail</div>
                      <div className="text-red-400 break-all">{gpt.error_detail}</div>
                    </>
                  )}
                </>
              );
            })()}
            {trace.llm_chunks_started != null && (
              <>
                <div className="text-slate-500">llm_chunks</div>
                <div className="text-slate-200">
                  {trace.llm_chunks_completed ?? 0} / {trace.llm_chunks_started} completed
                </div>
              </>
            )}
          </div>
          {attempts.length > 0 && (
            <div className="pt-1.5 border-t border-slate-700/60">
              <div className="text-slate-500 mb-1">parser_attempt_order</div>
              <div className="space-y-1">
                {attempts.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-slate-500 w-4 flex-shrink-0">{i + 1}.</span>
                    <span className="text-slate-300 flex-1">{entry.parser}</span>
                    <span className={statusColor(entry.status)}>{statusLabel(entry.status)}</span>
                    <span className="text-slate-500">{entry.duration_ms}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {job.last_error && (
            <div className="pt-1.5 border-t border-slate-700/60">
              <div className="text-slate-500 mb-0.5">last_error</div>
              <div className="text-red-400 break-all leading-relaxed">{job.last_error}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ParsingJobMonitor({ projectId, onJobCompleted, dashboardMode = 'original' }: ParsingJobMonitorProps) {
  const { currentTrade } = useTrade();
  const [jobs, setJobs] = useState<ParsingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState<Set<string>>(new Set());
  const autoRetriedJobs = useRef<Set<string>>(new Set());
  const isAutoRetrying = useRef<Set<string>>(new Set());
  const jobsRef = useRef<ParsingJob[]>([]);

  useEffect(() => {
    loadJobs();

    const subscription = supabase
      .channel('parsing_jobs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'parsing_jobs',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setJobs(prev => {
              const next = [payload.new as ParsingJob, ...prev];
              jobsRef.current = next;
              return next;
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as ParsingJob;
            setJobs(prev => {
              const next = prev.map(job => (job.id === updated.id ? updated : job));
              jobsRef.current = next;
              return next;
            });
            if (updated.status === 'completed' && updated.quote_id) {
              onJobCompleted?.(updated.id, updated.quote_id);
            }
          } else if (payload.eventType === 'DELETE') {
            setJobs(prev => {
              const next = prev.filter(job => job.id !== payload.old.id);
              jobsRef.current = next;
              return next;
            });
          }
        }
      )
      .subscribe();

    const pollInterval = setInterval(async () => {
      const currentJobs = jobsRef.current;
      const hasActiveJobs = currentJobs.some(
        job => job.status === 'pending' || job.status === 'processing'
      );
      if (hasActiveJobs) {
        await loadJobs();

        // Auto-retry: only if stuck AND attempt_count < 2 (loop-breaker)
        currentJobs.forEach(job => {
          const jobKey = `${job.id}_${job.updated_at}`;
          const attemptCount = job.attempt_count ?? 0;
          const priorLlmFailed = job.llm_attempted === true && job.llm_fail_reason != null;

          // Never auto-retry if LLM already failed twice — user must click Resume manually
          const autoRetryAllowed = !(priorLlmFailed && attemptCount >= 2);

          if (
            job.status === 'processing' &&
            job.progress >= 95 &&
            job.progress < 100 &&
            autoRetryAllowed &&
            !resuming.has(job.id) &&
            !autoRetriedJobs.current.has(jobKey)
          ) {
            const updatedAt = new Date(job.updated_at);
            const now = new Date();
            const secondsSinceUpdate = (now.getTime() - updatedAt.getTime()) / 1000;

            if (secondsSinceUpdate > 20) {
              console.log(`[Auto-Retry] Job ${job.supplier_name} stuck at ${job.progress}% for ${Math.round(secondsSinceUpdate)}s, auto-retrying (attempt ${attemptCount + 1})...`);
              autoRetriedJobs.current.add(jobKey);
              isAutoRetrying.current.add(job.id);
              handleResumeJob(job.id, true);
            }
          }

          if (job.status === 'completed' || job.progress === 100) {
            Array.from(autoRetriedJobs.current).forEach(key => {
              if (key.startsWith(job.id)) autoRetriedJobs.current.delete(key);
            });
          }
        });
      }
    }, 2000);

    return () => {
      subscription.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [projectId, dashboardMode, currentTrade]);

  const loadJobs = async () => {
    try {
      const { data: allJobs, error } = await supabase
        .from('parsing_jobs')
        .select('*')
        .eq('project_id', projectId)
        .eq('trade', currentTrade)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error || !allJobs) {
        console.error('Error loading parsing jobs:', error);
        return;
      }

      const jobsWithQuotes = allJobs.filter(job => job.quote_id);

      if (jobsWithQuotes.length > 0) {
        const quoteIds = jobsWithQuotes.map(job => job.quote_id);
        const { data: quotes } = await supabase
          .from('quotes')
          .select('id, revision_number, is_latest')
          .in('id', quoteIds);

        const quoteRevisionMap = new Map(quotes?.map(q => [q.id, q.revision_number]) || []);
        const quoteLatestMap = new Map(quotes?.map(q => [q.id, q.is_latest]) || []);

        const filteredJobs = allJobs.filter(job => {
          if (!job.quote_id) return true;
          const revisionNumber = quoteRevisionMap.get(job.quote_id) ?? 1;
          if (dashboardMode === 'original') return revisionNumber === 1;
          return revisionNumber > 1;
        }).map(job => ({
          ...job,
          is_latest: job.quote_id ? quoteLatestMap.get(job.quote_id) || false : false
        }));

        const result = filteredJobs.slice(0, 20) as ParsingJob[];
        jobsRef.current = result;
        setJobs(result);
      } else {
        const result = allJobs.slice(0, 20) as ParsingJob[];
        jobsRef.current = result;
        setJobs(result);
      }
    } catch (error) {
      console.error('Error loading parsing jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const isJobStuck = (job: ParsingJob): boolean => {
    if (job.status !== 'processing') return false;
    const updatedAt = new Date(job.updated_at);
    const now = new Date();
    const minutesSinceUpdate = (now.getTime() - updatedAt.getTime()) / 1000 / 60;
    return minutesSinceUpdate > 5;
  };

  const handleResumeJob = async (jobId: string, isAutoRetry: boolean = false) => {
    setResuming(prev => new Set(prev).add(jobId));

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resume_parsing_job`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ jobId }),
        }
      );

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Failed to retry job');

      if (result.success && isAutoRetry) {
        console.log(`[Auto-Retry] Re-dispatched job ${jobId}${result.willSkipLlm ? ' (LLM will be skipped)' : ''}`);
      }

      await loadJobs();
    } catch (error) {
      console.error('Error retrying job:', error);
      if (!isAutoRetry) {
        alert(`Failed to retry job: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } finally {
      setResuming(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
      isAutoRetrying.current.delete(jobId);
    }
  };

  const getItemCount = (job: ParsingJob): number => {
    const rd = job.result_data;
    if (rd?.item_count_base != null) return rd.item_count_base + (rd.item_count_optional ?? 0);
    if (rd?.items != null) return rd.items.length;
    return Array.isArray(job.parsed_lines) ? job.parsed_lines.length : 0;
  };

  const categorizeJobs = () => {
    const successful: ParsingJob[] = [];
    const partial: ParsingJob[] = [];
    const failed: ParsingJob[] = [];
    const active: ParsingJob[] = [];

    jobs.forEach(job => {
      if (job.status === 'pending' || job.status === 'processing') {
        active.push(job);
      } else if (job.status === 'completed') {
        const itemCount = getItemCount(job);
        const hasFailedChunks = job.error_message?.includes('chunks failed') || false;
        if (itemCount === 0) failed.push(job);
        else if (hasFailedChunks) partial.push(job);
        else successful.push(job);
      } else if (job.status === 'failed') {
        failed.push(job);
      }
    });

    return { successful, partial, failed, active };
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (isToday) return `Today at ${timeStr}`;
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
    return `${dateStr} at ${timeStr}`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          <span className="ml-2 text-sm text-gray-600">Loading jobs...</span>
        </div>
      </div>
    );
  }

  if (jobs.length === 0) return null;

  const { successful, partial, failed, active } = categorizeJobs();

  return (
    <div className="space-y-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-400 mb-1">Successfully Imported</div>
              <div className="text-3xl font-bold text-slate-100">{successful.length}</div>
            </div>
            <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
              <CheckCircle className="text-green-400" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-400 mb-1">Partial Imports</div>
              <div className="text-3xl font-bold text-slate-100">{partial.length}</div>
            </div>
            <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center">
              <AlertTriangle className="text-yellow-400" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-400 mb-1">Failed Imports</div>
              <div className="text-3xl font-bold text-slate-100">{failed.length}</div>
            </div>
            <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
              <XCircle className="text-red-400" size={24} />
            </div>
          </div>
        </div>
      </div>

      {active.length > 0 && (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700 p-5">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">Processing</h3>
          <div className="space-y-3">
            {active.map(job => {
              const stageLabel = getStageLabel(job.current_stage, job.progress);
              const attemptCount = job.attempt_count ?? 0;
              const priorLlmFailed = job.llm_attempted === true && job.llm_fail_reason != null;
              const isHardStuck = isJobStuck(job);
              const showResumeButton = isHardStuck;
              const resumeLabel = (priorLlmFailed && attemptCount >= 2) ? 'Resume (Regex Only)' : 'Resume';

              return (
                <div key={job.id} className="flex items-start gap-3 py-3 px-3 bg-blue-900/20 rounded-lg border border-blue-500/30">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-100 text-sm">{job.supplier_name}</div>
                    <div className="text-xs text-blue-300 mt-0.5 font-medium">{stageLabel}</div>
                    <div className="text-xs text-slate-400 mt-0.5">File: {job.filename}</div>
                    {attemptCount > 0 && (
                      <div className="text-xs text-slate-500 mt-0.5">Attempt {attemptCount + 1}</div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 bg-slate-700 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 w-9 text-right flex-shrink-0">
                        {job.progress}%
                      </span>
                    </div>
                  </div>
                  {showResumeButton && (
                    <button
                      onClick={() => handleResumeJob(job.id)}
                      disabled={resuming.has(job.id)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded disabled:opacity-50 flex-shrink-0 mt-0.5"
                    >
                      {resuming.has(job.id) ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      {resumeLabel}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {successful.length > 0 && (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700 p-5">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">Successfully Imported Quotes</h3>
          <div className="space-y-2">
            {successful.map((job) => {
              const meta = (job.metadata as ParsingJobMetadata | null) ?? null;
              const isV3 = meta?.parser_version === 'v3';
              const riskColor = meta?.validation_risk === 'OK' ? 'text-green-400' : meta?.validation_risk === 'MEDIUM' ? 'text-yellow-400' : 'text-red-400';
              const trace = job.trace_json as TraceJson | null;

              return (
                <div key={job.id} className="py-2 px-3 hover:bg-slate-700/50 rounded-lg transition-colors">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-100 text-sm">{job.supplier_name}</span>
                        {job.is_latest && (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">Latest</span>
                        )}
                        {isV3 && (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">v3</span>
                        )}
                        {trace?.fallback_triggered && (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-orange-500/20 text-orange-300 rounded-full border border-orange-500/30">regex fallback</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {getItemCount(job)} items parsed
                        {job.result_data?.item_count_optional != null && job.result_data.item_count_optional > 0 && (
                          <> ({job.result_data.item_count_base ?? 0} base + {job.result_data.item_count_optional} optional)</>
                        )}
                        {' '}• {job.filename} • {formatDateTime(job.updated_at)}
                      </div>
                    </div>
                  </div>
                  {isV3 && meta && (
                    <div className="mt-2 ml-7 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs bg-slate-900/60 border border-slate-700 rounded px-3 py-2">
                      <div className="text-slate-500">parser_version</div><div className="text-slate-200">{meta.parser_version}</div>
                      <div className="text-slate-500">document_class</div><div className="text-slate-200">{meta.document_class ?? '—'}</div>
                      <div className="text-slate-500">parser_used</div><div className="text-slate-200">{meta.parser_used ?? '—'}</div>
                      <div className="text-slate-500">total_source</div><div className="text-slate-200">{meta.total_source ?? '—'}</div>
                      <div className="text-slate-500">confidence</div><div className="text-slate-200">{meta.confidence != null ? (meta.confidence * 100).toFixed(0) + '%' : '—'}</div>
                      <div className="text-slate-500">validation_risk</div><div className={riskColor}>{meta.validation_risk ?? '—'}</div>
                      {meta.item_count_base != null && (
                        <>
                          <div className="text-slate-500">base_items</div><div className="text-slate-200">{meta.item_count_base}</div>
                          <div className="text-slate-500">optional_items</div><div className="text-slate-200">{meta.item_count_optional ?? 0}</div>
                          {meta.item_count_excluded != null && meta.item_count_excluded > 0 && (
                            <><div className="text-slate-500">excluded_items</div><div className="text-slate-400">{meta.item_count_excluded}</div></>
                          )}
                        </>
                      )}
                      {(() => {
                        const ct = meta.consensus_totals;
                        const mainDisplay = ct?.main_total ?? meta.main_total ?? null;
                        const optDisplay = ct?.optional_total ?? meta.optional_total ?? null;
                        const grandDisplay = ct?.grand_total ?? meta.grand_total ?? null;
                        return (
                          <>
                            {mainDisplay != null && (
                              <><div className="text-slate-500">main_total</div><div className="text-emerald-300">${mainDisplay.toLocaleString()}</div></>
                            )}
                            {optDisplay != null && optDisplay > 0 && (
                              <><div className="text-slate-500">optional_total</div><div className="text-blue-300">${optDisplay.toLocaleString()}</div></>
                            )}
                            {grandDisplay != null && (
                              <><div className="text-slate-500">grand_total</div><div className="text-slate-200">${grandDisplay.toLocaleString()}</div></>
                            )}
                            {ct && (
                              <>
                                <div className="text-slate-500">resolution_source</div>
                                <div className="text-slate-200">{ct.resolution_source ?? '—'}</div>
                                <div className="text-slate-500">consensus_confidence</div>
                                <div className={
                                  ct.confidence === 'HIGH' ? 'text-emerald-300' :
                                  ct.confidence === 'MEDIUM' ? 'text-yellow-300' : 'text-orange-300'
                                }>{ct.confidence ?? '—'}</div>
                                {ct.notes && ct.notes.length > 0 && (
                                  <>
                                    <div className="text-slate-500 col-span-2 pt-1 border-t border-slate-700 mt-1">consensus_notes</div>
                                    <div className="col-span-2 text-slate-400">{ct.notes.join(' · ')}</div>
                                  </>
                                )}
                              </>
                            )}
                          </>
                        );
                      })()}
                      {meta.warnings && meta.warnings.length > 0 && (
                        <>
                          <div className="text-slate-500 col-span-2 pt-1 border-t border-slate-700 mt-1">warnings</div>
                          <div className="col-span-2 text-yellow-400">{meta.warnings.join(' · ')}</div>
                        </>
                      )}
                    </div>
                  )}
                  {trace && <TraceReportPanel trace={trace} job={job} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(partial.length > 0 || failed.length > 0) && (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700 p-5">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">Quotes With Issues</h3>

          {partial.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-yellow-300 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} />
                Partial Imports ({partial.length})
              </h4>
              <div className="space-y-2">
                {partial.map(job => {
                  const itemCount = getItemCount(job);
                  const failedChunks = job.error_message?.match(/(\d+) chunks? failed/)?.[1] || '0';
                  const trace = job.trace_json as TraceJson | null;

                  return (
                    <div key={job.id} className="border border-yellow-500/30 rounded-lg p-3 bg-yellow-900/20">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-4 h-4 text-yellow-400" />
                            <span className="text-sm font-semibold text-slate-100">{job.supplier_name}</span>
                          </div>
                          <div className="text-xs text-slate-300 mb-1">
                            {itemCount} items extracted, {failedChunks} chunks failed
                          </div>
                          <div className="text-xs text-slate-400">File: {job.filename}</div>
                          {trace && <TraceReportPanel trace={trace} job={job} />}
                        </div>
                        <button
                          onClick={() => handleResumeJob(job.id)}
                          disabled={resuming.has(job.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-yellow-700 bg-yellow-100 hover:bg-yellow-200 rounded disabled:opacity-50 border border-yellow-300 flex-shrink-0 ml-3"
                        >
                          {resuming.has(job.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Retry Failed
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {failed.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-red-300 mb-2 flex items-center gap-2">
                <XCircle size={16} />
                Failed Imports ({failed.length})
              </h4>
              <div className="space-y-2">
                {failed.map(job => {
                  const itemCount = getItemCount(job);
                  const failMeta = (job.metadata as ParsingJobMetadata | null) ?? null;
                  const trace = job.trace_json as TraceJson | null;
                  const attemptCount = job.attempt_count ?? 0;
                  const priorLlmFailed = job.llm_attempted === true && job.llm_fail_reason != null;
                  const resumeLabel = (priorLlmFailed && attemptCount >= 2) ? 'Try Again (Regex Only)' : 'Try Again';
                  const reason = failMeta?.failure_reason
                    || job.last_error
                    || job.error_message
                    || (itemCount === 0 && job.status === 'completed' ? 'Parser completed but extracted 0 line items' : 'Could not extract tables');

                  return (
                    <div key={job.id} className="border border-red-500/30 rounded-lg p-3 bg-red-900/20">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <XCircle className="w-4 h-4 text-red-400" />
                            <span className="text-sm font-semibold text-slate-100">{job.supplier_name || 'Unknown Supplier'}</span>
                            {attemptCount > 0 && (
                              <span className="px-1.5 py-0.5 text-xs bg-slate-700 text-slate-400 rounded">
                                {attemptCount} attempt{attemptCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-300 mb-1">Reason: {reason}</div>
                          {job.last_error_code && (
                            <div className="text-xs text-red-400 mb-1">Code: {job.last_error_code}</div>
                          )}
                          <div className="text-xs text-slate-400">File: {job.filename}</div>
                          {failMeta?.parser_version === 'v3' && (
                            <div className="mt-2 font-mono text-xs bg-slate-900/40 border border-slate-700 rounded px-2 py-1.5 space-y-0.5">
                              <div className="grid grid-cols-2 gap-x-4">
                                <div className="text-slate-500">document_class</div><div className="text-slate-300">{failMeta.document_class ?? '—'}</div>
                                <div className="text-slate-500">parser_used</div><div className="text-slate-300">{failMeta.parser_used ?? '—'}</div>
                                <div className="text-slate-500">failure_code</div><div className="text-red-400">{failMeta.failure_code ?? '—'}</div>
                                <div className="text-slate-500">failure_reason</div><div className="text-red-400 col-span-1 break-words">{failMeta.failure_reason ?? reason}</div>
                                {failMeta.grand_total_found != null && (
                                  <><div className="text-slate-500">grand_total_found</div><div className="text-yellow-300">${failMeta.grand_total_found.toLocaleString()}</div></>
                                )}
                              </div>
                              {failMeta.parser_reasons && failMeta.parser_reasons.length > 0 && (
                                <div className="mt-1.5 pt-1.5 border-t border-slate-700">
                                  <div className="text-slate-500 mb-1">parser_reasons</div>
                                  <div className="space-y-0.5 max-h-40 overflow-y-auto">
                                    {failMeta.parser_reasons.map((r, i) => (
                                      <div key={i} className="text-slate-400 break-all leading-relaxed">{r}</div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {trace && <TraceReportPanel trace={trace} job={job} />}
                        </div>
                        <button
                          onClick={() => handleResumeJob(job.id)}
                          disabled={resuming.has(job.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded disabled:opacity-50 border border-red-300 flex-shrink-0 ml-3"
                        >
                          {resuming.has(job.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          {resumeLabel}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
