import { useState, useEffect } from 'react';
import { ChevronDown, Bell, User, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrganisation } from '../lib/organisationContext';

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
  const { currentOrganisation } = useOrganisation();

  useEffect(() => {
    loadProjects();
    loadUser();
  }, [currentOrganisation]);

  const loadProjects = async () => {
    if (!currentOrganisation) return;

    const { data } = await supabase
      .from('projects')
      .select('id, name, client, reference')
      .eq('organisation_id', currentOrganisation.id)
      .order('updated_at', { ascending: false });

    if (data) setProjects(data);
  };

  const loadUser = async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) setUserEmail(data.user.email || '');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {currentOrganisation && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Building2 size={16} />
              <span>{currentOrganisation.name}</span>
            </div>
          )}

          {currentProjectId && (
            <div className="relative">
              <button
                onClick={() => setShowProjectMenu(!showProjectMenu)}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <span className="font-medium">{currentProjectName || 'Select Project'}</span>
                <ChevronDown size={16} />
              </button>

              {showProjectMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowProjectMenu(false)}
                  />
                  <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-20 max-h-96 overflow-y-auto">
                    <div className="p-2">
                      <button
                        onClick={() => {
                          onBackToDashboard();
                          setShowProjectMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded-lg text-sm font-medium text-blue-600"
                      >
                        All Projects
                      </button>
                      <div className="border-t border-gray-200 my-2" />
                      {projects.map((project) => (
                        <button
                          key={project.id}
                          onClick={() => {
                            onProjectChange(project.id);
                            setShowProjectMenu(false);
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-gray-100 rounded-lg text-sm ${
                            project.id === currentProjectId ? 'bg-blue-50 text-blue-600' : ''
                          }`}
                        >
                          <div className="font-medium">{project.name}</div>
                          {project.client && (
                            <div className="text-xs text-gray-500">{project.client}</div>
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

        <div className="flex items-center gap-4">
          <button className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <Bell size={20} />
            {notificationCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {notificationCount}
              </span>
            )}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <User size={20} />
              <ChevronDown size={16} />
            </button>

            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                  <div className="p-4 border-b border-gray-200">
                    <div className="text-sm font-medium text-gray-900">{userEmail}</div>
                    {currentOrganisation && (
                      <div className="text-xs text-gray-500 mt-1">{currentOrganisation.name}</div>
                    )}
                  </div>
                  <div className="p-2">
                    <button
                      onClick={() => {
                        onNavigateToAccount();
                        setShowUserMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded-lg text-sm"
                    >
                      Account Settings
                    </button>
                    <button
                      onClick={() => {
                        onSwitchOrganisation();
                        setShowUserMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded-lg text-sm"
                    >
                      Switch Organisation
                    </button>
                    <div className="border-t border-gray-200 my-2" />
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded-lg text-sm text-red-600"
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
