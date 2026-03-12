import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import {
  ArrowLeft, Plus, X, ChevronDown, Loader2, Check, AlertTriangle,
  ArrowLeftRight, Package, Bell, Trash2
} from 'lucide-react';
import type { VsOrder, VsOrderItem, CartItem, VsTransferRequest } from '../../types/verifystock.orders.types';
import VSFindStockModal from './VSFindStockModal';
import type { StockSearchRow } from '../../types/verifystock.orders.types';

interface Props {
  onBack: () => void;
  preloadedOrders?: VsOrder[];
}

interface VsLocation { id: string; name: string; type: string; }
interface VsProject { id: string; name: string; project_number: string | null; }

function Spinner() { return <Loader2 size={16} className="animate-spin" />; }

export default function VSTransferStock({ onBack, preloadedOrders }: Props) {
  const { currentOrganisation } = useOrganisation();
  const orgId = currentOrganisation?.id ?? '';

  const [cart, setCart] = useState<CartItem[]>([]);
  const [locations, setLocations] = useState<VsLocation[]>([]);
  const [projects, setProjects] = useState<VsProject[]>([]);
  const [pendingRequests, setPendingRequests] = useState<VsTransferRequest[]>([]);
  const [transferRequests, setTransferRequests] = useState<{ [key: string]: number }>({});

  const [destType, setDestType] = useState<'project' | 'location'>('project');
  const [destProject, setDestProject] = useState<VsProject | null>(null);
  const [destLocation, setDestLocation] = useState<VsLocation | null>(null);
  const [picker, setPicker] = useState<'dest-project' | 'dest-location' | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  const [showFindStock, setShowFindStock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const isOrderMode = !!preloadedOrders?.length;

  const load = useCallback(async () => {
    const [{ data: l }, { data: p }, { data: tr }] = await Promise.all([
      supabase.from('vs_locations').select('id,name,type').eq('organisation_id', orgId).eq('active', true).order('name'),
      supabase.from('vs_projects').select('id,name,project_number').eq('organisation_id', orgId).eq('active', true).order('name'),
      supabase.from('vs_transfer_requests').select('*').eq('organisation_id', orgId).eq('status', 'PENDING').order('created_at', { ascending: false }),
    ]);
    setLocations(l || []);
    setProjects(p || []);
    setPendingRequests(tr || []);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isOrderMode && preloadedOrders) {
      const items: CartItem[] = preloadedOrders.flatMap(order =>
        (order.order_items || []).map((item: VsOrderItem) => ({
          material_id: item.material_id,
          material_name: item.material_name,
          supplier_id: item.supplier_id,
          supplier_name: item.supplier_name,
          unit: item.unit,
          quantity: item.quantity,
          source_type: item.source_type || undefined,
          from_location_id: item.from_location_id,
          from_location_name: item.from_location_name,
        }))
      );
      setCart(items);
    }
  }, [isOrderMode, preloadedOrders]);

  const addFromFindStock = (row: StockSearchRow) => {
    setCart(prev => {
      const existing = prev.find(c => c.material_id === row.material_id && c.from_location_id === row.location_id);
      if (existing) return prev;
      return [...prev, {
        material_id: row.material_id,
        material_name: row.material_name,
        supplier_id: row.supplier_id,
        supplier_name: row.supplier_name,
        unit: row.unit,
        quantity: 1,
        from_location_id: row.location_id,
        from_location_name: row.location_name,
        available_qty: row.quantity,
      }];
    });
    setShowFindStock(false);
  };

  const updateCartQty = (idx: number, value: string) => {
    const q = parseFloat(value);
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, quantity: isNaN(q) ? c.quantity : q } : c));
  };

  const submit = async () => {
    if (cart.length === 0) return;
    if (destType === 'project' && !destProject) { setMsg({ type: 'err', text: 'Select a destination project.' }); return; }
    if (destType === 'location' && !destLocation) { setMsg({ type: 'err', text: 'Select a destination location.' }); return; }

    for (const item of cart) {
      if (item.available_qty !== undefined && item.quantity > item.available_qty) {
        setMsg({ type: 'err', text: `${item.material_name}: quantity ${item.quantity} exceeds available ${item.available_qty}.` });
        return;
      }
    }

    setSaving(true);
    setMsg(null);
    const { data: { user } } = await supabase.auth.getUser();

    const movements = cart.map(item => ({
      organisation_id: orgId,
      material_id: item.material_id,
      material_name: item.material_name,
      supplier_id: item.supplier_id,
      supplier_name: item.supplier_name,
      location_id: item.from_location_id || null,
      location_name: item.from_location_name || null,
      movement_type: destType === 'project' ? ('REMOVE' as const) : ('TRANSFER' as const),
      quantity: item.quantity,
      allocated_project_id: destType === 'project' ? destProject?.id : null,
      allocated_project_name: destType === 'project' ? destProject?.name : null,
      order_id: isOrderMode ? preloadedOrders![0].id : null,
      created_by: user!.id,
    }));

    const { error: movErr } = await supabase.from('vs_stock_movements').insert(movements);

    if (movErr) { setMsg({ type: 'err', text: movErr.message }); setSaving(false); return; }

    // If transfer to location, add stock to destination
    if (destType === 'location' && destLocation) {
      for (const item of cart) {
        if (!item.material_id) continue;
        await supabase.from('vs_stock_balances')
          .upsert({
            organisation_id: orgId,
            material_id: item.material_id,
            location_id: destLocation.id,
            quantity: item.quantity,
          }, { onConflict: 'material_id,location_id' });

        await supabase.rpc('approve_transfer', { p_request_id: 'none' }).then(() => {
          supabase.from('vs_stock_balances')
            .select('quantity')
            .eq('material_id', item.material_id!)
            .eq('location_id', destLocation.id)
            .maybeSingle()
            .then(({ data }) => {
              if (data) {
                supabase.from('vs_stock_balances')
                  .update({ quantity: data.quantity + item.quantity })
                  .eq('material_id', item.material_id!)
                  .eq('location_id', destLocation.id);
              }
            });
        }).catch(() => {});
      }
    }

    // Mark orders as complete if order mode
    if (isOrderMode && preloadedOrders) {
      const orderIds = preloadedOrders.map(o => o.id);
      await supabase.from('vs_orders').update({ status: 'COMPLETE', updated_at: new Date().toISOString() }).in('id', orderIds);
    }

    setMsg({ type: 'ok', text: `Transfer complete. ${cart.length} item${cart.length !== 1 ? 's' : ''} processed.` });
    setCart([]);
    setSaving(false);
  };

  const approveRequest = async (req: VsTransferRequest) => {
    const { error } = await supabase.rpc('approve_transfer', { p_request_id: req.id });
    if (error) setMsg({ type: 'err', text: error.message });
    else await load();
  };

  const rejectRequest = async (req: VsTransferRequest) => {
    const { error } = await supabase.rpc('reject_transfer', { p_request_id: req.id });
    if (error) setMsg({ type: 'err', text: error.message });
    else await load();
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-sky-600 px-4 py-4 flex items-center gap-3 flex-none">
        <button onClick={onBack} className="text-white p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-white font-bold text-lg">Transfer Stock</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {msg && (
          <div className={`px-4 py-3 rounded-xl text-sm font-medium ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {msg.text}
          </div>
        )}

        {/* Pending transfer requests */}
        {pendingRequests.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-2">
              <Bell size={16} className="text-amber-600" />
              <h3 className="text-amber-800 font-semibold text-sm">Pending Transfer Requests ({pendingRequests.length})</h3>
            </div>
            {pendingRequests.map(req => (
              <div key={req.id} className="border-t border-amber-100 px-5 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-semibold text-sm">{req.material_name}</p>
                    <p className="text-gray-500 text-xs">{req.quantity} · {req.from_location_name} → {req.to_location_name}</p>
                    <p className="text-gray-400 text-xs">{req.requester_name || 'Unknown'} · {req.po_number || ''}</p>
                    <p className="text-gray-400 text-xs">{new Date(req.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2 ml-3">
                    <button onClick={() => approveRequest(req)}
                      className="px-3 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors">
                      <Check size={12} /> Approve
                    </button>
                    <button onClick={() => rejectRequest(req)}
                      className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-600 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors">
                      <X size={12} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Order summary (order mode) */}
        {isOrderMode && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-gray-900 font-semibold text-sm mb-3">Order Summary</h2>
            {preloadedOrders!.map(order => (
              <div key={order.id} className="mb-3">
                <p className="text-gray-700 text-xs font-semibold mb-1">
                  {(order.project as { name?: string })?.name || 'No project'}{order.po_number ? ` · ${order.po_number}` : ''}
                </p>
                {(order.order_items || []).map((item: VsOrderItem) => (
                  <div key={item.id} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <Package size={12} className="text-gray-300" />
                      <span className="text-gray-700 text-sm">{item.material_name}</span>
                    </div>
                    <span className="text-gray-600 text-sm font-medium">{item.quantity} {item.unit}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Cart (manual mode) */}
        {!isOrderMode && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-gray-900 font-semibold text-sm">Transfer Cart ({cart.length})</h2>
              <button onClick={() => setShowFindStock(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-xl transition-colors">
                <Plus size={13} /> Add Items
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-8">
                <ArrowLeftRight size={28} className="mx-auto mb-2 text-gray-200" />
                <p className="text-gray-400 text-sm">Tap "Add Items" to select stock to transfer</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-gray-900 font-semibold text-sm">{item.material_name}</p>
                        <p className="text-gray-400 text-xs">{item.from_location_name || 'No source'}</p>
                      </div>
                      <button onClick={() => setCart(prev => prev.filter((_, j) => j !== i))}
                        className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <input type="number" min="0.01" step="any" value={item.quantity}
                          onChange={e => updateCartQty(i, e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-center font-semibold focus:outline-none focus:border-sky-400" />
                      </div>
                      <span className="text-gray-400 text-xs">{item.unit}</span>
                      {item.available_qty !== undefined && (
                        <span className={`text-xs ${item.quantity > item.available_qty ? 'text-red-400 font-semibold' : 'text-gray-400'}`}>
                          / {item.available_qty} avail
                        </span>
                      )}
                    </div>
                    {item.available_qty !== undefined && item.quantity > item.available_qty && (
                      <div className="flex items-center gap-1 mt-2">
                        <AlertTriangle size={12} className="text-red-400" />
                        <p className="text-red-400 text-xs">Exceeds available stock</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Destination */}
        {cart.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-gray-900 font-semibold text-sm">Destination</h2>
            <div className="flex gap-2">
              {(['project', 'location'] as const).map(type => (
                <button key={type} onClick={() => setDestType(type)}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${
                    destType === type
                      ? 'bg-sky-500 text-white border-sky-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}>
                  {type === 'project' ? 'Project (Remove)' : 'Storage Location'}
                </button>
              ))}
            </div>

            {destType === 'project' && (
              <button onClick={() => { setPicker('dest-project'); setPickerSearch(''); }}
                className="w-full flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 hover:border-sky-400 transition-colors">
                <span className={`text-sm ${destProject ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                  {destProject?.name || 'Select project...'}
                </span>
                <ChevronDown size={16} className="text-gray-400" />
              </button>
            )}

            {destType === 'location' && (
              <button onClick={() => { setPicker('dest-location'); setPickerSearch(''); }}
                className="w-full flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 hover:border-sky-400 transition-colors">
                <span className={`text-sm ${destLocation ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                  {destLocation?.name || 'Select location...'}
                </span>
                <ChevronDown size={16} className="text-gray-400" />
              </button>
            )}

            <button onClick={submit} disabled={saving}
              className="w-full py-4 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors">
              {saving ? <Spinner /> : <><Check size={16} /> Complete Transfer</>}
            </button>
          </div>
        )}
      </div>

      {/* Picker */}
      {picker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">{picker === 'dest-project' ? 'Select Project' : 'Select Location'}</h3>
              <button onClick={() => setPicker(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="px-4 py-3 border-b border-gray-100">
              <input autoFocus value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Search..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" />
            </div>
            <div className="overflow-y-auto flex-1">
              {(picker === 'dest-project' ? projects : locations)
                .filter(i => !pickerSearch || i.name.toLowerCase().includes(pickerSearch.toLowerCase()))
                .map(item => (
                  <button key={item.id} onClick={() => {
                    if (picker === 'dest-project') setDestProject(projects.find(p => p.id === item.id) || null);
                    if (picker === 'dest-location') setDestLocation(locations.find(l => l.id === item.id) || null);
                    setPicker(null);
                  }}
                    className="w-full text-left px-5 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <p className="text-gray-900 text-sm font-medium">{item.name}</p>
                    {'type' in item && <p className="text-gray-400 text-xs capitalize">{(item as VsLocation).type}</p>}
                    {'project_number' in item && (item as VsProject).project_number && (
                      <p className="text-gray-400 text-xs">{(item as VsProject).project_number}</p>
                    )}
                  </button>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {showFindStock && (
        <VSFindStockModal
          orgId={orgId}
          onClose={() => setShowFindStock(false)}
          onSelectForTransfer={addFromFindStock}
          readOnly={false}
        />
      )}
    </div>
  );
}
