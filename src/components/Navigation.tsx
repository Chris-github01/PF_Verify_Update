import { LayoutDashboard, FileUp, ClipboardCheck, Grid3x3, Scale, FileBarChart, Brain, BarChart3, DollarSign, TrendingUp, FileText, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

type Tab = 'dashboard' | 'import' | 'review' | 'scope' | 'equalisation' | 'award' | 'quoteintel' | 'basetracker' | 'claimsvariations' | 'tradeanalysis' | 'insights' | 'settings';

interface NavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  currentProjectId?: string;
  currentProjectName?: string;
  onProjectChange?: (projectId: string) => void;
  onBackToDashboard?: () => void;
}

const tabs = [
  { id: 'dashboard' as Tab, label: 'Project Dashboard', icon: LayoutDashboard },
  { id: 'import' as Tab, label: 'Import Quotes', icon: FileUp },
  { id: 'review' as Tab, label: 'Review & Clean', icon: ClipboardCheck },
  { id: 'scope' as Tab, label: 'Scope Matrix', icon: Grid3x3 },
  { id: 'equalisation' as Tab, label: 'Equalisation', icon: Scale },
  { id: 'award' as Tab, label: 'Award Report', icon: FileBarChart },
  { id: 'quoteintel' as Tab, label: 'Quote Intelligence', icon: Brain },
  { id: 'basetracker' as Tab, label: 'Base Tracker', icon: BarChart3 },
  { id: 'claimsvariations' as Tab, label: 'Claims & Variations', icon: DollarSign },
  { id: 'tradeanalysis' as Tab, label: 'Trade Analysis', icon: FileText },
  { id: 'insights' as Tab, label: 'Insights Dashboard', icon: TrendingUp },
  { id: 'settings' as Tab, label: 'Settings', icon: Settings },
];

export default function Navigation({
  activeTab,
  onTabChange,
  currentProjectId,
  currentProjectName,
  onProjectChange,
  onBackToDashboard,
}: NavigationProps) {
  return (
    <nav className="nav-blur border-b border-cyan-500/30 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white">
              <span className="cyan-glow">PassiveFire Verify+</span>
              {currentProjectName && (
                <span className="text-gray-300 font-normal text-sm ml-2">— {currentProjectName}</span>
              )}
            </h1>
          </div>
          <div className="flex space-x-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`
                    relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200
                    ${
                      isActive
                        ? 'text-white tab-active'
                        : 'text-gray-300 hover:text-white'
                    }
                  `}
                  style={isActive ? {
                    background: 'rgba(0, 234, 255, 0.1)',
                    border: '1px solid rgba(0, 234, 255, 0.3)',
                  } : undefined}
                >
                  <Icon size={18} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
