// PERMANENT FIX FOR CHRIS – DO NOT REGRESS – USER MUST SEE "Pi" ORG
// This context properly fetches organisations via organisation_members junction table
// CRITICAL FIX 23 Nov 2025 – NEVER select organisations.settings again – column was removed and broke all org loading
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from './supabase';
import { getImpersonatedOrgId, isImpersonating } from './admin/adminApi';
import { getUserPreferences, updateLastOrganisation } from './userPreferences';

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

    // STEP 1: Check if user is a platform admin (god-mode)
    const { data: adminCheck, error: adminError } = await supabase
      .from('platform_admins')
      .select('is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    debug.isPlatformAdmin = !!adminCheck;
    debug.adminError = adminError?.message;

    console.log('🔐 [OrganisationContext] Platform admin check:', { isAdmin: !!adminCheck, error: adminError?.message });

    if (adminCheck) {
      // PLATFORM ADMIN: Load ALL organisations
      console.log('👑 [OrganisationContext] User is platform admin with god-mode - loading ALL organisations');
      setIsGodMode(true);
      setIsAdminView(true);

      const { data: allOrgs, error: orgsError } = await supabase
        .from('organisations')
        .select('id, name, created_at, subscription_status')
        .order('name', { ascending: true });

      if (orgsError) {
        console.error('❌ [OrganisationContext] Error loading organisations for admin:', orgsError);
        debug.orgsError = orgsError.message;
        setDebugInfo(debug);
        setLoading(false);
        return;
      }

      console.log('👑 [OrganisationContext] Platform admin loaded', allOrgs?.length || 0, 'organisations');
      debug.adminOrgCount = allOrgs?.length || 0;
      debug.adminOrgNames = allOrgs?.map((o: any) => o.name) || [];

      setOrganisations(allOrgs || []);

      // Check user preferences first, then fall back to localStorage
      const prefs = await getUserPreferences();
      let savedOrgId = prefs?.last_organisation_id;

      if (!savedOrgId) {
        savedOrgId = localStorage.getItem('passivefire_current_organisation_id');
      }

      const savedOrg = allOrgs?.find((o: Organisation) => o.id === savedOrgId);
      const orgToSet = savedOrg || allOrgs?.[0] || null;

      setCurrentOrganisation(orgToSet);

      if (orgToSet) {
        localStorage.setItem('passivefire_current_organisation_id', orgToSet.id);
        if (!savedOrg) {
          // Save to preferences if we're setting a new default
          await updateLastOrganisation(orgToSet.id);
        }
      }

      setDebugInfo(debug);
      setLoading(false);
      console.log('👑 [OrganisationContext] Platform admin load complete');
      return;
    }

    // STEP 2: Regular user - load only organizations they're members of
    console.log('👤 [OrganisationContext] Regular user - fetching memberships');
    setIsGodMode(false);
    setIsAdminView(false);

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

    if (!memberships || memberships.length === 0) {
      console.warn('⚠️ [OrganisationContext] Regular user has no organisation memberships');
      setOrganisations([]);
      setCurrentOrganisation(null);
      setDebugInfo(debug);
      setLoading(false);
      return;
    }

    // Load only the organisations this user is a member of
    console.log('✅ [OrganisationContext] User has', memberships.length, 'active memberships, loading their organisations');
    const orgIds = memberships.map(m => m.organisation_id);

    const { data: orgs, error: orgsError } = await supabase
      .from('organisations')
      .select('id, name, created_at, subscription_status')
      .in('id', orgIds)
      .order('name', { ascending: true });

    debug.orgCount = orgs?.length || 0;
    debug.orgNames = orgs?.map((o: any) => o.name) || [];

    console.log('📦 [OrganisationContext] Loaded', orgs?.length || 0, 'organisations:', orgs?.map((o: any) => o.name).join(', '));

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

      // Check user preferences first, then fall back to localStorage
      const prefs = await getUserPreferences();
      let savedOrgId = prefs?.last_organisation_id;

      if (!savedOrgId) {
        savedOrgId = localStorage.getItem('passivefire_current_organisation_id');
      }

      if (savedOrgId) {
        const savedOrg = orgs.find((o: Organisation) => o.id === savedOrgId);
        if (savedOrg) {
          setCurrentOrganisation(savedOrg);
          localStorage.setItem('passivefire_current_organisation_id', savedOrg.id);
          console.log('🎯 [OrganisationContext] Restored saved org:', savedOrg.name);
        } else if (orgs.length > 0) {
          setCurrentOrganisation(orgs[0]);
          localStorage.setItem('passivefire_current_organisation_id', orgs[0].id);
          await updateLastOrganisation(orgs[0].id);
          console.log('🎯 [OrganisationContext] Set first org as current:', orgs[0].name);
        }
      } else if (orgs.length > 0) {
        setCurrentOrganisation(orgs[0]);
        localStorage.setItem('passivefire_current_organisation_id', orgs[0].id);
        await updateLastOrganisation(orgs[0].id);
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
      // Save to user preferences in the background
      updateLastOrganisation(org.id).catch(err => {
        console.error('[OrganisationContext] Error saving org preference:', err);
      });
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
