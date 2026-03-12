import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import {
  ArrowLeft, Upload, Plus, ChevronDown, X, Check, Loader2,
  AlertTriangle, FileSpreadsheet
} from 'lucide-react';

interface Props {
  onBack: () => void;
}

interface VsSupplier { id: string; name: string; }
interface VsMaterial { id: string; name: string; unit: string; supplier_id: string | null; }
interface VsLocation { id: string; name: string; type: string; }

function Spinner() { return <Loader2 size={16} className="animate-spin" />; }

interface ImportRow {
  supplier: string;
  material: string;
  location: string;
  quantity: number;
  note?: string;
  valid: boolean;
  error?: string;
}

interface ImportResult {
  succeeded: number;
  failed: number;
  errors: string[];
}

function DropdownPicker({
  label, value, placeholder, onOpen,
}: {
  label: string; value: string; placeholder: string; onOpen: () => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</label>
      <button onClick={onOpen}
        className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-sky-400 transition-colors text-left">
        <span className={`text-sm ${value ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{value || placeholder}</span>
        <ChevronDown size={16} className="text-gray-400 flex-none" />
      </button>
    </div>
  );
}

export default function VSAddStock({ onBack }: Props) {
  const { currentOrganisation } = useOrganisation();
  const orgId = currentOrganisation?.id ?? '';

  const [suppliers, setSuppliers] = useState<VsSupplier[]>([]);
  const [materials, setMaterials] = useState<VsMaterial[]>([]);
  const [locations, setLocations] = useState<VsLocation[]>([]);

  const [selSupplier, setSelSupplier] = useState<VsSupplier | null>(null);
  const [selMaterial, setSelMaterial] = useState<VsMaterial | null>(null);
  const [selLocation, setSelLocation] = useState<VsLocation | null>(null);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);

  const [picker, setPicker] = useState<'supplier' | 'material' | 'location' | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const [{ data: s }, { data: m }, { data: l }] = await Promise.all([
        supabase.from('vs_suppliers').select('id,name').eq('organisation_id', orgId).eq('active', true).order('name'),
        supabase.from('vs_materials').select('id,name,unit,supplier_id').eq('organisation_id', orgId).eq('active', true).order('name'),
        supabase.from('vs_locations').select('id,name,type').eq('organisation_id', orgId).eq('active', true).order('name'),
      ]);
      setSuppliers(s || []);
      setMaterials(m || []);
      setLocations(l || []);
    };
    load();
  }, [orgId]);

  useEffect(() => {
    const loadBalance = async () => {
      if (!selMaterial || !selLocation) { setCurrentBalance(null); return; }
      const { data } = await supabase
        .from('vs_stock_balances')
        .select('quantity')
        .eq('material_id', selMaterial.id)
        .eq('location_id', selLocation.id)
        .maybeSingle();
      setCurrentBalance(data?.quantity ?? 0);
    };
    loadBalance();
  }, [selMaterial, selLocation]);

  const filteredMaterials = selSupplier
    ? materials.filter(m => m.supplier_id === selSupplier.id)
    : materials;

  const submit = async () => {
    if (!selMaterial || !selLocation) return;
    const quantity = parseFloat(qty);
    if (isNaN(quantity) || quantity <= 0) { setMsg({ type: 'err', text: 'Enter a valid positive quantity.' }); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('vs_stock_movements').insert({
      organisation_id: orgId,
      material_id: selMaterial.id,
      material_name: selMaterial.name,
      supplier_id: selSupplier?.id || null,
      supplier_name: selSupplier?.name || null,
      location_id: selLocation.id,
      location_name: selLocation.name,
      movement_type: 'ADD',
      quantity,
      notes: note || null,
      created_by: user!.id,
    });

    if (error) setMsg({ type: 'err', text: error.message });
    else {
      setMsg({ type: 'ok', text: `Added ${quantity} ${selMaterial.unit} of ${selMaterial.name} to ${selLocation.name}.` });
      setQty('');
      setNote('');
      setCurrentBalance(prev => (prev ?? 0) + quantity);
    }
    setSaving(false);
  };

  const handleFileImport = async (file: File) => {
    setImportLoading(true);
    setImportResult(null);

    try {
      const { read, utils } = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

      const { data: { user } } = await supabase.auth.getUser();
      let succeeded = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const supplier = String(row['Supplier'] || row['supplier'] || '').trim();
        const material = String(row['Material'] || row['material'] || '').trim();
        const location = String(row['Location'] || row['location'] || '').trim();
        const quantityRaw = row['Quantity'] || row['quantity'];
        const noteVal = String(row['Note'] || row['note'] || '').trim();

        if (!material || !location) { errors.push(`Row ${i + 2}: Material and Location are required`); continue; }
        const quantity = parseFloat(String(quantityRaw));
        if (isNaN(quantity) || quantity <= 0) { errors.push(`Row ${i + 2}: Invalid quantity "${quantityRaw}"`); continue; }

        const matchedMat = materials.find(m => m.name.toLowerCase() === material.toLowerCase());
        const matchedLoc = locations.find(l => l.name.toLowerCase() === location.toLowerCase());
        const matchedSup = supplier ? suppliers.find(s => s.name.toLowerCase() === supplier.toLowerCase()) : null;

        if (!matchedMat) { errors.push(`Row ${i + 2}: Material "${material}" not found`); continue; }
        if (!matchedLoc) { errors.push(`Row ${i + 2}: Location "${location}" not found`); continue; }

        const { error } = await supabase.from('vs_stock_movements').insert({
          organisation_id: orgId,
          material_id: matchedMat.id,
          material_name: matchedMat.name,
          supplier_id: matchedSup?.id || null,
          supplier_name: matchedSup?.name || null,
          location_id: matchedLoc.id,
          location_name: matchedLoc.name,
          movement_type: 'ADD',
          quantity,
          notes: noteVal || null,
          created_by: user!.id,
        });

        if (error) errors.push(`Row ${i + 2}: ${error.message}`);
        else succeeded++;
      }

      setImportResult({ succeeded, failed: errors.length, errors: errors.slice(0, 3) });
    } catch (e) {
      setImportResult({ succeeded: 0, failed: 1, errors: ['Failed to read file. Make sure it is a valid .xlsx file.'] });
    }
    setImportLoading(false);
  };

  const pickerItems = () => {
    if (picker === 'supplier') return suppliers.map(s => ({ id: s.id, label: s.name }));
    if (picker === 'material') return filteredMaterials.map(m => ({ id: m.id, label: m.name, sub: m.unit }));
    if (picker === 'location') return locations.map(l => ({ id: l.id, label: l.name, sub: l.type }));
    return [];
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-emerald-500 px-4 py-4 flex items-center gap-3 flex-none">
        <button onClick={onBack} className="text-white p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-white font-bold text-lg">Add Stock</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Excel import */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileSpreadsheet size={18} className="text-emerald-600" />
            <h2 className="text-gray-900 font-semibold text-sm">Bulk Import via Excel</h2>
          </div>
          <p className="text-gray-500 text-xs mb-4">Required columns: Supplier, Material, Location, Quantity. Optional: Note.</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => e.target.files?.[0] && handleFileImport(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={importLoading}
            className="w-full py-3.5 border-2 border-dashed border-emerald-300 text-emerald-600 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors disabled:opacity-60">
            {importLoading ? <><Spinner /> Importing...</> : <><Upload size={16} /> Choose Excel File</>}
          </button>

          {importResult && (
            <div className={`mt-4 rounded-xl p-4 ${importResult.failed === 0 ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {importResult.failed === 0
                  ? <Check size={16} className="text-green-600" />
                  : <AlertTriangle size={16} className="text-amber-600" />}
                <p className={`text-sm font-semibold ${importResult.failed === 0 ? 'text-green-700' : 'text-amber-700'}`}>
                  {importResult.succeeded} succeeded, {importResult.failed} failed
                </p>
              </div>
              {importResult.errors.map((e, i) => (
                <p key={i} className="text-amber-600 text-xs">{e}</p>
              ))}
            </div>
          )}
        </div>

        {/* Manual entry */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-gray-900 font-semibold text-sm flex items-center gap-2">
            <Plus size={16} className="text-emerald-600" /> Manual Entry
          </h2>

          {msg && (
            <div className={`px-4 py-3 rounded-xl text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {msg.text}
            </div>
          )}

          <DropdownPicker label="Supplier" value={selSupplier?.name || ''} placeholder="Select supplier..." onOpen={() => { setPicker('supplier'); setPickerSearch(''); }} />
          <DropdownPicker label="Material" value={selMaterial?.name || ''} placeholder="Select material..." onOpen={() => { setPicker('material'); setPickerSearch(''); }} />
          <DropdownPicker label="Location" value={selLocation?.name || ''} placeholder="Select location..." onOpen={() => { setPicker('location'); setPickerSearch(''); }} />

          {currentBalance !== null && (
            <div className="flex items-center gap-2 px-4 py-3 bg-sky-50 border border-sky-200 rounded-xl">
              <span className="text-sky-600 text-xs font-semibold">Current balance at {selLocation?.name}: </span>
              <span className="text-sky-800 font-bold text-sm">{currentBalance} {selMaterial?.unit}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quantity</label>
            <input type="number" min="0.01" step="any" value={qty} onChange={e => setQty(e.target.value)}
              placeholder="Enter quantity..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-lg font-semibold text-center focus:outline-none focus:border-emerald-400" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Note (Optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Delivery from supplier"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400" />
          </div>

          <button onClick={submit} disabled={saving || !selMaterial || !selLocation || !qty}
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors">
            {saving ? <Spinner /> : <><Plus size={16} /> Add Stock</>}
          </button>
        </div>
      </div>

      {/* Picker modal */}
      {picker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 capitalize">Select {picker}</h3>
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
                  if (picker === 'material') setSelMaterial(materials.find(m => m.id === item.id) || null);
                  if (picker === 'location') setSelLocation(locations.find(l => l.id === item.id) || null);
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
