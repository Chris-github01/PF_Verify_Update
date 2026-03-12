import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { useOrganisation } from '../organisationContext';
import type {
  StockItem,
  StockItemWithLevel,
  StockLevel,
  StockVerification,
  StockAdjustment,
  StockAlert,
  VerifyStockSummary,
} from '../../types/verifystock.types';

export function useStockItems() {
  const { currentOrganisation } = useOrganisation();
  const [items, setItems] = useState<StockItemWithLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { data: stockItems, error: itemsErr } = await supabase
        .from('vs_stock_items')
        .select('*')
        .eq('organisation_id', currentOrganisation.id)
        .eq('active', true)
        .order('name');

      if (itemsErr) throw itemsErr;

      const { data: levels } = await supabase
        .from('vs_stock_levels')
        .select('*')
        .eq('organisation_id', currentOrganisation.id);

      const levelMap = new Map<string, StockLevel>();
      (levels || []).forEach((l) => levelMap.set(l.stock_item_id, l));

      const withLevels: StockItemWithLevel[] = (stockItems || []).map((item) => {
        const level = levelMap.get(item.id);
        const qty = level?.quantity_on_hand ?? 0;
        let status: StockItemWithLevel['status'] = 'ok';
        if (qty === 0) status = 'out';
        else if (qty < item.min_quantity) status = 'low';
        else if (item.max_quantity && qty > item.max_quantity) status = 'over';
        return { ...item, stock_level: level, status };
      });

      setItems(withLevels);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load stock items');
    } finally {
      setLoading(false);
    }
  }, [currentOrganisation?.id]);

  useEffect(() => { load(); }, [load]);

  return { items, loading, error, refresh: load };
}

export function useStockAlerts() {
  const { currentOrganisation } = useOrganisation();
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('vs_stock_alerts')
        .select('*, stock_item:vs_stock_items(name, sku)')
        .eq('organisation_id', currentOrganisation.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false });
      setAlerts(data || []);
    } finally {
      setLoading(false);
    }
  }, [currentOrganisation?.id]);

  useEffect(() => { load(); }, [load]);

  const markRead = useCallback(async (id: string) => {
    await supabase.from('vs_stock_alerts').update({ is_read: true }).eq('id', id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!currentOrganisation?.id) return;
    await supabase
      .from('vs_stock_alerts')
      .update({ is_read: true })
      .eq('organisation_id', currentOrganisation.id)
      .eq('is_read', false);
    setAlerts([]);
  }, [currentOrganisation?.id]);

  return { alerts, loading, refresh: load, markRead, markAllRead };
}

export function useVerifications(stockItemId?: string) {
  const { currentOrganisation } = useOrganisation();
  const [verifications, setVerifications] = useState<StockVerification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    try {
      let query = supabase
        .from('vs_verifications')
        .select('*, stock_item:vs_stock_items(name, sku)')
        .eq('organisation_id', currentOrganisation.id)
        .order('verified_at', { ascending: false })
        .limit(100);

      if (stockItemId) query = query.eq('stock_item_id', stockItemId);

      const { data } = await query;
      setVerifications(data || []);
    } finally {
      setLoading(false);
    }
  }, [currentOrganisation?.id, stockItemId]);

  useEffect(() => { load(); }, [load]);

  return { verifications, loading, refresh: load };
}

export function useVerifyStockSummary() {
  const { items, loading: itemsLoading } = useStockItems();
  const { alerts, loading: alertsLoading } = useStockAlerts();

  const summary: VerifyStockSummary = {
    total_items: items.length,
    low_stock_count: items.filter((i) => i.status === 'low').length,
    out_of_stock_count: items.filter((i) => i.status === 'out').length,
    unread_alerts: alerts.length,
  };

  return { summary, loading: itemsLoading || alertsLoading };
}

export async function createStockItem(
  organisationId: string,
  userId: string,
  data: Omit<StockItem, 'id' | 'organisation_id' | 'created_by' | 'created_at' | 'updated_at' | 'active'>
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('vs_stock_items').insert({
    ...data,
    organisation_id: organisationId,
    created_by: userId,
    active: true,
  });
  if (error) return { error: error.message };

  return { error: null };
}

export async function updateStockItem(
  id: string,
  data: Partial<StockItem>
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('vs_stock_items').update(data).eq('id', id);
  if (error) return { error: error.message };
  return { error: null };
}

export async function recordVerification(
  organisationId: string,
  userId: string,
  stockItemId: string,
  verifiedQuantity: number,
  previousQuantity: number,
  notes: string | null
): Promise<{ error: string | null }> {
  const { error: verErr } = await supabase.from('vs_verifications').insert({
    organisation_id: organisationId,
    stock_item_id: stockItemId,
    verified_quantity: verifiedQuantity,
    previous_quantity: previousQuantity,
    notes,
    verified_by: userId,
  });
  if (verErr) return { error: verErr.message };

  const { error: levelErr } = await supabase.from('vs_stock_levels').upsert(
    {
      organisation_id: organisationId,
      stock_item_id: stockItemId,
      quantity_on_hand: verifiedQuantity,
      last_verified_at: new Date().toISOString(),
      last_verified_by: userId,
    },
    { onConflict: 'stock_item_id' }
  );
  if (levelErr) return { error: levelErr.message };

  return { error: null };
}

export async function recordAdjustment(
  organisationId: string,
  userId: string,
  stockItemId: string,
  adjustmentType: StockAdjustment['adjustment_type'],
  quantity: number,
  currentQuantity: number,
  reason: string | null,
  reference: string | null
): Promise<{ error: string | null }> {
  const { error: adjErr } = await supabase.from('vs_stock_adjustments').insert({
    organisation_id: organisationId,
    stock_item_id: stockItemId,
    adjustment_type: adjustmentType,
    quantity,
    reason,
    reference,
    adjusted_by: userId,
  });
  if (adjErr) return { error: adjErr.message };

  let newQty = currentQuantity;
  if (adjustmentType === 'ADD' || adjustmentType === 'TRANSFER_IN') newQty += quantity;
  else if (adjustmentType === 'REMOVE' || adjustmentType === 'TRANSFER_OUT') newQty = Math.max(0, newQty - quantity);
  else newQty = quantity;

  const { error: levelErr } = await supabase.from('vs_stock_levels').upsert(
    {
      organisation_id: organisationId,
      stock_item_id: stockItemId,
      quantity_on_hand: newQty,
      last_verified_at: new Date().toISOString(),
      last_verified_by: userId,
    },
    { onConflict: 'stock_item_id' }
  );
  if (levelErr) return { error: levelErr.message };

  return { error: null };
}
