import { supabase } from '../supabase';
import { logAdminAction } from './superAdminGuard';

export interface OrganisationDashboard {
  id: string;
  name: string;
  trade_type: string;
  licensed_trades: string[];
  subscription_status: string;
  pricing_tier: string;
  trial_end_date: string | null;
  monthly_quote_limit: number | null;
  quotes_used_this_month: number;
  last_active_at: string | null;
  created_at: string;
  member_count: number;
  project_count: number;
  quote_count: number;
  owner_email: string | null;
}

export interface GlobalQuote {
  quote_id: string;
  supplier_name: string;
  quote_reference: string | null;
  total_amount: number;
  items_count: number;
  status: string;
  extraction_confidence: number | null;
  organisation_id: string;
  organisation_name: string;
  trade_type: string;
  created_at: string;
  import_date: string | null;
  uploaded_by_email: string | null;
  project_name: string;
  avg_confidence: number | null;
}

export async function getAllOrganisations(): Promise<OrganisationDashboard[]> {
  const { data, error } = await supabase
    .from('admin_organisations_dashboard')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getAllQuotes(filters?: {
  organisationId?: string;
  tradeType?: string;
  startDate?: string;
  endDate?: string;
}): Promise<GlobalQuote[]> {
  let query = supabase
    .from('admin_global_quotes')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.organisationId) {
    query = query.eq('organisation_id', filters.organisationId);
  }
  if (filters?.tradeType) {
    query = query.eq('trade_type', filters.tradeType);
  }
  if (filters?.startDate) {
    query = query.gte('created_at', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('created_at', filters.endDate);
  }

  const { data, error } = await query.limit(1000);

  if (error) throw error;
  return data || [];
}

export async function createOrganisation(params: {
  name: string;
  tradeType: string;
  trialDays: number;
  ownerEmail: string;
}): Promise<{ success: boolean; organisationId: string; message: string }> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user.email) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase.rpc('admin_create_client_organisation', {
    p_admin_email: session.user.email,
    p_org_name: params.name,
    p_trade_type: params.tradeType,
    p_trial_days: params.trialDays,
    p_owner_email: params.ownerEmail
  });

  if (error) throw error;

  return {
    success: data.success,
    organisationId: data.organisation_id,
    message: data.message
  };
}

export async function extendTrial(
  organisationId: string,
  days: number
): Promise<{ success: boolean; newTrialEndDate: string }> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user.email) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase.rpc('admin_extend_trial', {
    p_admin_email: session.user.email,
    p_org_id: organisationId,
    p_days: days
  });

  if (error) throw error;

  return {
    success: data.success,
    newTrialEndDate: data.new_trial_end_date
  };
}

export async function updateSubscriptionStatus(
  organisationId: string,
  newStatus: 'trial' | 'active' | 'expired' | 'suspended' | 'cancelled'
): Promise<{ success: boolean; newStatus: string }> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user.email) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase.rpc('admin_update_subscription', {
    p_admin_email: session.user.email,
    p_org_id: organisationId,
    p_new_status: newStatus
  });

  if (error) throw error;

  return {
    success: data.success,
    newStatus: data.new_status
  };
}

export async function getAdminAuditLog(limit = 100): Promise<any[]> {
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function impersonateOrganisation(organisationId: string): Promise<void> {
  await logAdminAction('impersonate_org', 'organisation', organisationId);

  // Store impersonation in localStorage
  localStorage.setItem('admin_impersonate_org', organisationId);

  // Reload to trigger org context change
  window.location.href = '/dashboard';
}

export async function stopImpersonation(): Promise<void> {
  localStorage.removeItem('admin_impersonate_org');
  window.location.href = '/admin/dashboard';
}

export function getImpersonatedOrgId(): string | null {
  return localStorage.getItem('admin_impersonate_org');
}

export function isImpersonating(): boolean {
  return !!localStorage.getItem('admin_impersonate_org');
}

export async function addTradeLicense(
  organisationId: string,
  trade: string
): Promise<{ success: boolean; message: string; licensedTrades: string[] }> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user.email) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase.rpc('admin_add_trade_license', {
    p_admin_email: session.user.email,
    p_org_id: organisationId,
    p_trade: trade
  });

  if (error) throw error;

  return {
    success: data.success,
    message: data.message,
    licensedTrades: data.licensed_trades
  };
}

export async function removeTradeLicense(
  organisationId: string,
  trade: string
): Promise<{ success: boolean; message: string; licensedTrades: string[] }> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user.email) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase.rpc('admin_remove_trade_license', {
    p_admin_email: session.user.email,
    p_org_id: organisationId,
    p_trade: trade
  });

  if (error) throw error;

  return {
    success: data.success,
    message: data.message,
    licensedTrades: data.licensed_trades
  };
}

export async function getTradePricing(): Promise<any> {
  const { data, error } = await supabase.rpc('get_trade_pricing');

  if (error) throw error;
  return data;
}

export const TRADE_LABELS: Record<string, string> = {
  'passive_fire': 'PassiveFire Verify+',
  'electrical': 'Electrical Verify+',
  'plumbing': 'Plumbing Verify+',
  'mechanical': 'Mechanical Verify+',
  'other': 'Other'
};

export const ALL_TRADES = [
  { value: 'passive_fire', label: 'PassiveFire Verify+', price: 299, color: 'orange' },
  { value: 'electrical', label: 'Electrical Verify+', price: 349, color: 'yellow' },
  { value: 'plumbing', label: 'Plumbing Verify+', price: 329, color: 'blue' },
  { value: 'mechanical', label: 'Mechanical Verify+', price: 399, color: 'green' }
];
