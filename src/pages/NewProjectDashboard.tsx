import { useState, useEffect } from 'react';
import {
  Plus,
  FolderOpen,
  X,
  FileText,
  Building2,
  Clock,
  CheckCircle,
  Circle,
  ArrowRight,
  Layers,
  Target,
  Grid3x3,
  List
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { supabase } from '../lib/supabase';
import { useOrganisation } from '../lib/organisationContext';
import { PROJECT_WORKFLOW_STEPS, TOTAL_WORKFLOW_STEPS } from '../config/workflow';

interface NewProjectDashboardProps {
  projectId: string | null;
  projectName?: string;
  allProjects: any[];
  onProjectSelect: (id: string) => void;
  onCreateProject: (name: string, client: string, reference: string) => Promise<string | null>;
  onNavigateToQuotes: () => void;
  onNavigateToMatrix: () => void;
  onNavigateToReports: () => void;
  dashboardMode?: 'original' | 'revisions';
}

interface StepStatus {
  id: string;
  name: string;
  status: 'not_started' | 'in_progress' | 'completed';
  route: string;
}

interface ProjectStats {
  quoteCount: number;
  supplierCount: number;
  systemsDetected: number;
  systemsCovered: number;
  coveragePercent: number;
  completedSteps: number;
  totalSteps: number;
  hasQuotes: boolean;
  hasReviewedItems: boolean;
  hasScopeMatrix: boolean;
  hasReports: boolean;
}

export default function NewProjectDashboard({
  projectId,
  projectName,
  allProjects,
  onProjectSelect,
  onCreateProject,
  onNavigateToQuotes,
  onNavigateToMatrix,
  onNavigateToReports,
  dashboardMode = 'original',
}: NewProjectDashboardProps) {
  const { currentOrganisation } = useOrganisation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectClient, setNewProjectClient] = useState('');
  const [newProjectReference, setNewProjectReference] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [stats, setStats] = useState<ProjectStats>({
    quoteCount: 0,
    supplierCount: 0,
    systemsDetected: 0,
    systemsCovered: 0,
    coveragePercent: 0,
    completedSteps: 0,
    totalSteps: TOTAL_WORKFLOW_STEPS,
    hasQuotes: false,
    hasReviewedItems: false,
    hasScopeMatrix: false,
    hasReports: false,
  });
  const [steps, setSteps] = useState<StepStatus[]>([]);

  useEffect(() => {
    loadUserData();
    if (projectId) {
      loadProjectData();
    } else {
      setLoading(false);
    }
  }, [projectId, dashboardMode]);

  const loadUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.full_name) {
        setUserName(user.user_metadata.full_name);
      } else if (user?.email) {
        // Extract first name from email if full_name is not available
        const emailName = user.email.split('@')[0];
        const formattedName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
        setUserName(formattedName);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const loadProjectData = async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      // Filter quotes based on dashboard mode
      let quotesQuery = supabase
        .from('quotes')
        .select('id, supplier_name, revision_number')
        .eq('project_id', projectId);

      const { data: allQuotes, error: quotesError } = await quotesQuery;

      if (quotesError) {
        console.error('Error loading quotes:', quotesError);
      }

      // Filter quotes by revision number, treating NULL as revision 1
      const quotes = allQuotes?.filter(q => {
        const revisionNumber = q.revision_number ?? 1; // Treat NULL as revision 1
        if (dashboardMode === 'original') {
          return revisionNumber === 1;
        } else {
          return revisionNumber > 1;
        }
      }) || [];

      console.log(`Dashboard mode: ${dashboardMode}, Total quotes: ${allQuotes?.length || 0}, Filtered quotes: ${quotes.length}`);

      const quoteCount = quotes?.length || 0;
      const supplierCount = new Set(quotes?.map(q => q.supplier_name)).size;

      const { data: lineItems } = await supabase
        .from('quote_items')
        .select('system_id, quote_id')
        .in('quote_id', quotes?.map(q => q.id) || []);

      const allSystemIds = lineItems?.filter(item => item.system_id).map(item => item.system_id) || [];
      const uniqueSystems = new Set(allSystemIds);
      const systemsDetected = uniqueSystems.size;

      const systemsWithQuotes = new Set(
        lineItems?.filter(item => item.system_id).map(item => item.system_id) || []
      );
      const systemsCovered = systemsWithQuotes.size;
      const coveragePercent = systemsDetected > 0
        ? Math.round((systemsCovered / systemsDetected) * 100)
        : 0;

      const { data: settings } = await supabase
        .from('project_settings')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      const { data: reportsList } = await supabase
        .from('award_reports')
        .select('id')
        .eq('project_id', projectId)
        .eq('status', 'ready');

      const newStats: ProjectStats = {
        quoteCount,
        supplierCount,
        systemsDetected,
        systemsCovered,
        coveragePercent,
        completedSteps: 0,
        totalSteps: TOTAL_WORKFLOW_STEPS,
        hasQuotes: quoteCount > 0,
        hasReviewedItems: settings?.settings?.review_clean_completed || false,
        hasScopeMatrix: settings?.settings?.scope_matrix_completed || false,
        hasReports: (reportsList?.length || 0) > 0,
      };

      setStats(newStats);
      updateStepStatuses(newStats);
    } catch (error) {
      console.error('Error loading project data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStepStatuses = (projectStats: ProjectStats) => {
    const updatedSteps: StepStatus[] = PROJECT_WORKFLOW_STEPS.map(step => {
      let status: 'not_started' | 'in_progress' | 'completed' = 'not_started';

      switch (step.id) {
        case 'import':
          status = projectStats.hasQuotes ? 'completed' : 'not_started';
          break;
        case 'review':
          status = projectStats.hasReviewedItems ? 'completed' : projectStats.hasQuotes ? 'in_progress' : 'not_started';
          break;
        case 'matrix':
          status = projectStats.hasScopeMatrix ? 'completed' : projectStats.hasReviewedItems ? 'in_progress' : 'not_started';
          break;
        case 'intelligence':
          status = projectStats.hasReviewedItems ? 'completed' : 'not_started';
          break;
        case 'reports':
          status = projectStats.hasReports ? 'completed' : 'not_started';
          break;
      }

      return {
        id: step.id,
        name: step.name,
        status,
        route: step.route
      };
    });

    const completedCount = updatedSteps.filter(s => s.status === 'completed').length;
    setStats(prev => ({ ...prev, completedSteps: completedCount }));
    setSteps(updatedSteps);
  };

  const handleNavigateToStep = (route: string) => {
    switch (route) {
      case 'quotes':
        onNavigateToQuotes();
        break;
      case 'scope-matrix':
        onNavigateToMatrix();
        break;
      case 'reports':
        onNavigateToReports();
        break;
      default:
        console.log('Navigation to', route, 'not yet implemented');
    }
  };

  const handleCreateClick = () => {
    setShowCreateModal(true);
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setNewProjectName('');
    setNewProjectClient('');
    setNewProjectReference('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    const projectId = await onCreateProject(newProjectName, newProjectClient, newProjectReference);
    setIsCreating(false);

    if (projectId) {
      handleCloseModal();
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)] p-6">
      <div className="max-w-7xl mx-auto px-6 py-6 rounded-xl border border-slate-700">
        {projectId && (
          <div className="mb-3">
            <div className="text-xs text-slate-400 mb-1">Projects &gt; {projectName}</div>
          </div>
        )}
        {!projectId && userName && (
          <div className="mb-4">
            <h1 className="text-2xl font-semibold text-slate-100">
              Welcome back, {userName}
            </h1>
          </div>
        )}
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title={projectId ? projectName || 'Project Dashboard' : 'All Projects'}
            subtitle={projectId ? 'Manage your quote analysis workflow' : 'Select or create a project'}
          />
          {!projectId && (
            <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg border border-slate-700 p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
                }`}
                title="Grid view"
              >
                <Grid3x3 size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
                }`}
                title="List view"
              >
                <List size={18} />
              </button>
            </div>
          )}
        </div>

        {!projectId ? (
          <div className="mt-6">
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-3'}>
              {viewMode === 'grid' ? (
                <>
                  <button
                    onClick={handleCreateClick}
                    className="p-6 border-2 border-dashed border-slate-700 rounded-xl hover:border-blue-500 hover:bg-slate-800/50 transition-colors"
                  >
                    <Plus className="mx-auto mb-2 text-slate-400" size={32} />
                    <div className="font-medium text-slate-200">Create New Project</div>
                  </button>

                  {allProjects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => onProjectSelect(project.id)}
                      className="p-6 bg-slate-800/60 border border-slate-700 rounded-xl hover:border-blue-500 hover:shadow-lg hover:bg-slate-800/80 transition-all text-left"
                    >
                      <FolderOpen className="mb-2 text-blue-400" size={24} />
                      <div className="font-semibold text-slate-100 mb-1">{project.name}</div>
                      <div className="text-sm text-slate-400">{project.client_reference}</div>
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <button
                    onClick={handleCreateClick}
                    className="w-full flex items-center gap-4 p-4 border-2 border-dashed border-slate-700 rounded-xl hover:border-blue-500 hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="w-12 h-12 flex items-center justify-center bg-slate-700/50 rounded-lg">
                      <Plus className="text-slate-400" size={24} />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-slate-200">Create New Project</div>
                      <div className="text-sm text-slate-400">Start a new quote analysis project</div>
                    </div>
                  </button>

                  {allProjects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => onProjectSelect(project.id)}
                      className="w-full flex items-center gap-4 p-4 bg-slate-800/60 border border-slate-700 rounded-xl hover:border-blue-500 hover:shadow-lg hover:bg-slate-800/80 transition-all text-left group"
                    >
                      <div className="w-12 h-12 flex items-center justify-center bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                        <FolderOpen className="text-blue-400" size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-100 mb-0.5">{project.name}</div>
                        <div className="text-sm text-slate-400">{project.client_reference || 'No client reference'}</div>
                      </div>
                      <ArrowRight className="text-slate-500 group-hover:text-blue-400 transition-colors flex-shrink-0" size={20} />
                    </button>
                  ))}
                </>
              )}
            </div>

            {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Create New Project</h2>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 mb-1">
                      Project Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="projectName"
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                      placeholder="Enter project name"
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <label htmlFor="projectClient" className="block text-sm font-medium text-gray-700 mb-1">
                      Client Name
                    </label>
                    <input
                      id="projectClient"
                      type="text"
                      value={newProjectClient}
                      onChange={(e) => setNewProjectClient(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                      placeholder="Enter client name"
                    />
                  </div>

                  <div>
                    <label htmlFor="projectReference" className="block text-sm font-medium text-gray-700 mb-1">
                      Project Reference
                    </label>
                    <input
                      id="projectReference"
                      type="text"
                      value={newProjectReference}
                      onChange={(e) => setNewProjectReference(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                      placeholder="Enter project reference"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                    disabled={isCreating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    disabled={isCreating || !newProjectName.trim()}
                  >
                    {isCreating ? 'Creating...' : 'Create Project'}
                  </button>
                </div>
              </form>
            </div>
          </div>
            )}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-400">Loading project dashboard...</div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between py-2 px-4 bg-white border-b border-gray-200">
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <Building2 size={14} />
                <span>{currentOrganisation?.name || 'Loading...'}</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-500">
                <Clock size={13} />
                <span>Last updated: {new Date().toLocaleDateString()}</span>
              </div>
            </div>

            <div className="bg-slate-800/60 rounded-lg border border-slate-700 p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="flex items-center gap-3 py-2 px-3 bg-slate-700/50 rounded-lg">
                  <div className="p-2 bg-blue-500/20 rounded">
                    <FileText className="text-blue-400" size={18} />
                  </div>
                  <div>
                    <div className="text-[13px] text-slate-400 font-medium">Quotes Imported</div>
                    <div className="text-2xl font-bold text-slate-100">{stats.quoteCount}</div>
                    <div className="text-[11px] text-slate-400">
                      from {stats.supplierCount} {stats.supplierCount === 1 ? 'supplier' : 'suppliers'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 py-2 px-3 bg-slate-700/50 rounded-lg">
                  <div className="p-2 bg-violet-500/20 rounded">
                    <Layers className="text-violet-400" size={18} />
                  </div>
                  <div>
                    <div className="text-[13px] text-slate-400 font-medium">Systems Detected</div>
                    <div className="text-2xl font-bold text-slate-100">{stats.systemsDetected}</div>
                    <div className="text-[11px] text-slate-400">Unique systems in project</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 py-2 px-3 bg-slate-700/50 rounded-lg">
                  <div className={`p-2 rounded ${
                    stats.coveragePercent >= 80 ? 'bg-green-500/20' :
                    stats.coveragePercent >= 50 ? 'bg-amber-500/20' :
                    'bg-red-500/20'
                  }`}>
                    <Target className={
                      stats.coveragePercent >= 80 ? 'text-green-400' :
                      stats.coveragePercent >= 50 ? 'text-amber-400' :
                      'text-red-400'
                    } size={18} />
                  </div>
                  <div>
                    <div className="text-[13px] text-slate-400 font-medium">Coverage</div>
                    <div className={`text-2xl font-bold ${
                      stats.coveragePercent >= 80 ? 'text-green-400' :
                      stats.coveragePercent >= 50 ? 'text-amber-400' :
                      'text-red-400'
                    }`}>
                      {stats.coveragePercent}%
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {stats.systemsCovered}/{stats.systemsDetected} systems covered
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 py-2 px-3 bg-slate-700/50 rounded-lg">
                  <div className="p-2 bg-blue-500/20 rounded">
                    <CheckCircle className="text-blue-400" size={18} />
                  </div>
                  <div>
                    <div className="text-[13px] text-slate-400 font-medium">Progress</div>
                    <div className="text-2xl font-bold text-slate-100">
                      {stats.completedSteps}/{stats.totalSteps}
                    </div>
                    <div className="text-[11px] text-slate-400">Steps completed</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/60 rounded-lg border border-slate-700">
              <div className="px-4 py-3 border-b border-slate-700">
                <h2 className="text-[20px] font-semibold text-slate-100">Project Workflow</h2>
              </div>
              <div>
                {steps.map((step, index) => {
                  const isCompleted = step.status === 'completed';
                  const isClickable = !isCompleted;

                  return (
                    <div
                      key={step.id}
                      onClick={isClickable ? () => handleNavigateToStep(step.route) : undefined}
                      className={`w-full flex items-center gap-3 py-3 px-4 border-b border-slate-700 last:border-b-0 ${
                        isClickable ? 'cursor-pointer hover:bg-slate-700/50 group' : 'cursor-default'
                      } transition-colors`}
                    >
                      {isCompleted ? (
                        <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
                      ) : (
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-[11px] font-semibold text-slate-300 group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors flex-shrink-0">
                          {index + 1}
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {step.status === 'in_progress' ? (
                          <Circle className="text-blue-400 fill-blue-900/20 flex-shrink-0" size={18} />
                        ) : step.status === 'not_started' ? (
                          <Circle className="text-slate-500 flex-shrink-0" size={18} />
                        ) : null}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-100 text-[15px]">{step.name}</div>
                          <div className="text-[11px] text-slate-400 capitalize">{step.status.replace('_', ' ')}</div>
                        </div>
                      </div>
                      {isClickable && (
                        <ArrowRight className="text-slate-500 group-hover:text-blue-400 transition-colors flex-shrink-0" size={14} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
