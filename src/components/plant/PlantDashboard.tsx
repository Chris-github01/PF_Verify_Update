import { Truck, Package, Wrench, AlertCircle, DollarSign, ClipboardList, RefreshCw, Calendar } from 'lucide-react';
import { usePlantDashboardStats, usePlantBookings, usePlantMovements, formatCurrency } from '../../lib/plantHire/usePlantHire';
import type { PlantAssetStatus, BookingStatus } from '../../types/plantHire.types';

const STATUS_BADGE: Record<BookingStatus, { label: string; color: string }> = {
  DRAFT:      { label: 'Draft',      color: 'bg-slate-600/40 text-slate-300' },
  BOOKED:     { label: 'Booked',     color: 'bg-blue-500/20 text-blue-300' },
  ON_HIRE:    { label: 'On Hire',    color: 'bg-emerald-500/20 text-emerald-300' },
  OFF_HIRED:  { label: 'Off Hired',  color: 'bg-amber-500/20 text-amber-300' },
  CLOSED:     { label: 'Closed',     color: 'bg-slate-600/30 text-slate-400' },
  CANCELLED:  { label: 'Cancelled',  color: 'bg-red-500/20 text-red-400' },
};

const ASSET_STATUS_BADGE: Record<PlantAssetStatus, { label: string; color: string }> = {
  AVAILABLE:      { label: 'Available',     color: 'bg-emerald-500/20 text-emerald-300' },
  ON_HIRE:        { label: 'On Hire',       color: 'bg-sky-500/20 text-sky-300' },
  IN_MAINTENANCE: { label: 'Maintenance',   color: 'bg-amber-500/20 text-amber-300' },
  INACTIVE:       { label: 'Inactive',      color: 'bg-slate-600/30 text-slate-400' },
};

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  DELIVERED_TO_SITE:    { label: 'Delivered to Site',  color: 'text-emerald-400' },
  COLLECTED_FROM_SITE:  { label: 'Collected from Site', color: 'text-amber-400' },
  RETURNED_TO_YARD:     { label: 'Returned to Yard',   color: 'text-slate-400' },
  SWAPPED:              { label: 'Swapped',             color: 'text-blue-400' },
  EXTENDED:             { label: 'Extended',            color: 'text-sky-400' },
  CANCELLED:            { label: 'Cancelled',           color: 'text-red-400' },
};

interface Props {
  onNavigate: (view: string) => void;
}

export default function PlantDashboard({ onNavigate }: Props) {
  const { stats, loading: statsLoading, refresh } = usePlantDashboardStats();
  const { bookings } = usePlantBookings({ status: 'ON_HIRE' });
  const { movements } = usePlantMovements();

  const recentMovements = movements.slice(0, 8);
  const activeBookings = bookings.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Plant Hire Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">Overview of all owned plant and equipment</p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 text-sm transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Assets" value={stats.total_assets} icon={Package} color="text-slate-300" onClick={() => onNavigate('register')} />
          <StatCard label="On Hire" value={stats.on_hire_count} icon={Truck} color="text-emerald-400" onClick={() => onNavigate('bookings')} />
          <StatCard label="Available" value={stats.available_count} icon={Package} color="text-sky-400" onClick={() => onNavigate('register')} />
          <StatCard label="Maintenance" value={stats.maintenance_count} icon={Wrench} color="text-amber-400" onClick={() => onNavigate('register')} />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Active Bookings" value={stats.active_bookings} icon={ClipboardList} color="text-blue-400" onClick={() => onNavigate('bookings')} />
        <StatCard label="Unclaimed Charges" value={stats.unclaimed_charges} icon={AlertCircle} color="text-amber-400" onClick={() => onNavigate('claims')} />
        <StatCard label="Unclaimed Value" value={formatCurrency(stats.current_period_value)} icon={DollarSign} color="text-teal-400" onClick={() => onNavigate('claims')} />
      </div>

      {/* Active bookings + recent movements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assets currently on hire */}
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <Truck size={14} className="text-emerald-400" />
              <span className="text-sm font-medium text-white">Currently On Hire</span>
            </div>
            <button onClick={() => onNavigate('bookings')} className="text-xs text-cyan-400 hover:text-cyan-300">View all</button>
          </div>
          <div className="divide-y divide-slate-700/30">
            {activeBookings.length === 0 ? (
              <p className="text-slate-500 text-sm px-4 py-6 text-center">No active bookings</p>
            ) : activeBookings.map(b => (
              <div key={b.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {(b.asset as any)?.asset_name || '—'}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {(b.project as any)?.name || 'No project'} · {b.booking_reference}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[b.status].color}`}>
                  {STATUS_BADGE[b.status].label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent movements */}
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-sky-400" />
              <span className="text-sm font-medium text-white">Recent Movements</span>
            </div>
            <button onClick={() => onNavigate('movements')} className="text-xs text-cyan-400 hover:text-cyan-300">View all</button>
          </div>
          <div className="divide-y divide-slate-700/30">
            {recentMovements.length === 0 ? (
              <p className="text-slate-500 text-sm px-4 py-6 text-center">No movements recorded</p>
            ) : recentMovements.map(m => {
              const ev = EVENT_LABELS[m.event_type] || { label: m.event_type, color: 'text-slate-400' };
              return (
                <div key={m.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-xs font-medium ${ev.color}`}>{ev.label}</p>
                    <p className="text-sm text-white truncate">{(m.asset as any)?.asset_name || '—'}</p>
                    {m.notes && <p className="text-xs text-slate-400 truncate">{m.notes}</p>}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{m.event_date}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Register Plant', icon: Package, view: 'register' },
          { label: 'New Booking', icon: ClipboardList, view: 'bookings' },
          { label: 'Record Movement', icon: Truck, view: 'bookings' },
          { label: 'Claim Report', icon: DollarSign, view: 'claims' },
        ].map(({ label, icon: Icon, view }) => (
          <button
            key={view + label}
            onClick={() => onNavigate(view)}
            className="flex flex-col items-center gap-2 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 hover:border-slate-600/50 rounded-xl p-4 transition-colors"
          >
            <Icon size={18} className="text-cyan-400" />
            <span className="text-xs text-slate-300 text-center">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, onClick }: {
  label: string; value: string | number; icon: React.ElementType; color: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600/50 transition-colors text-left w-full"
    >
      <div className="flex items-start justify-between">
        <p className="text-slate-400 text-xs uppercase tracking-wide">{label}</p>
        <Icon size={14} className={`${color} opacity-60`} />
      </div>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </button>
  );
}
