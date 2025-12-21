import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, RefreshCw, AlertTriangle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ParsingJob {
  id: string;
  supplier_name: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error_message: string | null;
  result_data: { items?: any[] } | null;
  quote_id: string | null;
  created_at: string;
  updated_at: string;
  is_latest?: boolean; // Track if this job's quote is the latest
}

interface ParsingJobMonitorProps {
  projectId: string;
  onJobCompleted?: (jobId: string, quoteId: string) => void;
  dashboardMode?: 'original' | 'revisions';
}

export default function ParsingJobMonitor({ projectId, onJobCompleted, dashboardMode = 'original' }: ParsingJobMonitorProps) {
  const [jobs, setJobs] = useState<ParsingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState<Set<string>>(new Set());

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
            setJobs(prev => [payload.new as ParsingJob, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as ParsingJob;
            setJobs(prev =>
              prev.map(job => (job.id === updated.id ? updated : job))
            );

            if (updated.status === 'completed' && updated.quote_id) {
              onJobCompleted?.(updated.id, updated.quote_id);
            }
          } else if (payload.eventType === 'DELETE') {
            setJobs(prev => prev.filter(job => job.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    const pollInterval = setInterval(() => {
      const hasActiveJobs = jobs.some(
        job => job.status === 'pending' || job.status === 'processing'
      );
      if (hasActiveJobs) {
        loadJobs();
      }
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [projectId, dashboardMode, jobs]);

  const loadJobs = async () => {
    try {
      // Get all jobs for this project
      const { data: allJobs, error } = await supabase
        .from('parsing_jobs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error || !allJobs) {
        console.error('Error loading parsing jobs:', error);
        return;
      }

      // Filter jobs based on their associated quote's revision_number
      const jobsWithQuotes = allJobs.filter(job => job.quote_id);
      const jobsWithoutQuotes = allJobs.filter(job => !job.quote_id);

      if (jobsWithQuotes.length > 0) {
        const quoteIds = jobsWithQuotes.map(job => job.quote_id);
        const { data: quotes } = await supabase
          .from('quotes')
          .select('id, revision_number, is_latest')
          .in('id', quoteIds);

        const quoteRevisionMap = new Map(quotes?.map(q => [q.id, q.revision_number]) || []);
        const quoteLatestMap = new Map(quotes?.map(q => [q.id, q.is_latest]) || []);

        const filteredJobs = allJobs.filter(job => {
          if (!job.quote_id) return true; // Include jobs without quotes (pending/failed)

          const revisionNumber = quoteRevisionMap.get(job.quote_id) ?? 1; // Treat NULL as revision 1

          if (dashboardMode === 'original') {
            return revisionNumber === 1;
          } else {
            return revisionNumber > 1;
          }
        }).map(job => ({
          ...job,
          is_latest: job.quote_id ? quoteLatestMap.get(job.quote_id) || false : false
        }));

        setJobs(filteredJobs.slice(0, 20) as ParsingJob[]);
      } else {
        setJobs(allJobs.slice(0, 20) as ParsingJob[]);
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

  const handleResumeJob = async (jobId: string) => {
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

      if (!response.ok) {
        throw new Error(result.error || 'Failed to resume job');
      }

      if (result.success && result.quoteId) {
        onJobCompleted?.(jobId, result.quoteId);
        alert(result.message || `Successfully recovered ${result.recoveredItems} items`);
      } else {
        alert(result.message || 'Job was too incomplete to recover');
      }

      await loadJobs();
    } catch (error) {
      console.error('Error resuming job:', error);
      alert(`Failed to resume job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setResuming(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
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
        const itemCount = job.result_data?.items?.length || 0;
        const hasFailedChunks = job.error_message?.includes('chunks failed') || false;

        if (itemCount === 0) {
          failed.push(job);
        } else if (hasFailedChunks) {
          partial.push(job);
        } else {
          successful.push(job);
        }
      } else if (job.status === 'failed') {
        failed.push(job);
      }
    });

    return { successful, partial, failed, active };
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    if (isToday) {
      return `Today at ${timeStr}`;
    }

    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
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

  if (jobs.length === 0) {
    return null;
  }

  const { successful, partial, failed, active } = categorizeJobs();

  const successCount = successful.length;
  const partialCount = partial.length;
  const failedCount = failed.length;

  return (
    <div className="space-y-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-400 mb-1">Successfully Imported</div>
              <div className="text-3xl font-bold text-slate-100">{successCount}</div>
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
              <div className="text-3xl font-bold text-slate-100">{partialCount}</div>
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
              <div className="text-3xl font-bold text-slate-100">{failedCount}</div>
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
          <div className="space-y-2">
            {active.map(job => (
              <div key={job.id} className="flex items-center gap-3 py-2 px-3 bg-blue-900/20 rounded-lg border border-blue-500/30">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-100 text-sm">{job.supplier_name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">File: {job.filename}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-600 w-10 text-right">
                    {job.progress}%
                  </span>
                  {isJobStuck(job) && (
                    <button
                      onClick={() => handleResumeJob(job.id)}
                      disabled={resuming.has(job.id)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded disabled:opacity-50"
                    >
                      {resuming.has(job.id) ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      Resume
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {successful.length > 0 && (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700 p-5">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">Successfully Imported Quotes</h3>
          <div className="space-y-2">
            {successful.map((job) => (
              <div key={job.id} className="flex items-center gap-3 py-2 px-3 hover:bg-slate-700/50 rounded-lg transition-colors">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-100 text-sm">{job.supplier_name}</span>
                    {job.is_latest && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">
                        Latest
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {job.result_data?.items?.length || 0} items • File: {job.filename} • Imported {formatDateTime(job.updated_at)}
                  </div>
                </div>
              </div>
            ))}
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
                  const itemCount = job.result_data?.items?.length || 0;
                  const failedChunks = job.error_message?.match(/(\d+) chunks? failed/)?.[1] || '0';

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
                        </div>
                        <button
                          onClick={() => handleResumeJob(job.id)}
                          disabled={resuming.has(job.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-yellow-700 bg-yellow-100 hover:bg-yellow-200 rounded disabled:opacity-50 border border-yellow-300"
                        >
                          {resuming.has(job.id) ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
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
                  const itemCount = job.result_data?.items?.length || 0;
                  const reason = itemCount === 0 && job.status === 'completed'
                    ? 'Parsed successfully but returned 0 line items'
                    : job.error_message || 'Could not extract tables';

                  return (
                    <div key={job.id} className="border border-red-500/30 rounded-lg p-3 bg-red-900/20">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <XCircle className="w-4 h-4 text-red-400" />
                            <span className="text-sm font-semibold text-slate-100">{job.supplier_name || 'Unknown Supplier'}</span>
                          </div>
                          <div className="text-xs text-slate-300 mb-1">
                            Reason: {reason}
                          </div>
                          <div className="text-xs text-slate-400">File: {job.filename}</div>
                        </div>
                        <button
                          onClick={() => handleResumeJob(job.id)}
                          disabled={resuming.has(job.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded disabled:opacity-50 border border-red-300"
                        >
                          {resuming.has(job.id) ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          Try Again
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
