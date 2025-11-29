import { Search, Bell, Menu, X, Sparkles, LogOut, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useOrganisation } from '../lib/organisationContext';

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

export default function AppBar({
  currentProjectId,
  currentProjectName,
  onSearchOpen,
  notificationCount = 0,
  mobileMenuOpen,
  onMobileMenuToggle,
  onCopilotOpen,
}: AppBarProps) {
  const { currentOrganisation } = useOrganisation();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur">
      <div className="flex items-center justify-between px-4 lg:px-8 h-14">
        <div className="flex items-center gap-3">
          <button
            onClick={onMobileMenuToggle}
            className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/80 text-slate-300 hover:border-sky-500 hover:text-sky-200"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {currentOrganisation && (
            <button className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1 text-xs text-slate-200 shadow-sm hover:border-sky-500 hover:text-sky-200 transition-colors">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {currentOrganisation.name}
            </button>
          )}

          {currentProjectId && currentProjectName && (
            <button className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1 text-xs text-slate-200 shadow-sm hover:border-sky-500 hover:text-sky-200 transition-colors">
              {currentProjectName}
              <span className="text-slate-500">▼</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onCopilotOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/80 text-slate-300 hover:border-purple-500 hover:text-purple-200 transition-colors group"
            title="Verify+ Copilot"
          >
            <Sparkles size={16} className="group-hover:text-purple-400 transition-colors" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onSearchOpen}
            className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/80 text-slate-300 hover:border-sky-500 hover:text-sky-200 transition-colors"
            title="Search (Ctrl+K)"
          >
            <Search size={16} />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/80 text-slate-300 hover:border-sky-500 hover:text-sky-200 transition-colors"
            title="Notifications"
          >
            <Bell size={16} />
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
            )}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={async () => {
              await supabase.auth.signOut();
            }}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-200 hover:border-sky-500 hover:text-sky-200 transition-colors group"
            title="Logout"
          >
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-[11px] flex items-center justify-center flex-shrink-0">
              <User size={14} className="text-white" />
            </div>
            <span className="hidden sm:inline">Account</span>
            <LogOut size={14} className="hidden sm:inline text-slate-400 group-hover:text-rose-400 transition-colors" />
          </motion.button>
        </div>
      </div>
    </header>
  );
}
