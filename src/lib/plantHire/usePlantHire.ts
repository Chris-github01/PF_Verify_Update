import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { useOrganisation } from '../organisationContext';
import type {
  PlantAsset,
  PlantCategory,
  PlantRateCard,
  PlantBooking,
  PlantMovement,
  PlantChargeEvent,
  PlantClaimPeriod,
  PlantClaimLine,
  PlantSettings,
  PlantDashboardStats,
  HireUnit,
  BookingStatus,
  MovementEventType,
} from '../../types/plantHire.types';

export function usePlantSettings() {
  const { currentOrganisation } = useOrganisation();
  const [settings, setSettings] = useState<PlantSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('vs_plant_settings')
      .select('*')
      .eq('organisation_id', currentOrganisation.id)
      .maybeSingle();
    setSettings(data);
    setLoading(false);
  }, [currentOrganisation?.id]);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async (updates: Partial<PlantSettings>) => {
    if (!currentOrganisation?.id) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (settings) {
      const { error } = await supabase
        .from('vs_plant_settings')
        .update({ ...updates, updated_by: user?.id, updated_at: new Date().toISOString() })
        .eq('id', settings.id);
      if (!error) await load();
      return error;
    } else {
      const { error } = await supabase
        .from('vs_plant_settings')
        .insert({ organisation_id: currentOrganisation.id, ...updates, created_by: user?.id });
      if (!error) await load();
      return error;
    }
  };

  return { settings, loading, refresh: load, saveSettings };
}

export function usePlantCategories() {
  const { currentOrganisation } = useOrganisation();
  const [categories, setCategories] = useState<PlantCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('vs_plant_categories')
      .select('*')
      .eq('organisation_id', currentOrganisation.id)
      .eq('active', true)
      .order('name');
    setCategories(data || []);
    setLoading(false);
  }, [currentOrganisation?.id]);

  useEffect(() => { load(); }, [load]);

  return { categories, loading, refresh: load };
}

export function usePlantAssets(includeInactive = false) {
  const { currentOrganisation } = useOrganisation();
  const [assets, setAssets] = useState<PlantAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    setError(null);
    let query = supabase
      .from('vs_plant_assets')
      .select('*, category:vs_plant_categories(id, name)')
      .eq('organisation_id', currentOrganisation.id)
      .order('asset_code');
    if (!includeInactive) query = query.eq('active', true);
    const { data, error: err } = await query;
    if (err) setError(err.message);
    setAssets(data || []);
    setLoading(false);
  }, [currentOrganisation?.id, includeInactive]);

  useEffect(() => { load(); }, [load]);

  return { assets, loading, error, refresh: load };
}

export function usePlantAsset(id: string | null) {
  const { currentOrganisation } = useOrganisation();
  const [asset, setAsset] = useState<PlantAsset | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id || !currentOrganisation?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('vs_plant_assets')
      .select('*, category:vs_plant_categories(id, name)')
      .eq('id', id)
      .maybeSingle();
    setAsset(data);
    setLoading(false);
  }, [id, currentOrganisation?.id]);

  useEffect(() => { load(); }, [load]);

  return { asset, loading, refresh: load };
}

export function usePlantRateCard(assetId: string | null) {
  const { currentOrganisation } = useOrganisation();
  const [rateCard, setRateCard] = useState<PlantRateCard | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!assetId || !currentOrganisation?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('vs_plant_rate_cards')
      .select('*')
      .eq('asset_id', assetId)
      .eq('active', true)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();
    setRateCard(data);
    setLoading(false);
  }, [assetId, currentOrganisation?.id]);

  useEffect(() => { load(); }, [load]);

  return { rateCard, loading, refresh: load };
}

export function usePlantBookings(filters?: { assetId?: string; status?: BookingStatus; projectId?: string }) {
  const { currentOrganisation } = useOrganisation();
  const [bookings, setBookings] = useState<PlantBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    let query = supabase
      .from('vs_plant_bookings')
      .select(`
        *,
        asset:vs_plant_assets(id, asset_code, asset_name, current_status),
        project:vs_projects(id, name, client)
      `)
      .eq('organisation_id', currentOrganisation.id)
      .order('hire_start_date', { ascending: false });

    if (filters?.assetId) query = query.eq('asset_id', filters.assetId);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.projectId) query = query.eq('project_id', filters.projectId);

    const { data } = await query;
    setBookings(data || []);
    setLoading(false);
  }, [currentOrganisation?.id, filters?.assetId, filters?.status, filters?.projectId]);

  useEffect(() => { load(); }, [load]);

  return { bookings, loading, refresh: load };
}

