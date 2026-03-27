import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Sparkles, AlertTriangle, X } from 'lucide-react';
import { isImpersonating, stopImpersonation } from './lib/admin/adminApi';
import { logActivity } from './lib/activityLogger';
import Sidebar, { SidebarTab } from './components/Sidebar';
import DashboardHeader from './components/DashboardHeader';
import AppBar from './components/AppBar';
import { AppShell } from './components/layout/AppShell';
import NewProjectDashboard from './pages/NewProjectDashboard';
import EnhancedImportQuotes from './pages/EnhancedImportQuotes';
import QuoteSelect from './pages/QuoteSelect';
import ReviewClean from './pages/ReviewClean';
import QuoteIntelligence from './pages/QuoteIntelligence';
import ScopeMatrix from './pages/ScopeMatrix';
import Equalisation from './pages/Equalisation';
import BOQBuilder from './pages/BOQBuilder';
import ContractManager from './pages/ContractManager';
import CommercialControlDashboard from './pages/CommercialControlDashboard';
import SCCDashboard from './pages/SCCDashboard';
import SCCContractPicker from './pages/scc/SCCContractPicker';
import SCCQuoteWorkflow from './pages/scc/SCCQuoteWorkflow';
import PaymentClaimsList from './pages/scc/PaymentClaimsList';
import SCCRetentionMaterials from './pages/scc/SCCRetentionMaterials';
import VerifyStock from './pages/scc/VerifyStock';
import PlantHire from './pages/scc/PlantHire';
import BaselineTrackerModule from './pages/bt/BaselineTrackerModule';
import EnhancedReportsHub from './pages/EnhancedReportsHub';
import ProjectReportPage from './pages/ProjectReportPage';
import InsightsDashboard from './pages/InsightsDashboard';
import SystemCheck from './pages/SystemCheck';
import CopilotAudit from './pages/CopilotAudit';
import Settings from './pages/Settings';
import OrganisationAdminCenter from './pages/OrganisationAdminCenter';
import Toast, { ToastType } from './components/Toast';
import ToastContainer from './components/ToastContainer';
import AppFooter from './components/AppFooter';
import CopilotDrawer from './components/CopilotDrawer';
import TrialStatusBanner from './components/TrialStatusBanner';
import Login from './pages/Login';
import LandingPage from './pages/LandingPage';
import VideoPage from './pages/VideoPage';
import Pricing from './pages/Pricing';
import TrialSignup from './pages/TrialSignup';
import TrialExpired from './pages/TrialExpired';
import ModeSelector from './pages/ModeSelector';
import OrganisationPicker from './pages/OrganisationPicker';
import OrganisationSettings from './pages/OrganisationSettings';
import AdminApp from './pages/AdminApp';
import DemoLogin from './pages/DemoLogin';
import ShadowHome from './pages/shadow/ShadowHome';
import ShadowLogin from './pages/shadow/ShadowLogin';
import ShadowModulesPage from './pages/shadow/ShadowModulesPage';
import ShadowModuleDetail from './pages/shadow/ShadowModuleDetail';
import ShadowModuleRuns from './pages/shadow/ShadowModuleRuns';
import ShadowFeatureFlagsPage from './pages/shadow/ShadowFeatureFlagsPage';
import ShadowVersionsPage from './pages/shadow/ShadowVersionsPage';
import ShadowAuditLogPage from './pages/shadow/ShadowAuditLogPage';
import ShadowRolloutPage from './pages/shadow/ShadowRolloutPage';
import ShadowKillSwitchPage from './pages/shadow/ShadowKillSwitchPage';
import PlumbingCompareView from './pages/shadow/PlumbingCompareView';
import ShadowModuleCompare from './pages/shadow/ShadowModuleCompare';
import PlumbingRegressionListPage from './pages/shadow/PlumbingRegressionListPage';
import PlumbingRegressionSuitePage from './pages/shadow/PlumbingRegressionSuitePage';
import PlumbingRegressionRunPage from './pages/shadow/PlumbingRegressionRunPage';
import PlumbingRolloutPage from './pages/shadow/PlumbingRolloutPage';
import PlumbingBetaDashboard from './pages/shadow/PlumbingBetaDashboard';
import PlumbingBetaAnomaliesPage from './pages/shadow/PlumbingBetaAnomaliesPage';
import PlumbingReleaseDashboard from './pages/shadow/PlumbingReleaseDashboard';
import PlumbingLearningDashboard from './pages/shadow/PlumbingLearningDashboard';
import PlumbingPredictiveDashboard from './pages/shadow/PlumbingPredictiveDashboard';
import PlumbingReviewDashboard from './pages/shadow/PlumbingReviewDashboard';
import PlumbingReviewCaseDetail from './pages/shadow/PlumbingReviewCaseDetail';
import PlumbingExecutiveDashboard from './pages/shadow/PlumbingExecutiveDashboard';
import PlumbingOptimizationDashboard from './pages/shadow/PlumbingOptimizationDashboard';
import GlobalIntelligenceDashboard from './pages/shadow/GlobalIntelligenceDashboard';
import IntelligenceModuleDetail from './pages/shadow/IntelligenceModuleDetail';
import { supabase } from './lib/supabase';
import { OrganisationProvider, useOrganisation } from './lib/organisationContext';
import { AdminProvider, useAdmin } from './lib/adminContext';
import { TradeProvider, useTrade } from './lib/tradeContext';
import { toastStore } from './lib/toastStore';
import { getUserPreferences, updateLastProject } from './lib/userPreferences';
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
  const [showTrialSignup, setShowTrialSignup] = useState(false);
  const [selectedTier, setSelectedTier] = useState<'starter' | 'professional'>('starter');
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
  const [isTrialExpired, setIsTrialExpired] = useState(false);
  const [checkingTrial, setCheckingTrial] = useState(false);
  const [sccContractId, setSccContractId] = useState<string | null>(() => localStorage.getItem('scc_current_contract_id'));
  const [sccContractName, setSccContractName] = useState<string | null>(() => localStorage.getItem('scc_current_contract_name'));
  const { currentOrganisation, organisations, loading: orgLoading, isGodMode, isSubContractor, setCurrentOrganisation } = useOrganisation();
  const { isMasterAdmin, loading: adminLoading } = useAdmin();
  const { currentTrade } = useTrade();

  // Use god-mode status from organisation context as master admin indicator
  const effectiveIsMasterAdmin = isGodMode || isMasterAdmin;
  console.log('🎯 [App] Admin Status:', { isGodMode, isMasterAdmin, effectiveIsMasterAdmin, orgLoading, adminLoading });
  const initializingRef = useRef(false);
  const initializedForOrgRef = useRef<string | null>(null);

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
          setSccContractId(null);
          setSccContractName(null);
          localStorage.removeItem('passivefire_current_project_id');
          localStorage.removeItem('passivefire_current_organisation_id');
          localStorage.removeItem('scc_current_contract_id');
          localStorage.removeItem('scc_current_contract_name');
        }
      })();
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(loadTimeout);
    };
  }, []);

  useEffect(() => {
    console.log('🔄 [App] useEffect [authLoading, session, currentOrganisation?.id] triggered:', {
      authLoading,
      hasSession: !!session,
      currentOrganisation: currentOrganisation?.name,
      orgId: currentOrganisation?.id,
      initializedForOrg: initializedForOrgRef.current
    });

    if (!authLoading && session && currentOrganisation) {
      // Only initialize if we haven't initialized for this org yet, or if org changed
      if (initializedForOrgRef.current !== currentOrganisation.id) {
        console.log('🎯 [App] Conditions met, calling initializeApp()');
        initializeApp();
      } else {
        console.log('ℹ️ [App] Already initialized for this org, skipping');
      }
    } else {
      console.log('⏳ [App] Waiting for conditions:', {
        needsAuth: authLoading,
        needsSession: !session,
        needsOrg: !currentOrganisation
      });
    }
  }, [authLoading, session, currentOrganisation?.id]);

  useEffect(() => {
    if (currentOrganisation) {
      loadOrgLicensing();
    }
  }, [currentOrganisation?.id]);

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

  const checkTrialStatus = async () => {
    if (!currentOrganisation) return;

    // Skip trial check for god mode users and master admins
    if (isGodMode || isMasterAdmin) {
      setIsTrialExpired(false);
      return;
    }

    setCheckingTrial(true);
    try {
      const { data, error } = await supabase.rpc('check_trial_status', {
        p_organisation_id: currentOrganisation.id
      });

      if (error) {
        console.error('Failed to check trial status:', error);
        return;
      }

      if (data?.subscription_status === 'expired') {
        setIsTrialExpired(true);
      } else {
        setIsTrialExpired(false);
      }
    } catch (err) {
      console.error('Failed to check trial status:', err);
    } finally {
      setCheckingTrial(false);
    }
  };

  useEffect(() => {
    if (currentOrganisation && !orgLoading && !adminLoading) {
      checkTrialStatus();
    }
  }, [currentOrganisation?.id, isGodMode, isMasterAdmin, orgLoading, adminLoading]);

  useEffect(() => {
    if (projectId) {
      loadProjectInfo(projectId);
    }
  }, [projectId]);

  // Reload projects when trade changes to refresh quote counts and status for the new trade
  useEffect(() => {
    if (currentOrganisation && initializedForOrgRef.current === currentOrganisation.id) {
      console.log('🔄 [App] Trade changed to:', currentTrade, '- reloading project stats for new trade view');
      loadAllProjects();
      // Keep the selected project - one project can have data for multiple trades
    }
  }, [currentTrade]);

  // Redirect subcontractors away from the generic project dashboard to the SCC module
  useEffect(() => {
    if (isSubContractor && (activeTab === 'dashboard' || activeTab === 'quotes' || activeTab === 'quoteselect' || activeTab === 'review' || activeTab === 'scope' || activeTab === 'equalisation' || activeTab === 'boq' || activeTab === 'reports')) {
      setActiveTab('scc');
    }
  }, [isSubContractor]);

  // Projects are loaded by initializeApp() - no separate effect needed
  // Removed to prevent duplicate loadAllProjects() calls and loops

  const initializeApp = async () => {
    if (initializingRef.current) {
      console.log('🔄 [App] Already initializing, skipping duplicate call');
      return;
    }

    console.log('🚀 [App] initializeApp starting for organisation:',
      currentOrganisation?.name, currentOrganisation?.id);

    initializingRef.current = true;
    setLoading(true);

    try {
      // Load all projects first
      console.log('📂 [App] Step 1: Loading projects...');
      await loadAllProjects();

      // Try to restore the last selected project from user preferences, then localStorage
      console.log('📝 [App] Step 2: Restoring last project...');
      const prefs = await getUserPreferences();
      let savedProjectId = prefs?.last_project_id;

      console.log('🔍 [App] User preferences last_project_id:', savedProjectId);

      if (!savedProjectId) {
        savedProjectId = localStorage.getItem('passivefire_current_project_id');
        console.log('🔍 [App] localStorage project_id:', savedProjectId);
      }

      if (savedProjectId && currentOrganisation) {
        console.log('🔍 [App] Verifying project', savedProjectId, 'belongs to org', currentOrganisation.id);
        // Verify the project exists and belongs to this organisation (projects can have data for all trades)
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('id, name, client, reference')
          .eq('id', savedProjectId)
          .eq('organisation_id', currentOrganisation.id)
          .maybeSingle();

        if (projectError) {
          console.error('❌ [App] Error verifying project:', projectError);
        }

        if (project) {
          console.log('✅ [App] Restored project:', project.name, project.id);
          setProjectId(project.id);
          setProjectInfo(project);
          localStorage.setItem('passivefire_current_project_id', project.id);
        } else {
          console.warn('⚠️ [App] Saved project not found or does not belong to current org');
          // Project doesn't exist or doesn't belong to this org - clear it
          localStorage.removeItem('passivefire_current_project_id');
          setProjectId(null);
          setProjectInfo(null);
        }
      } else {
        console.log('ℹ️ [App] No saved project to restore');
      }
    } finally {
      setLoading(false);
      initializingRef.current = false;
      // Mark this org as initialized
      if (currentOrganisation) {
        initializedForOrgRef.current = currentOrganisation.id;
        console.log('✅ [App] initializeApp complete for org:', currentOrganisation.name);
      } else {
        console.warn('⚠️ [App] initializeApp complete but currentOrganisation is null');
      }
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

    // Save to user preferences in the background
    updateLastProject(id, currentOrganisation?.id).catch(err => {
      console.error('[App] Error saving project preference:', err);
    });

    await loadProjectInfo(id);
  };

  const handleCreateProject = async (name: string, client: string, reference: string) => {
    if (!currentOrganisation || !session?.user) {
      setToast({ message: 'Must be logged in to create a project', type: 'error' });
      return null;
    }

    try {
      console.log('Creating project with:', {
        organisation_id: currentOrganisation.id,
        name,
        client,
        reference,
        trade: currentTrade,
        user_id: session.user.id
      });

      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          organisation_id: currentOrganisation.id,
          name,
          client: client || null,
          reference: reference || null,
          status: 'active',
          trade: currentTrade,
          created_by: session.user.id,
          created_by_user_id: session.user.id,
          user_id: session.user.id,
        })
        .select()
        .single();

      console.log('Project creation result:', { project, error });

      if (error) {
        console.error('Project creation error details:', error);
        throw error;
      }

      await loadAllProjects();

      await logActivity({
        organisationId: currentOrganisation.id,
        userId: session.user.id,
        activityType: 'project_created',
        projectId: project.id,
        metadata: { name, client, reference }
      });

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
    if (!currentOrganisation) {
      console.warn('⚠️ [App] loadAllProjects called but currentOrganisation is not set yet');
      console.log('🔍 [App] currentOrganisation state:', currentOrganisation);
      console.log('🔍 [App] orgLoading:', orgLoading);
      setAllProjects([]);
      return;
    }

    console.log('📂 [App] Loading projects for organisation:', currentOrganisation.name, currentOrganisation.id);

    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name, client, reference, updated_at, approved_quote_id, trade')
      .eq('organisation_id', currentOrganisation.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('❌ [App] Error loading projects:', error);
      setAllProjects([]);
      return;
    }

    console.log('📊 [App] Loaded', projects?.length || 0, 'projects from database');

    if (projects) {
      const projectsWithReportStatus = await Promise.all(
        projects.map(async (p) => {
          const { data: quotes } = await supabase
            .from('quotes')
            .select('id, status')
            .eq('project_id', p.id)
            .eq('trade', currentTrade);

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
            .eq('trade', currentTrade)
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
      console.log('✅ [App] Set', projectsWithReportStatus.length, 'projects in state:',
        projectsWithReportStatus.map(p => ({ id: p.id, name: p.name })));
    } else {
      console.log('📭 [App] No projects found');
      setAllProjects([]);
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
      case 'select':
        setActiveTab('quoteselect');
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
      case 'equalisation':
        setActiveTab('equalisation');
        break;
      case 'boq-builder':
        setActiveTab('boq-builder');
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
        if (isSubContractor) {
          return <SCCDashboard onNavigate={(tab) => setActiveTab(tab as SidebarTab)} />;
        }
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
          onNavigateToNext={() => setActiveTab('quoteselect')}
          dashboardMode={dashboardMode}
        />;

      case 'quoteselect':
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
        return <QuoteSelect
          projectId={projectId}
          onNavigateBack={() => setActiveTab('quotes')}
          onNavigateNext={() => setActiveTab('review')}
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
          onNavigateBack={() => setActiveTab('quoteselect')}
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
          onNavigateNext={() => setActiveTab('boq-builder')}
          preselectedQuoteIds={selectedQuoteIds}
        />;

      case 'boq-builder':
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
        return <BOQBuilder projectId={projectId} />;

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
        return <ContractManager
          projectId={projectId}
          dashboardMode={dashboardMode}
          onNavigateBack={() => {
            setProjectId(null);
            setProjectInfo(null);
            setActiveTab('dashboard');
          }}
          onToast={(message, type) => setToast({ message, type })}
        />;

      case 'scc':
      case 'scc-quote-import':
      case 'scc-base-tracker':
      case 'scc-claims':
      case 'scc-retention':
      case 'scc-variations':
      case 'scc-verify-stock':
      case 'scc-plant-hire': {
        if (!sccContractId) {
          return (
            <SCCContractPicker
              onContractSelect={(id, name) => {
                setSccContractId(id);
                setSccContractName(name);
                localStorage.setItem('scc_current_contract_id', id);
                localStorage.setItem('scc_current_contract_name', name);
                setActiveTab('scc');
              }}
            />
          );
        }
        if (activeTab === 'scc') {
          return <SCCDashboard onNavigate={(tab) => setActiveTab(tab as SidebarTab)} sccContractId={sccContractId} />;
        }
        if (activeTab === 'scc-quote-import') {
          return <SCCQuoteWorkflow onFinish={() => setActiveTab('scc-base-tracker')} />;
        }
        if (activeTab === 'scc-base-tracker') {
          return <BaselineTrackerModule projectId={projectId || undefined} projectName={projectInfo?.name} projectClient={projectInfo?.client || undefined} projectReference={projectInfo?.reference || undefined} />;
        }
        if (activeTab === 'scc-claims') {
          return <PaymentClaimsList sccContractId={sccContractId} />;
        }
        if (activeTab === 'scc-retention') {
          return <SCCRetentionMaterials sccContractId={sccContractId} />;
        }
        if (activeTab === 'scc-variations') {
          return <SCCDashboard onNavigate={(tab) => setActiveTab(tab as SidebarTab)} sccContractId={sccContractId} />;
        }
        if (activeTab === 'scc-verify-stock') {
          return <VerifyStock />;
        }
        if (activeTab === 'scc-plant-hire') {
          return <PlantHire onBack={() => setActiveTab('scc')} />;
        }
        return null;
      }

      case 'bt-dashboard':
        return <BaselineTrackerModule projectId={projectId || undefined} projectName={projectInfo?.name} projectClient={projectInfo?.client || undefined} projectReference={projectInfo?.reference || undefined} />;

      case 'commercial':
        return <CommercialControlDashboard />;

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
          onNavigateToDashboard={() => setActiveTab('dashboard')}
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

      case 'admincenter':
        return <OrganisationAdminCenter />;

      case 'settings':
        if (!isMasterAdmin) {
          return (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-300 mb-2">Access Denied</h2>
                <p className="text-slate-500">Settings are only accessible to administrators.</p>
              </div>
            </div>
          );
        }
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

  // Shadow Admin routes — completely isolated from the main app loading cycle.
  // Must be checked BEFORE authLoading/orgLoading gates so org context never interferes.
  const shadowPath = window.location.pathname;
  const isShadowRoute = shadowPath.startsWith('/shadow');

  if (isShadowRoute) {
    if (authLoading) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto" />
            <p className="text-gray-400 text-sm">Authenticating...</p>
          </div>
        </div>
      );
    }
    if (!session) {
      return <ShadowLogin />;
    }
    // Check that the verified flag matches the current session user.
    // This flag is written by ShadowLogin only after confirming admin_roles via REST fetch.
    const verifiedUserId = localStorage.getItem('shadow_admin_verified');
    if (verifiedUserId !== session.user.id) {
      return <ShadowLogin />;
    }
    // Verified admin — fall through to shadow route matchers below.
  }

  if (authLoading || orgLoading) {
    if (isShadowRoute) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto" />
            <p className="text-gray-400 text-sm">Loading...</p>
          </div>
        </div>
      );
    }
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

  if (window.location.pathname === '/video') {
    return <VideoPage />;
  }
  if (shadowPath === '/shadow' || shadowPath === '/shadow/') {
    return <ShadowHome />;
  }
  if (shadowPath === '/shadow/modules') {
    return <ShadowModulesPage />;
  }
  if (shadowPath.match(/^\/shadow\/modules\/([^/]+)\/runs$/)) {
    return <ShadowModuleRuns />;
  }
  if (shadowPath.match(/^\/shadow\/modules\/([^/]+)\/compare$/)) {
    return <ShadowModuleCompare />;
  }
  if (shadowPath.match(/^\/shadow\/modules\/([^/]+)$/)) {
    return <ShadowModuleDetail />;
  }
  if (shadowPath === '/shadow/admin/flags') {
    return <ShadowFeatureFlagsPage />;
  }
  if (shadowPath === '/shadow/admin/versions') {
    return <ShadowVersionsPage />;
  }
  if (shadowPath === '/shadow/admin/audit-log') {
    return <ShadowAuditLogPage />;
  }
  if (shadowPath === '/shadow/admin/rollout') {
    return <ShadowRolloutPage />;
  }
  if (shadowPath === '/shadow/admin/kill-switch') {
    return <ShadowKillSwitchPage />;
  }
  if (shadowPath.match(/^\/shadow\/plumbing\/compare\/([^/]+)$/)) {
    return <PlumbingCompareView />;
  }
  if (shadowPath === '/shadow/modules/plumbing_parser/regression') {
    return <PlumbingRegressionListPage />;
  }
  if (shadowPath.match(/^\/shadow\/modules\/plumbing_parser\/regression\/runs\/([^/]+)$/)) {
    return <PlumbingRegressionRunPage />;
  }
  if (shadowPath.match(/^\/shadow\/modules\/plumbing_parser\/regression\/([^/]+)$/)) {
    return <PlumbingRegressionSuitePage />;
  }
  if (shadowPath === '/shadow/modules/plumbing_parser/rollout') {
    return <PlumbingRolloutPage />;
  }
  if (shadowPath === '/shadow/modules/plumbing_parser/beta') {
    return <PlumbingBetaDashboard />;
  }
  if (shadowPath === '/shadow/modules/plumbing_parser/beta/anomalies') {
    return <PlumbingBetaAnomaliesPage />;
  }
  if (
    shadowPath === '/shadow/modules/plumbing_parser/release' ||
    shadowPath === '/shadow/modules/plumbing_parser/release/checklist' ||
    shadowPath === '/shadow/modules/plumbing_parser/release/timeline'
  ) {
    return <PlumbingReleaseDashboard />;
  }
  if (
    shadowPath === '/shadow/modules/plumbing_parser/learning' ||
    shadowPath === '/shadow/modules/plumbing_parser/learning/suggestions' ||
    shadowPath === '/shadow/modules/plumbing_parser/learning/rules'
  ) {
    return <PlumbingLearningDashboard />;
  }
  if (
    shadowPath === '/shadow/modules/plumbing_parser/predictive' ||
    shadowPath === '/shadow/modules/plumbing_parser/predictive/risk-events' ||
    shadowPath === '/shadow/modules/plumbing_parser/predictive/policies' ||
    shadowPath.startsWith('/shadow/modules/plumbing_parser/predictive/orgs/')
  ) {
    return <PlumbingPredictiveDashboard />;
  }
  if (shadowPath.startsWith('/shadow/modules/plumbing_parser/review/cases/')) {
    const caseId = shadowPath.split('/shadow/modules/plumbing_parser/review/cases/')[1];
    return <PlumbingReviewCaseDetail caseId={caseId} onBack={() => { window.location.pathname = '/shadow/modules/plumbing_parser/review'; }} />;
  }
  if (
    shadowPath === '/shadow/modules/plumbing_parser/review' ||
    shadowPath === '/shadow/modules/plumbing_parser/review/queue' ||
    shadowPath === '/shadow/modules/plumbing_parser/review/assignments' ||
    shadowPath === '/shadow/modules/plumbing_parser/review/corrections'
  ) {
    return <PlumbingReviewDashboard />;
  }
  if (
    shadowPath === '/shadow/modules/plumbing_parser/executive' ||
    shadowPath === '/shadow/modules/plumbing_parser/executive/releases' ||
    shadowPath.startsWith('/shadow/modules/plumbing_parser/executive/orgs/')
  ) {
    return <PlumbingExecutiveDashboard />;
  }
  if (
    shadowPath === '/shadow/modules/plumbing_parser/optimization' ||
    shadowPath === '/shadow/modules/plumbing_parser/optimization/bundles' ||
    shadowPath === '/shadow/modules/plumbing_parser/optimization/runs' ||
    shadowPath === '/shadow/modules/plumbing_parser/optimization/rankings'
  ) {
    return <PlumbingOptimizationDashboard />;
  }
  if (
    shadowPath === '/shadow/intelligence/dashboard' ||
    shadowPath === '/shadow/intelligence/modules' ||
    shadowPath === '/shadow/intelligence/cross-trade' ||
    shadowPath === '/shadow/intelligence/onboarding'
  ) {
    return <GlobalIntelligenceDashboard />;
  }
  if (shadowPath.startsWith('/shadow/intelligence/modules/')) {
    return <IntelligenceModuleDetail />;
  }

  if (!session) {
    if (showTrialSignup) {
      return <TrialSignup
        preselectedTier={selectedTier}
        onSuccess={() => {
          setShowTrialSignup(false);
          setShowLanding(false);
          setShowPricing(false);
        }}
        onBackToHome={() => {
          setShowTrialSignup(false);
          setShowPricing(false);
          setShowLanding(true);
        }}
      />;
    }
    if (showPricing) {
      return <Pricing
        onStartTrial={(tier) => {
          if (tier) setSelectedTier(tier);
          setShowPricing(false);
          setShowTrialSignup(true);
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
    // Wait for admin check to complete before denying access
    if (orgLoading || adminLoading) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Checking admin access...</p>
          </div>
        </div>
      );
    }

    if (!effectiveIsMasterAdmin) {
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
    return <ModeSelector onSelectMode={setSelectedMode} isMasterAdmin={effectiveIsMasterAdmin} adminLoading={orgLoading || adminLoading} />;
  }

  if (selectedMode === 'admin') {
    // Wait for admin check to complete before denying access
    if (orgLoading || adminLoading) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Checking admin access...</p>
          </div>
        </div>
      );
    }

    if (!effectiveIsMasterAdmin) {
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

  // Check trial status for non-admin users
  if (checkingTrial) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking account status...</p>
        </div>
      </div>
    );
  }

  // Redirect to trial expired page if trial has expired (except for admins)
  if (isTrialExpired && !isGodMode && !isMasterAdmin) {
    return <TrialExpired />;
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
            sccContractId={sccContractId}
            sccContractName={sccContractName}
            onSccContractChange={(id, name) => {
              setSccContractId(id);
              setSccContractName(name);
              if (id) {
                localStorage.setItem('scc_current_contract_id', id);
                localStorage.setItem('scc_current_contract_name', name);
              } else {
                localStorage.removeItem('scc_current_contract_id');
                localStorage.removeItem('scc_current_contract_name');
              }
            }}
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

            {!isInAdminMode && currentOrganisation?.id && (
              <TrialStatusBanner organisationId={currentOrganisation.id} />
            )}

            <AppBar
              activeTab={'project'}
              onTabChange={() => {}}
              currentProjectId={isSubContractor ? undefined : (projectId || undefined)}
              currentProjectName={isSubContractor ? undefined : projectInfo?.name}
              onProjectChange={handleProjectSelect}
              onSearchOpen={() => {}}
              notificationCount={0}
              onSettingsOpen={() => setActiveTab('settings')}
              mobileMenuOpen={mobileMenuOpen}
              onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
              onCopilotOpen={() => setIsCopilotOpen(true)}
              sccContractName={isSubContractor ? sccContractName : undefined}
              onSccContractClick={isSubContractor ? () => {
                setSccContractId(null);
                setSccContractName(null);
                localStorage.removeItem('scc_current_contract_id');
                localStorage.removeItem('scc_current_contract_name');
                setActiveTab('scc');
              } : undefined}
              onOrganisationClick={() => {
                setProjectId(null);
                setProjectInfo(null);
                setActiveTab('dashboard');
                setCurrentOrganisation(null);
                setSccContractId(null);
                setSccContractName(null);
                localStorage.removeItem('scc_current_contract_id');
                localStorage.removeItem('scc_current_contract_name');
              }}
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
        <TradeProvider>
          <AppContent />
        </TradeProvider>
      </OrganisationProvider>
    </AdminProvider>
  );
}

export default App;
