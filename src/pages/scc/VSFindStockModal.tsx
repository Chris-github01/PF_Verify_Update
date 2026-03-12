import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Search, ChevronDown, Package, MapPin, Loader2 } from 'lucide-react';
import type { StockSearchRow } from '../../types/verifystock.orders.types';

interface Props {
  orgId: string;
  onClose: () => void;
  onSelectForTransfer?: (row: StockSearchRow) => void;
  readOnly?: boolean;
}

interface SubModal {
  type: 'supplier' | 'material' | 'location';
  items: { id: string; label: string }[];
  onSelect: (id: string, label: string) => void;
}

function Spinner() { return <Loader2 size={16} className="animate-spin" />; }

interface ResultGroup {
  material_name: string;
  material_id: string;
  supplier_name: string | null;
  locations: { location_id: string; location_name: string | null; location_type: string | null; quantity: number }[];
  total_qty: number;
}

export default function VSFindStockModal({ orgId, onClose, onSelectForTransfer, readOnly = false }: Props) {
  const [selectedSupplier, setSelectedSupplier] = useState<{ id: string; name: string } | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<{ id: string; name: string } | null>(null);
  const [locationFilter, setLocationFilter] = useState<{ id: string; name: string } | null>(null);

  const [results, setResults] = useState<StockSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [subModal, setSubModal] = useState<SubModal | null>(null);
  const [subSearch, setSubSearch] = useState('');

  const openSupplierPicker = async () => {
    const { data } = await supabase.from('vs_suppliers').select('id,name').eq('organisation_id', orgId).eq('active', true).order('name');
    setSubSearch('');
    setSubModal({
      type: 'supplier',
      items: [{ id: '', label: 'All Suppliers' }, ...(data || []).map(s => ({ id: s.id, label: s.name }))],
      onSelect: (id, label) => { setSelectedSupplier(id ? { id, name: label } : null); setSelectedMaterial(null); setSubModal(null); },
    });
  };

  const openMaterialPicker = async () => {
    let query = supabase.from('vs_materials').select('id,name').eq('organisation_id', orgId).eq('active', true).order('name');
    if (selectedSupplier) query = query.eq('supplier_id', selectedSupplier.id);
    const { data } = await query;
    setSubSearch('');
    setSubModal({
      type: 'material',
      items: [{ id: '', label: 'All Materials' }, ...(data || []).map(m => ({ id: m.id, label: m.name }))],
      onSelect: (id, label) => { setSelectedMaterial(id ? { id, name: label } : null); setSubModal(null); },
    });
  };

  const openLocationPicker = async () => {
    const { data } = await supabase.from('vs_locations').select('id,name').eq('organisation_id', orgId).eq('active', true).order('name');
    setSubSearch('');
    setSubModal({
      type: 'location',
      items: [{ id: '', label: 'All Locations' }, ...(data || []).map(l => ({ id: l.id, label: l.name }))],
      onSelect: (id, label) => { setLocationFilter(id ? { id, name: label } : null); setSubModal(null); },
    });
  };

  const doSearch = useCallback(async () => {
    if (!selectedSupplier && !selectedMaterial) return;
    setLoading(true);
    setSearched(true);
    let query = supabase.from('stock_search_view').select('*').eq('organisation_id', orgId);
    if (selectedSupplier) query = query.eq('supplier_id', selectedSupplier.id);
    if (selectedMaterial) query = query.eq('material_id', selectedMaterial.id);
    const { data } = await query.order('material_name');
    setResults(data || []);
    setLoading(false);
  }, [orgId, selectedSupplier, selectedMaterial]);

  const filteredResults = locationFilter
    ? results.filter(r => r.location_id === locationFilter.id)
    : results;

  const grouped: ResultGroup[] = Object.values(
    filteredResults.reduce<Record<string, ResultGroup>>((acc, row) => {
      const key = row.material_id;
      if (!acc[key]) {
        acc[key] = {
          material_id: row.material_id,
          material_name: row.material_name,
          supplier_name: row.supplier_name,
          locations: [],
          total_qty: 0,
        };
      }
      if (row.location_id && row.quantity > 0) {
        acc[key].locations.push({
          location_id: row.location_id,
          location_name: row.location_name,
          location_type: row.location_type,
          quantity: row.quantity,
        });
        acc[key].total_qty += row.quantity;
      }
      return acc;
    }, {})
  );

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center">
      <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-100">
          <h2 className="text-gray-900 font-bold text-lg">Find Stock</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Filters */}
          <div className="p-5 space-y-3 border-b border-gray-100">
            <button onClick={openSupplierPicker}
              className="w-full flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 hover:border-sky-400 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase w-20">Supplier</span>
                <span className={`text-sm ${selectedSupplier ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                  {selectedSupplier?.name || 'All Suppliers'}
                </span>
              </div>
              <ChevronDown size={15} className="text-gray-400" />
            </button>

            <button onClick={openMaterialPicker}
              className="w-full flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 hover:border-sky-400 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase w-20">Item</span>
                <span className={`text-sm ${selectedMaterial ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                  {selectedMaterial?.name || 'All Materials'}
                </span>
              </div>
              <ChevronDown size={15} className="text-gray-400" />
            </button>

            <button onClick={openLocationPicker}
              className="w-full flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 hover:border-sky-400 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase w-20">Location</span>
                <span className={`text-sm ${locationFilter ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                  {locationFilter?.name || 'All Locations'}
                </span>
              </div>
              <ChevronDown size={15} className="text-gray-400" />
            </button>

            <button
              onClick={doSearch}
              disabled={!selectedSupplier && !selectedMaterial}
              className="w-full py-3.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              {loading ? <><Spinner /> Searching...</> : <><Search size={15} /> Search</>}
            </button>
          </div>

          {/* Results */}
          <div className="p-5">
            {!searched ? (
              <div className="text-center py-12">
                <Search size={36} className="mx-auto mb-3 text-gray-200" />
                <p className="text-gray-400 text-sm">Select a supplier or material to search</p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-sky-500"><Spinner /> Searching...</div>
            ) : grouped.length === 0 ? (
              <div className="text-center py-12">
                <Package size={36} className="mx-auto mb-3 text-gray-200" />
                <p className="text-gray-600 font-medium">No stock found</p>
                <p className="text-gray-400 text-sm mt-1">Try different filters</p>
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map(group => (
                  <div key={group.material_id} className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-gray-900 font-semibold text-sm">{group.material_name}</p>
                        {group.supplier_name && <p className="text-gray-400 text-xs">{group.supplier_name}</p>}
                      </div>
                      <span className="bg-sky-100 text-sky-700 text-xs font-bold px-2.5 py-1 rounded-full">
                        {group.total_qty} total
                      </span>
                    </div>
                    {group.locations.length > 0 && (
                      <div className="border-t border-gray-100">
                        {group.locations.map((loc, i) => (
                          <button
                            key={i}
                            onClick={() => !readOnly && onSelectForTransfer && onSelectForTransfer({
                              material_id: group.material_id,
                              material_name: group.material_name,
                              material_type: null,
                              unit: 'ea',
                              sku: null,
                              organisation_id: orgId,
                              supplier_id: null,
                              supplier_name: group.supplier_name,
                              location_id: loc.location_id,
                              location_name: loc.location_name,
                              location_type: loc.location_type,
                              quantity: loc.quantity,
                            })}
                            disabled={readOnly}
                            className={`w-full flex items-center justify-between px-4 py-3 border-t border-gray-100 text-left transition-colors ${
                              !readOnly ? 'hover:bg-sky-50 cursor-pointer' : 'cursor-default'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <MapPin size={13} className="text-gray-400 flex-none" />
                              <div>
                                <p className="text-gray-700 text-sm">{loc.location_name || 'Unknown'}</p>
                                {loc.location_type && <p className="text-gray-400 text-xs capitalize">{loc.location_type}</p>}
                              </div>
                            </div>
                            <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                              {loc.quantity}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-picker modal */}
      {subModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 capitalize">Select {subModal.type}</h3>
              <button onClick={() => setSubModal(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="px-4 py-3 border-b border-gray-100">
              <input autoFocus value={subSearch} onChange={e => setSubSearch(e.target.value)} placeholder="Search..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" />
            </div>
            <div className="overflow-y-auto flex-1">
              {subModal.items.filter(i => !subSearch || i.label.toLowerCase().includes(subSearch.toLowerCase())).map(item => (
                <button key={item.id} onClick={() => subModal.onSelect(item.id, item.label)}
                  className="w-full text-left px-5 py-3.5 border-b border-gray-50 hover:bg-gray-50 text-sm text-gray-900 transition-colors">
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
