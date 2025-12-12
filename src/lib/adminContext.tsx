import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from './supabase';

interface AdminContextType {
  isMasterAdmin: boolean;
  loading: boolean;
}

const AdminContext = createContext<AdminContextType | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      console.warn('⚠️ [AdminContext] Loading timeout after 5s - forcing completion');
      setLoading(false);
    }, 5000);

    checkAdminStatus().finally(() => clearTimeout(timeout));

    return () => clearTimeout(timeout);
  }, []);

  const checkAdminStatus = async () => {
    let isAdmin = false;
    try {
      console.log('🔐 [AdminContext] Checking admin status...');
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError) {
        console.error('❌ [AdminContext] Error getting user:', userError);
        setIsMasterAdmin(false);
        setLoading(false);
        return;
      }

      if (!user) {
        console.log('🔐 [AdminContext] No user found');
        setIsMasterAdmin(false);
        setLoading(false);
        return;
      }

      console.log('🔐 [AdminContext] User found:', { id: user.id, email: user.email });
      console.log('🔐 [AdminContext] Querying platform_admins...');

      const { data: adminCheck, error: adminError } = await supabase
        .from('platform_admins')
        .select('is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (adminError) {
        console.error('❌ [AdminContext] Error querying platform_admins:', adminError);
        setIsMasterAdmin(false);
        setLoading(false);
        return;
      }

      isAdmin = !!adminCheck;
      console.log('🔐 [AdminContext] Admin check result:', {
        hasData: !!adminCheck,
        isActive: adminCheck?.is_active,
        finalResult: isAdmin
      });
      setIsMasterAdmin(isAdmin);
    } catch (error) {
      console.error('❌ [AdminContext] Unexpected error checking admin status:', error);
      setIsMasterAdmin(false);
    } finally {
      console.log('🔐 [AdminContext] Setting loading to false, isMasterAdmin:', isAdmin);
      setLoading(false);
    }
  };

  return (
    <AdminContext.Provider value={{ isMasterAdmin, loading }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within AdminProvider');
  }
  return context;
}
