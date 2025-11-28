import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Organisation {
  id: string;
  name: string;
  status: 'active' | 'trial' | 'suspended';
  seat_limit: number;
  created_at: string;
  owner_email?: string;
  owner_name?: string;
  plan_name?: string;
  seats_used?: number;
  project_count?: number;
  last_active?: string;
}

export default function OrganisationsList() {
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [filteredOrgs, setFilteredOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    loadOrganisations();
  }, []);

  useEffect(() => {
    filterOrganisations();
  }, [searchQuery, statusFilter, organisations]);

  const loadOrganisations = async () => {
    try {
      const { data: orgs, error } = await supabase
        .from('organisations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const orgsWithDetails = await Promise.all(
        (orgs || []).map(async (org) => {
          const { data: members } = await supabase
            .from('organisation_members')
            .select('user_id, role, status')
            .eq('organisation_id', org.id);

          const owner = members?.find(m => m.role === 'owner');
          const seatsUsed = members?.filter(
            m => m.status === 'active' && ['owner', 'admin', 'member'].includes(m.role)
          ).length || 0;

          let ownerEmail = '';
          if (owner) {
            const { data: profile } = await supabase
              .rpc('get_user_details', { p_user_id: owner.user_id })
              .maybeSingle();
            ownerEmail = profile?.email || '';
          }

          const subscription = {
            plan_name: org.pricing_tier || 'standard'
          };

          const { count: projectCount } = await supabase
            .from('projects')
            .select('*', { count: 'exact', head: true })
            .eq('organisation_id', org.id);

          const { data: lastProject } = await supabase
            .from('projects')
            .select('updated_at')
            .eq('organisation_id', org.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...org,
            owner_email: ownerEmail,
            plan_name: subscription?.plan_name || 'Trial',
            seats_used: seatsUsed,
            project_count: projectCount || 0,
            last_active: lastProject?.updated_at || org.created_at,
          };
        })
      );

      setOrganisations(orgsWithDetails as Organisation[]);
    } catch (error) {
      console.error('Error loading organisations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOrganisations = () => {
    let filtered = organisations;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(org => org.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        org =>
          org.name.toLowerCase().includes(query) ||
          (org.owner_email && org.owner_email.toLowerCase().includes(query))
      );
    }

    setFilteredOrgs(filtered);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'trial':
        return 'bg-amber-50 text-amber-700';
      case 'suspended':
        return 'bg-rose-50 text-rose-700';
      default:
        return 'bg-emerald-50 text-emerald-700';
    }
  };

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Organisations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage client organisations, seat limits, and subscription status.
          </p>
        </div>
        <button
          onClick={() => (window.location.href = '/admin/organisations/new')}
          className="inline-flex items-center rounded-lg bg-[#0A66C2] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[#0952A0] transition"
        >
          Create organisation
        </button>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by organisation name or owner email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.06)] overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading organisations...</div>
        ) : filteredOrgs.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            {searchQuery || statusFilter !== 'all' ? 'No organisations found' : 'No organisations yet'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Organisation
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Owner
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Plan
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Seats
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Projects
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Last active
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredOrgs.map((org) => (
                  <tr
                    key={org.id}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => (window.location.href = `/admin/organisations/${org.id}`)}
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{org.name}</span>
                        {org.status !== 'active' && (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadge(
                              org.status
                            )}`}
                          >
                            {org.status.charAt(0).toUpperCase() + org.status.slice(1)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle text-sm text-slate-600">
                      {org.owner_email || '—'}
                    </td>
                    <td className="px-4 py-3 align-middle text-sm text-slate-800">{org.plan_name}</td>
                    <td className="px-4 py-3 align-middle text-sm text-slate-800">
                      <span className={org.seats_used! > org.seat_limit ? 'text-rose-600 font-medium' : ''}>
                        {org.seats_used} / {org.seat_limit}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-sm text-slate-800">{org.project_count}</td>
                    <td className="px-4 py-3 align-middle">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(
                          org.status
                        )}`}
                      >
                        {org.status.charAt(0).toUpperCase() + org.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-sm text-slate-600">
                      {formatDate(org.last_active!)}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.href = `/admin/organisations/${org.id}`;
                        }}
                        className="text-xs font-medium text-[#0A66C2] hover:underline"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
