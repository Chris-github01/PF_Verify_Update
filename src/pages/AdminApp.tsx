import { useState, useEffect } from 'react';
import { Building2, LayoutDashboard, LogOut, Users, FileText, ShieldCheck, Settings, ShieldAlert, Flame, BarChart3, Database, Map, FlaskConical, GitCompare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isSuperAdmin } from '../lib/admin/superAdminGuard';
import AdminDashboard from './admin/AdminDashboard';
import OrganisationsList from './admin/OrganisationsList';
import OrganisationDetail from './admin/OrganisationDetail';
import CreateOrganisation from './admin/CreateOrganisation';
import SuperAdminDashboard from './admin/SuperAdminDashboard';
import CreateClient from './admin/CreateClient';
import GlobalPDFVault from './admin/GlobalPDFVault';
import PlatformAdminUsers from './admin/PlatformAdminUsers';
import SystemConfiguration from './admin/SystemConfiguration';
import ExecutiveDashboard from './admin/ExecutiveDashboard';
import AuditLedger from './admin/AuditLedger';
import FutureBuildsRoadmap from './admin/FutureBuildsRoadmap';
import ParserValidationReport from './admin/ParserValidationReport';
import VersionComparison from './admin/VersionComparison';

type AdminView = 'dashboard' | 'organisations' | 'organisation-detail' | 'create-organisation' | 'super-dashboard' | 'create-client' | 'pdf-vault' | 'platform-admins' | 'system-config' | 'executive-dashboard' | 'audit-ledger' | 'future-builds-roadmap' | 'parser-validation' | 'version-comparison';

function viewFromPath(path: string): AdminView {
  if (path === '/admin/dashboard') return 'super-dashboard';
  if (path === '/admin/clients/new') return 'create-client';
  if (path === '/admin/pdfs') return 'pdf-vault';
  if (path === '/admin/platform-admins') return 'platform-admins';
  if (path === '/admin/system-config') return 'system-config';
  if (path === '/admin/executive-dashboard') return 'executive-dashboard';
  if (path === '/admin/audit-ledger') return 'audit-ledger';
  if (path === '/admin/future-builds-roadmap') return 'future-builds-roadmap';
  if (path === '/admin/parser-validation') return 'parser-validation';
  if (path === '/admin/version-comparison') return 'version-comparison';
  if (path === '/admin/organisations') return 'organisations';
  if (path === '/admin/organisations/new') return 'create-organisation';
  if (path.startsWith('/admin/organisations/')) return 'organisation-detail';
  return 'dashboard';
}

