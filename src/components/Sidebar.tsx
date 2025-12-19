import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FileText,
  Grid3x3,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Flame,
  Sparkles,
  ClipboardCheck,
  Briefcase,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import type { DashboardMode } from '../App';
import { useOrganisation } from '../lib/organisationContext';
import { useAdmin } from '../lib/adminContext';

export type SidebarTab =
  | 'dashboard'
  | 'quotes'
  | 'review'
  | 'quoteintel'
  | 'scope'
  | 'contract'
  | 'reports'
  | 'insights'
  | 'systemcheck'
  | 'copilotaudit'
  | 'settings';

interface SidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  projectId?: string | null;
  dashboardMode: DashboardMode;
  onDashboardModeChange: (mode: DashboardMode) => void;
}

const menuItems = [
  { id: 'dashboard' as SidebarTab, label: 'Project Dashboard', icon: LayoutDashboard },
  { id: 'quotes' as SidebarTab, label: 'Import Quotes', icon: FileText },
  { id: 'review' as SidebarTab, label: 'Review & Clean', icon: ClipboardCheck },
  { id: 'quoteintel' as SidebarTab, label: 'Quote Intelligence', icon: Sparkles },
  { id: 'scope' as SidebarTab, label: 'Scope Matrix', icon: Grid3x3 },
  { id: 'reports' as SidebarTab, label: 'Reports', icon: BarChart3 },
  { id: 'contract' as SidebarTab, label: 'Contract Manager', icon: Briefcase },
  { id: 'settings' as SidebarTab, label: 'Settings', icon: Settings, requiresManagePermission: true },
];

export default function Sidebar({ activeTab, onTabChange, projectId, dashboardMode, onDashboardModeChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const { hasPermission } = useOrganisation();
  const { isMasterAdmin } = useAdmin();

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', collapsed.toString());
  }, [collapsed]);

  return (
    <aside
      className={`${
        collapsed ? 'w-20' : 'w-64'
      } hidden md:flex flex-col border-r border-slate-800 bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)] transition-all duration-200 relative`}
    >
      {/* Brand Header */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2'} px-5 pt-5 pb-4`}>
        <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-orange-400 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30 flex-shrink-0">
          <Flame className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-wide text-slate-50">
              VerifyTrade
            </span>
            <span className="text-[11px] text-slate-400">
              Quote Audit Engine
            </span>
          </div>
        )}
      </div>

      {/* Dashboard Mode Toggle */}
      {!collapsed && projectId && (
        <div className="px-3 pb-4 border-b border-slate-800/80">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 px-3 mb-2">
            Mode
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => onDashboardModeChange('original')}
              className={`
                group flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all
                ${
                  dashboardMode === 'original'
                    ? 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                    : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                }
              `}
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
                <LayoutDashboard size={13} />
              </span>
              <span className="flex-1 text-left">Original Quotes</span>
              {dashboardMode === 'original' && (
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.8)]" />
              )}
            </button>
            <button
              onClick={() => onDashboardModeChange('revisions')}
              className={`
                group flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all
                ${
                  dashboardMode === 'revisions'
                    ? 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                    : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                }
              `}
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
                <RefreshCw size={13} />
              </span>
              <span className="flex-1 text-left">Revised Quotes</span>
              {dashboardMode === 'revisions' && (
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 shadow-[0_0_12px_rgba(192,132,252,0.8)]" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Main Navigation */}
      <nav className="flex-1 px-3 pb-4 pt-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 px-3 mb-2">
          Workflow
        </div>
        <ul className="space-y-1">
          {menuItems.map((item) => {
            if ((item as any).requiresManagePermission && !hasPermission('manage')) {
              return null;
            }

            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <li key={item.id}>
                <button
                  onClick={() => onTabChange(item.id)}
                  className={`
                    group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all
                    ${
                      isActive
                        ? 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                        : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                    }
                    ${collapsed ? 'justify-center' : ''}
                  `}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
                    <Icon size={16} />
                  </span>
                  {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                  {!collapsed && isActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.8)]" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Admin Console Button */}
      {isMasterAdmin && (
        <div className="px-3 pb-3 border-t border-slate-800/80 pt-3">
          <button
            onClick={() => window.location.href = '/admin'}
            className={`
              group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all
              text-slate-400 hover:text-slate-50 hover:bg-slate-900/60 border border-slate-700/60
              ${collapsed ? 'justify-center' : ''}
            `}
            title={collapsed ? 'Admin Console' : undefined}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/60 group-hover:bg-slate-900 flex-shrink-0">
              <ShieldAlert size={16} />
            </span>
            {!collapsed && <span className="flex-1 text-left">Admin Console</span>}
          </button>
        </div>
      )}

      {/* Version Footer */}
      {!collapsed && (
        <div className="border-t border-slate-800/80 px-4 py-3 text-[11px] text-slate-500">
          v1.9 • © 2025 VerifyTrade
        </div>
      )}

      {/* Collapse Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-slate-900 border border-slate-700 rounded-full flex items-center justify-center hover:bg-slate-800 transition-colors shadow-lg"
      >
        {collapsed ? (
          <ChevronRight size={14} className="text-slate-400" />
        ) : (
          <ChevronLeft size={14} className="text-slate-400" />
        )}
      </button>
    </aside>
  );
}
