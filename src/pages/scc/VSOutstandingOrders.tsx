import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import {
  ArrowLeft, Package, Loader2, CheckCircle, XCircle, Truck,
  RefreshCw, AlertTriangle, ChevronDown, ChevronUp
} from 'lucide-react';
import type { VsOrder, VsOrderItem } from '../../types/verifystock.orders.types';

interface Props {
  onBack: () => void;
  onGoToTransfer: (orders: VsOrder[]) => void;
}

function Spinner() { return <Loader2 size={16} className="animate-spin" />; }

interface OrderWithItems extends VsOrder {
  order_items: VsOrderItem[];
  expanded: boolean;
}

export default function VSOutstandingOrders({ onBack, onGoToTransfer }: Props) {
  const { currentOrganisation } = useOrganisation();
  const orgId = currentOrganisation?.id ?? '';

  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [vanLocationId, setVanLocationId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: { user } }, { data: ordersData }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('vs_orders')
        .select('*, order_items:vs_order_items(*), project:vs_projects(name,project_number)')
        .eq('organisation_id', orgId)
        .eq('status', 'PLANNED')
        .order('created_at', { ascending: false }),
    ]);

    if (user) {
      const { data: profile } = await supabase.from('vs_user_profiles').select('nearest_location_id').eq('id', user.id).maybeSingle();
      if (profile?.nearest_location_id) setVanLocationId(profile.nearest_location_id);
    }

    setOrders((ordersData || []).map(o => ({ ...o, expanded: true })));
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const receiveOrder = async (order: OrderWithItems) => {
    if (!vanLocationId) {
      setMsg({ type: 'err', text: 'No van location linked to your profile. Update your profile location in Settings.' });
      return;
    }
    setSaving(order.id);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.rpc('receive_supplier_order', {
      p_order_id: order.id,
      p_organisation_id: orgId,
      p_user_id: user!.id,
      p_van_location_id: vanLocationId,
    });
    if (error) setMsg({ type: 'err', text: error.message });
    else { setMsg({ type: 'ok', text: `Order ${order.po_number || order.id.slice(0, 8)} received into van.` }); await load(); }
    setSaving(null);
  };

  const rejectOrder = async (order: OrderWithItems) => {
    if (!window.confirm(`Reject order ${order.po_number || order.id.slice(0, 8)}? This cannot be undone.`)) return;
    setSaving(order.id);
    const { error } = await supabase.from('vs_orders').update({ status: 'CANCELLED', updated_at: new Date().toISOString() }).eq('id', order.id);
    if (error) setMsg({ type: 'err', text: error.message });
    else await load();
    setSaving(null);
  };

  const rejectAll = async () => {
    if (!window.confirm(`Reject all ${orders.length} planned orders?`)) return;
    setSaving('ALL');
    const ids = orders.map(o => o.id);
    const { error } = await supabase.from('vs_orders').update({ status: 'CANCELLED', updated_at: new Date().toISOString() }).in('id', ids);
    if (error) setMsg({ type: 'err', text: error.message });
    else await load();
    setSaving(null);
  };

  const toggleExpand = (id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, expanded: !o.expanded } : o));
  };

  const hasSupplierItems = (order: OrderWithItems) =>
    (order.order_items || []).some(i => i.source_type === 'SUPPLIER' || !i.source_type);
  const hasLocationItems = (order: OrderWithItems) =>
    (order.order_items || []).some(i => i.source_type === 'STOREROOM' || i.source_type === 'VAN');

  const SOURCE_LABELS: Record<string, string> = { SUPPLIER: 'From Suppliers', STOREROOM: 'From Storeroom', VAN: 'From Vans' };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-sky-500 px-4 py-4 flex items-center justify-between flex-none">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-white p-1"><ArrowLeft size={20} /></button>
          <h1 className="text-white font-bold text-lg">Outstanding Orders</h1>
        </div>
        <button onClick={load} className="text-white/80 hover:text-white p-1.5"><RefreshCw size={16} /></button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner /></div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {msg && (
            <div className={`mx-4 mt-4 px-4 py-3 rounded-xl text-sm font-medium ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {msg.text}
            </div>
          )}

          {orders.length === 0 ? (
            <div className="text-center py-20">
              <CheckCircle size={40} className="mx-auto mb-3 text-emerald-400" />
              <p className="text-gray-600 font-semibold">No outstanding orders</p>
              <p className="text-gray-400 text-sm mt-1">All orders are actioned</p>
            </div>
          ) : (
            <>
              {/* Bulk actions */}
              <div className="px-4 pt-4 pb-2 flex gap-2">
                <button onClick={() => onGoToTransfer(orders)}
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors">
                  Remove All
                </button>
                <button onClick={rejectAll} disabled={saving === 'ALL'}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60">
                  {saving === 'ALL' ? <Spinner /> : 'Reject All'}
                </button>
              </div>

              <div className="p-4 space-y-3">
                {orders.map(order => {
                  const items = order.order_items || [];
                  const groupedItems: Record<string, VsOrderItem[]> = {};
                  items.forEach(item => {
                    const key = item.source_type || 'SUPPLIER';
                    groupedItems[key] = [...(groupedItems[key] || []), item];
                  });

                  return (
                    <div key={order.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                      {/* Order header */}
                      <button onClick={() => toggleExpand(order.id)}
                        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="bg-sky-100 text-sky-700 text-xs font-semibold px-2 py-0.5 rounded-full">PLANNED</span>
                            {order.po_number && (
                              <span className="text-gray-500 text-xs font-mono">{order.po_number}</span>
                            )}
                          </div>
                          <p className="text-gray-900 font-semibold text-sm mt-1">
                            {(order.project as { name?: string })?.name || 'No project'}
                          </p>
                          <p className="text-gray-400 text-xs mt-0.5">{new Date(order.created_at).toLocaleString()} · {items.length} item{items.length !== 1 ? 's' : ''}</p>
                        </div>
                        {order.expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                      </button>

                      {/* Expanded items */}
                      {order.expanded && (
                        <div className="border-t border-gray-100">
                          {(['SUPPLIER', 'STOREROOM', 'VAN'] as const).map(type => {
                            const typeItems = groupedItems[type];
                            if (!typeItems?.length) return null;
                            return (
                              <div key={type} className="px-5 py-3 border-b border-gray-50">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{SOURCE_LABELS[type]}</p>
                                {typeItems.map(item => (
                                  <div key={item.id} className="flex items-center justify-between py-1.5">
                                    <div className="flex items-center gap-2">
                                      <Package size={13} className="text-gray-300" />
                                      <span className="text-gray-800 text-sm">{item.material_name}</span>
                                    </div>
                                    <span className="text-gray-600 text-sm font-medium">{item.quantity} {item.unit}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })}

                          {/* Per-order actions */}
                          <div className="px-5 py-4 flex gap-2">
                            {hasSupplierItems(order) && (
                              <button onClick={() => receiveOrder(order)} disabled={saving === order.id}
                                className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60">
                                {saving === order.id ? <Spinner /> : <><Truck size={13} /> Receive</>}
                              </button>
                            )}
                            {hasLocationItems(order) && (
                              <button onClick={() => onGoToTransfer([order])}
                                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors">
                                Remove
                              </button>
                            )}
                            <button onClick={() => rejectOrder(order)} disabled={saving === order.id}
                              className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60">
                              {saving === order.id ? <Spinner /> : <><XCircle size={13} /> Reject</>}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