export default function AdminApp() {
  const [activeView, setActiveView] = useState<AdminView>(() =>
    viewFromPath(typeof window !== 'undefined' ? window.location.pathname : '/admin'),
  );
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(() => {
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (path.startsWith('/admin/organisations/') && path !== '/admin/organisations/new') {
      return path.split('/').pop() ?? null;
    }
    return null;
  });
  const [userEmail, setUserEmail] = useState<string>('');
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);

  useEffect(() => {
    checkSuperAdmin();
  }, []);

  const checkSuperAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.email) {
      setUserEmail(session.user.email);
      const isAdmin = await isSuperAdmin(session.user.email);
      setIsSuperAdminUser(isAdmin);
    }
  };

  useEffect(() => {
    const path = window.location.pathname;

    if (path === '/admin' || path === '/admin/') {
      setActiveView('dashboard');
    } else if (path === '/admin/dashboard') {
      setActiveView('super-dashboard');
    } else if (path === '/admin/clients/new') {
      setActiveView('create-client');
    } else if (path === '/admin/pdfs') {
      setActiveView('pdf-vault');
    } else if (path === '/admin/platform-admins') {
      setActiveView('platform-admins');
    } else if (path === '/admin/system-config') {
      setActiveView('system-config');
    } else if (path === '/admin/executive-dashboard') {
      setActiveView('executive-dashboard');
    } else if (path === '/admin/audit-ledger') {
      setActiveView('audit-ledger');
    } else if (path === '/admin/future-builds-roadmap') {
      setActiveView('future-builds-roadmap');
    } else if (path === '/admin/parser-validation') {
      setActiveView('parser-validation');
    } else if (path === '/admin/version-comparison') {
      setActiveView('version-comparison');
    } else if (path === '/admin/organisations') {
      setActiveView('organisations');
    } else if (path === '/admin/organisations/new') {
      setActiveView('create-organisation');
    } else if (path.startsWith('/admin/organisations/')) {
      const orgId = path.split('/').pop();
      if (orgId) {
        setSelectedOrgId(orgId);
        setActiveView('organisation-detail');
      }
    }
  }, [isSuperAdminUser]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const renderContent = () => {
    switch (activeView) {
      case 'super-dashboard':
        return <SuperAdminDashboard />;
      case 'create-client':
        return <CreateClient />;
      case 'pdf-vault':
        return <GlobalPDFVault />;
      case 'platform-admins':
        return <PlatformAdminUsers />;
      case 'system-config':
        return <SystemConfiguration />;
      case 'executive-dashboard':
        return <ExecutiveDashboard />;
      case 'audit-ledger':
        return <AuditLedger />;
      case 'future-builds-roadmap':
        return <FutureBuildsRoadmap />;
      case 'parser-validation':
        return <ParserValidationReport />;
      case 'version-comparison':
        return <VersionComparison />;
      case 'dashboard':
        return <AdminDashboard />;
      case 'organisations':
        return <OrganisationsList />;
      case 'organisation-detail':
        return selectedOrgId ? <OrganisationDetail organisationId={selectedOrgId} /> : null;
      case 'create-organisation':
        return <CreateOrganisation />;
      default:
        return <AdminDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <aside className="w-64 border-r border-slate-800 bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)] flex flex-col fixed left-0 top-0 h-screen z-40">
        {/* Brand Header */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-4">
          <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-orange-400 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30 flex-shrink-0">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-wide text-slate-50">
              Admin Console
            </span>
            <span className="text-[11px] text-slate-400">
              Master Admin
            </span>
          </div>
        </div>

        {/* Super Admin Section */}
        {isSuperAdminUser && (
          <div className="px-3 pb-4 border-b border-slate-800/80">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 px-3 mb-2">
              Super Admin
            </div>
            <div className="space-y-1">
              <button
                onClick={() => (window.location.href = '/admin/dashboard')}
                className={`
                  group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all
                  ${
                    activeView === 'super-dashboard'
                      ? 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                      : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                  }
                `}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
                  <Users size={16} />
                </span>
                <span className="flex-1 text-left">Clients & Trials</span>
                {activeView === 'super-dashboard' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.8)]" />
                )}
              </button>
              <button
                onClick={() => (window.location.href = '/admin/pdfs')}
                className={`
                  group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all
                  ${
                    activeView === 'pdf-vault'
                      ? 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                      : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                  }
                `}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
                  <FileText size={16} />
                </span>
                <span className="flex-1 text-left">PDF Vault</span>
                {activeView === 'pdf-vault' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.8)]" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Main Navigation */}
        <nav className="flex-1 px-3 pb-4 pt-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 px-3 mb-2">
            Platform Administration
          </div>
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => (window.location.href = '/admin')}
                className={`
                  group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all
                  ${
                    activeView === 'dashboard'
                      ? 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                      : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                  }
                `}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
                  <LayoutDashboard size={16} />
                </span>
                <span className="flex-1 text-left">Dashboard</span>
                {activeView === 'dashboard' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.8)]" />
                )}
              </button>
            </li>
            <li>
              <button
                onClick={() => (window.location.href = '/admin/organisations')}
                className={`
                  group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all
                  ${
                    activeView === 'organisations' || activeView === 'organisation-detail' || activeView === 'create-organisation'
                      ? 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                      : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                  }
                `}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
                  <Building2 size={16} />
                </span>
                <span className="flex-1 text-left">Organisations</span>
                {(activeView === 'organisations' || activeView === 'organisation-detail' || activeView === 'create-organisation') && (
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.8)]" />
                )}
              </button>
            </li>
            <li>
              <button
                onClick={() => (window.location.href = '/admin/platform-admins')}
                className={`
                  group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all
                  ${
                    activeView === 'platform-admins'
                      ? 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                      : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                  }
                `}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
                  <ShieldCheck size={16} />
                </span>
                <span className="flex-1 text-left">Platform Admins</span>
                {activeView === 'platform-admins' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.8)]" />
                )}
              </button>
            </li>
            <li>
              <button
                onClick={() => (window.location.href = '/admin/system-config')}
                className={`
                  group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all
                  ${
                    activeView === 'system-config'
                      ? 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                      : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                  }
                `}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
                  <Settings size={16} />
                </span>
                <span className="flex-1 text-left">System Config</span>
                {activeView === 'system-config' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.8)]" />
                )}
              </button>
            </li>
          </ul>

          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 px-3 mb-2 mt-6">
            Audit & Reporting
          </div>
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => (window.location.href = '/admin/executive-dashboard')}
                className={`
                  group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all
                  ${
                    activeView === 'executive-dashboard'
                      ? 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                      : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                  }
                `}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
                  <BarChart3 size={16} />
                </span>
                <span className="flex-1 text-left">Executive Dashboard</span>
                {activeView === 'executive-dashboard' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                )}
              </button>
            </li>
            <li>
              <button
                onClick={() => (window.location.href = '/admin/audit-ledger')}
                className={`
                  group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all
                  ${
                    activeView === 'audit-ledger'
                      ? 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                      : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                  }
                `}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
                  <Database size={16} />
                </span>
                <span className="flex-1 text-left">Audit Ledger</span>
                {activeView === 'audit-ledger' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.8)]" />
                )}
              </button>
            </li>
            <li>
              <button
                onClick={() => (window.location.href = '/admin/future-builds-roadmap')}
                className={`
                  group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all
                  ${
                    activeView === 'future-builds-roadmap'
                      ? 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                      : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                  }
                `}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
                  <Map size={16} />
                </span>
                <span className="flex-1 text-left">Future Builds</span>
                {activeView === 'future-builds-roadmap' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.8)]" />
                )}
              </button>
            </li>
            <li>
              <button
                onClick={() => (window.location.href = '/admin/parser-validation')}
                className={`
                  group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all
                  ${
                    activeView === 'parser-validation'
                      ? 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                      : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                  }
                `}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
                  <FlaskConical size={16} />
                </span>
                <span className="flex-1 text-left">Parser Validation</span>
                {activeView === 'parser-validation' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.8)]" />
                )}
              </button>
            </li>
            <li>
              <button
                onClick={() => (window.location.href = '/admin/version-comparison')}
                className={`
                  group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all
                  ${
                    activeView === 'version-comparison'
                      ? 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                      : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                  }
                `}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
                  <GitCompare size={16} />
                </span>
                <span className="flex-1 text-left">Version Comparison</span>
                {activeView === 'version-comparison' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
                )}
              </button>
            </li>
          </ul>
        </nav>

        {/* Footer Actions */}
        <div className="px-3 pb-3 border-t border-slate-800/80 pt-3 space-y-2">
          <button
            onClick={() => (window.location.href = '/')}
            className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all text-slate-400 hover:text-slate-50 hover:bg-slate-900/60"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
              <LayoutDashboard size={16} />
            </span>
            <span className="flex-1 text-left">Main App</span>
          </button>
          <button
            onClick={handleLogout}
            className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-rose-500/20 flex-shrink-0">
              <LogOut size={16} />
            </span>
            <span className="flex-1 text-left">Logout</span>
          </button>
        </div>

        {/* Version Footer */}
        <div className="border-t border-slate-800/80 px-4 py-3 text-[11px] text-slate-500">
          v1.9 • © 2025 VerifyTrade
        </div>
      </aside>

      <div className="ml-64 overflow-auto bg-slate-950 min-h-screen">
        {renderContent()}
      </div>
    </div>
  );
}
