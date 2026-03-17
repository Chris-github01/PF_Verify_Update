import { Search, Bell, Menu, X, Sparkles, LogOut, User, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useOrganisation } from '../lib/organisationContext';
import TradeSelectorDropdown from './TradeSelectorDropdown';

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
  onOrganisationClick?: () => void;
  sccContractName?: string | null;
  onSccContractClick?: () => void;
}

interface Project {
  id: string;
  name: string;
  client: string | null;
  reference: string | null;
  trade?: string;
}

export default function AppBar({
  currentProjectId,
  currentProjectName,
  onProjectChange,
  onSearchOpen,
  notificationCount = 0,
  mobileMenuOpen,
  onMobileMenuToggle,
  onCopilotOpen,
  onOrganisationClick,
  sccContractName,
  onSccContractClick,
}: AppBarProps) {
  const { currentOrganisation } = useOrganisation();
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectTrade, setCurrentProjectTrade] = useState<string>('passive_fire');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentOrganisation) {
      loadProjects();
    }
  }, [currentOrganisation]);

  useEffect(() => {
    if (currentProjectId) {
      loadCurrentProjectTrade();
    }
  }, [currentProjectId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProjectDropdown(false);
      }
    }

    if (showProjectDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showProjectDropdown]);

  const loadProjects = async () => {
    if (!currentOrganisation) return;

    const { data, error } = await supabase
      .from('projects')
      .select('id, name, client, reference, trade')
      .eq('organisation_id', currentOrganisation.id)
      .order('name', { ascending: true });

    if (!error && data) {
      setProjects(data);
    }
  };

  const loadCurrentProjectTrade = async () => {
    if (!currentProjectId) return;

    const { data, error } = await supabase
      .from('projects')
      .select('trade')
      .eq('id', currentProjectId)
      .maybeSingle();

    if (!error && data) {
      setCurrentProjectTrade(data.trade || 'passive_fire');
    }
  };

  const handleProjectSelect = (projectId: string) => {
    setShowProjectDropdown(false);
    if (onProjectChange) {
      onProjectChange(projectId);
    }
  };

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
            <button
              onClick={onOrganisationClick}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1 text-xs text-slate-200 shadow-sm hover:border-sky-500 hover:text-sky-200 transition-colors"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {currentOrganisation.name}
              {currentOrganisation.subscription_status === 'trial' && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-orange-950/50 text-orange-400 border border-orange-700/50 rounded ml-1">
                  Trial
                </span>
              )}
            </button>
          )}

          <div className="hidden md:flex">
            <TradeSelectorDropdown />
          </div>

          {sccContractName && (
            <button
              onClick={onSccContractClick}
              className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1 text-xs text-slate-200 shadow-sm hover:border-cyan-500 hover:text-cyan-200 transition-colors"
            >
              {sccContractName}
              <ChevronDown size={12} className="text-slate-400" />
            </button>
          )}

          {currentProjectId && currentProjectName && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1 text-xs text-slate-200 shadow-sm hover:border-sky-500 hover:text-sky-200 transition-colors"
              >
                {currentProjectName}
                <ChevronDown size={12} className={`text-slate-400 transition-transform ${showProjectDropdown ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showProjectDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute left-0 top-full mt-2 w-72 rounded-lg border border-slate-700/80 bg-slate-900/95 backdrop-blur-sm shadow-xl overflow-hidden z-50"
                  >
                    <div className="py-2 max-h-80 overflow-y-auto">
                      <div className="px-3 py-2 text-xs font-medium text-slate-400 border-b border-slate-800">
                        Switch Project
                      </div>
                      {projects.length === 0 ? (
                        <div className="px-3 py-4 text-xs text-slate-500 text-center">
                          No projects available
                        </div>
                      ) : (
                        projects.map((project) => (
                          <button
                            key={project.id}
                            onClick={() => handleProjectSelect(project.id)}
                            className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-800/70 transition-colors ${
                              project.id === currentProjectId
                                ? 'bg-sky-900/30 text-sky-200 border-l-2 border-sky-500'
                                : 'text-slate-300'
                            }`}
                          >
                            <div className="font-medium">{project.name}</div>
                            {(project.client || project.reference) && (
                              <div className="text-slate-500 mt-0.5">
                                {project.client || project.reference}
                              </div>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
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