export function usePlantMovements(filters?: { assetId?: string; bookingId?: string }) {
  const { currentOrganisation } = useOrganisation();
  const [movements, setMovements] = useState<PlantMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    let query = supabase
      .from('vs_plant_movements')
      .select(`
        *,
        asset:vs_plant_assets(id, asset_code, asset_name),
        booking:vs_plant_bookings(id, booking_reference, status)
      `)
      .eq('organisation_id', currentOrganisation.id)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters?.assetId) query = query.eq('asset_id', filters.assetId);
    if (filters?.bookingId) query = query.eq('booking_id', filters.bookingId);

    const { data } = await query;
    setMovements(data || []);
    setLoading(false);
  }, [currentOrganisation?.id, filters?.assetId, filters?.bookingId]);

  useEffect(() => { load(); }, [load]);

  return { movements, loading, refresh: load };
}

export function usePlantChargeEvents(filters?: { bookingId?: string; isClaimed?: boolean }) {
  const { currentOrganisation } = useOrganisation();
  const [charges, setCharges] = useState<PlantChargeEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    let query = supabase
      .from('vs_plant_charge_events')
      .select('*')
      .eq('organisation_id', currentOrganisation.id)
      .order('charge_date', { ascending: false });

    if (filters?.bookingId) query = query.eq('booking_id', filters.bookingId);
    if (filters?.isClaimed !== undefined) query = query.eq('is_claimed', filters.isClaimed);

    const { data } = await query;
    setCharges(data || []);
    setLoading(false);
  }, [currentOrganisation?.id, filters?.bookingId, filters?.isClaimed]);

  useEffect(() => { load(); }, [load]);

  return { charges, loading, refresh: load };
}

export function usePlantClaimPeriods() {
  const { currentOrganisation } = useOrganisation();
  const [periods, setPeriods] = useState<PlantClaimPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('vs_plant_claim_periods')
      .select('*')
      .eq('organisation_id', currentOrganisation.id)
      .order('period_end', { ascending: false });
    setPeriods(data || []);
    setLoading(false);
  }, [currentOrganisation?.id]);

  useEffect(() => { load(); }, [load]);

  return { periods, loading, refresh: load };
}

export function usePlantClaimLines(periodId: string | null) {
  const { currentOrganisation } = useOrganisation();
  const [lines, setLines] = useState<PlantClaimLine[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!periodId || !currentOrganisation?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('vs_plant_claim_lines')
      .select(`
        *,
        asset:vs_plant_assets(id, asset_code, asset_name),
        booking:vs_plant_bookings(id, booking_reference, charging_basis, hire_start_date, actual_off_hire_date),
        project:vs_projects(id, name, client)
      `)
      .eq('claim_period_id', periodId)
      .order('created_at');
    setLines(data || []);
    setLoading(false);
  }, [periodId, currentOrganisation?.id]);

  useEffect(() => { load(); }, [load]);

  return { lines, loading, refresh: load };
}

export function usePlantDashboardStats() {
  const { currentOrganisation } = useOrganisation();
  const [stats, setStats] = useState<PlantDashboardStats>({
    total_assets: 0,
    on_hire_count: 0,
    available_count: 0,
    maintenance_count: 0,
    active_bookings: 0,
    unclaimed_charges: 0,
    current_period_value: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);

    const [assetsRes, bookingsRes, chargesRes] = await Promise.all([
      supabase.from('vs_plant_assets').select('id, current_status').eq('organisation_id', currentOrganisation.id).eq('active', true),
      supabase.from('vs_plant_bookings').select('id').eq('organisation_id', currentOrganisation.id).in('status', ['BOOKED','ON_HIRE']),
      supabase.from('vs_plant_charge_events').select('amount').eq('organisation_id', currentOrganisation.id).eq('is_claimed', false),
    ]);

    const assets = assetsRes.data || [];
    const unclaimedCharges = chargesRes.data || [];
    const currentPeriodValue = unclaimedCharges.reduce((sum, c) => sum + (c.amount || 0), 0);

    setStats({
      total_assets: assets.length,
      on_hire_count: assets.filter(a => a.current_status === 'ON_HIRE').length,
      available_count: assets.filter(a => a.current_status === 'AVAILABLE').length,
      maintenance_count: assets.filter(a => a.current_status === 'IN_MAINTENANCE').length,
      active_bookings: bookingsRes.data?.length || 0,
      unclaimed_charges: unclaimedCharges.length,
      current_period_value: currentPeriodValue,
    });
    setLoading(false);
  }, [currentOrganisation?.id]);

  useEffect(() => { load(); }, [load]);

  return { stats, loading, refresh: load };
}

