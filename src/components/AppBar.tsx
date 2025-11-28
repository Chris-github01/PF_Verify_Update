import { Folders, Upload, TrendingUp, FileText, Search, Bell, Settings as SettingsIcon, Menu, X, Sparkles, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';

export type PrimaryTab = 'project' | 'import' | 'analysis' | 'reports';

interface AppBarProps {
  activeTab: PrimaryTab;
  onTabChange: (tab: PrimaryTab) => void;
  currentProjectId?: string;
  currentProjectName?: string;
  onProjectChange?: (projectId: string) => void;
  onBackToDashboard?: () => void;
  onSearchOpen: () => void;
  notificationCount?: number;
  onSettingsOpen: () => void;
  mobileMenuOpen: boolean;
  onMobileMenuToggle: () => void;
  onCopilotOpen: () => void;
}

const primaryTabs = [
  { id: 'project' as PrimaryTab, label: 'Project', icon: Folders },
  { id: 'import' as PrimaryTab, label: 'Import', icon: Upload },
  { id: 'analysis' as PrimaryTab, label: 'Analysis', icon: TrendingUp },
  { id: 'reports' as PrimaryTab, label: 'Reports', icon: FileText },
];

export default function AppBar({
  activeTab,
  onTabChange,
  currentProjectId,
  currentProjectName,
  onProjectChange,
  onBackToDashboard,
  onSearchOpen,
  notificationCount = 0,
  onSettingsOpen,
  mobileMenuOpen,
  onMobileMenuToggle,
  onCopilotOpen,
}: AppBarProps) {
  return (
    <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <button
              onClick={onMobileMenuToggle}
              className="lg:hidden p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            <h1 className="text-lg font-bold text-gray-900 whitespace-nowrap">
              PassiveFire Verify+
            </h1>

            {currentProjectId && currentProjectName && (
              <div className="text-xs text-gray-500 ml-4 hidden md:block">
                {currentProjectName}
              </div>
            )}
          </div>

          <div className="hidden lg:flex items-center gap-1">
            {primaryTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  data-testid={`nav-${tab.id}`}
                  onClick={() => onTabChange(tab.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`
                    relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                    ${
                      isActive
                        ? 'text-blue-600 bg-blue-50 border border-blue-200'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }
                  `}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-blue-50 rounded-lg -z-10"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onCopilotOpen}
              className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors group"
              title="Verify+ Copilot"
            >
              <Sparkles size={20} className="group-hover:text-blue-600 transition-colors" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onSearchOpen}
              className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors group"
              title="Search (Ctrl+K)"
            >
              <Search size={20} />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="relative p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
              title="Notifications"
            >
              <Bell size={20} />
              {notificationCount > 0 && (
                <span className="absolute top-0 right-0 flex items-center justify-center h-5 w-5 text-xs font-bold text-white bg-red-500 rounded-full">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onSettingsOpen}
              className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
              title="Settings"
            >
              <SettingsIcon size={20} />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={async () => {
                await supabase.auth.signOut();
              }}
              className="p-2 text-gray-600 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
              title="Logout"
            >
              <LogOut size={20} />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
