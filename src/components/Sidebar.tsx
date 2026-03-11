import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FileText,
  Grid3x3,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ClipboardCheck,
  Briefcase,
  ShieldAlert,
  CheckSquare,
  FileSpreadsheet,
  DollarSign,
  Layers,
  TrendingUp,
  RefreshCw,
  HardHat,
  BookOpen,
  FolderOpen,
} from 'lucide-react';
import type { DashboardMode } from '../App';
import { useOrganisation } from '../lib/organisationContext';
import { useAdmin } from '../lib/adminContext';
import { useTrade } from '../lib/tradeContext';
import type { Trade } from '../lib/userPreferences';

export type SidebarTab =
  | 'dashboard'
  | 'quotes'
  | 'quoteselect'
  | 'review'
  | 'quoteintel'
  | 'scope'
  | 'equalisation'
  | 'boq-builder'
  | 'contract'
  | 'commercial'
  | 'reports'
  | 'insights'
  | 'systemcheck'
  | 'copilotaudit'
  | 'admincenter'
  | 'settings'
  | 'scc'
  | 'scc-quote-import'
  | 'scc-contract-setup'
  | 'scc-claims'
  | 'scc-retention'
  | 'scc-variations'
  | 'bt-dashboard'
  | 'bt-projects';

interface SidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  projectId?: string | null;
  dashboardMode: DashboardMode;
  onDashboardModeChange: (mode: DashboardMode) => void;
}

const mainContractorMenu = [
  {
    section: 'QUOTE AUDIT (PRE-AWARD)',
    items: [
      { id: 'dashboard' as SidebarTab, label: 'Project Dashboard', icon: LayoutDashboard },
      { id: 'quotes' as SidebarTab, label: 'Import Quotes', icon: FileText },
      { id: 'quoteselect' as SidebarTab, label: 'Quote Select', icon: CheckSquare },
      { id: 'review' as SidebarTab, label: 'Review & Clean', icon: ClipboardCheck },
      { id: 'quoteintel' as SidebarTab, label: 'Quote Intelligence', icon: Sparkles },
      { id: 'scope' as SidebarTab, label: 'Scope Matrix', icon: Grid3x3 },
      { id: 'equalisation' as SidebarTab, label: 'Equalisation Analysis', icon: BarChart3 },
      { id: 'boq-builder' as SidebarTab, label: 'BOQ Builder', icon: FileSpreadsheet },
      { id: 'reports' as SidebarTab, label: 'Award Reports', icon: BarChart3 },
    ]
  },
  {
    section: 'CONTRACT & HANDOVER (POST-AWARD)',
    items: [
      { id: 'contract' as SidebarTab, label: 'Contract Manager', icon: Briefcase },
      { id: 'commercial' as SidebarTab, label: 'Commercial Control', icon: DollarSign },
    ]
  },
  {
    section: 'BASELINE TRACKER',
    items: [
      { id: 'bt-dashboard' as SidebarTab, label: 'BT Dashboard',  icon: BookOpen   },
      { id: 'bt-projects' as SidebarTab,  label: 'BT Projects',   icon: FolderOpen },
    ]
  }
];

const subContractorMenu = [
  {
    section: 'SCC: SUBCONTRACT COMMERCIAL CONTROL',
    items: [
      { id: 'scc' as SidebarTab,                label: 'SCC Dashboard',     icon: Layers     },
      { id: 'scc-quote-import' as SidebarTab,   label: 'Quote Import',      icon: FileText   },
      { id: 'scc-contract-setup' as SidebarTab, label: 'Contract Setup',    icon: Briefcase  },
      { id: 'scc-claims' as SidebarTab,         label: 'Progress Claims',   icon: TrendingUp },
      { id: 'scc-retention' as SidebarTab,      label: 'Retention & Materials', icon: DollarSign },
      { id: 'scc-variations' as SidebarTab,     label: 'Variation Register', icon: RefreshCw },
    ]
  },
  {
    section: 'BASELINE TRACKER',
    items: [
      { id: 'bt-dashboard' as SidebarTab, label: 'BT Dashboard',  icon: BookOpen   },
      { id: 'bt-projects' as SidebarTab,  label: 'BT Projects',   icon: FolderOpen },
    ]
  }
];

const adminItems = [
  { id: 'admincenter' as SidebarTab, label: 'Admin Center', icon: ShieldAlert, requiresAdminAccess: true },
  { id: 'settings' as SidebarTab, label: 'Settings', icon: Settings, requiresAdminAccess: true },
];

