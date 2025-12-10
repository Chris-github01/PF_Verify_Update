import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Sparkles, AlertTriangle, X } from 'lucide-react';
import { isImpersonating, stopImpersonation } from './lib/admin/adminApi';
import TradeUpsellBanner from './components/TradeUpsellBanner';
import Sidebar, { SidebarTab } from './components/Sidebar';
import DashboardHeader from './components/DashboardHeader';
import AppBar from './components/AppBar';
import { AppShell } from './components/layout/AppShell';
import NewProjectDashboard from './pages/NewProjectDashboard';
import EnhancedImportQuotes from './pages/EnhancedImportQuotes';
import ReviewClean from './pages/ReviewClean';
import QuoteIntelligence from './pages/QuoteIntelligence';
import ScopeMatrix from './pages/ScopeMatrix';
import Equalisation from './pages/Equalisation';
import ContractManager from './pages/ContractManager';
import EnhancedReportsHub from './pages/EnhancedReportsHub';
import ProjectReportPage from './pages/ProjectReportPage';
import InsightsDashboard from './pages/InsightsDashboard';
import SystemCheck from './pages/SystemCheck';
import CopilotAudit from './pages/CopilotAudit';
import Settings from './pages/Settings';
import Toast, { ToastType } from './components/Toast';
import ToastContainer from './components/ToastContainer';
import AppFooter from './components/AppFooter';
import CopilotDrawer from './components/CopilotDrawer';
import Login from './pages/Login';
import LandingPage from './pages/LandingPage';
import Pricing from './pages/Pricing';
import ModeSelector from './pages/ModeSelector';
import OrganisationPicker from './pages/OrganisationPicker';
import OrganisationSettings from './pages/OrganisationSettings';
import AdminApp from './pages/AdminApp';
import DemoLogin from './pages/DemoLogin';
import { supabase } from './lib/supabase';
import { OrganisationProvider, useOrganisation } from './lib/organisationContext';
import { AdminProvider, useAdmin } from './lib/adminContext';
import { toastStore } from './lib/toastStore';
import type { Session } from '@supabase/supabase-js';

interface ProjectInfo {
  id: string;
  name: string;
  client: string | null;
  reference: string | null;
}

