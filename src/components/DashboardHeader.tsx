import { useState, useEffect } from 'react';
import { ChevronDown, Bell, User, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrganisation } from '../lib/organisationContext';
import TradeSelectorDropdown from './TradeSelectorDropdown';

interface DashboardHeaderProps {
  currentProjectId?: string;
  currentProjectName?: string;
  onProjectChange: (projectId: string) => void;
  onBackToDashboard: () => void;
  notificationCount?: number;
  onNavigateToAccount: () => void;
  onNavigateToBilling: () => void;
  onSwitchOrganisation: () => void;
}

export default function DashboardHeader({
  currentProjectId,
  currentProjectName,
  onProjectChange,
  onBackToDashboard,
  notificationCount = 0,
  onNavigateToAccount,
  onSwitchOrganisation,
}: DashboardHeaderProps) {
  const [projects, setProjects] = useState<any[]>([]);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [currentProjectTrade, setCurrentProjectTrade] = useState<string>('passive_fire');
  const { currentOrganisation } = useOrganisation();

  useEffect(() => {
    loadProjects();
    loadUser();
  }, [currentOrganisation]);

  useEffect(() => {
    if (currentProjectId) {
      loadCurrentProjectTrade();
    }
  }, [currentProjectId]);

  const loadProjects = async () => {
    if (!currentOrganisation) return;

    const { data } = await supabase
      .from('projects')
      .select('id, name, client, reference, trade')
      .eq('organisation_id', currentOrganisation.id)
      .order('updated_at', { ascending: false });

    if (data) setProjects(data);
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

  const loadUser = async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) setUserEmail(data.user.email || '');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <header className="bg-slate-900 border-b border-slate-700/60 px-6 py-3.5 sticky top-0 z-30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {currentOrganisation && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Building2 size={15} />
              <span>{currentOrganisation.name}</span>
            </div>
          )}

          <div className="border-l border-slate-700 pl-4 ml-4">
            <TradeSelectorDropdown />
          </div>

          {currentProjectId && (
            <div className="relative">
              <button
                onClick={() => setShowProjectMenu(!showProjectMenu)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors text-slate-200"
              >
                <span className="font-medium text-sm">{currentProjectName || 'Select Project'}</span>
                <ChevronDown size={15} className="text-slate-400" />
              </button>

              {showProjectMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowProjectMenu(false)}
                  />
                  <div className="absolute top-full left-0 mt-2 w-64 bg-slate-800 rounded-lg shadow-xl border border-slate-700 z-20 max-h-96 overflow-y-auto">
                    <div className="p-2">
                      <button
                        onClick={() => {
                          onBackToDashboard();
                          setShowProjectMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-700 rounded-lg text-sm font-medium text-orange-400"
                      >
                        All Projects
                      </button>
                      <div className="border-t border-slate-700 my-2" />
                      {projects.map((project) => (
                        <button
                          key={project.id}
                          onClick={() => {
                            onProjectChange(project.id);
                            setShowProjectMenu(false);
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-slate-700 rounded-lg text-sm ${
                            project.id === currentProjectId ? 'bg-orange-500/10 text-orange-400' : 'text-slate-300'
                          }`}
                        >
                          <div className="font-medium">{project.name}</div>
                          {project.client && (
                            <div className="text-xs text-slate-500 mt-0.5">{project.client}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button className="relative p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-slate-200">
            <Bell size={18} />
            {notificationCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {notificationCount}
              </span>
            )}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-300"
            >
              <User size={17} />
              <ChevronDown size={14} className="text-slate-500" />
            </button>

            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute top-full right-0 mt-2 w-64 bg-slate-800 rounded-lg shadow-xl border border-slate-700 z-20">
                  <div className="p-4 border-b border-slate-700">
                    <div className="text-sm font-medium text-slate-100">{userEmail}</div>
                    {currentOrganisation && (
                      <div className="text-xs text-slate-500 mt-1">{currentOrganisation.name}</div>
                    )}
                  </div>
                  <div className="p-2">
                    <button
                      onClick={() => {
                        onNavigateToAccount();
                        setShowUserMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-700 rounded-lg text-sm text-slate-300"
                    >
                      Account Settings
                    </button>
                    <button
                      onClick={() => {
                        onSwitchOrganisation();
                        setShowUserMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-700 rounded-lg text-sm text-slate-300"
                    >
                      Switch Organisation
                    </button>
                    <div className="border-t border-slate-700 my-2" />
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-3 py-2 hover:bg-slate-700 rounded-lg text-sm text-red-400"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
