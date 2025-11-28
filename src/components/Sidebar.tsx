import { useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  Grid3x3,
  ShieldCheck,
  Shield,
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
import { t } from '../i18n';
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
  const [collapsed, setCollapsed] = useState(false);
  const { hasPermission } = useOrganisation();
  const { isMasterAdmin } = useAdmin();

  return (
    <div
      className={`${
        collapsed ? 'w-20' : 'w-64'
      } bg-white border-r border-gray-200 flex flex-col transition-all duration-200 relative`}
    >
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <Flame className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-[14px] font-bold brand-navy leading-tight">PassiveFire</h1>
              <p className="text-[11px] text-gray-600">Verify+</p>
            </div>
          )}
        </div>
      </div>

      {/* Dashboard Mode Toggle */}
      {!collapsed && projectId && (
        <div className="p-3 border-b border-gray-200">
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => onDashboardModeChange('original')}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all
                ${
                  dashboardMode === 'original'
                    ? 'bg-orange-50 brand-primary'
                    : 'text-gray-600 hover:bg-gray-50'
                }
              `}
            >
              <LayoutDashboard size={14} className="flex-shrink-0" />
              <span>Original Quote Comparison</span>
            </button>
            <button
              onClick={() => onDashboardModeChange('revisions')}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all
                ${
                  dashboardMode === 'revisions'
                    ? 'bg-orange-50 brand-primary'
                    : 'text-gray-600 hover:bg-gray-50'
                }
              `}
            >
              <RefreshCw size={14} className="flex-shrink-0" />
              <span>Quote Revisions & RFIs</span>
            </button>
          </div>
        </div>
      )}

      <nav className="flex-1 p-2 space-y-0.5">
        {menuItems.map((item) => {
          if ((item as any).requiresManagePermission && !hasPermission('manage')) {
            return null;
          }

          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2 rounded-md text-[14px] font-medium transition-all
                ${
                  isActive
                    ? 'bg-orange-50 brand-primary'
                    : 'text-gray-700 hover:bg-gray-50'
                }
                ${collapsed ? 'justify-center' : ''}
              `}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {isMasterAdmin && (
        <div className="p-2 border-t border-gray-200">
          <button
            onClick={() => window.location.href = '/admin'}
            className={`
              w-full flex items-center gap-3 px-3 py-2 rounded-md text-[14px] font-medium transition-all
              text-gray-700 hover:bg-gray-50 border border-gray-200
              ${collapsed ? 'justify-center' : ''}
            `}
            title={collapsed ? 'Admin Console' : undefined}
          >
            <ShieldAlert size={18} className="flex-shrink-0" />
            {!collapsed && <span>Admin Console</span>}
          </button>
        </div>
      )}

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors shadow-sm"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </div>
  );
}
