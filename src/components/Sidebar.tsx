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
  Package,
  Truck,
  Building2,
  ChevronDown,
  Check,
  FlaskConical,
} from 'lucide-react';
import type { DashboardMode } from '../App';
import { useOrganisation } from '../lib/organisationContext';
import { useAdmin } from '../lib/adminContext';
import { useTrade } from '../lib/tradeContext';
import type { Trade } from '../lib/userPreferences';
import { supabase } from '../lib/supabase';

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
  | 'scc-base-tracker'
  | 'scc-claims'
  | 'scc-retention'
  | 'scc-variations'
  | 'scc-verify-stock'
  | 'scc-plant-hire'
  | 'bt-dashboard';

interface SccContract {
  id: string;
  contract_name: string;
  contract_number: string;
  subcontractor_company: string;
  status: string;
}

interface SidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  projectId?: string | null;
  dashboardMode: DashboardMode;
  onDashboardModeChange: (mode: DashboardMode) => void;
  sccContractId?: string | null;
  sccContractName?: string | null;
  onSccContractChange?: (id: string | null, name: string | null) => void;
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
  // BASELINE TRACKER section hidden — not yet visible in sidebar
  // { section: 'BASELINE TRACKER', items: [{ id: 'bt-dashboard' as SidebarTab, label: 'BT Dashboard', icon: BookOpen }] }
];

const subContractorMenu = [
  {
    section: 'SCC: SUBCONTRACT COMMERCIAL CONTROL',
    items: [
      { id: 'scc' as SidebarTab,               label: 'SCC Dashboard',         icon: Layers     },
      { id: 'scc-quote-import' as SidebarTab,  label: 'Quote Import',          icon: FileText   },
      { id: 'scc-base-tracker' as SidebarTab,  label: 'Base Tracker',          icon: BookOpen   },
      { id: 'scc-claims' as SidebarTab,        label: 'Payment Claims',        icon: TrendingUp },
      { id: 'scc-retention' as SidebarTab,    label: 'Retention & Materials', icon: DollarSign },
      { id: 'scc-variations' as SidebarTab,    label: 'Variation Register',    icon: RefreshCw  },
    ]
  },
  {
    section: 'STOCK MANAGEMENT',
    items: [
      { id: 'scc-verify-stock' as SidebarTab, label: 'Verify Stock',  icon: Package },
      { id: 'scc-plant-hire'  as SidebarTab, label: 'Plant Hire',    icon: Truck   },
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

export default function Sidebar({ activeTab, onTabChange, projectId, dashboardMode, onDashboardModeChange, sccContractId, sccContractName, onSccContractChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const [sccContracts, setSccContracts] = useState<SccContract[]>([]);
  const [sccPickerOpen, setSccPickerOpen] = useState(false);
  const { currentTrade: selectedTrade } = useTrade();
  const { hasPermission, isSubContractor, currentOrganisation } = useOrganisation();
  const { isMasterAdmin } = useAdmin();

  const menuStructure = isSubContractor ? subContractorMenu : mainContractorMenu;

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', collapsed.toString());
  }, [collapsed]);

  useEffect(() => {
    if (!isSubContractor || !currentOrganisation?.id) return;
    supabase
      .from('scc_contracts')
      .select('id, contract_name, contract_number, subcontractor_company, status')
      .eq('organisation_id', currentOrganisation.id)
      .in('status', ['setup', 'active'])
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setSccContracts(data || []);
      });
  }, [isSubContractor, currentOrganisation?.id]);

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

      {/* SCC Contract Selector — only for subcontractors */}
      {isSubContractor && !collapsed && (
        <div className="px-3 pb-3 border-b border-slate-800/80">
          <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-700 px-1 mb-2 font-semibold">
            Active Contract
          </div>
          <div className="relative">
            <button
              onClick={() => setSccPickerOpen(!sccPickerOpen)}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-900/60 border border-slate-700/60 rounded-xl text-left hover:border-cyan-500/50 transition-all group"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-900/40 flex-shrink-0">
                <Building2 size={13} className="text-cyan-400" />
              </span>
              <span className="flex-1 min-w-0">
                {sccContractName ? (
                  <span className="block text-xs font-medium text-white truncate">{sccContractName}</span>
                ) : (
                  <span className="block text-xs text-slate-400">Select a contract...</span>
                )}
                {sccContracts.length > 0 && (
                  <span className="block text-[10px] text-slate-500">{sccContracts.length} contract{sccContracts.length !== 1 ? 's' : ''} available</span>
                )}
              </span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform flex-shrink-0 ${sccPickerOpen ? 'rotate-180' : ''}`} />
            </button>

            {sccPickerOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                {sccContracts.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-slate-400 text-center">
                    No active contracts found.<br />
                    <button
                      onClick={() => { onTabChange('scc-quote-import'); setSccPickerOpen(false); }}
                      className="mt-1 text-cyan-400 hover:text-cyan-300 underline"
                    >
                      Import a quote to create one
                    </button>
                  </div>
                ) : (
                  <ul className="py-1 max-h-48 overflow-y-auto">
                    {sccContracts.map((c) => (
                      <li key={c.id}>
                        <button
                          onClick={() => {
                            onSccContractChange?.(c.id, c.contract_name);
                            setSccPickerOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-800 transition-colors"
                        >
                          <span className="flex-1 min-w-0">
                            <span className="block text-xs font-medium text-white truncate">{c.contract_name}</span>
                            <span className="block text-[10px] text-slate-400 truncate">
                              {c.contract_number && `#${c.contract_number} · `}{c.subcontractor_company}
                            </span>
                          </span>
                          {sccContractId === c.id && (
                            <Check size={13} className="text-cyan-400 flex-shrink-0" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Admin Console + Shadow Dashboard Buttons */}
      {isMasterAdmin && (
        <div className="px-3 pb-3 border-t border-slate-800/80 pt-3 space-y-1.5">
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
          <button
            onClick={() => window.location.href = '/shadow'}
            className={`
              group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all
              text-amber-500/80 hover:text-amber-400 hover:bg-amber-900/10 border border-amber-800/40
              ${collapsed ? 'justify-center' : ''}
            `}
            title={collapsed ? 'Shadow Dashboard' : undefined}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-900/20 group-hover:bg-amber-900/30 flex-shrink-0">
              <FlaskConical size={16} className="text-amber-500" />
            </span>
            {!collapsed && <span className="flex-1 text-left">Shadow Dashboard</span>}
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