export async function createPlantAsset(
  orgId: string,
  userId: string,
  data: Partial<PlantAsset>
): Promise<{ data: PlantAsset | null; error: string | null }> {
  const { data: result, error } = await supabase
    .from('vs_plant_assets')
    .insert({ ...data, organisation_id: orgId, created_by: userId })
    .select()
    .single();
  return { data: result, error: error?.message || null };
}

export async function updatePlantAsset(
  id: string,
  userId: string,
  updates: Partial<PlantAsset>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('vs_plant_assets')
    .update({ ...updates, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error?.message || null };
}

export async function upsertRateCard(
  orgId: string,
  userId: string,
  assetId: string,
  rates: Partial<PlantRateCard>
): Promise<{ error: string | null }> {
  const { data: existing } = await supabase
    .from('vs_plant_rate_cards')
    .select('id')
    .eq('asset_id', assetId)
    .eq('active', true)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('vs_plant_rate_cards')
      .update({ ...rates, updated_by: userId, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    return { error: error?.message || null };
  } else {
    const { error } = await supabase
      .from('vs_plant_rate_cards')
      .insert({ ...rates, organisation_id: orgId, asset_id: assetId, created_by: userId });
    return { error: error?.message || null };
  }
}

export async function createPlantBooking(
  orgId: string,
  userId: string,
  data: Partial<PlantBooking>
): Promise<{ data: PlantBooking | null; error: string | null }> {
  const ref = `BK-${Date.now().toString(36).toUpperCase()}`;
  const { data: result, error } = await supabase
    .from('vs_plant_bookings')
    .insert({ ...data, organisation_id: orgId, created_by: userId, booking_reference: data.booking_reference || ref })
    .select()
    .single();
  return { data: result, error: error?.message || null };
}

export async function updatePlantBooking(
  id: string,
  userId: string,
  updates: Partial<PlantBooking>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('vs_plant_bookings')
    .update({ ...updates, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error?.message || null };
}

export async function recordPlantMovement(
  orgId: string,
  bookingId: string,
  assetId: string,
  eventType: MovementEventType,
  eventDate: string,
  userId: string,
  opts?: { fromLocation?: string; toLocation?: string; notes?: string }
): Promise<{ movementId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('vs_record_plant_movement', {
    p_org_id: orgId,
    p_booking_id: bookingId,
    p_asset_id: assetId,
    p_event_type: eventType,
    p_event_date: eventDate,
    p_from_location: opts?.fromLocation || null,
    p_to_location: opts?.toLocation || null,
    p_notes: opts?.notes || null,
    p_created_by: userId,
  });
  return { movementId: data, error: error?.message || null };
}

export async function createClaimPeriod(
  orgId: string,
  periodEndDate: string
): Promise<{ periodId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('vs_create_plant_claim_period', {
    p_org_id: orgId,
    p_period_end_date: periodEndDate,
  });
  return { periodId: data, error: error?.message || null };
}

export async function generateTimeHireCharges(
  periodId: string
): Promise<{ count: number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('vs_generate_time_hire_charges', {
    p_claim_period_id: periodId,
  });
  return { count: data, error: error?.message || null };
}

export async function generateClaimLines(
  periodId: string
): Promise<{ count: number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('vs_generate_plant_claim_lines', {
    p_claim_period_id: periodId,
  });
  return { count: data, error: error?.message || null };
}

export async function finalizeClaimPeriod(
  periodId: string
): Promise<{ success: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('vs_finalize_plant_claim_period', {
    p_claim_period_id: periodId,
  });
  return { success: data === true, error: error?.message || null };
}

export function formatHireUnit(unit: HireUnit): string {
  return { HOUR: 'Hour', DAY: 'Day', WEEK: 'Week', MONTH: 'Month' }[unit];
}

export function formatCurrency(amount: number | null | undefined, currency = 'NZD'): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount);
}