const getTradeDisplayName = (trade: Trade): string => {
  const tradeNames: Record<Trade, string> = {
    'passive_fire': 'Passive Fire',
    'electrical': 'Electrical',
    'hvac': 'HVAC',
    'plumbing': 'Plumbing',
    'active_fire': 'Active Fire',
  };
  return tradeNames[trade];
};

export default function Sidebar({ activeTab, onTabChange, projectId, dashboardMode, onDashboardModeChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const { currentTrade: selectedTrade } = useTrade();
  const { hasPermission, isSubContractor } = useOrganisation();
  const { isMasterAdmin } = useAdmin();

  const menuStructure = isSubContractor ? subContractorMenu : mainContractorMenu;

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', collapsed.toString());
  }, [collapsed]);

  return (
    <aside
      className={`${
        collapsed ? 'w-20' : 'w-64'
      } hidden md:flex flex-col border-r border-slate-800 bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)] transition-all duration-200 fixed left-0 top-0 h-screen z-40`}
    >
      {/* Brand Header */}
      <div className={`flex ${collapsed ? 'justify-center' : 'flex-col'} px-5 pt-5 pb-4`}>
        <div className={`flex items-center justify-center mb-2 overflow-hidden ${collapsed ? "h-12" : "h-24"}`}>
          <img
            src="/verifytrade_logo.png"
            alt="VerifyTrade"
            className={collapsed ? "h-20 w-auto object-cover object-center scale-125" : "h-36 w-auto object-cover object-center scale-125"}
          />
        </div>
        {!collapsed && (
          <div className="flex flex-col text-center">
            {isSubContractor ? (
              <>
                <span className="text-xs font-semibold tracking-wide text-cyan-300 flex items-center justify-center gap-1.5">
                  <HardHat size={12} />
                  SCC Module
                </span>
                <span className="text-[10px] text-slate-400">
                  Subcontract Commercial Control
                </span>
              </>
            ) : (
              <>
                <span className="text-xs font-semibold tracking-wide text-slate-50">
                  Verify+ {getTradeDisplayName(selectedTrade)}
                </span>
                <span className="text-[10px] text-slate-400">
                  Quote Audit Engine
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Dashboard Mode Toggle — only for main contractors */}
      {!isSubContractor && !collapsed && projectId && (
        <div className="px-3 pb-4 border-b border-slate-800/80">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 px-3 mb-2">
            Mode
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => {
                onDashboardModeChange('original');
                onTabChange('dashboard');
              }}
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
          </div>
        </div>
      )}

      {/* Main Navigation */}
      <nav className="flex-1 px-3 pb-4 pt-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
        {menuStructure.map((section, sectionIndex) => (
          <div key={section.section}>
            {!collapsed && (
              <div className={`text-[10px] uppercase tracking-[0.2em] px-3 mb-2 font-semibold ${
                sectionIndex > 0 ? 'mt-6 pt-6 border-t border-slate-800/60' : ''
              } ${isSubContractor ? 'text-cyan-600' : 'text-slate-500'}`}>
                {section.section}
              </div>
            )}

            <ul className="space-y-1">
              {section.items.map((item) => {
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
                            ? isSubContractor
                              ? 'bg-cyan-900/60 text-cyan-50 shadow-[0_0_0_1px_rgba(6,182,212,0.4)]'
                              : 'bg-slate-800/80 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.3)]'
                            : 'text-slate-400 hover:text-slate-50 hover:bg-slate-900/60'
                        }
                        ${collapsed ? 'justify-center' : ''}
                      `}
                      title={collapsed ? item.label : undefined}
                    >
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl flex-shrink-0 group-hover:bg-slate-900 ${
                        isActive && isSubContractor ? 'bg-cyan-900/80' : 'bg-slate-900/60'
                      }`}>
                        <Icon size={16} className={isActive && isSubContractor ? 'text-cyan-400' : ''} />
                      </span>
                      {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                      {!collapsed && isActive && (
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          isSubContractor
                            ? 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]'
                            : 'bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.8)]'
                        }`} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Admin Section */}
        {isMasterAdmin && (
          <div>
            {!collapsed && (
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 px-3 mb-2 mt-6 pt-6 border-t border-slate-800/60 font-semibold">
                ADMINISTRATION
              </div>
            )}
            <ul className="space-y-1">
              {adminItems.map((item) => {
                if (item.requiresAdminAccess && !isMasterAdmin) return null;

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
          </div>
        )}
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
