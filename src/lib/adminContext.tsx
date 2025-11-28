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
    try {
      console.log('🔐 [AdminContext] Checking admin status...');
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        console.log('🔐 [AdminContext] No user found');
        setIsMasterAdmin(false);
        setLoading(false);
        return;
      }

      console.log('🔐 [AdminContext] User found, checking platform_admins...');
      const { data: adminCheck } = await supabase
        .from('platform_admins')
        .select('is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      console.log('🔐 [AdminContext] Admin check result:', !!adminCheck);
      setIsMasterAdmin(!!adminCheck);
    } catch (error) {
      console.error('❌ [AdminContext] Error checking admin status:', error);
      setIsMasterAdmin(false);
    } finally {
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
