import { useState } from 'react';
import { Plus, X, Loader2, ClipboardList, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import {
  usePlantBookings, usePlantAssets, createPlantBooking, updatePlantBooking, recordPlantMovement,
  formatCurrency, formatHireUnit,
} from '../../lib/plantHire/usePlantHire';
import { useOrganisation } from '../../lib/organisationContext';
import { supabase } from '../../lib/supabase';
import type { PlantBooking, BookingStatus, HireUnit, MovementEventType } from '../../types/plantHire.types';

const STATUS_BADGE: Record<BookingStatus, { label: string; color: string }> = {
  DRAFT:     { label: 'Draft',      color: 'bg-slate-600/40 text-slate-300 border-slate-600/40' },
  BOOKED:    { label: 'Booked',     color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  ON_HIRE:   { label: 'On Hire',    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  OFF_HIRED: { label: 'Off Hired',  color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  CLOSED:    { label: 'Closed',     color: 'bg-slate-700/40 text-slate-500 border-slate-700/30' },
  CANCELLED: { label: 'Cancelled',  color: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

const HIRE_UNITS: HireUnit[] = ['HOUR', 'DAY', 'WEEK', 'MONTH'];

interface BookingFormData {
  asset_id: string; project_id: string; charging_basis: HireUnit;
  hire_start_date: string; planned_end_date: string;
  delivery_required: boolean; collection_required: boolean;
  cost_code: string; notes: string; internal_reference: string;
}

const EMPTY_FORM: BookingFormData = {
  asset_id: '', project_id: '', charging_basis: 'DAY',
  hire_start_date: '', planned_end_date: '',
  delivery_required: false, collection_required: false,
  cost_code: '', notes: '', internal_reference: '',
};

interface Props {
  initialAssetId?: string;
  onNavigate?: (view: string) => void;
}

export default function PlantBookings({ initialAssetId, onNavigate }: Props) {
  const { currentOrganisation } = useOrganisation();
  const { bookings, loading, refresh } = usePlantBookings();
  const { assets } = usePlantAssets();
  const [showModal, setShowModal] = useState(!!initialAssetId);
  const [form, setForm] = useState<BookingFormData>({ ...EMPTY_FORM, asset_id: initialAssetId || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [movementModal, setMovementModal] = useState<{ booking: PlantBooking } | null>(null);
  const [movementForm, setMovementForm] = useState({ event_type: 'DELIVERED_TO_SITE' as MovementEventType, event_date: new Date().toISOString().split('T')[0], notes: '' });
  const [movingSaving, setMovingSaving] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);

  useState(() => {
    if (!currentOrganisation?.id) return;
    supabase.from('vs_projects').select('id, name, client').eq('organisation_id', currentOrganisation.id).eq('active', true).order('name')
      .then(({ data }) => setProjects(data || []));
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganisation?.id || !form.asset_id || !form.hire_start_date) {
      setError('Asset and hire start date are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await createPlantBooking(currentOrganisation.id, user?.id || '', {
      ...form,
      project_id: form.project_id || null,
      planned_end_date: form.planned_end_date || null,
      status: 'BOOKED',
    });
    if (err) { setError(err); setSaving(false); return; }
    setSaving(false);
    setShowModal(false);
    setForm(EMPTY_FORM);
    refresh();
  };

  const handleStatusChange = async (booking: PlantBooking, status: BookingStatus) => {
    const { data: { user } } = await supabase.auth.getUser();
    await updatePlantBooking(booking.id, user?.id || '', { status });
    refresh();
  };

  const handleRecordMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movementModal || !currentOrganisation?.id) return;
    setMovingSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await recordPlantMovement(
      currentOrganisation.id,
      movementModal.booking.id,
      movementModal.booking.asset_id,
      movementForm.event_type,
      movementForm.event_date,
      user?.id || '',
      { notes: movementForm.notes || undefined }
    );
    setMovingSaving(false);
    if (err) { alert('Error: ' + err); return; }
    setMovementModal(null);
    refresh();
  };

  const availableMovements = (booking: PlantBooking): MovementEventType[] => {
    switch (booking.status) {
      case 'BOOKED':    return ['DELIVERED_TO_SITE', 'CANCELLED'];
      case 'ON_HIRE':   return ['COLLECTED_FROM_SITE', 'EXTENDED', 'SWAPPED'];
      case 'OFF_HIRED': return ['RETURNED_TO_YARD', 'CANCELLED'];
      default:          return [];
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-slate-400 text-sm">{bookings.length} bookings total</p>
        <button
          onClick={() => { setForm(EMPTY_FORM); setError(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold text-sm rounded-lg transition-colors"
        >
          <Plus size={15} />
          New Booking
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="text-slate-500 animate-spin" /></div>
      ) : bookings.length === 0 ? (
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-12 text-center">
          <ClipboardList size={36} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No bookings yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map(booking => {
            const sb = STATUS_BADGE[booking.status];
            const isExpanded = expandedId === booking.id;
            const moves = availableMovements(booking);
            const asset = booking.asset as any;
            const project = booking.project as any;
            return (
              <div key={booking.id} className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-700/20 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : booking.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${sb.color}`}>{sb.label}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{asset?.asset_name || booking.asset_id}</p>
                      <p className="text-xs text-slate-400">{booking.booking_reference} · {project?.name || 'No project'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-400 hidden sm:block">{booking.hire_start_date} → {booking.actual_off_hire_date || booking.planned_end_date || 'Open'}</span>
                    {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-700/50 px-4 py-4 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <InfoItem label="Charging Basis" value={formatHireUnit(booking.charging_basis)} />
                      <InfoItem label="Start Date" value={booking.hire_start_date} />
                      <InfoItem label="Planned End" value={booking.planned_end_date || 'Open'} />
                      <InfoItem label="Actual Off Hire" value={booking.actual_off_hire_date || '—'} />
                      {booking.cost_code && <InfoItem label="Cost Code" value={booking.cost_code} />}
                      {booking.notes && <InfoItem label="Notes" value={booking.notes} />}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {moves.length > 0 && (
                        <button
                          onClick={() => { setMovementModal({ booking }); setMovementForm({ event_type: moves[0], event_date: new Date().toISOString().split('T')[0], notes: '' }); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs hover:bg-emerald-500/30 transition-colors"
                        >
                          <Calendar size={12} />
                          Record Movement
                        </button>
                      )}
                      {booking.status === 'OFF_HIRED' && (
                        <button
                          onClick={() => handleStatusChange(booking, 'CLOSED')}
                          className="px-3 py-1.5 bg-slate-600/30 text-slate-300 border border-slate-600/30 rounded-lg text-xs hover:bg-slate-600/50 transition-colors"
                        >
                          Close Booking
                        </button>
                      )}
                      {booking.status === 'DRAFT' && (
                        <button
                          onClick={() => handleStatusChange(booking, 'BOOKED')}
                          className="px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs hover:bg-blue-500/30 transition-colors"
                        >
                          Confirm Booking
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New Booking Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto py-8 px-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
              <h2 className="text-lg font-bold text-white">New Plant Booking</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2">{error}</div>}

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Plant Asset *</label>
                <select
                  value={form.asset_id}
                  onChange={e => setForm(f => ({ ...f, asset_id: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="">Select plant...</option>
                  {assets.filter(a => a.current_status === 'AVAILABLE').map(a => (
                    <option key={a.id} value={a.id}>{a.asset_code} — {a.asset_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Project / Site</label>
                <select
                  value={form.project_id}
                  onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="">No project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.client ? ` — ${p.client}` : ''}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Charging Basis *</label>
                  <select
                    value={form.charging_basis}
                    onChange={e => setForm(f => ({ ...f, charging_basis: e.target.value as HireUnit }))}
                    className="w-full bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/50"
                  >
                    {HIRE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <FormField label="Cost Code" value={form.cost_code} onChange={v => setForm(f => ({ ...f, cost_code: v }))} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Hire Start Date *" type="date" value={form.hire_start_date} onChange={v => setForm(f => ({ ...f, hire_start_date: v }))} />
                <FormField label="Planned End Date" type="date" value={form.planned_end_date} onChange={v => setForm(f => ({ ...f, planned_end_date: v }))} />
              </div>

              <div className="flex gap-6">
                <CheckField label="Delivery required" checked={form.delivery_required} onChange={v => setForm(f => ({ ...f, delivery_required: v }))} />
                <CheckField label="Collection required" checked={form.collection_required} onChange={v => setForm(f => ({ ...f, collection_required: v }))} />
              </div>

              <FormField label="Internal Reference / PO" value={form.internal_reference} onChange={v => setForm(f => ({ ...f, internal_reference: v }))} />
              <FormField label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} />

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/50 text-sm transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Confirm Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Movement Modal */}
      {movementModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
              <h2 className="text-lg font-bold text-white">Record Movement</h2>
              <button onClick={() => setMovementModal(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <form onSubmit={handleRecordMovement} className="p-6 space-y-4">
              <p className="text-sm text-slate-400">
                Asset: <span className="text-white">{(movementModal.booking.asset as any)?.asset_name}</span>
              </p>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Event Type *</label>
                <select
                  value={movementForm.event_type}
                  onChange={e => setMovementForm(f => ({ ...f, event_type: e.target.value as MovementEventType }))}
                  className="w-full bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/50"
                >
                  {availableMovements(movementModal.booking).map(et => (
                    <option key={et} value={et}>{et.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <FormField label="Event Date *" type="date" value={movementForm.event_date} onChange={v => setMovementForm(f => ({ ...f, event_date: v }))} />
              <FormField label="Notes" value={movementForm.notes} onChange={v => setMovementForm(f => ({ ...f, notes: v }))} />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setMovementModal(null)} className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/50 text-sm transition-colors">Cancel</button>
                <button type="submit" disabled={movingSaving} className="flex-1 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {movingSaving && <Loader2 size={14} className="animate-spin" />}
                  Record Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-slate-200 mt-0.5">{value}</p>
    </div>
  );
}

function FormField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/50" />
    </div>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500" />
      <span className="text-sm text-slate-300">{label}</span>
    </label>
  );
}
