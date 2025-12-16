import { useState, useEffect } from 'react';
import { ArrowLeft, Search, Filter, Eye, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AuditEvent {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string | null;
  metadata_json: any;
  created_at: string;
  actor_email?: string;
}

export default function AuditLedger() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalEvents, setTotalEvents] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    loadEvents();
  }, [entityTypeFilter, actionFilter, currentPage]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_events')
        .select('*, actor:auth.users!audit_events_actor_user_id_fkey(email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

      if (entityTypeFilter) {
        query = query.eq('entity_type', entityTypeFilter);
      }

      if (actionFilter) {
        query = query.eq('action', actionFilter);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const eventsWithActor = data?.map(event => ({
        ...event,
        actor_email: (event as any).actor?.email || 'System',
      })) || [];

      setEvents(eventsWithActor);
      setTotalEvents(count || 0);
    } catch (error) {
      console.error('Failed to load audit events:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = events.filter(event =>
    search === '' ||
    event.entity_id.toLowerCase().includes(search.toLowerCase()) ||
    event.entity_type.toLowerCase().includes(search.toLowerCase()) ||
    event.action.toLowerCase().includes(search.toLowerCase()) ||
    event.actor_email?.toLowerCase().includes(search.toLowerCase())
  );

  const getEntityBadgeColor = (entityType: string) => {
    const colors: any = {
      quote: 'bg-blue-100 text-blue-700',
      audit: 'bg-emerald-100 text-emerald-700',
      export: 'bg-amber-100 text-amber-700',
      org: 'bg-purple-100 text-purple-700',
      project: 'bg-cyan-100 text-cyan-700',
      supplier: 'bg-pink-100 text-pink-700',
      user: 'bg-slate-100 text-slate-700',
    };
    return colors[entityType] || 'bg-gray-100 text-gray-700';
  };

  const getActionBadgeColor = (action: string) => {
    const colors: any = {
      created: 'bg-emerald-100 text-emerald-700',
      updated: 'bg-blue-100 text-blue-700',
      deleted: 'bg-rose-100 text-rose-700',
      parsed: 'bg-amber-100 text-amber-700',
      scored: 'bg-purple-100 text-purple-700',
      exported: 'bg-cyan-100 text-cyan-700',
      recommended: 'bg-green-100 text-green-700',
      approved: 'bg-emerald-100 text-emerald-700',
      rejected: 'bg-rose-100 text-rose-700',
    };
    return colors[action] || 'bg-gray-100 text-gray-700';
  };

  const totalPages = Math.ceil(totalEvents / pageSize);

  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <button
          onClick={() => (window.location.href = '/admin/dashboard')}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>
        <h1 className="text-2xl font-bold text-slate-900">Audit Ledger</h1>
        <p className="text-sm text-slate-600 mt-1">
          Immutable event log of all system activities
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search events..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2]"
              />
            </div>

            <select
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2]"
            >
              <option value="">All Entity Types</option>
              <option value="quote">Quote</option>
              <option value="audit">Audit</option>
              <option value="export">Export</option>
              <option value="org">Organisation</option>
              <option value="project">Project</option>
              <option value="supplier">Supplier</option>
              <option value="user">User</option>
            </select>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2]"
            >
              <option value="">All Actions</option>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="deleted">Deleted</option>
              <option value="parsed">Parsed</option>
              <option value="scored">Scored</option>
              <option value="exported">Exported</option>
              <option value="recommended">Recommended</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block w-8 h-8 border-4 border-slate-200 border-t-[#0A66C2] rounded-full animate-spin" />
              <p className="text-sm text-slate-600 mt-3">Loading events...</p>
            </div>
          ) : filteredEvents.length > 0 ? (
            <>
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Timestamp</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Entity</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Actor</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Entity ID</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(event.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${getEntityBadgeColor(event.entity_type)}`}>
                          {event.entity_type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${getActionBadgeColor(event.action)}`}>
                          {event.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {event.actor_email}
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-slate-500">
                        {event.entity_id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedEvent(event)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-[#0A66C2] hover:text-[#0952A0]"
                        >
                          View
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalEvents)} of {totalEvents} events
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-600">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center">
              <Eye size={48} className="mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Events Found</h3>
              <p className="text-sm text-slate-600">
                Try adjusting your filters or search criteria.
              </p>
            </div>
          )}
        </div>
      </div>

      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Event Details</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Event ID</label>
                <p className="text-sm font-mono text-slate-900">{selectedEvent.id}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Entity Type</label>
                  <p className="text-sm text-slate-900">{selectedEvent.entity_type}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Action</label>
                  <p className="text-sm text-slate-900">{selectedEvent.action}</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Entity ID</label>
                <p className="text-sm font-mono text-slate-900">{selectedEvent.entity_id}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Actor</label>
                <p className="text-sm text-slate-900">{selectedEvent.actor_email}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Timestamp</label>
                <p className="text-sm text-slate-900">{new Date(selectedEvent.created_at).toLocaleString()}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Metadata</label>
                <pre className="text-xs bg-slate-50 p-3 rounded-lg overflow-auto max-h-48 font-mono text-slate-900">
                  {JSON.stringify(selectedEvent.metadata_json, null, 2)}
                </pre>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
