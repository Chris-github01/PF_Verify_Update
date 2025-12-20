import { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  BarChart3,
  Clock,
  FileText,
  TrendingUp,
  Shield,
  Archive,
  Share2,
  Mail,
  AlertCircle,
  Zap
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrganisation } from '../lib/organisationContext';
import TeamMembersPanel from '../components/admin/TeamMembersPanel';
import OrganisationAnalytics from '../components/admin/OrganisationAnalytics';
import InviteTeamMemberModal from '../components/admin/InviteTeamMemberModal';
import CreateUserDirectlyModal from '../components/admin/CreateUserDirectlyModal';

export default function OrganisationAdminCenter() {
  const { currentOrganisation } = useOrganisation();
  const [activeTab, setActiveTab] = useState<'overview' | 'team' | 'analytics'>('overview');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    if (currentOrganisation) {
      loadUserRole();
      loadStats();
    }
  }, [currentOrganisation]);

  const loadUserRole = async () => {
    if (!currentOrganisation) return;

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;

    // Check if user is a platform admin
    const { data: platformAdminData } = await supabase
      .from('platform_admins')
      .select('is_active')
      .eq('user_id', session.session.user.id)
      .eq('is_active', true)
      .maybeSingle();

    setIsPlatformAdmin(!!platformAdminData);

    // Check organisation role
    const { data } = await supabase
      .from('organisation_members')
      .select('role')
      .eq('organisation_id', currentOrganisation.id)
      .eq('user_id', session.session.user.id)
      .is('archived_at', null)
      .maybeSingle();

    setUserRole(data?.role || null);
  };

  const loadStats = async () => {
    if (!currentOrganisation) return;

    setLoading(true);
    try {
      // Calculate analytics if not exists
      const { error: calcError } = await supabase.rpc('calculate_organisation_analytics', {
        p_organisation_id: currentOrganisation.id
      });

      if (calcError) {
        console.error('Error calculating analytics:', calcError);
      }

      // Load analytics
      const { data: analytics } = await supabase
        .from('organisation_analytics')
        .select('*')
        .eq('organisation_id', currentOrganisation.id)
        .maybeSingle();

      // Load organisation info
      const { data: org } = await supabase
        .from('organisations')
        .select('seat_limit, monthly_quote_limit, quotes_used_this_month')
        .eq('id', currentOrganisation.id)
        .single();

      setStats({
        ...analytics,
        seat_limit: org?.seat_limit || 5,
        monthly_quote_limit: org?.monthly_quote_limit || 100,
        quotes_used_this_month: org?.quotes_used_this_month || 0
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = isPlatformAdmin || userRole === 'owner' || userRole === 'admin';

  if (!currentOrganisation) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-slate-400">No organisation selected</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-slate-400 mb-4" />
          <h2 className="text-2xl font-bold text-slate-300 mb-2">Admin Access Required</h2>
          <p className="text-slate-500">Only platform admins, organisation owners, and organisation admins can access this area.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Admin Center</h1>
            <p className="text-slate-400">
              Manage your team, track usage, and configure settings for {currentOrganisation.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isPlatformAdmin && (
              <button
                onClick={() => setShowCreateUserModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                title="God Mode: Create user without signup"
              >
                <Zap size={20} />
                Create User
              </button>
            )}
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <UserPlus size={20} />
              Invite Team Member
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mt-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <BarChart3 size={18} />
              Overview
            </div>
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'team'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Users size={18} />
              Team Members
            </div>
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'analytics'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <TrendingUp size={18} />
              Analytics
            </div>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-8 overflow-y-auto" style={{ height: 'calc(100% - 200px)' }}>
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                icon={<Users size={24} />}
                label="Team Members"
                value={stats?.active_users_count || 0}
                subtitle={`of ${stats?.seat_limit || 5} seats`}
                color="blue"
                progress={(stats?.active_users_count / stats?.seat_limit) * 100}
              />
              <StatCard
                icon={<FileText size={24} />}
                label="Projects"
                value={stats?.total_projects || 0}
                subtitle="total projects"
                color="green"
              />
              <StatCard
                icon={<BarChart3 size={24} />}
                label="Quotes Imported"
                value={stats?.total_quotes_imported || 0}
                subtitle={`of ${stats?.monthly_quote_limit || 100} monthly limit`}
                color="purple"
                progress={(stats?.quotes_used_this_month / stats?.monthly_quote_limit) * 100}
              />
              <StatCard
                icon={<Clock size={24} />}
                label="Hours Saved"
                value={Math.round(stats?.estimated_hours_saved || 0)}
                subtitle="estimated time saved"
                color="orange"
              />
            </div>

            {/* Archived Users Alert */}
            {stats?.archived_users_count > 0 && (
              <div className="bg-slate-800 border border-amber-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Archive className="text-amber-500 mt-0.5" size={20} />
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-1">Archived Users</h3>
                    <p className="text-sm text-slate-400">
                      You have {stats.archived_users_count} archived user{stats.archived_users_count !== 1 ? 's' : ''}.
                      Their data is preserved and can be transferred to active users.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('team')}
                    className="text-amber-500 hover:text-amber-400 text-sm font-medium"
                  >
                    View
                  </button>
                </div>
              </div>
            )}

            {/* Recent Activity */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <h2 className="text-xl font-bold text-white mb-4">Organization Insights</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-slate-400 mb-3">Usage Statistics</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300">Reports Generated</span>
                      <span className="font-semibold text-white">{stats?.total_reports_generated || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300">Avg. Quotes per Project</span>
                      <span className="font-semibold text-white">
                        {stats?.total_projects > 0
                          ? (stats.total_quotes_imported / stats.total_projects).toFixed(1)
                          : '0'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300">Avg. Hours Saved per Quote</span>
                      <span className="font-semibold text-white">2.5h</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-400 mb-3">Capacity</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300">Seats Available</span>
                      <span className="font-semibold text-white">
                        {(stats?.seat_limit || 0) - (stats?.active_users_count || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300">Quotes Remaining (Monthly)</span>
                      <span className="font-semibold text-white">
                        {(stats?.monthly_quote_limit || 0) - (stats?.quotes_used_this_month || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300">Last Updated</span>
                      <span className="text-slate-400 text-sm">
                        {stats?.last_calculated_at
                          ? new Date(stats.last_calculated_at).toLocaleDateString()
                          : 'Never'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <TeamMembersPanel
            organisationId={currentOrganisation.id}
            onInvite={() => setShowInviteModal(true)}
            onRefresh={loadStats}
          />
        )}

        {activeTab === 'analytics' && (
          <OrganisationAnalytics organisationId={currentOrganisation.id} />
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteTeamMemberModal
          organisationId={currentOrganisation.id}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            loadStats();
          }}
        />
      )}

      {/* Create User Directly Modal (God Mode) */}
      {showCreateUserModal && isPlatformAdmin && (
        <CreateUserDirectlyModal
          organisationId={currentOrganisation.id}
          organisationName={currentOrganisation.name}
          onClose={() => setShowCreateUserModal(false)}
          onSuccess={() => {
            setShowCreateUserModal(false);
            loadStats();
          }}
        />
      )}
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  subtitle: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
  progress?: number;
}

function StatCard({ icon, label, value, subtitle, color, progress }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    green: 'bg-green-500/10 text-green-400 border-green-500/30',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/30'
  };

  const progressColors = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500'
  };

  return (
    <div className={`bg-slate-800 rounded-lg border p-6 ${colorClasses[color]}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="p-2 rounded-lg bg-slate-700/50">
          {icon}
        </div>
      </div>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      <div className="text-sm text-slate-400 mb-3">{subtitle}</div>
      {progress !== undefined && (
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full ${progressColors[color]} transition-all duration-300`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
