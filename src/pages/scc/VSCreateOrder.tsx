import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import {
  ArrowLeft, MapPin, X, Plus, ChevronDown, ShoppingCart,
  Package, Check, AlertTriangle, Loader2, Truck
} from 'lucide-react';
import type { CartItem, SourcingPlanItem } from '../../types/verifystock.orders.types';

interface Props {
  onBack: () => void;
  onOrderCreated?: () => void;
}

interface VsSupplier { id: string; name: string; }
interface VsMaterial { id: string; name: string; unit: string; supplier_id: string | null; price: number | null; }
interface VsProject { id: string; name: string; project_number: string | null; }
interface VsLocation { id: string; name: string; type: string; numberplate: string | null; }
interface UserProfile { nearest_location_id: string | null; last_lat: number | null; last_lon: number | null; nearest_location_name?: string; }
interface StockSearchRow { material_id: string; material_name: string; supplier_name: string | null; location_name: string | null; quantity: number; }

function Spinner() { return <Loader2 size={16} className="animate-spin" />; }

function PickerModal({
  title, items, onSelect, onClose, searchable = false,
}: {
  title: string;
  items: { id: string; label: string; sub?: string }[];
  onSelect: (id: string, label: string) => void;
  onClose: () => void;
  searchable?: boolean;
}) {
  const [q, setQ] = useState('');
  const filtered = searchable ? items.filter(i => i.label.toLowerCase().includes(q.toLowerCase())) : items;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        {searchable && (
          <div className="px-4 py-3 border-b border-gray-100">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" />
          </div>
        )}
        <div className="overflow-y-auto flex-1">
          {filtered.map(item => (
            <button key={item.id} onClick={() => onSelect(item.id, item.label)}
              className="w-full text-left px-5 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <p className="text-gray-900 text-sm font-medium">{item.label}</p>
              {item.sub && <p className="text-gray-400 text-xs">{item.sub}</p>}
            </button>
          ))}
          {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-8">No results</p>}
        </div>
      </div>
    </div>
  );
}