export type DashboardMode = 'original' | 'revisions';

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showLanding, setShowLanding] = useState(true);
  const [showPricing, setShowPricing] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'admin' | 'app' | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>('dashboard');
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>('original');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [showReportsHub, setShowReportsHub] = useState(false);
  const [orgLicensing, setOrgLicensing] = useState<{ licensed_trades: string[]; subscription_status: string } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);
  const { currentOrganisation, organisations, loading: orgLoading, setCurrentOrganisation } = useOrganisation();
  const { isMasterAdmin, loading: adminLoading } = useAdmin();
  const initializingRef = useRef(false);

  useEffect(() => {
    const loadTimeout = setTimeout(() => {
      if (authLoading) {
        console.warn('⚠️ [App] Auth loading timeout after 5s - forcing completion');
        setAuthLoading(false);
      }
    }, 5000);

    console.log('🔐 [App] Initializing authentication...');

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('🔐 [App] Session loaded:', {
        hasSession: !!session,
        userId: session?.user?.id,
        email: session?.user?.email,
        error: error?.message
      });
      setSession(session);
      setAuthLoading(false);
      clearTimeout(loadTimeout);
    }).catch((error) => {
      console.error('❌ [App] Error loading session:', error);
      setAuthLoading(false);
      clearTimeout(loadTimeout);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('🔄 [App] Auth state changed:', {
        event: _event,
        hasSession: !!session,
        userId: session?.user?.id
      });

      if (_event === 'TOKEN_REFRESHED') {
        console.log('🔄 [App] Token refreshed - skipping re-initialization');
        setSession(session);
        return;
      }

      (async () => {
        setSession(session);
        if (_event === 'SIGNED_OUT') {
          setShowLanding(true);
          setSelectedMode(null);
          setProjectId(null);
          setProjectInfo(null);
          setAllProjects([]);
          setActiveTab('dashboard');
          localStorage.removeItem('passivefire_current_project_id');
          localStorage.removeItem('passivefire_current_organisation_id');
        }
      })();
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(loadTimeout);
    };
  }, []);

  useEffect(() => {
    if (!authLoading && session) {
      initializeApp();
    }
  }, [authLoading, session]);

  useEffect(() => {
    if (currentOrganisation) {
      initializeApp();
      loadOrgLicensing();
    }
  }, [currentOrganisation]);

  const loadOrgLicensing = async () => {
    if (!currentOrganisation) return;

    try {
      const { data, error } = await supabase
        .from('organisations')
        .select('licensed_trades, subscription_status')
        .eq('id', currentOrganisation.id)
        .single();

      if (!error && data) {
        setOrgLicensing({
          licensed_trades: data.licensed_trades || [],
          subscription_status: data.subscription_status || 'trial'
        });
      }
    } catch (err) {
      console.error('Failed to load org licensing:', err);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadProjectInfo(projectId);
    }
  }, [projectId]);


  useEffect(() => {
    if (allProjects.length === 0 && currentOrganisation) {
      loadAllProjects();
    }
  }, [currentOrganisation]);

  const initializeApp = async () => {
    if (initializingRef.current) {
      console.log('🔄 [App] Already initializing, skipping duplicate call');
      return;
    }

    initializingRef.current = true;
    setLoading(true);

    try {
      // Load all projects first
      await loadAllProjects();

      // Try to restore the last selected project from localStorage
      const savedProjectId = localStorage.getItem('passivefire_current_project_id');
      if (savedProjectId && currentOrganisation) {
        // Verify the project exists and belongs to this organisation
        const { data: project } = await supabase
          .from('projects')
          .select('id, name, client, reference')
          .eq('id', savedProjectId)
          .eq('organisation_id', currentOrganisation.id)
          .maybeSingle();

        if (project) {
          setProjectId(project.id);
          setProjectInfo(project);
        } else {
          // Project doesn't exist or doesn't belong to this org, clear it
          localStorage.removeItem('passivefire_current_project_id');
          setProjectId(null);
          setProjectInfo(null);
        }
      }
    } finally {
      setLoading(false);
      initializingRef.current = false;
    }
  };

  const handleProjectSelect = async (id: string) => {
    setProjectId(id);
    setShowReportsHub(false);
    localStorage.setItem('passivefire_current_project_id', id);

    await supabase
      .from('projects')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', id);

    await loadProjectInfo(id);
  };

  const handleCreateProject = async (name: string, client: string, reference: string) => {
    if (!currentOrganisation || !session?.user) {
      setToast({ message: 'Must be logged in to create a project', type: 'error' });
      return null;
    }

    try {
      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          organisation_id: currentOrganisation.id,
          name,
          client: client || null,
          reference: reference || null,
          status: 'active',
          created_by_user_id: session.user.id,
          user_id: session.user.id,
        })
        .select()
        .single();

      if (error) throw error;

      await loadAllProjects();

      setToast({ message: `Project "${name}" created successfully`, type: 'success' });

      await handleProjectSelect(project.id);

      return project.id;
    } catch (error) {
      console.error('Error creating project:', error);
      setToast({ message: 'Failed to create project', type: 'error' });
      return null;
    }
  };

  const loadProjectInfo = async (id: string) => {
    const { data } = await supabase
      .from('projects')
      .select('id, name, client, reference')
      .eq('id', id)
      .maybeSingle();

    if (data) {
      setProjectInfo(data);
    }
  };

  const loadAllProjects = async () => {
    if (!currentOrganisation) return;

    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name, client, reference, updated_at, approved_quote_id')
      .eq('organisation_id', currentOrganisation.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error loading projects:', error);
      return;
    }

    if (projects) {
      const projectsWithReportStatus = await Promise.all(
        projects.map(async (p) => {
          const { data: quotes } = await supabase
            .from('quotes')
            .select('id, status')
            .eq('project_id', p.id);

          const hasQuotes = quotes && quotes.length > 0;
          const allQuotesProcessed = quotes && quotes.every(q => q.status === 'processed' || q.status === 'ready');

          const { data: quoteItems } = await supabase
            .from('quote_items')
            .select('id, system_id, quote_id')
            .in('quote_id', quotes?.map(q => q.id) || []);

          const hasMappedItems = quoteItems && quoteItems.some(item => item.system_id);

          const workflowComplete = hasQuotes && allQuotesProcessed && hasMappedItems;

          const { data: latestReport } = await supabase
            .from('award_reports')
            .select('id, generated_at, status, result_json')
            .eq('project_id', p.id)
            .eq('status', 'ready')
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const quotesCount = latestReport?.result_json?.awardSummary?.suppliers?.length || 0;
          const coveragePercent = latestReport?.result_json?.awardSummary?.suppliers?.[0]?.coveragePercent || 0;

          return {
            id: p.id,
            name: p.name,
            client_reference: p.client || p.reference || 'No client',
            updated_at: p.updated_at,
            has_report: !!latestReport,
            report_id: latestReport?.id,
            report_generated_at: latestReport?.generated_at,
            report_quotes_count: quotesCount,
            report_coverage_percent: Math.round(coveragePercent),
            workflow_complete: workflowComplete,
          };
        })
      );

      setAllProjects(projectsWithReportStatus);
    }
  };


  const handleNavigationGuard = (tab: SidebarTab) => {
    if (!projectId) {
      setToast({ message: 'Select or create a project first.', type: 'error' });
      return false;
    }
    return true;
  };

  const handleCopilotNavigate = (path: string, navProjectId?: string) => {
    const targetProjectId = navProjectId || projectId;

    if (targetProjectId) {
      setProjectId(targetProjectId);
    }

    switch (path) {
      case 'dashboard':
        setActiveTab('dashboard');
        break;
      case 'quotes':
        setActiveTab('quotes');
        break;
      case 'review':
        setActiveTab('review');
        break;
      case 'quoteintel':
        setActiveTab('quoteintel');
        break;
      case 'scope':
        setActiveTab('scope');
        break;
      case 'reports':
      case 'award':
        setActiveTab('reports');
        break;
      case 'contract':
      case 'basetracker':
        setActiveTab('contract');
        break;
      case 'insights':
        setActiveTab('insights');
        break;
      case 'settings':
        setActiveTab('settings');
        break;
      default:
        setActiveTab('dashboard');
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <NewProjectDashboard
          projectId={projectId}
          projectName={projectInfo?.name}
          allProjects={allProjects}
          onProjectSelect={handleProjectSelect}
          onCreateProject={handleCreateProject}
          onNavigateToQuotes={() => {
            if (handleNavigationGuard('quotes')) setActiveTab('quotes');
          }}
          onNavigateToMatrix={() => {
            if (handleNavigationGuard('scope')) setActiveTab('scope');
          }}
          onNavigateToReports={() => {
            if (handleNavigationGuard('reports')) setActiveTab('reports');
          }}
          dashboardMode={dashboardMode}
        />;

      case 'quotes':
        if (!projectId) {
          return <NewProjectDashboard
            projectId={null}
            projectName={undefined}
            allProjects={allProjects}
            onProjectSelect={handleProjectSelect}
            onCreateProject={handleCreateProject}
            onNavigateToQuotes={() => {
              if (handleNavigationGuard('quotes')) setActiveTab('quotes');
            }}
            onNavigateToMatrix={() => {
              if (handleNavigationGuard('scope')) setActiveTab('scope');
            }}
            onNavigateToReports={() => {
              if (handleNavigationGuard('reports')) setActiveTab('reports');
            }}
            dashboardMode={dashboardMode}
          />;
        }
        return <EnhancedImportQuotes
          projectId={projectId}
          onQuotesImported={() => {}}
          onNavigateToDashboard={() => setActiveTab('dashboard')}
          onNavigateToNext={() => setActiveTab('review')}
          dashboardMode={dashboardMode}
        />;

      case 'review':
        if (!projectId) {
          return <NewProjectDashboard
            projectId={null}
            projectName={undefined}
            allProjects={allProjects}
            onProjectSelect={handleProjectSelect}
            onCreateProject={handleCreateProject}
            onNavigateToQuotes={() => {
              if (handleNavigationGuard('quotes')) setActiveTab('quotes');
            }}
            onNavigateToMatrix={() => {
              if (handleNavigationGuard('scope')) setActiveTab('scope');
            }}
            onNavigateToReports={() => {
              if (handleNavigationGuard('reports')) setActiveTab('reports');
            }}
            dashboardMode={dashboardMode}
          />;
        }
        return <ReviewClean
          projectId={projectId}
          onNavigateBack={() => setActiveTab('quotes')}
          onNavigateNext={() => setActiveTab('quoteintel')}
          dashboardMode={dashboardMode}
        />;


      case 'quoteintel':
        if (!projectId) {
          return <NewProjectDashboard
            projectId={null}
            projectName={undefined}
            allProjects={allProjects}
            onProjectSelect={handleProjectSelect}
            onCreateProject={handleCreateProject}
            onNavigateToQuotes={() => {
              if (handleNavigationGuard('quotes')) setActiveTab('quotes');
            }}
            onNavigateToMatrix={() => {
              if (handleNavigationGuard('scope')) setActiveTab('scope');
            }}
            onNavigateToReports={() => {
              if (handleNavigationGuard('reports')) setActiveTab('reports');
            }}
            dashboardMode={dashboardMode}
          />;
        }
        return <QuoteIntelligence
          projectId={projectId}
          onNavigateBack={() => setActiveTab('review')}
          onNavigateNext={() => setActiveTab('scope')}
          dashboardMode={dashboardMode}
          onQuotesSelected={setSelectedQuoteIds}
        />;

      case 'scope':
        if (!projectId) {
          return <NewProjectDashboard
            projectId={null}
            projectName={undefined}
            allProjects={allProjects}
            onProjectSelect={handleProjectSelect}
            onCreateProject={handleCreateProject}
            onNavigateToQuotes={() => {
              if (handleNavigationGuard('quotes')) setActiveTab('quotes');
            }}
            onNavigateToMatrix={() => {
              if (handleNavigationGuard('scope')) setActiveTab('scope');
            }}
            onNavigateToReports={() => {
              if (handleNavigationGuard('reports')) setActiveTab('reports');
            }}
            dashboardMode={dashboardMode}
          />;
        }
        return <ScopeMatrix
          projectId={projectId}
          onNavigateBack={() => setActiveTab('quoteintel')}
          onNavigateNext={() => setActiveTab('equalisation')}
          dashboardMode={dashboardMode}
          preselectedQuoteIds={selectedQuoteIds}
        />;

      case 'equalisation':
        if (!projectId) {
          return <NewProjectDashboard
            projectId={null}
            projectName={undefined}
            allProjects={allProjects}
            onProjectSelect={handleProjectSelect}
            onCreateProject={handleCreateProject}
            onNavigateToQuotes={() => {
              if (handleNavigationGuard('quotes')) setActiveTab('quotes');
            }}
            onNavigateToMatrix={() => {
              if (handleNavigationGuard('scope')) setActiveTab('scope');
            }}
            onNavigateToReports={() => {
              if (handleNavigationGuard('reports')) setActiveTab('reports');
            }}
            dashboardMode={dashboardMode}
          />;
        }
        return <Equalisation
          projectId={projectId}
          onNavigateBack={() => setActiveTab('scope')}
          onNavigateNext={() => setActiveTab('reports')}
          preselectedQuoteIds={selectedQuoteIds}
        />;

      case 'contract':
        if (!projectId) {
          return <NewProjectDashboard
            projectId={null}
            projectName={undefined}
            allProjects={allProjects}
            onProjectSelect={handleProjectSelect}
            onCreateProject={handleCreateProject}
            onNavigateToQuotes={() => {
              if (handleNavigationGuard('quotes')) setActiveTab('quotes');
            }}
            onNavigateToMatrix={() => {
              if (handleNavigationGuard('scope')) setActiveTab('scope');
            }}
            onNavigateToReports={() => {
              if (handleNavigationGuard('reports')) setActiveTab('reports');
            }}
            dashboardMode={dashboardMode}
          />;
        }
        return <ContractManager projectId={projectId} dashboardMode={dashboardMode} />;

      case 'reports':
        if (!projectId) {
          return <NewProjectDashboard
            projectId={null}
            projectName={undefined}
            allProjects={allProjects}
            onProjectSelect={handleProjectSelect}
            onCreateProject={handleCreateProject}
            onNavigateToQuotes={() => {
              if (handleNavigationGuard('quotes')) setActiveTab('quotes');
            }}
            onNavigateToMatrix={() => {
              if (handleNavigationGuard('scope')) setActiveTab('scope');
            }}
            onNavigateToReports={() => {
              if (handleNavigationGuard('reports')) setActiveTab('reports');
            }}
            dashboardMode={dashboardMode}
          />;
        }
        if (showReportsHub) {
          return <EnhancedReportsHub
            projectId={projectId}
            projects={allProjects}
            onNavigateBackToScope={() => setActiveTab('scope')}
            onNavigateBackToDashboard={() => setActiveTab('dashboard')}
            dashboardMode={dashboardMode}
            preselectedQuoteIds={selectedQuoteIds}
          />;
        }
        return <ProjectReportPage
          projectId={projectId}
          projectName={projectInfo?.name || 'Project'}
          onNavigateToHub={() => setShowReportsHub(true)}
          onToast={(message, type) => setToast({ message, type })}
        />;

      case 'insights':
        if (!projectId) {
          return <NewProjectDashboard
            projectId={null}
            projectName={undefined}
            allProjects={allProjects}
            onProjectSelect={handleProjectSelect}
            onCreateProject={handleCreateProject}
            onNavigateToQuotes={() => {
              if (handleNavigationGuard('quotes')) setActiveTab('quotes');
            }}
            onNavigateToMatrix={() => {
              if (handleNavigationGuard('scope')) setActiveTab('scope');
            }}
            onNavigateToReports={() => {
              if (handleNavigationGuard('reports')) setActiveTab('reports');
            }}
            dashboardMode={dashboardMode}
          />;
        }
        return <InsightsDashboard projectId={projectId} />;


      case 'systemcheck':
        return <SystemCheck />;

      case 'copilotaudit':
        return <CopilotAudit />;

      case 'settings':
        if (projectId) {
          return <Settings projectId={projectId} onProjectDeleted={() => setProjectId(null)} />;
        }
        return (
          <div className="p-8">
            <h1 className="text-3xl font-bold mb-6">Settings</h1>
            <p className="text-gray-600 mb-4">Select a project to configure project-specific settings, or manage organisation settings below.</p>
            <OrganisationSettings />
          </div>
        );

      default:
        return <NewProjectDashboard
          projectId={projectId}
          projectName={projectInfo?.name}
          allProjects={allProjects}
          onProjectSelect={handleProjectSelect}
          onCreateProject={handleCreateProject}
          onNavigateToQuotes={() => {
            if (handleNavigationGuard('quotes')) setActiveTab('quotes');
          }}
          onNavigateToMatrix={() => {
            if (handleNavigationGuard('scope')) setActiveTab('scope');
          }}
          onNavigateToReports={() => {
            if (handleNavigationGuard('reports')) setActiveTab('reports');
          }}
          dashboardMode={dashboardMode}
        />;
    }
  };

  if (authLoading || orgLoading || adminLoading) {
    console.log('🔄 [App] Loading states:', { authLoading, orgLoading, adminLoading });
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-xs text-gray-400 mt-2">
              Auth: {authLoading ? '⏳' : '✓'} | Org: {orgLoading ? '⏳' : '✓'} | Admin: {adminLoading ? '⏳' : '✓'}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (window.location.pathname === '/demo-login') {
    return <DemoLogin />;
  }

  if (!session) {
    if (showPricing) {
      return <Pricing
        onStartTrial={() => {
          setShowPricing(false);
          setShowLanding(false);
        }}
        onBookDemo={() => {
          setShowPricing(false);
          setShowLanding(false);
        }}
        onBackToHome={() => {
          setShowPricing(false);
          setShowLanding(true);
        }}
      />;
    }
    if (showLanding) {
      return <LandingPage
        onSignIn={() => setShowLanding(false)}
        onViewPricing={() => setShowPricing(true)}
      />;
    }
    return <Login />;
  }

  if (window.location.pathname.startsWith('/admin')) {
    if (!isMasterAdmin) {
      toastStore.show({
        type: 'warning',
        title: 'Access denied',
        body: 'The Admin Console is only accessible to platform administrators.',
        duration: 5000,
      });
      setTimeout(() => {
        window.location.href = '/';
      }, 1000);
      return null;
    }
    return <AdminApp />;
  }

  if (!session) {
    console.error('❌ [App] Session lost at protected route check');
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!selectedMode) {
    return <ModeSelector onSelectMode={setSelectedMode} isMasterAdmin={isMasterAdmin} />;
  }

  if (selectedMode === 'admin') {
    if (!isMasterAdmin) {
      toastStore.show({
        type: 'warning',
        title: 'Access denied',
        body: 'The Admin Console is only accessible to platform administrators.',
        duration: 5000,
      });
      setSelectedMode(null);
      return null;
    }
    return <AdminApp />;
  }

  if (!currentOrganisation) {
    if (organisations.length === 1) {
      setCurrentOrganisation(organisations[0]);
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Setting up your workspace...</p>
          </div>
        </div>
      );
    }

    return <OrganisationPicker onOrganisationSelected={() => {}} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const isInAdminMode = isImpersonating();
  const impersonatedOrg = isInAdminMode ? currentOrganisation : null;

  return (
    <>
      <AppShell
        sidebar={
          <Sidebar
            activeTab={activeTab}
            onTabChange={(tab) => {
              setShowReportsHub(false);
              setActiveTab(tab);
              setMobileMenuOpen(false);
            }}
            projectId={projectId}
            dashboardMode={dashboardMode}
            onDashboardModeChange={setDashboardMode}
          />
        }
        topBar={
          <>
            {isInAdminMode && impersonatedOrg && (
              <div className="bg-red-600 text-white px-6 py-3 flex items-center justify-between shadow-lg border-b border-red-700">
                <div className="flex items-center gap-3">
                  <AlertTriangle size={20} />
                  <div>
                    <div className="font-bold">ADMIN MODE - Impersonating Client</div>
                    <div className="text-sm text-red-100">
                      Viewing as: {impersonatedOrg.name}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => stopImpersonation()}
                  className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 rounded-md font-medium transition-colors"
                >
                  <X size={16} />
                  Exit Admin Mode
                </button>
              </div>
            )}

            {!isInAdminMode && orgLicensing && orgLicensing.licensed_trades && (
              <TradeUpsellBanner
                currentTrades={orgLicensing.licensed_trades}
                subscriptionStatus={orgLicensing.subscription_status}
              />
            )}

            <AppBar
              activeTab={'project'}
              onTabChange={() => {}}
              currentProjectId={projectId || undefined}
              currentProjectName={projectInfo?.name}
              onSearchOpen={() => {}}
              notificationCount={0}
              onSettingsOpen={() => setActiveTab('settings')}
              mobileMenuOpen={mobileMenuOpen}
              onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
              onCopilotOpen={() => setIsCopilotOpen(true)}
            />
          </>
        }
      >
        {renderContent()}
      </AppShell>

      <AnimatePresence>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>

      <ToastContainer />

      <button
        onClick={() => setIsCopilotOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center z-40 hover:scale-110"
        title="Ask AI Copilot"
      >
        <Sparkles size={24} />
      </button>

      <CopilotDrawer
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        currentProjectId={projectId || undefined}
        allProjects={allProjects.map(p => ({ id: p.id, name: p.name }))}
        onNavigate={handleCopilotNavigate}
      />
    </>
  );
}

function App() {
  return (
    <AdminProvider>
      <OrganisationProvider>
        <AppContent />
      </OrganisationProvider>
    </AdminProvider>
  );
}

export default App;
