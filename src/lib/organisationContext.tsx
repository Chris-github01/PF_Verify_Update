// PERMANENT FIX FOR CHRIS – DO NOT REGRESS – USER MUST SEE "Pi" ORG
// This context properly fetches organisations via organisation_members junction table
// CRITICAL FIX 23 Nov 2025 – NEVER select organisations.settings again – column was removed and broke all org loading
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from './supabase';
import { getImpersonatedOrgId, isImpersonating } from './admin/adminApi';

interface Organisation {
  id: string;
  name: string;
  created_at: string;
  status?: string;
  subscription_status?: string;
}

interface OrganisationContextType {
  currentOrganisation: Organisation | null;
  organisations: Organisation[];
  loading: boolean;
  isAdminView: boolean;
  isGodMode: boolean;
  setCurrentOrganisation: (org: Organisation | null) => void;
  refreshOrganisations: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  debugInfo?: any;
}

const OrganisationContext = createContext<OrganisationContextType | undefined>(undefined);

export function OrganisationProvider({ children }: { children: ReactNode }) {
  const [currentOrganisation, setCurrentOrganisation] = useState<Organisation | null>(null);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdminView, setIsAdminView] = useState(false);
  const [isGodMode, setIsGodMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    console.log('🔄 [OrganisationContext] Setting up auth listener...');

    const loadTimeout = setTimeout(() => {
      console.warn('⚠️ [OrganisationContext] Loading timeout after 5s - forcing completion');
      setLoading(false);
    }, 5000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('🔄 [OrganisationContext] Initial session check:', { hasSession: !!session });
      setSessionReady(true);
      if (session) {
        loadOrganisations();
      } else {
        setLoading(false);
      }
      clearTimeout(loadTimeout);
    }).catch((error) => {
      console.error('❌ [OrganisationContext] Error getting session:', error);
      setLoading(false);
      clearTimeout(loadTimeout);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔄 [OrganisationContext] Auth state changed:', event, { hasSession: !!session });
      if (event === 'SIGNED_IN' && session) {
        setSessionReady(true);
        loadOrganisations();
      } else if (event === 'SIGNED_OUT') {
        setSessionReady(false);
        setOrganisations([]);
        setCurrentOrganisation(null);
        setIsGodMode(false);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(loadTimeout);
    };
  }, []);

  const loadOrganisations = async () => {
    setLoading(true);
    const debug: any = { timestamp: new Date().toISOString() };

    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
      console.warn('⚠️ [OrganisationContext] loadOrganisations called without session');
      setDebugInfo({ ...debug, error: 'Called without session' });
      setOrganisations([]);
      setLoading(false);
      return;
    }

    const user = session.user;
    debug.user = { id: user.id, email: user.email };

    console.log('🔍 [OrganisationContext] Loading organisations for user:', user.id, user.email);

    // GOD-MODE OVERRIDE: Hard-coded permanent access for owners
    const GOD_MODE_EMAILS = ['chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz'];
    const isGodMode = user.email && GOD_MODE_EMAILS.includes(user.email.toLowerCase());
    debug.isGodMode = isGodMode;

    if (isGodMode) {
      console.log('👑👑👑 [OrganisationContext] GOD-MODE OWNER DETECTED:', user.email);
      console.log('👑 [OrganisationContext] Ensuring God-Mode access to ALL organisations...');
      setIsGodMode(true);

      // Call the function to ensure God-Mode owner has access to all orgs
      const { error: ensureError } = await supabase.rpc('ensure_god_mode_access');
      if (ensureError) {
        console.error('⚠️ [OrganisationContext] Error ensuring God-Mode access:', ensureError);
      } else {
        console.log('✅ [OrganisationContext] God-Mode access ensured');
      }

      // Load ALL organisations for God-Mode owners
      const { data: allOrgs, error: orgsError } = await supabase
        .from('organisations')
        .select('id, name, created_at, subscription_status')
        .order('name', { ascending: true });

      if (orgsError) {
        console.error('❌ [OrganisationContext] Error loading organisations for God-Mode:', orgsError);
        debug.orgsError = orgsError.message;
        setDebugInfo(debug);
        setLoading(false);
        return;
      }

      console.log('👑 [OrganisationContext] God-Mode: Loaded', allOrgs?.length || 0, 'organisations');
      debug.godModeOrgCount = allOrgs?.length || 0;
      debug.godModeOrgNames = allOrgs?.map((o: any) => o.name) || [];

      // AUTO-CREATE TEST ORG if no organisations exist
      if (!allOrgs || allOrgs.length === 0) {
        console.log('🚀 [OrganisationContext] NO ORGANISATIONS FOUND - Auto-creating test org for God-Mode user');
        debug.autoCreateTriggered = true;

        const { data: newOrgId, error: createError } = await supabase.rpc('create_god_mode_test_org', {
          for_user_id: user.id
        });

        if (createError) {
          console.error('❌ [OrganisationContext] Error auto-creating test org:', createError);
          debug.autoCreateError = createError.message;
        } else {
          console.log('✅ [OrganisationContext] Test org auto-created:', newOrgId);
          debug.autoCreatedOrgId = newOrgId;

          // Reload organisations after creation
          const { data: reloadedOrgs, error: reloadError } = await supabase
            .from('organisations')
            .select('id, name, created_at, subscription_status')
            .order('name', { ascending: true });

          if (!reloadError && reloadedOrgs) {
            setOrganisations(reloadedOrgs);
            const testOrg = reloadedOrgs.find((o: Organisation) => o.id === newOrgId);
            if (testOrg) {
              setCurrentOrganisation(testOrg);
              localStorage.setItem('passivefire_current_organisation_id', testOrg.id);
              console.log('👑 [OrganisationContext] God-Mode: Auto-selected test org:', testOrg.name);
            }
          }
        }
      } else {
        setOrganisations(allOrgs);
        setIsAdminView(true);

        const savedOrgId = localStorage.getItem('passivefire_current_organisation_id');
        const savedOrg = allOrgs.find((o: Organisation) => o.id === savedOrgId);
        setCurrentOrganisation(savedOrg || allOrgs[0]);
        if (!savedOrg) {
          localStorage.setItem('passivefire_current_organisation_id', allOrgs[0].id);
        }
        console.log('👑 [OrganisationContext] God-Mode: Set current org:', (savedOrg || allOrgs[0]).name);
      }

      setDebugInfo(debug);
      setLoading(false);
      console.log('👑👑👑 [OrganisationContext] GOD-MODE LOAD COMPLETE');
      return;
    }

    // Check if admin is impersonating
    const impersonatedOrgId = getImpersonatedOrgId();
    if (impersonatedOrgId) {
      console.log('👤 [OrganisationContext] Admin impersonating org:', impersonatedOrgId);
      const { data: org } = await supabase
        .from('organisations')
        .select('*')
        .eq('id', impersonatedOrgId)
        .single();

      if (org) {
        console.log('✅ [OrganisationContext] Loaded impersonated org:', org.name);
        setOrganisations([org]);
        setCurrentOrganisation(org);
        setDebugInfo({ ...debug, impersonating: true, org: org.name });
        setLoading(false);
        return;
      }
    }

    // PERMANENT FIX: Fetch memberships via organisation_members junction table
    const { data: memberships, error: membershipError } = await supabase
      .from('organisation_members')
      .select('organisation_id, role, status')
      .eq('user_id', user.id)
      .eq('status', 'active');

    debug.memberships = memberships || [];
    debug.membershipError = membershipError?.message;

    console.log('🔍 [OrganisationContext] Memberships query result:', {
      count: memberships?.length || 0,
      orgIds: memberships?.map(m => m.organisation_id),
      error: membershipError?.message
    });

    if (membershipError) {
      console.error('❌ [OrganisationContext] Error loading memberships:', membershipError);
      setDebugInfo(debug);
      setLoading(false);
      return;
    }

    let orgs = null;
    let orgsError = null;

    if (!memberships || memberships.length === 0) {
      console.log('🔍 [OrganisationContext] No memberships found, checking platform admin status');
      const { data: adminCheck, error: adminError } = await supabase
        .from('platform_admins')
        .select('is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      debug.isAdmin = !!adminCheck;
      debug.adminError = adminError?.message;

      console.log('🔐 [OrganisationContext] Admin check result:', { isAdmin: !!adminCheck, error: adminError?.message });

      if (adminCheck) {
        console.log('👑 [OrganisationContext] User is platform admin, loading all organisations');
        const result = await supabase
          .from('organisations')
          .select('id, name, created_at, subscription_status')
          .order('created_at', { ascending: false });

        console.log('📦 [OrganisationContext] All orgs loaded:', result.data?.length || 0, 'organisations');
        orgs = result.data;
        orgsError = result.error;
        debug.orgCount = orgs?.length || 0;
        debug.orgNames = orgs?.map((o: any) => o.name) || [];
        setIsAdminView(true);
      } else {
        console.warn('⚠️ [OrganisationContext] Not an admin and no memberships - user cannot see any orgs');
        setOrganisations([]);
        setIsAdminView(false);
        setDebugInfo(debug);
        setLoading(false);
        return;
      }
    } else {
      console.log('✅ [OrganisationContext] User has', memberships.length, 'active memberships, loading organisations');
      const orgIds = memberships.map(m => m.organisation_id);

      const result = await supabase
        .from('organisations')
        .select('id, name, created_at, subscription_status')
        .in('id', orgIds)
        .order('name', { ascending: true });

      debug.orgCount = result.data?.length || 0;
      debug.orgNames = result.data?.map((o: any) => o.name) || [];

      console.log('📦 [OrganisationContext] Loaded', result.data?.length || 0, 'organisations:', result.data?.map((o: any) => o.name).join(', '));

      orgs = result.data;
      orgsError = result.error;
      setIsAdminView(false);
    }

    if (orgsError) {
      console.error('❌ [OrganisationContext] Error loading organisations:', orgsError);
      debug.orgsError = orgsError.message;
      setDebugInfo(debug);
      setLoading(false);
      return;
    }

    if (orgs) {
      setOrganisations(orgs);
      console.log('✅ [OrganisationContext] Successfully set', orgs.length, 'organisations in state');

      const savedOrgId = localStorage.getItem('passivefire_current_organisation_id');
      if (savedOrgId) {
        const savedOrg = orgs.find((o: Organisation) => o.id === savedOrgId);
        if (savedOrg) {
          setCurrentOrganisation(savedOrg);
          console.log('🎯 [OrganisationContext] Restored saved org:', savedOrg.name);
        } else if (orgs.length > 0) {
          setCurrentOrganisation(orgs[0]);
          localStorage.setItem('passivefire_current_organisation_id', orgs[0].id);
          console.log('🎯 [OrganisationContext] Set first org as current:', orgs[0].name);
        }
      } else if (orgs.length > 0) {
        setCurrentOrganisation(orgs[0]);
        localStorage.setItem('passivefire_current_organisation_id', orgs[0].id);
        console.log('🎯 [OrganisationContext] Set first org as current:', orgs[0].name);
      }
    }

    setDebugInfo(debug);
    setLoading(false);
    console.log('✅ [OrganisationContext] Load complete. Final org count:', orgs?.length || 0);
  };

  const refreshOrganisations = async () => {
    await loadOrganisations();
  };

  const handleSetCurrentOrganisation = (org: Organisation | null) => {
    setCurrentOrganisation(org);
    if (org) {
      localStorage.setItem('passivefire_current_organisation_id', org.id);
    } else {
      localStorage.removeItem('passivefire_current_organisation_id');
    }
  };

  const hasPermission = (permission: string) => {
    return true;
  };

  return (
    <OrganisationContext.Provider
      value={{
        currentOrganisation,
        organisations,
        loading,
        isAdminView,
        isGodMode,
        setCurrentOrganisation: handleSetCurrentOrganisation,
        refreshOrganisations,
        hasPermission,
        debugInfo,
      }}
    >
      {children}
    </OrganisationContext.Provider>
  );
}

export function useOrganisation() {
  const context = useContext(OrganisationContext);
  if (context === undefined) {
    throw new Error('useOrganisation must be used within an OrganisationProvider');
  }
  return context;
}
