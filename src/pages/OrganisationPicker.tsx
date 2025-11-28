// PERMANENT FIX FOR CHRIS – DO NOT REGRESS – USER MUST SEE "Pi" ORG
// CRITICAL: Wait for user session to load before rendering organisation selector
import { Building2, AlertCircle, Loader2, Shield, Bug, Check, ChevronRight, User, LogOut } from 'lucide-react';
import { useOrganisation } from '../lib/organisationContext';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface OrganisationPickerProps {
  onOrganisationSelected: () => void;
}

export default function OrganisationPicker({ onOrganisationSelected }: OrganisationPickerProps) {
  const { organisations, setCurrentOrganisation, loading, isAdminView, debugInfo } = useOrganisation();
  const [error, setError] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userLoading, setUserLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [creatingTestOrg, setCreatingTestOrg] = useState(false);
  const isDev = import.meta.env.DEV;
  const GOD_MODE_EMAILS = ['chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz'];
  const isGodMode = userEmail && GOD_MODE_EMAILS.includes(userEmail.toLowerCase());

  useEffect(() => {
    const loadUser = async () => {
      setUserLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      console.log('🔑 [OrganisationPicker] User loaded:', user?.id, user?.email);

      // TEST: Try to load organisations directly here
      if (user) {
        setCurrentUser(user);
        setUserEmail(user.email || '');

        // DEBUG: Try loading organisations directly
        console.log('🧪 [DEBUG] Testing direct organisations query...');
        const { data: testOrgs, error: testError } = await supabase
          .from('organisations')
          .select('id, name, created_at');

        console.log('🧪 [DEBUG] Direct query result:', {
          success: !testError,
          count: testOrgs?.length || 0,
          orgs: testOrgs,
          error: testError
        });
      }
      setUserLoading(false);
    };
    loadUser();
  }, []);

  const handleSelect = (orgId: string) => {
    const org = organisations.find(o => o.id === orgId);
    if (org) {
      setCurrentOrganisation(org);
      onOrganisationSelected();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleForceCreateTestOrg = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🚀 [OrganisationPicker] Force Create Test Org clicked');
    console.log('Current user:', currentUser?.id, currentUser?.email);
    console.log('Is God Mode:', isGodMode);

    if (!currentUser || !isGodMode) {
      console.warn('❌ Cannot create test org - missing user or not God Mode');
      alert('You must be logged in as a God-Mode user to create a test org');
      return;
    }

    setCreatingTestOrg(true);
    try {
      console.log('📡 Calling create_god_mode_test_org RPC...');
      const { data: newOrgId, error } = await supabase.rpc('create_god_mode_test_org', {
        for_user_id: currentUser.id
      });

      if (error) {
        console.error('❌ Error creating test org:', error);
        alert('Failed to create test org: ' + error.message);
      } else {
        console.log('✅ Test org created:', newOrgId);
        alert('Test org created successfully! Refreshing...');
        window.location.reload();
      }
    } catch (err) {
      console.error('❌ Error:', err);
      alert('Failed to create test org');
    } finally {
      setCreatingTestOrg(false);
    }
  };

  const handleOpenAdminConsole = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🔧 [OrganisationPicker] Open Admin Console clicked');
    console.log('Navigating to /admin');
    window.location.href = '/admin';
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 text-blue-600 animate-spin" size={48} />
          <p className="text-gray-600">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    console.error('❌ [OrganisationPicker] No authenticated user found');
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-gray-600 mb-4">Please sign in to continue</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 text-blue-600 animate-spin" size={48} />
          <p className="text-gray-600">Loading organisations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="text-blue-600" size={32} />
              <span className="text-xl font-bold text-gray-900">PassiveFire Verify+</span>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                  {userEmail ? userEmail[0].toUpperCase() : 'U'}
                </div>
                <span className="hidden sm:block text-sm font-medium text-gray-700">{userEmail}</span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <p className="text-sm font-medium text-gray-900">Signed in as</p>
                    <p className="text-sm text-gray-600 truncate">{userEmail}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Your Organisations</h1>
          <p className="text-lg text-gray-600">Select an organisation to continue</p>
          {isAdminView && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
              <Shield size={16} />
              Platform Admin View
            </div>
          )}
        </div>

        {organisations.length > 0 ? (
          <>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {organisations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSelect(org.id)}
                  className="group bg-white rounded-xl border-2 border-gray-200 p-6 hover:border-blue-500 hover:shadow-lg transition-all text-left"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-sm">
                      {getInitials(org.name)}
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        <Check className="text-white" size={16} />
                      </div>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                    {org.name}
                  </h3>

                  <div className="flex items-center justify-end">
                    <ChevronRight className="text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" size={20} />
                  </div>
                </button>
              ))}
            </div>

            {isAdminView && (
              <div className="text-center">
                <div className="flex justify-center gap-3">
                  <button
                    onClick={handleOpenAdminConsole}
                    type="button"
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                  >
                    <Shield size={18} />
                    Open Admin Console
                  </button>
                  {isGodMode && (
                    <button
                      onClick={handleForceCreateTestOrg}
                      disabled={creatingTestOrg}
                      type="button"
                      className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {creatingTestOrg ? 'Creating...' : '🚀 Force Create Test Org'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <AlertCircle className="mx-auto mb-4 text-gray-400" size={48} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Organisations Found</h3>
            <p className="text-gray-600 mb-6">
              You are not a member of any organisation. Please contact your administrator to be added to an organisation.
            </p>

            {(isDev || isGodMode) && (
              <div className="mt-6 border-t pt-6">
                <div className="flex flex-wrap justify-center gap-3 mb-4">
                  <button
                    onClick={() => {
                      console.log('🧹 Clearing all cache and reloading...');
                      localStorage.clear();
                      sessionStorage.clear();
                      window.location.reload();
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-red-600 border border-red-700 rounded-lg hover:bg-red-700 transition-colors shadow-md"
                  >
                    🧹 Clear Cache & Reload
                  </button>
                  <button
                    onClick={() => setShowDebug(!showDebug)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    <Bug size={16} />
                    {showDebug ? 'Hide' : 'Show'} Debug Info
                  </button>
                </div>

                {showDebug && debugInfo && (
                  <div className="mt-4 p-4 bg-gray-900 text-gray-100 rounded-lg text-left text-xs font-mono overflow-auto max-h-96">
                    <div className="mb-2 text-amber-400 font-bold">Debug Information:</div>

                    {debugInfo.isGodMode && (
                      <div className="mb-4 p-3 bg-yellow-900 border border-yellow-600 rounded">
                        <div className="text-yellow-300 font-bold text-sm mb-1">👑 GOD-MODE OWNER STATUS: ACTIVE</div>
                        <div className="text-yellow-100 text-xs">You have permanent access to ALL organisations</div>
                        {debugInfo.autoCreateTriggered && (
                          <div className="mt-2 text-yellow-200 text-xs">
                            🚀 Auto-create triggered: {debugInfo.autoCreateError || 'Success'}
                          </div>
                        )}
                      </div>
                    )}

                    <pre className="whitespace-pre-wrap">{JSON.stringify(debugInfo, null, 2)}</pre>
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <div className="text-amber-400 font-bold mb-2">Quick Actions:</div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleOpenAdminConsole}
                          type="button"
                          className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        >
                          Open Admin Console
                        </button>
                        {isGodMode && (
                          <button
                            onClick={handleForceCreateTestOrg}
                            disabled={creatingTestOrg}
                            type="button"
                            className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {creatingTestOrg ? 'Creating...' : '🚀 Force Create Test Org'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
