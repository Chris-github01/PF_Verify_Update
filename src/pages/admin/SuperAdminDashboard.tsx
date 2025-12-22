import { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  ExternalLink,
  Calendar,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  FileText,
  Shield
} from 'lucide-react';
import {
  getAllOrganisations,
  extendTrial,
  updateSubscriptionStatus,
  impersonateOrganisation,
  TRADE_LABELS,
  type OrganisationDashboard
} from '../../lib/admin/adminApi';
import { logAdminAction } from '../../lib/admin/superAdminGuard';
import PageHeader from '../../components/PageHeader';
import TradeLicenseManager from '../../components/TradeLicenseManager';

export default function SuperAdminDashboard() {
  const [orgs, setOrgs] = useState<OrganisationDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'trial' | 'active' | 'expired'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [managingLicenses, setManagingLicenses] = useState<OrganisationDashboard | null>(null);

  useEffect(() => {
    loadOrganisations();
  }, []);

  const loadOrganisations = async () => {
    setLoading(true);
    try {
      const data = await getAllOrganisations();
      setOrgs(data);
    } catch (error) {
      console.error('Failed to load organisations:', error);
      setMessage({ type: 'error', text: 'Failed to load organisations' });
    } finally {
      setLoading(false);
    }
  };

  const handleExtendTrial = async (orgId: string, days: number) => {
    try {
      await extendTrial(orgId, days);
      setMessage({ type: 'success', text: `Trial extended by ${days} days` });
      await loadOrganisations();
    } catch (error) {
      console.error('Failed to extend trial:', error);
      setMessage({ type: 'error', text: 'Failed to extend trial' });
    }
  };

  const handleUpdateStatus = async (
    orgId: string,
    newStatus: 'trial' | 'active' | 'expired' | 'suspended' | 'cancelled'
  ) => {
    try {
      await updateSubscriptionStatus(orgId, newStatus);
      setMessage({ type: 'success', text: `Status updated to ${newStatus}` });
      await loadOrganisations();
    } catch (error) {
      console.error('Failed to update status:', error);
      setMessage({ type: 'error', text: 'Failed to update status' });
    }
  };

  const handleImpersonate = async (org: OrganisationDashboard) => {
    try {
      await impersonateOrganisation(org.id);
    } catch (error) {
      console.error('Failed to impersonate:', error);
      setMessage({ type: 'error', text: 'Failed to enter client mode' });
    }
  };

  const getDaysUntilExpiry = (trialEndDate: string | null): number | null => {
    if (!trialEndDate) return null;
    const end = new Date(trialEndDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'trial': return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
      case 'active': return 'bg-green-500/20 text-green-300 border border-green-500/30';
      case 'expired': return 'bg-red-500/20 text-red-300 border border-red-500/30';
      case 'suspended': return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border border-slate-500/30';
    }
  };

  const getTradeLabel = (tradeType: string) => {
    const labels: Record<string, string> = {
      'passive_fire': 'VerifyTrade Passive Fire',
      'electrical': 'Verify+ Electrical',
      'plumbing': 'Verify+ Plumbing',
      'mechanical': 'Verify+ Mechanical',
      'other': 'Other'
    };
    return labels[tradeType] || tradeType;
  };

  const filteredOrgs = orgs.filter(org => {
    if (filter !== 'all' && org.subscription_status !== filter) return false;
    if (searchTerm && !org.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: orgs.length,
    trial: orgs.filter(o => o.subscription_status === 'trial').length,
    active: orgs.filter(o => o.subscription_status === 'active').length,
    expired: orgs.filter(o => o.subscription_status === 'expired').length,
    totalQuotes: orgs.reduce((sum, o) => sum + o.quote_count, 0)
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading clients...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Super Admin Dashboard"
        subtitle="God-mode control over all clients and trades"
      />

      {message && (
        <div className={`p-4 rounded-lg border ${
          message.type === 'success'
            ? 'bg-green-500/10 text-green-300 border-green-500/30'
            : 'bg-red-500/10 text-red-300 border-red-500/30'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 p-4">
          <div className="flex items-center gap-3">
            <Users className="text-gray-400" size={24} />
            <div>
              <div className="text-sm text-gray-400">Total Clients</div>
              <div className="text-2xl font-bold text-white">{stats.total}</div>
            </div>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-lg border border-blue-500/30 p-4">
          <div className="flex items-center gap-3">
            <Clock className="text-blue-400" size={24} />
            <div>
              <div className="text-sm text-blue-400">On Trial</div>
              <div className="text-2xl font-bold text-blue-300">{stats.trial}</div>
            </div>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-lg border border-green-500/30 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="text-green-400" size={24} />
            <div>
              <div className="text-sm text-green-400">Active Paid</div>
              <div className="text-2xl font-bold text-green-300">{stats.active}</div>
            </div>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-lg border border-red-500/30 p-4">
          <div className="flex items-center gap-3">
            <XCircle className="text-red-400" size={24} />
            <div>
              <div className="text-sm text-red-400">Expired</div>
              <div className="text-2xl font-bold text-red-300">{stats.expired}</div>
            </div>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 p-4">
          <div className="flex items-center gap-3">
            <FileText className="text-gray-400" size={24} />
            <div>
              <div className="text-sm text-gray-400">Total Quotes</div>
              <div className="text-2xl font-bold text-white">{stats.totalQuotes}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-700/50 text-gray-300 hover:bg-slate-600/50'
                }`}
              >
                All ({stats.total})
              </button>
              <button
                onClick={() => setFilter('trial')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  filter === 'trial'
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-700/50 text-gray-300 hover:bg-slate-600/50'
                }`}
              >
                Trial ({stats.trial})
              </button>
              <button
                onClick={() => setFilter('active')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  filter === 'active'
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-700/50 text-gray-300 hover:bg-slate-600/50'
                }`}
              >
                Active ({stats.active})
              </button>
              <button
                onClick={() => setFilter('expired')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  filter === 'expired'
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-700/50 text-gray-300 hover:bg-slate-600/50'
                }`}
              >
                Expired ({stats.expired})
              </button>
            </div>

            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Search clients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-4 py-2 bg-slate-800/50 border border-slate-600 rounded-md text-white placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <button
                onClick={() => window.location.href = '/admin/clients/new'}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 font-medium transition-colors"
              >
                <Plus size={18} />
                New Client
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Licensed Trades</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Trial End</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Quotes</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Last Active</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredOrgs.map((org) => {
                const daysLeft = getDaysUntilExpiry(org.trial_end_date);

                return (
                  <tr key={org.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-white">{org.name}</div>
                        <div className="text-sm text-gray-400">{org.owner_email || 'No owner'}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {org.licensed_trades && org.licensed_trades.length > 0 ? (
                          org.licensed_trades.map(trade => (
                            <span
                              key={trade}
                              className="inline-flex px-2 py-1 text-xs font-medium rounded bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            >
                              {TRADE_LABELS[trade]?.replace(' Verify+', '') || trade}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-500">No trades</span>
                        )}
                      </div>
                      <button
                        onClick={() => setManagingLicenses(org)}
                        className="text-xs text-blue-400 hover:text-blue-300 mt-1 transition-colors"
                      >
                        Manage Licenses
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${getStatusColor(org.subscription_status)}`}>
                        {org.subscription_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {org.trial_end_date ? (
                        <div>
                          <div className="text-sm text-white">
                            {new Date(org.trial_end_date).toLocaleDateString()}
                          </div>
                          {daysLeft !== null && (
                            <div className={`text-xs ${
                              daysLeft < 0 ? 'text-red-400' :
                              daysLeft < 3 ? 'text-orange-400' :
                              'text-gray-400'
                            }`}>
                              {daysLeft < 0 ? `${Math.abs(daysLeft)} days ago` : `${daysLeft} days left`}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-white">{org.quote_count}</span>
                    </td>
                    <td className="px-4 py-3">
                      {org.last_active_at ? (
                        <span className="text-sm text-gray-300">
                          {new Date(org.last_active_at).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleImpersonate(org)}
                          className="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
                          title="Enter as Client"
                        >
                          <ExternalLink size={16} />
                        </button>
                        <button
                          onClick={() => handleExtendTrial(org.id, 30)}
                          className="p-1.5 text-green-400 hover:bg-green-500/20 rounded transition-colors"
                          title="Extend Trial +30 days"
                        >
                          <Calendar size={16} />
                        </button>
                        {org.subscription_status === 'trial' && (
                          <button
                            onClick={() => handleUpdateStatus(org.id, 'active')}
                            className="p-1.5 text-green-400 hover:bg-green-500/20 rounded transition-colors"
                            title="Upgrade to Active"
                          >
                            <TrendingUp size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredOrgs.length === 0 && (
            <div className="p-12 text-center text-gray-400">
              No clients found matching your filters
            </div>
          )}
        </div>
      </div>

      {managingLicenses && (
        <TradeLicenseManager
          organisationId={managingLicenses.id}
          organisationName={managingLicenses.name}
          currentLicenses={managingLicenses.licensed_trades || []}
          subscriptionStatus={managingLicenses.subscription_status}
          onClose={() => setManagingLicenses(null)}
          onUpdate={() => {
            loadOrganisations();
            setMessage({ type: 'success', text: 'Trade licenses updated' });
          }}
        />
      )}
    </div>
  );
}
