import { useState, useEffect } from 'react';
import { FolderOpen, FileText, TrendingUp, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ProjectDashboardProps {
  projectId: string;
  onQuotesImported?: () => void;
  onNavigateToMatrix?: () => void;
  onProjectDeleted?: () => void;
}

interface ProjectStats {
  quoteCount: number;
  totalValue: number;
  supplierCount: number;
  reportStatus: 'not_generated' | 'ready' | 'out_of_date';
  reportGeneratedAt?: string;
}

export default function ProjectDashboard({
  projectId,
  onQuotesImported,
  onNavigateToMatrix,
  onProjectDeleted
}: ProjectDashboardProps) {
  const [stats, setStats] = useState<ProjectStats>({
    quoteCount: 0,
    totalValue: 0,
    supplierCount: 0,
    reportStatus: 'not_generated',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjectStats();
  }, [projectId]);

  const loadProjectStats = async () => {
    setLoading(true);
    try {
      const { data: quotes } = await supabase
        .from('quotes')
        .select('id, supplier_name, total_amount')
        .eq('project_id', projectId);

      const quoteCount = quotes?.length || 0;
      const totalValue = quotes?.reduce((sum, q) => sum + (q.total_amount || 0), 0) || 0;
      const supplierCount = new Set(quotes?.map(q => q.supplier_name)).size;

      const { data: latestReport } = await supabase
        .from('award_reports')
        .select('id, generated_at, status')
        .eq('project_id', projectId)
        .eq('status', 'ready')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setStats({
        quoteCount,
        totalValue,
        supplierCount,
        reportStatus: latestReport ? 'ready' : 'not_generated',
        reportGeneratedAt: latestReport?.generated_at,
      });
    } catch (error) {
      console.error('Error loading project stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading project dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="text-blue-400" size={24} />
            <h3 className="text-lg font-semibold text-white">Quotes</h3>
          </div>
          <p className="text-3xl font-bold text-white">{stats.quoteCount}</p>
          <p className="text-sm text-gray-400 mt-1">
            from {stats.supplierCount} {stats.supplierCount === 1 ? 'supplier' : 'suppliers'}
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="text-green-400" size={24} />
            <h3 className="text-lg font-semibold text-white">Total Value</h3>
          </div>
          <p className="text-3xl font-bold text-white">
            ${stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-sm text-gray-400 mt-1">Combined quote value</p>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
          <div className="flex items-center gap-3 mb-2">
            <FolderOpen className="text-purple-400" size={24} />
            <h3 className="text-lg font-semibold text-white">Report Status</h3>
          </div>
          <div className="flex items-center gap-2">
            {stats.reportStatus === 'ready' ? (
              <>
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                <span className="text-lg font-semibold text-green-400">Ready</span>
              </>
            ) : (
              <>
                <AlertCircle className="text-amber-400" size={18} />
                <span className="text-lg font-semibold text-amber-400">Not Generated</span>
              </>
            )}
          </div>
          {stats.reportGeneratedAt && (
            <p className="text-sm text-gray-400 mt-1">
              Last generated {new Date(stats.reportGeneratedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white/5 backdrop-blur-sm rounded-lg p-8 border border-white/10">
        <h3 className="text-xl font-semibold text-white mb-4">Getting Started</h3>
        <div className="space-y-3 text-gray-300">
          <p>1. Import quotes from your suppliers using the Import tab</p>
          <p>2. Review and clean the imported data</p>
          <p>3. Analyze quotes using the Scope Matrix and other analysis tools</p>
          <p>4. Generate award reports to compare suppliers</p>
        </div>
      </div>
    </div>
  );
}
