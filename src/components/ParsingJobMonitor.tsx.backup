import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ParsingJob {
  id: string;
  supplier_name: string;
  file_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error_message: string | null;
  parsed_lines: any[] | null;
  quote_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ParsingJobMonitorProps {
  projectId: string;
  onJobCompleted?: (jobId: string, quoteId: string) => void;
}

export default function ParsingJobMonitor({ projectId, onJobCompleted }: ParsingJobMonitorProps) {
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
  }, [projectId, jobs]);

  const loadJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('parsing_jobs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error && data) {
        setJobs(data as ParsingJob[]);
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

    return minutesSinceUpdate > 3;
  };

  const handleResumeJob = async (jobId: string) => {
    setResuming(prev => new Set(prev).add(jobId));

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/resume_parsing_job`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-gray-400" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Waiting to start';
      case 'processing':
        return 'Processing';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-100 text-gray-700';
      case 'processing':
        return 'bg-blue-100 text-blue-700';
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
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

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Background Parsing Jobs</h3>
      <div className="space-y-2">
        {jobs.map(job => (
          <div
            key={job.id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
          >
            <div className="flex items-center gap-3 flex-1">
              {getStatusIcon(job.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {job.supplier_name}
                  </p>
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(
                      job.status
                    )}`}
                  >
                    {getStatusText(job.status)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">{job.file_name}</p>
                {job.error_message && (
                  <p className={`text-xs mt-1 ${job.status === 'completed' ? 'text-orange-600' : 'text-red-600'}`}>
                    {job.error_message}
                  </p>
                )}
              </div>
            </div>

            {(job.status === 'processing' || job.status === 'pending') && (
              <div className="flex items-center gap-2 ml-4">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
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
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    title="This job appears stuck. Click to recover and complete with partial data."
                  >
                    {resuming.has(job.id) ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    <span>Resume</span>
                  </button>
                )}
              </div>
            )}

            {job.status === 'completed' && job.parsed_lines && (
              <div className="flex items-center gap-2 ml-4">
                <span className="text-xs text-gray-600">
                  {job.parsed_lines.length} items
                </span>
                {job.error_message && job.error_message.includes('chunks failed') && (
                  <button
                    onClick={() => handleResumeJob(job.id)}
                    disabled={resuming.has(job.id)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Some chunks failed. Click to retry and potentially recover more items."
                  >
                    {resuming.has(job.id) ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    <span>Retry Failed</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
