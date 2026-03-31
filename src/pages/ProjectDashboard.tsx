import { useState, useEffect } from 'react';
import { FolderOpen, FileText, TrendingUp, AlertCircle, CheckCircle2, Circle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PROJECT_WORKFLOW_STEPS } from '../config/workflow';
import { useTrade } from '../lib/tradeContext';

interface ProjectDashboardProps {
  projectId: string;
  onQuotesImported?: () => void;
  onNavigateToMatrix?: () => void;
  onProjectDeleted?: () => void;
}

interface ProjectStats {
  quoteCount: number;
  selectedQuoteCount: number;
  totalValue: number;
  supplierCount: number;
  reportStatus: 'not_generated' | 'ready' | 'out_of_date';
  reportGeneratedAt?: string;
  hasCleanedData: boolean;
  scopeMatrixCompleted: boolean;
  equalisationCompleted: boolean;
}

export default function ProjectDashboard({
  projectId,
  onQuotesImported,
  onNavigateToMatrix,
  onProjectDeleted
}: ProjectDashboardProps) {
  const { currentTrade } = useTrade();
  const [stats, setStats] = useState<ProjectStats>({
    quoteCount: 0,
    selectedQuoteCount: 0,
    totalValue: 0,
    supplierCount: 0,
    reportStatus: 'not_generated',
    hasCleanedData: false,
    scopeMatrixCompleted: false,
    equalisationCompleted: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjectStats();
  }, [projectId, currentTrade]);

  // Reload stats when page becomes visible (user returns from another page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('[ProjectDashboard] Page visible, reloading stats...');
        loadProjectStats();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [projectId]);

  // Listen for manual refresh events
  useEffect(() => {
    const handleRefresh = () => {
      console.log('[ProjectDashboard] Manual refresh triggered');
      loadProjectStats();
    };

    window.addEventListener('refresh-dashboard', handleRefresh);
    return () => window.removeEventListener('refresh-dashboard', handleRefresh);
  }, [projectId, currentTrade]);

  const loadProjectStats = async () => {
    setLoading(true);
    try {
      console.log(`[ProjectDashboard] Loading stats for project ${projectId}, trade: ${currentTrade}`);

      const { data: quotes } = await supabase
        .from('quotes')
        .select('id, supplier_name, total_amount, is_selected, trade')
        .eq('project_id', projectId)
        .eq('trade', currentTrade);

      const quoteCount = quotes?.length || 0;
      const selectedQuoteCount = quotes?.filter(q => q.is_selected).length || 0;
      const totalValue = quotes?.reduce((sum, q) => sum + (q.total_amount || 0), 0) || 0;
      const supplierCount = new Set(quotes?.map(q => q.supplier_name)).size;

      console.log(`[ProjectDashboard] Loaded stats for ${currentTrade} - Total: ${quoteCount}, Selected: ${selectedQuoteCount}`);

      // Check if any quote has cleaned/processed items
      // Only query if we have quotes, otherwise skip to avoid .in([]) edge case
      let processedItems: any[] = [];
      if (quotes && quotes.length > 0) {
        const { data } = await supabase
          .from('quote_items')
          .select('id')
          .in('quote_id', quotes.map(q => q.id))
          .not('system_id', 'is', null)
          .limit(1);
        processedItems = data || [];
      }

      // Load project settings to check equalisation status
      const { data: settings } = await supabase
        .from('project_settings')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      // CRITICAL: Filter reports by current trade to prevent cross-trade contamination
      const { data: latestReport } = await supabase
        .from('award_reports')
        .select('id, generated_at, status')
        .eq('project_id', projectId)
        .eq('trade', currentTrade)
        .eq('status', 'ready')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // For trade isolation: workflow steps are only complete if THIS TRADE has quotes
      // If there are no quotes for this trade, none of the later steps can be complete
      const hasQuotesForTrade = quoteCount > 0;
      const hasProcessedData = processedItems.length > 0;

      // Read trade-scoped flags only. Legacy flat flags migrated by DB migration.
      const tradeSettings = settings?.settings?.[currentTrade];
      const getFlag = (flag: string): boolean => !!tradeSettings?.[flag];
      const hasEqualisation = hasQuotesForTrade && getFlag('last_equalisation_run');
      const hasScopeMatrix = hasProcessedData && getFlag('scope_matrix_completed');
      const hasReports = hasQuotesForTrade && !!latestReport;

      setStats({
        quoteCount,
        selectedQuoteCount,
        totalValue,
        supplierCount,
        reportStatus: hasReports ? 'ready' : 'not_generated',
        reportGeneratedAt: hasReports ? latestReport?.generated_at : undefined,
        hasCleanedData: hasProcessedData,
        // Only show as complete if this trade has data
        scopeMatrixCompleted: hasScopeMatrix,
        equalisationCompleted: hasEqualisation,
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

  // Determine workflow step completion
  const workflowSteps = [
    {
      id: 'import',
      name: 'Import Quotes',
      completed: stats.quoteCount > 0,
      description: `${stats.quoteCount} quote${stats.quoteCount === 1 ? '' : 's'} imported`
    },
    {
      id: 'select',
      name: 'Quote Select',
      completed: stats.selectedQuoteCount > 0,
      description: `${stats.selectedQuoteCount} quote${stats.selectedQuoteCount === 1 ? '' : 's'} selected`
    },
    {
      id: 'review',
      name: 'Review & Clean',
      completed: stats.hasCleanedData,
      description: stats.hasCleanedData ? 'Data cleaned and mapped' : 'Not started'
    },
    {
      id: 'intelligence',
      name: 'Quote Intelligence',
      completed: stats.hasCleanedData,
      description: stats.hasCleanedData ? 'Ready for analysis' : 'Complete Review & Clean first'
    },
    {
      id: 'scope',
      name: 'Scope Matrix',
      completed: stats.scopeMatrixCompleted,
      description: stats.scopeMatrixCompleted ? 'Scope analysis completed' : 'Not started'
    },
    {
      id: 'equalisation',
      name: 'Equalisation Analysis',
      completed: stats.equalisationCompleted,
      description: stats.equalisationCompleted ? 'Equalisation completed' : 'Not started'
    },
    {
      id: 'reports',
      name: 'Award Reports',
      completed: stats.reportStatus === 'ready',
      description: stats.reportStatus === 'ready' ? 'Reports generated' : 'Not generated'
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800/60 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="text-blue-400" size={24} />
            <h3 className="text-lg font-semibold text-white">Quotes</h3>
          </div>
          <p className="text-3xl font-bold text-white">{stats.quoteCount}</p>
          <p className="text-sm text-slate-400 mt-1">
            from {stats.supplierCount} {stats.supplierCount === 1 ? 'supplier' : 'suppliers'}
          </p>
        </div>

        <div className="bg-slate-800/60 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="text-green-400" size={24} />
            <h3 className="text-lg font-semibold text-white">Total Value</h3>
          </div>
          <p className="text-3xl font-bold text-white">
            ${stats.totalValue.toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-sm text-slate-400 mt-1">Combined quote value</p>
        </div>

        <div className="bg-slate-800/60 rounded-lg p-6 border border-slate-700">
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
            <p className="text-sm text-slate-400 mt-1">
              Last generated {new Date(stats.reportGeneratedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      <div className="bg-slate-800/60 rounded-xl p-8 border border-slate-700/50">
        <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-orange-500"></div>
          Workflow Progress
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workflowSteps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                step.completed
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-slate-800/50 border-slate-700/50'
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {step.completed ? (
                  <CheckCircle2 className="text-emerald-400" size={24} />
                ) : (
                  <Circle className="text-slate-500" size={24} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-slate-500">STEP {index + 1}</span>
                </div>
                <h4 className={`text-base font-semibold mb-1 ${
                  step.completed ? 'text-emerald-300' : 'text-slate-300'
                }`}>
                  {step.name}
                </h4>
                <p className="text-sm text-slate-400">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-800/60 rounded-lg p-8 border border-slate-700">
        <h3 className="text-xl font-semibold text-white mb-4">Getting Started</h3>
        <div className="space-y-3 text-slate-300">
          <p>1. Import quotes from your suppliers using the Import Quotes tab</p>
          <p>2. Select which quotes you want to process in Quote Select</p>
          <p>3. Review and clean the imported data</p>
          <p>4. Analyze coverage with the Scope Matrix</p>
          <p>5. Perform Equalisation Analysis to normalize comparisons</p>
          <p>6. Generate award reports to compare suppliers</p>
        </div>
      </div>
    </div>
  );
}
