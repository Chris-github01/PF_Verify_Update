import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import {
  ArrowLeft, ChevronDown, X, Loader2, AlertTriangle, Download,
  Minus
} from 'lucide-react';

interface Props {
  onBack: () => void;
}

interface VsSupplier { id: string; name: string; }
interface VsMaterial { id: string; name: string; unit: string; supplier_id: string | null; }
interface VsLocation { id: string; name: string; type: string; }
interface VsProject { id: string; name: string; project_number: string | null; }

function Spinner() { return <Loader2 size={16} className="animate-spin" />; }

function DropdownPicker({ label, value, placeholder, onOpen, required }: {
  label: string; value: string; placeholder: string; onOpen: () => void; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <button onClick={onOpen}
        className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-red-400 transition-colors text-left">
        <span className={`text-sm ${value ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{value || placeholder}</span>
        <ChevronDown size={16} className="text-gray-400 flex-none" />
      </button>
    </div>
  );
}

export default function VSRemoveStock({ onBack }: Props) {
  const { currentOrganisation } = useOrganisation();
  const orgId = currentOrganisation?.id ?? '';

  const [suppliers, setSuppliers] = useState<VsSupplier[]>([]);
  const [materials, setMaterials] = useState<VsMaterial[]>([]);
  const [locations, setLocations] = useState<VsLocation[]>([]);
  const [projects, setProjects] = useState<VsProject[]>([]);

  const [selSupplier, setSelSupplier] = useState<VsSupplier | null>(null);
  const [selMaterial, setSelMaterial] = useState<VsMaterial | null>(null);
  const [selLocation, setSelLocation] = useState<VsLocation | null>(null);
  const [selProject, setSelProject] = useState<VsProject | null>(null);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [otherLocations, setOtherLocations] = useState<{ name: string; qty: number }[]>([]);

  const [picker, setPicker] = useState<'supplier' | 'material' | 'location' | 'project' | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const [{ data: s }, { data: m }, { data: l }, { data: p }] = await Promise.all([
        supabase.from('vs_suppliers').select('id,name').eq('organisation_id', orgId).eq('active', true).order('name'),
        supabase.from('vs_materials').select('id,name,unit,supplier_id').eq('organisation_id', orgId).eq('active', true).order('name'),
        supabase.from('vs_locations').select('id,name,type').eq('organisation_id', orgId).eq('active', true).order('name'),
        supabase.from('vs_projects').select('id,name,project_number').eq('organisation_id', orgId).eq('active', true).order('name'),
      ]);
      setSuppliers(s || []);
      setMaterials(m || []);
      setLocations(l || []);
      setProjects(p || []);
    };
    load();
  }, [orgId]);

  useEffect(() => {
    const loadBalance = async () => {
      setCurrentBalance(null);
      setOtherLocations([]);
      if (!selMaterial || !selLocation) return;

      const { data: bal } = await supabase
        .from('vs_stock_balances')
        .select('quantity')
        .eq('material_id', selMaterial.id)
        .eq('location_id', selLocation.id)
        .maybeSingle();

      setCurrentBalance(bal?.quantity ?? 0);

      const { data: others } = await supabase
        .from('vs_stock_balances')
        .select('quantity, location:vs_locations(name)')
        .eq('material_id', selMaterial.id)
        .neq('location_id', selLocation.id)
        .gt('quantity', 0);

      setOtherLocations((others || []).map(o => ({
        name: (o.location as { name?: string })?.name || 'Unknown',
        qty: o.quantity,
      })));
    };
    loadBalance();
  }, [selMaterial, selLocation]);

  const filteredMaterials = selSupplier ? materials.filter(m => m.supplier_id === selSupplier.id) : materials;

  const exportTemplate = async () => {
    setExporting(true);
    try {
      const { utils, writeFile } = await import('xlsx');
      const { data: balances } = await supabase
        .from('vs_stock_balances')
        .select('quantity, material:vs_materials(name,unit,supplier:vs_suppliers(name)), location:vs_locations(name)')
        .eq('organisation_id', orgId);

      const rows = (balances || []).map(b => ({
        Supplier: (b.material as { supplier?: { name?: string } })?.supplier?.name || '',
        Material: (b.material as { name?: string })?.name || '',
        Location: (b.location as { name?: string })?.name || '',
        Quantity: b.quantity,
        Note: '',
      }));

      rows.sort((a, b) => a.Supplier.localeCompare(b.Supplier) || a.Material.localeCompare(b.Material) || a.Location.localeCompare(b.Location));

      const ws = utils.json_to_sheet(rows);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Stock');
      writeFile(wb, 'stock_template.xlsx');
    } catch { /* ignore */ }
    setExporting(false);
  };

  const submit = async () => {
    if (!selMaterial || !selLocation || !selProject) {
      setMsg({ type: 'err', text: 'Material, Location, and Project are all required.' });
      return;
    }
    const quantity = parseFloat(qty);
    if (isNaN(quantity) || quantity <= 0) { setMsg({ type: 'err', text: 'Enter a valid positive quantity.' }); return; }
    if (currentBalance !== null && quantity > currentBalance) {
      setMsg({ type: 'err', text: `Only ${currentBalance} ${selMaterial.unit} available at ${selLocation.name}. ${otherLocations.length > 0 ? `Other locations: ${otherLocations.map(l => `${l.name} (${l.qty})`).join(', ')}` : ''}` });
      return;
    }

    setSaving(true);
    setMsg(null);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('vs_stock_movements').insert({
      organisation_id: orgId,
      material_id: selMaterial.id,
      material_name: selMaterial.name,
      supplier_id: selSupplier?.id || null,
      supplier_name: selSupplier?.name || null,
      location_id: selLocation.id,
      location_name: selLocation.name,
      movement_type: 'REMOVE',
      quantity,
      allocated_project_id: selProject.id,
      allocated_project_name: selProject.name,
      notes: note || null,
      created_by: user!.id,
    });

    if (error) setMsg({ type: 'err', text: error.message });
    else {
      setMsg({ type: 'ok', text: `Removed ${quantity} ${selMaterial.unit} of ${selMaterial.name} allocated to ${selProject.name}.` });
      setQty('');
      setNote('');
      setCurrentBalance(prev => prev !== null ? Math.max(0, prev - quantity) : null);
    }
    setSaving(false);
  };

  const pickerItems = () => {
    if (picker === 'supplier') return suppliers.map(s => ({ id: s.id, label: s.name }));
    if (picker === 'material') return filteredMaterials.map(m => ({ id: m.id, label: m.name, sub: m.unit }));
    if (picker === 'location') return locations.map(l => ({ id: l.id, label: l.name, sub: l.type }));
    if (picker === 'project') return projects.map(p => ({ id: p.id, label: p.name, sub: p.project_number || undefined }));
    return [];
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-red-500 px-4 py-4 flex items-center gap-3 flex-none">
        <button onClick={onBack} className="text-white p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-white font-bold text-lg">Remove Stock</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Export template */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-gray-900 font-semibold text-sm mb-3">Export Stock Template</h2>
          <p className="text-gray-400 text-xs mb-4">Download a spreadsheet of all current stock to use as a template for bulk Add Stock import.</p>
          <button onClick={exportTemplate} disabled={exporting}
            className="w-full py-3.5 border-2 border-dashed border-gray-300 text-gray-500 rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors disabled:opacity-60">
            {exporting ? <><Spinner /> Generating...</> : <><Download size={16} /> Export to Excel</>}
          </button>
        </div>

        {/* Manual remove */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-gray-900 font-semibold text-sm flex items-center gap-2">
            <Minus size={16} className="text-red-500" /> Manual Remove
          </h2>

          {msg && (
            <div className={`px-4 py-3 rounded-xl text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {msg.text}
              {msg.type === 'err' && otherLocations.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="font-semibold text-xs">Other locations with stock:</p>
                  {otherLocations.map((l, i) => (
                    <p key={i} className="text-xs">{l.name}: {l.qty}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <DropdownPicker label="Supplier" value={selSupplier?.name || ''} placeholder="Select supplier..." onOpen={() => { setPicker('supplier'); setPickerSearch(''); }} />
          <DropdownPicker label="Material" value={selMaterial?.name || ''} placeholder="Select material..." onOpen={() => { setPicker('material'); setPickerSearch(''); }} required />
          <DropdownPicker label="From Location" value={selLocation?.name || ''} placeholder="Select location..." onOpen={() => { setPicker('location'); setPickerSearch(''); }} required />

          {currentBalance !== null && selMaterial && selLocation && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${currentBalance > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <span className={`text-xs font-semibold ${currentBalance > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                Available at {selLocation.name}:
              </span>
              <span className={`font-bold text-sm ${currentBalance > 0 ? 'text-emerald-800' : 'text-red-700'}`}>
                {currentBalance} {selMaterial.unit}
              </span>
            </div>
          )}

          <DropdownPicker label="Project / Site" value={selProject?.name || ''} placeholder="Select project..." onOpen={() => { setPicker('project'); setPickerSearch(''); }} required />

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quantity <span className="text-red-400">*</span></label>
            <input type="number" min="0.01" step="any" value={qty} onChange={e => setQty(e.target.value)}
              placeholder="Enter quantity..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-lg font-semibold text-center focus:outline-none focus:border-red-400" />
            {currentBalance !== null && qty && parseFloat(qty) > currentBalance && (
              <div className="flex items-center gap-1.5 mt-2">
                <AlertTriangle size={13} className="text-red-400" />
                <p className="text-red-500 text-xs">Exceeds available stock ({currentBalance})</p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Note (Optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Reason for removal..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-400" />
          </div>

          <button onClick={submit} disabled={saving || !selMaterial || !selLocation || !selProject || !qty}
            className="w-full py-4 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors">
            {saving ? <Spinner /> : <><Minus size={16} /> Remove Stock</>}
          </button>
        </div>
      </div>

      {/* Picker */}
      {picker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 capitalize">Select {picker === 'project' ? 'Project' : picker}</h3>
              <button onClick={() => setPicker(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="px-4 py-3 border-b border-gray-100">
              <input autoFocus value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Search..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" />
            </div>
            <div className="overflow-y-auto flex-1">
              {pickerItems().filter(i => !pickerSearch || i.label.toLowerCase().includes(pickerSearch.toLowerCase())).map(item => (
                <button key={item.id} onClick={() => {
                  if (picker === 'supplier') setSelSupplier(suppliers.find(s => s.id === item.id) || null);
                  if (picker === 'material') { setSelMaterial(materials.find(m => m.id === item.id) || null); setSelLocation(null); }
                  if (picker === 'location') setSelLocation(locations.find(l => l.id === item.id) || null);
                  if (picker === 'project') setSelProject(projects.find(p => p.id === item.id) || null);
                  setPicker(null);
                }}
                  className="w-full text-left px-5 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <p className="text-gray-900 text-sm font-medium">{item.label}</p>
                  {'sub' in item && item.sub && <p className="text-gray-400 text-xs capitalize">{(item as { sub?: string }).sub}</p>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
