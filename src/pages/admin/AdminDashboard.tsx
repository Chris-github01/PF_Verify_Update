import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Building2,
  Users,
  FolderKanban,
  FileText,
  Activity,
  TrendingUp,
  Clock,
  ArrowRight,
  Database,
  Server,
  Zap
} from 'lucide-react';

interface PlatformStats {
  totalOrganisations: number;
  totalUsers: number;
  totalProjects: number;
  totalQuotes: number;
  activeOrganisations: number;
  recentActivity: {
    id: string;
    type: string;
    description: string;
    timestamp: string;
  }[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<PlatformStats>({
    totalOrganisations: 0,
    totalUsers: 0,
    totalProjects: 0,
    totalQuotes: 0,
    activeOrganisations: 0,
    recentActivity: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [
        { count: orgsCount },
        { count: usersCount },
        { count: projectsCount },
        { count: quotesCount },
        { count: activeOrgsCount },
        { data: recentOrgs },
      ] = await Promise.all([
        supabase.from('organisations').select('*', { count: 'exact', head: true }),
        supabase.from('organisation_members').select('*', { count: 'exact', head: true }),
        supabase.from('projects').select('*', { count: 'exact', head: true }),
        supabase.from('quotes').select('*', { count: 'exact', head: true }),
        supabase
          .from('organisations')
          .select('*', { count: 'exact', head: true })
          .eq('subscription_status', 'active'),
        supabase
          .from('organisations')
          .select('id, name, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      const recentActivity = (recentOrgs || []).map((org) => ({
        id: org.id,
        type: 'organisation',
        description: `New organisation: ${org.name}`,
        timestamp: org.created_at,
      }));

      setStats({
        totalOrganisations: orgsCount || 0,
        totalUsers: usersCount || 0,
        totalProjects: projectsCount || 0,
        totalQuotes: quotesCount || 0,
        activeOrganisations: activeOrgsCount || 0,
        recentActivity,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statCards = [
    {
      title: 'Total Organisations',
      value: stats.totalOrganisations,
      icon: Building2,
      color: 'from-sky-500 to-blue-600',
      iconColor: 'text-sky-400',
      bgColor: 'bg-sky-500/10',
      link: '/admin/organisations',
    },
    {
      title: 'Total Users',
      value: stats.totalUsers,
      icon: Users,
      color: 'from-emerald-500 to-green-600',
      iconColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      link: '/admin/platform-admins',
    },
    {
      title: 'Total Projects',
      value: stats.totalProjects,
      icon: FolderKanban,
      color: 'from-violet-500 to-purple-600',
      iconColor: 'text-violet-400',
      bgColor: 'bg-violet-500/10',
    },
    {
      title: 'Total Quotes',
      value: stats.totalQuotes,
      icon: FileText,
      color: 'from-amber-500 to-orange-600',
      iconColor: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
    },
  ];

  const quickActions = [
    {
      title: 'Manage Organisations',
      description: 'View and manage client organisations',
      icon: Building2,
      link: '/admin/organisations',
      color: 'bg-sky-500',
    },
    {
      title: 'Platform Admins',
      description: 'Manage platform administrator access',
      icon: Users,
      link: '/admin/platform-admins',
      color: 'bg-emerald-500',
    },
    {
      title: 'Executive Dashboard',
      description: 'Audit intelligence and reporting',
      icon: Activity,
      link: '/admin/executive-dashboard',
      color: 'bg-blue-500',
    },
    {
      title: 'Audit Ledger',
      description: 'Immutable event log and audit trail',
      icon: Database,
      link: '/admin/audit-ledger',
      color: 'bg-amber-500',
    },
    {
      title: 'PDF Vault',
      description: 'Global PDF repository and analytics',
      icon: FileText,
      link: '/admin/pdfs',
      color: 'bg-purple-500',
    },
    {
      title: 'System Configuration',
      description: 'Configure system-wide settings',
      icon: Server,
      link: '/admin/system-config',
      color: 'bg-violet-500',
    },
  ];

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-50 mb-2">Admin Dashboard</h1>
        <p className="text-slate-400">Platform administration and monitoring</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="relative group rounded-xl border border-slate-700 bg-slate-900/40 shadow-lg p-6 hover:border-slate-600 transition-all overflow-hidden"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-0 group-hover:opacity-5 transition-opacity`} />

              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${card.bgColor}`}>
                    <Icon className={`w-6 h-6 ${card.iconColor}`} />
                  </div>
                  {card.link && (
                    <button
                      onClick={() => (window.location.href = card.link)}
                      className="text-slate-400 hover:text-slate-200 transition opacity-0 group-hover:opacity-100"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-slate-400">{card.title}</p>
                  <p className="text-3xl font-bold text-slate-50">{card.value.toLocaleString()}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-6 mb-8">
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 shadow-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-sky-500/10">
              <Activity className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Recent Activity</h2>
              <p className="text-sm text-slate-400">Latest platform events</p>
            </div>
          </div>

          <div className="space-y-3">
            {stats.recentActivity.length === 0 ? (
              <p className="text-center py-8 text-slate-400">No recent activity</p>
            ) : (
              stats.recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/40 border border-slate-700/40 hover:border-slate-600/40 transition"
                >
                  <div className="p-2 rounded-lg bg-sky-500/10">
                    <Building2 className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200">{activity.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <p className="text-xs text-slate-500">{formatDate(activity.timestamp)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/40 shadow-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">System Status</h2>
              <p className="text-sm text-slate-400">Platform health</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm text-slate-200">Database</span>
              </div>
              <span className="text-xs font-medium text-emerald-400">Operational</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm text-slate-200">API Services</span>
              </div>
              <span className="text-xs font-medium text-emerald-400">Operational</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-sky-500/10 border border-sky-500/30">
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-sky-400" />
                <span className="text-sm text-slate-200">Active Orgs</span>
              </div>
              <span className="text-sm font-medium text-sky-300">{stats.activeOrganisations}</span>
            </div>

            <div className="mt-4 p-4 rounded-lg bg-slate-800/60 border border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-slate-200">Platform Growth</span>
              </div>
              <p className="text-xs text-slate-400">
                {stats.totalOrganisations} organisations managing {stats.totalProjects} projects
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/40 shadow-lg p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-1">Quick Actions</h2>
          <p className="text-sm text-slate-400">Common administrative tasks</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.title}
                onClick={() => (window.location.href = action.link)}
                className="group relative rounded-xl border border-slate-700 bg-slate-800/40 p-6 text-left hover:border-slate-600 transition-all overflow-hidden"
              >
                <div className={`absolute inset-0 ${action.color} opacity-0 group-hover:opacity-5 transition-opacity`} />

                <div className="relative">
                  <div className={`inline-flex p-3 rounded-xl ${action.color} bg-opacity-10 mb-4`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>

                  <h3 className="text-base font-semibold text-slate-100 mb-2">{action.title}</h3>
                  <p className="text-sm text-slate-400 mb-4">{action.description}</p>

                  <div className="flex items-center gap-2 text-sm text-slate-300 group-hover:text-slate-100 transition">
                    <span>Open</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
