// PERMANENT FIX FOR CHRIS – DO NOT REGRESS – USER MUST SEE "Pi" ORG
// CRITICAL: Wait for user session to load before rendering organisation selector
import { Building2, AlertCircle, Loader2, Shield, Bug, Check, ChevronRight, User, LogOut, X } from 'lucide-react';
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [selectedTier, setSelectedTier] = useState<'starter' | 'professional'>('starter');
  const [creatingOrg, setCreatingOrg] = useState(false);
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
          .select('id, name, created_at, subscription_status');

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

  const handleCreateTrialOrg = async () => {
    if (!orgName.trim()) {
      setError('Please enter an organization name');
      return;
    }

    if (!currentUser) {
      setError('You must be logged in to create an organization');
      return;
    }

    setCreatingOrg(true);
    setError('');

    try {
      const { data, error: fnError } = await supabase.rpc('create_trial_account', {
        p_user_id: currentUser.id,
        p_email: currentUser.email,
        p_organisation_name: orgName.trim(),
        p_pricing_tier: selectedTier
      });

      if (fnError) throw fnError;

      console.log('✅ Trial organization created:', data);
      alert('Organization created successfully! Refreshing...');
      window.location.reload();
    } catch (err: any) {
      console.error('❌ Failed to create organization:', err);
      setError(err.message || 'Failed to create organization');
    } finally {
      setCreatingOrg(false);
    }
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
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)] flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 text-orange-500 animate-spin" size={48} />
          <p className="text-slate-400">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    console.error('❌ [OrganisationPicker] No authenticated user found');
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)] flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
          <h2 className="text-xl font-bold text-slate-50 mb-2">Authentication Required</h2>
          <p className="text-slate-400 mb-4">Please sign in to continue</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-gradient-to-br from-orange-400 to-red-600 text-white rounded-lg hover:from-orange-500 hover:to-red-700 transition-all shadow-lg shadow-orange-500/30 font-medium"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)] flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 text-orange-500 animate-spin" size={48} />
          <p className="text-slate-400">Loading organisations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)]">
      <header className="border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/verifytrade-new-logo.png"
                alt="VerifyTrade"
                className="h-10 w-auto object-contain"
              />
            </div>

            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-600 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-lg shadow-orange-500/20">
                  {userEmail ? userEmail[0].toUpperCase() : 'U'}
                </div>
                <span className="hidden sm:block text-sm font-medium text-slate-300">{userEmail}</span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-slate-900 rounded-lg shadow-xl border border-slate-700 py-1 z-10">
                  <div className="px-4 py-3 border-b border-slate-700">
                    <p className="text-sm font-medium text-slate-300">Signed in as</p>
                    <p className="text-sm text-slate-400 truncate">{userEmail}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-950/30 transition-colors flex items-center gap-2"
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
          <h1 className="text-4xl font-bold text-slate-50 mb-2">Your Organisations</h1>
          <p className="text-lg text-slate-400">Select an organisation to continue</p>
          {isAdminView && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-400 bg-amber-950/30 border border-amber-700/50 rounded-lg">
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
                  className="group bg-slate-900/50 backdrop-blur-sm rounded-xl border-2 border-slate-700 p-6 hover:border-orange-500 hover:shadow-xl hover:shadow-orange-500/20 transition-all text-left"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-red-600 rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-orange-500/30">
                      {getInitials(org.name)}
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-600 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/30">
                        <Check className="text-white" size={16} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-slate-50 group-hover:text-orange-400 transition-colors">
                      {org.name}
                    </h3>
                    {org.subscription_status === 'trial' && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-orange-950/50 text-orange-400 border border-orange-700/50 rounded">
                        Trial
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-end">
                    <ChevronRight className="text-slate-500 group-hover:text-orange-400 group-hover:translate-x-1 transition-all" size={20} />
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
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-slate-300 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 hover:border-slate-600 transition-colors shadow-lg"
                  >
                    <Shield size={18} />
                    Open Admin Console
                  </button>
                  {isGodMode && (
                    <button
                      onClick={handleForceCreateTestOrg}
                      disabled={creatingTestOrg}
                      type="button"
                      className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-gradient-to-br from-green-500 to-green-600 rounded-lg hover:from-green-600 hover:to-green-700 transition-all shadow-lg shadow-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <AlertCircle className="mx-auto mb-4 text-slate-500" size={48} />
            <h3 className="text-lg font-semibold text-slate-50 mb-2">No Organisations Found</h3>
            <p className="text-slate-400 mb-6">
              You are not a member of any organisation. Create your trial organization to get started.
            </p>

            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-orange-400 to-red-600 text-white rounded-lg font-semibold hover:from-orange-500 hover:to-red-700 transition-all shadow-lg shadow-orange-500/30"
            >
              <Building2 size={20} />
              Create Trial Organization
            </button>

            {(isDev || isGodMode) && showDebug && (
              <div className="mt-6 border-t border-slate-700 pt-6">

                {debugInfo && (
                  <div className="mt-4 p-4 bg-slate-900 text-slate-100 rounded-lg text-left text-xs font-mono overflow-auto max-h-96 border border-slate-700">
                    <div className="mb-2 text-amber-400 font-bold">Debug Information:</div>

                    {debugInfo.isGodMode && (
                      <div className="mb-4 p-3 bg-yellow-950/50 border border-yellow-700/50 rounded">
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
                    <div className="mt-4 pt-4 border-t border-slate-700">
                      <div className="text-amber-400 font-bold mb-2">Quick Actions:</div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleOpenAdminConsole}
                          type="button"
                          className="px-3 py-1.5 bg-slate-700 text-slate-200 rounded hover:bg-slate-600 transition-colors"
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

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-50">Create Trial Organization</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setError('');
                }}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Organization Name
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Your Company Name"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Select Trial Plan
                </label>
                <div className="grid md:grid-cols-2 gap-4">
                  <button
                    onClick={() => setSelectedTier('starter')}
                    className={`text-left p-4 rounded-lg border-2 transition-all ${
                      selectedTier === 'starter'
                        ? 'border-orange-500 bg-orange-950/30'
                        : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
                    }`}
                  >
                    <h3 className="font-semibold text-slate-100 mb-1">Starter</h3>
                    <p className="text-sm text-slate-400 mb-2">Perfect for smaller teams</p>
                    <ul className="space-y-1 text-xs text-slate-400">
                      <li>✓ Up to 5 users</li>
                      <li>✓ 100 quotes/month</li>
                      <li>✓ Full reports</li>
                    </ul>
                  </button>

                  <button
                    onClick={() => setSelectedTier('professional')}
                    className={`text-left p-4 rounded-lg border-2 transition-all ${
                      selectedTier === 'professional'
                        ? 'border-orange-500 bg-orange-950/30'
                        : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
                    }`}
                  >
                    <h3 className="font-semibold text-slate-100 mb-1">Professional</h3>
                    <p className="text-sm text-slate-400 mb-2">For growing contractors</p>
                    <ul className="space-y-1 text-xs text-slate-400">
                      <li>✓ Up to 15 users</li>
                      <li>✓ 500 quotes/month</li>
                      <li>✓ Priority support</li>
                    </ul>
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-950/30 border border-red-700/50 rounded-lg text-sm text-red-400">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setError('');
                  }}
                  className="flex-1 px-6 py-3 border border-slate-700 text-slate-300 rounded-lg font-semibold hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTrialOrg}
                  disabled={creatingOrg || !orgName.trim()}
                  className="flex-1 px-6 py-3 bg-gradient-to-br from-orange-400 to-red-600 text-white rounded-lg font-semibold hover:from-orange-500 hover:to-red-700 transition-all shadow-lg shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingOrg ? 'Creating...' : 'Start 14-Day Trial'}
                </button>
              </div>

              <div className="text-center text-xs text-slate-500">
                No credit card required. Full access to all features for 14 days.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
