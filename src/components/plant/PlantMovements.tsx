import { useState } from 'react';
import { Activity, Filter } from 'lucide-react';
import { usePlantMovements } from '../../lib/plantHire/usePlantHire';
import type { MovementEventType } from '../../types/plantHire.types';

const EVENT_CONFIG: Record<MovementEventType, { label: string; color: string; dot: string }> = {
  DELIVERED_TO_SITE:   { label: 'Delivered to Site',  color: 'text-emerald-400', dot: 'bg-emerald-500' },
  COLLECTED_FROM_SITE: { label: 'Collected from Site', color: 'text-amber-400',  dot: 'bg-amber-500'  },
  RETURNED_TO_YARD:    { label: 'Returned to Yard',   color: 'text-slate-400',   dot: 'bg-slate-500'  },
  SWAPPED:             { label: 'Swapped',             color: 'text-blue-400',   dot: 'bg-blue-500'   },
  EXTENDED:            { label: 'Extended',            color: 'text-sky-400',    dot: 'bg-sky-500'    },
  CANCELLED:           { label: 'Cancelled',           color: 'text-red-400',    dot: 'bg-red-500'    },
};

export default function PlantMovements() {
  const { movements, loading } = usePlantMovements();
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = movements.filter(m => {
    const matchType = filterType === 'all' || m.event_type === filterType;
    const assetName = (m.asset as any)?.asset_name?.toLowerCase() || '';
    const matchSearch = !search || assetName.includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Activity size={14} className="text-slate-500 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by asset..."
            className="flex-1 bg-slate-800/80 border border-slate-700/50 text-white text-sm rounded-lg px-3 py-2 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-500 shrink-0" />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-slate-800/80 border border-slate-700/50 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="all">All Events</option>
            {Object.entries(EVENT_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="bg-slate-800/60 rounded-xl border border-slate-700/50 h-16 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-12 text-center">
          <Activity size={36} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No movements found</p>
        </div>
      ) : (
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['Date', 'Event', 'Asset', 'Booking Ref', 'Notes', 'Recorded By'].map(h => (
                  <th key={h} className="text-left text-xs text-slate-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filtered.map(m => {
                const ev = EVENT_CONFIG[m.event_type];
                const asset = m.asset as any;
                const booking = m.booking as any;
                return (
                  <tr key={m.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 text-slate-300 text-xs font-mono whitespace-nowrap">{m.event_date}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ev.dot}`} />
                        <span className={`text-xs font-medium ${ev.color}`}>{ev.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">{asset?.asset_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">{booking?.booking_reference || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{m.notes || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{m.created_at ? new Date(m.created_at).toLocaleDateString('en-NZ') : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