export default function VSCreateOrder({ onBack, onOrderCreated }: Props) {
  const { currentOrganisation } = useOrganisation();
  const orgId = currentOrganisation?.id ?? '';

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [nearestName, setNearestName] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<VsSupplier[]>([]);
  const [materials, setMaterials] = useState<VsMaterial[]>([]);
  const [projects, setProjects] = useState<VsProject[]>([]);
  const [locations, setLocations] = useState<VsLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<{ id: string; name: string; type: string; numberplate: string | null } | null>(null);

  const [selectedProject, setSelectedProject] = useState<{ id: string; name: string } | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<{ id: string; name: string } | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<{ id: string; name: string; unit: string } | null>(null);

  const [searchResults, setSearchResults] = useState<StockSearchRow[]>([]);
  const [searching, setSearching] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [qtyModal, setQtyModal] = useState<{ row: StockSearchRow } | null>(null);
  const [qtyInput, setQtyInput] = useState('1');

  const [picker, setPicker] = useState<'project' | 'supplier' | 'material' | 'location' | null>(null);

  const [sourcing, setSourcing] = useState<SourcingPlanItem[] | null>(null);
  const [sourcingLoading, setSourcingLoading] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !orgId) return;

      const [{ data: p }, { data: sups }, { data: mats }, { data: projs }, { data: locs }] = await Promise.all([
        supabase.from('vs_user_profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('vs_suppliers').select('id,name').eq('organisation_id', orgId).eq('active', true).order('name'),
        supabase.from('vs_materials').select('id,name,unit,supplier_id,price').eq('organisation_id', orgId).eq('active', true).order('name'),
        supabase.from('vs_projects').select('id,name,project_number').eq('organisation_id', orgId).eq('active', true).order('name'),
        supabase.from('vs_locations').select('id,name,type,numberplate').eq('organisation_id', orgId).eq('active', true).order('type').order('name'),
      ]);

      if (p) {
        setProfile(p as UserProfile);
        if (p.nearest_location_id) {
          const { data: loc } = await supabase.from('vs_locations').select('name').eq('id', p.nearest_location_id).maybeSingle();
          if (loc) setNearestName(loc.name);
        }
      }
      setSuppliers(sups || []);
      setMaterials(mats || []);
      setProjects(projs || []);
      setLocations((locs || []) as VsLocation[]);
    };
    load();
  }, [orgId]);

  const filteredMaterials = selectedSupplier
    ? materials.filter(m => m.supplier_id === selectedSupplier.id)
    : materials;

  const doSearch = useCallback(async () => {
    if (!selectedSupplier && !selectedMaterial) return;
    setSearching(true);
    let query = supabase
      .from('stock_search_view')
      .select('*')
      .eq('organisation_id', orgId)
      .gt('quantity', 0);

    if (selectedSupplier) query = query.eq('supplier_id', selectedSupplier.id);
    if (selectedMaterial) query = query.eq('material_id', selectedMaterial.id);

    const { data } = await query.order('material_name');
    setSearchResults(data || []);
    setSearching(false);
  }, [orgId, selectedSupplier, selectedMaterial]);

  useEffect(() => { if (selectedSupplier || selectedMaterial) doSearch(); }, [doSearch, selectedSupplier, selectedMaterial]);

  const addToCart = async () => {
    if (!qtyModal || !orgId) return;
    const qty = parseFloat(qtyInput);
    if (isNaN(qty) || qty <= 0) return;
    setSaving(true);

    let orderId = currentOrderId;
    if (!orderId) {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: order, error: orderErr } = await supabase
        .from('vs_orders')
        .insert({
          organisation_id: orgId,
          project_id: selectedProject?.id || null,
          status: 'DRAFT',
          created_by: user!.id,
        })
        .select()
        .maybeSingle();

      if (orderErr || !order) { setMsg({ type: 'err', text: orderErr?.message || 'Failed to create order' }); setSaving(false); setQtyModal(null); return; }
      orderId = order.id;
      setCurrentOrderId(orderId);
    }

    const row = qtyModal.row;
    const { error: itemErr } = await supabase.from('vs_order_items').insert({
      order_id: orderId,
      organisation_id: orgId,
      material_id: row.material_id,
      material_name: row.material_name,
      supplier_name: row.supplier_name,
      quantity: qty,
      unit: selectedMaterial?.unit || 'ea',
    });

    if (itemErr) { setMsg({ type: 'err', text: itemErr.message }); }
    else {
      setCart(prev => {
        const existing = prev.find(c => c.material_id === row.material_id);
        if (existing) return prev.map(c => c.material_id === row.material_id ? { ...c, quantity: c.quantity + qty } : c);
        return [...prev, {
          material_id: row.material_id,
          material_name: row.material_name,
          supplier_id: null,
          supplier_name: row.supplier_name,
          unit: selectedMaterial?.unit || 'ea',
          quantity: qty,
        }];
      });
    }
    setSaving(false);
    setQtyModal(null);
    setQtyInput('1');
  };

  const viewSourcingPlan = async () => {
    if (!currentOrderId) return;
    setSourcingLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.rpc('calculate_multi_material_sourcing', {
      p_organisation_id: orgId,
      p_user_id: user!.id,
      p_order_id: currentOrderId,
    });
    if (!error && data) setSourcing(data as SourcingPlanItem[]);
    else setSourcing([]);
    setSourcingLoading(false);
  };

  const approveSourcingPlan = async () => {
    if (!sourcing || !currentOrderId) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const totalCost = sourcing.reduce((s, i) => s + (i.collection_cost || 0) + (i.material_value || 0), 0);

    const { data: decision, error: decErr } = await supabase
      .from('vs_sourcing_decisions')
      .insert({ organisation_id: orgId, order_id: currentOrderId, approved_by: user!.id, total_cost: totalCost })
      .select()
      .maybeSingle();

    if (decErr || !decision) { setMsg({ type: 'err', text: decErr?.message || 'Failed' }); setSaving(false); return; }

    const planItems = sourcing.map(s => ({
      sourcing_decision_id: decision.id,
      material_id: s.material_id,
      material_name: s.material_name,
      source_type: s.source_type,
      source_id: s.source_id,
      source_name: s.source_name,
      quantity: s.recommended_quantity,
      collection_cost: s.collection_cost,
      material_value: s.material_value,
      efficiency_ratio: s.efficiency_ratio,
    }));

    await supabase.from('vs_sourcing_plan_items').insert(planItems);
    await supabase.rpc('plan_order', { p_order_id: currentOrderId, p_organisation_id: orgId, p_user_id: user!.id });

    setSourcing(null);
    setMsg({ type: 'ok', text: 'Order planned successfully! Navigating to Outstanding Orders.' });
    setSaving(false);
    setTimeout(() => { if (onOrderCreated) onOrderCreated(); }, 1500);
  };

  const SOURCE_COLORS: Record<string, string> = {
    VAN: 'bg-sky-100 text-sky-700 border-sky-200',
    STOREROOM: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    SUPPLIER: 'bg-amber-100 text-amber-700 border-amber-200',
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-sky-500 px-4 py-4 flex items-center gap-3 flex-none">
        <button onClick={onBack} className="text-white p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-white font-bold text-lg">Create Order</h1>
        {cart.length > 0 && (
          <span className="ml-auto bg-white/20 text-white rounded-full px-2.5 py-0.5 text-xs font-semibold">
            {cart.length} item{cart.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* GPS / Location banner */}
        {(profile?.last_lat != null || nearestName) && (
          <div className="mx-4 mt-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <MapPin size={15} className="text-emerald-600 flex-none" />
            <div className="flex-1 min-w-0">
              <p className="text-emerald-800 text-xs font-semibold">Your detected location</p>
              <p className="text-emerald-600 text-xs">
                {nearestName || `${profile?.last_lat?.toFixed(4)}, ${profile?.last_lon?.toFixed(4)}`}
              </p>
            </div>
          </div>
        )}

        <div className="p-4 space-y-4">
          {msg && (
            <div className={`px-4 py-3 rounded-xl text-sm font-medium ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {msg.text}
            </div>
          )}

          {/* Project selector (optional) */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Project (Optional)</label>
            <button onClick={() => setPicker('project')}
              className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-sky-400 transition-colors">
              <span className={`text-sm ${selectedProject ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                {selectedProject?.name || 'Select project...'}
              </span>
              <ChevronDown size={16} className="text-gray-400" />
            </button>
          </div>

          {/* Deliver to Location selector */}
          {locations.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Deliver To (Optional)</label>
              <button onClick={() => setPicker('location')}
                className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-sky-400 transition-colors">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {selectedLocation ? (
                    <>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full border ${
                        selectedLocation.type === 'van'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-sky-50 text-sky-700 border-sky-200'
                      }`}>
                        {selectedLocation.type === 'van' ? 'Van' : 'Storeroom'}
                      </span>
                      <span className="text-gray-900 font-medium text-sm truncate">{selectedLocation.name}</span>
                      {selectedLocation.numberplate && (
                        <span className="text-gray-500 text-xs font-mono">{selectedLocation.numberplate}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400 text-sm">Select delivery location...</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-none">
                  {selectedLocation && (
                    <button onClick={e => { e.stopPropagation(); setSelectedLocation(null); }}
                      className="p-0.5 text-gray-300 hover:text-red-400 transition-colors">
                      <X size={13} />
                    </button>
                  )}
                  <ChevronDown size={16} className="text-gray-400" />
                </div>
              </button>
            </div>
          )}

          {/* Supplier selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Supplier</label>
            <button onClick={() => setPicker('supplier')}
              className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-sky-400 transition-colors">
              <span className={`text-sm ${selectedSupplier ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                {selectedSupplier?.name || 'Select supplier...'}
              </span>
              <ChevronDown size={16} className="text-gray-400" />
            </button>
          </div>

          {/* Material selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Material</label>
            <button onClick={() => setPicker('material')}
              className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-sky-400 transition-colors">
              <span className={`text-sm ${selectedMaterial ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                {selectedMaterial?.name || 'Select material...'}
              </span>
              <ChevronDown size={16} className="text-gray-400" />
            </button>
          </div>

          {/* Search results */}
          {(selectedSupplier || selectedMaterial) && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Available Stock</label>
              {searching ? (
                <div className="flex items-center justify-center py-8 gap-2 text-sky-500"><Spinner /> Searching...</div>
              ) : searchResults.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-8 text-center">
                  <Package size={28} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-gray-400 text-sm">No stock found for this selection</p>
                  <p className="text-gray-300 text-xs mt-1">You can still add to cart to order from supplier</p>
                  <button onClick={() => setQtyModal({ row: { material_id: selectedMaterial?.id || '', material_name: selectedMaterial?.name || 'Custom item', supplier_name: selectedSupplier?.name || null, location_name: 'Supplier', quantity: 0 } })}
                    className="mt-3 px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 mx-auto">
                    <Plus size={14} /> Add to Cart
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((row, i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-xl px-4 py-3.5 flex items-center justify-between">
                      <div>
                        <p className="text-gray-900 font-medium text-sm">{row.material_name}</p>
                        <p className="text-gray-400 text-xs">{row.supplier_name}{row.location_name ? ` · ${row.location_name}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-gray-900 font-semibold text-sm">{row.quantity}</p>
                          <p className="text-gray-400 text-xs">available</p>
                        </div>
                        <button onClick={() => { setQtyModal({ row }); setQtyInput('1'); }}
                          className="w-9 h-9 bg-sky-500 hover:bg-sky-600 text-white rounded-full flex items-center justify-center transition-colors">
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cart */}
          {cart.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <ShoppingCart size={12} /> Cart ({cart.length})
                </label>
                {selectedProject && <span className="text-xs text-gray-400">{selectedProject.name}</span>}
              </div>
              <div className="space-y-2">
                {cart.map((item, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-gray-900 font-medium text-sm">{item.material_name}</p>
                      {item.supplier_name && <p className="text-gray-400 text-xs">{item.supplier_name}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900 font-semibold text-sm">{item.quantity} <span className="text-gray-400 text-xs">{item.unit}</span></span>
                      <button onClick={() => setCart(prev => prev.filter((_, j) => j !== i))}
                        className="p-1 text-gray-300 hover:text-red-400 transition-colors"><X size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={viewSourcingPlan} disabled={sourcingLoading}
                className="w-full mt-3 py-3.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
                {sourcingLoading ? <><Spinner /> Calculating...</> : <><Truck size={16} /> View Sourcing Plan (All Items)</>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pickers */}
      {picker === 'project' && (
        <PickerModal
          title="Select Project"
          items={[{ id: '', label: 'No project' }, ...projects.map(p => ({ id: p.id, label: p.name, sub: p.project_number || undefined }))]}
          onSelect={(id, label) => { setSelectedProject(id ? { id, name: label } : null); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'supplier' && (
        <PickerModal
          title="Select Supplier"
          items={suppliers.map(s => ({ id: s.id, label: s.name }))}
          onSelect={(id, label) => { setSelectedSupplier({ id, name: label }); setSelectedMaterial(null); setPicker(null); }}
          onClose={() => setPicker(null)}
          searchable
        />
      )}
      {picker === 'material' && (
        <PickerModal
          title="Select Material"
          items={filteredMaterials.map(m => ({ id: m.id, label: m.name, sub: m.unit }))}
          onSelect={(id, label) => {
            const mat = filteredMaterials.find(m => m.id === id);
            setSelectedMaterial({ id, name: label, unit: mat?.unit || 'ea' });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
          searchable
        />
      )}
      {picker === 'location' && (
        <PickerModal
          title="Select Delivery Location"
          items={[
            { id: '', label: 'No location' },
            ...locations.map(l => ({
              id: l.id,
              label: l.name,
              sub: l.type === 'van' && l.numberplate
                ? `Van · ${l.numberplate}`
                : l.type === 'storeroom' ? 'Storeroom' : l.type,
            })),
          ]}
          onSelect={(id, label) => {
            if (!id) { setSelectedLocation(null); }
            else {
              const loc = locations.find(l => l.id === id);
              setSelectedLocation({ id, name: label, type: loc?.type || 'storeroom', numberplate: loc?.numberplate || null });
            }
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
          searchable
        />
      )}

      {/* Quantity modal */}
      {qtyModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Add to Cart</h3>
              <button onClick={() => setQtyModal(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-gray-900 font-semibold text-sm">{qtyModal.row.material_name}</p>
              {qtyModal.row.supplier_name && <p className="text-gray-400 text-xs">{qtyModal.row.supplier_name}</p>}
              {qtyModal.row.quantity > 0 && (
                <p className="text-emerald-600 text-xs mt-1">{qtyModal.row.quantity} available at {qtyModal.row.location_name}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Quantity</label>
              <input
                autoFocus
                type="number"
                min="0.01"
                step="any"
                value={qtyInput}
                onChange={e => setQtyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addToCart()}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-semibold text-center focus:outline-none focus:border-sky-400"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setQtyModal(null)}
                className="flex-1 border border-gray-200 rounded-xl py-3 text-gray-700 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={addToCart} disabled={saving}
                className="flex-1 bg-sky-500 hover:bg-sky-600 rounded-xl py-3 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5">
                {saving ? <Spinner /> : <><Check size={15} /> Add</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sourcing Plan Modal */}
      {sourcing !== null && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-3xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
            <div className="px-6 py-5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-gray-900 font-bold text-base">Sourcing Plan</h2>
                  <p className="text-gray-400 text-xs mt-0.5">{sourcing.length} source{sourcing.length !== 1 ? 's' : ''} identified</p>
                </div>
                <button onClick={() => setSourcing(null)}><X size={20} className="text-gray-400" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {sourcing.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle size={32} className="mx-auto mb-3 text-amber-400" />
                  <p className="text-gray-600 font-medium">No sourcing options found</p>
                  <p className="text-gray-400 text-sm mt-1">Check your stock balances and locations</p>
                </div>
              ) : (
                ['VAN', 'STOREROOM', 'SUPPLIER'].map(type => {
                  const items = sourcing.filter(s => s.source_type === type);
                  if (items.length === 0) return null;
                  return (
                    <div key={type}>
                      <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 px-1 ${
                        type === 'VAN' ? 'text-sky-600' : type === 'STOREROOM' ? 'text-emerald-600' : 'text-amber-600'
                      }`}>{type === 'VAN' ? 'Your Van' : type === 'STOREROOM' ? 'Storeroom' : 'Supplier'}</h3>
                      {items.map((item, i) => (
                        <div key={i} className={`rounded-xl border px-4 py-3.5 mb-2 ${SOURCE_COLORS[item.source_type]}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-sm">{item.material_name}</p>
                              <p className="text-xs opacity-75">{item.source_name}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-sm">{item.recommended_quantity}</p>
                              <p className="text-xs opacity-75">Cost: ${(item.collection_cost + item.material_value).toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
            {sourcing.length > 0 && (
              <div className="px-6 py-5 border-t border-gray-100">
                <div className="flex items-center justify-between mb-3 text-sm text-gray-500">
                  <span>Total estimated cost</span>
                  <span className="font-bold text-gray-900">
                    ${sourcing.reduce((s, i) => s + i.collection_cost + i.material_value, 0).toFixed(2)}
                  </span>
                </div>
                <button onClick={approveSourcingPlan} disabled={saving}
                  className="w-full py-4 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
                  {saving ? <Spinner /> : <><Check size={16} /> Approve Plan</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
