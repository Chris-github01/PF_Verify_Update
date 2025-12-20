import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, FileText, Clock, Activity } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ActivityItem {
  id: string;
  activity_type: string;
  created_at: string;
  user_email: string;
  project_name: string | null;
  metadata: any;
}

interface OrganisationAnalyticsProps {
  organisationId: string;
}

export default function OrganisationAnalytics({ organisationId }: OrganisationAnalyticsProps) {
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecentActivity();
  }, [organisationId]);

  const loadRecentActivity = async () => {
    try {
      const { data: activities } = await supabase
        .from('user_activity_log')
        .select('*')
        .eq('organisation_id', organisationId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (activities) {
        // Enrich with user and project details
        const enrichedActivities = await Promise.all(
          activities.map(async (activity) => {
            const { data: userDetails, error: userError } = await supabase
              .rpc('get_user_details', { p_user_id: activity.user_id })
              .maybeSingle();

            if (userError) {
              console.error('Error fetching user details:', userError);
            }

            let projectName = null;
            if (activity.project_id) {
              const { data: project } = await supabase
                .from('projects')
                .select('name')
                .eq('id', activity.project_id)
                .maybeSingle();
              projectName = project?.name || null;
            }

            return {
              ...activity,
              user_email: userDetails?.email || activity.user_id || 'Unknown',
              project_name: projectName
            };
          })
        );

        setRecentActivity(enrichedActivities);
      }
    } catch (error) {
      console.error('Error loading activity:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'project_created':
        return <FileText size={16} className="text-blue-400" />;
      case 'quote_imported':
        return <BarChart3 size={16} className="text-green-400" />;
      case 'report_generated':
        return <TrendingUp size={16} className="text-purple-400" />;
      case 'user_invited':
      case 'invitation_accepted':
        return <Users size={16} className="text-amber-400" />;
      default:
        return <Activity size={16} className="text-slate-400" />;
    }
  };

  const getActivityDescription = (activity: ActivityItem) => {
    switch (activity.activity_type) {
      case 'project_created':
        return (
          <>
            created project <span className="text-white font-medium">{activity.project_name}</span>
          </>
        );
      case 'quote_imported':
        return (
          <>
            imported a quote{activity.project_name && (
              <> to <span className="text-white font-medium">{activity.project_name}</span></>
            )}
          </>
        );
      case 'report_generated':
        return (
          <>
            generated a report{activity.project_name && (
              <> for <span className="text-white font-medium">{activity.project_name}</span></>
            )}
          </>
        );
      case 'user_invited':
        return 'invited a new team member';
      case 'invitation_accepted':
        return 'accepted team invitation';
      case 'user_archived':
        return 'archived a team member';
      default:
        return activity.activity_type.replace(/_/g, ' ');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Activity Timeline</h2>
        <p className="text-slate-400">Recent activity across your organisation</p>
      </div>

      {/* Activity Timeline */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Activity size={18} />
            Recent Activity
          </h3>
        </div>
        <div className="divide-y divide-slate-700 max-h-[600px] overflow-y-auto">
          {recentActivity.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400">
              <Activity size={48} className="mx-auto mb-4 opacity-50" />
              <p>No recent activity</p>
            </div>
          ) : (
            recentActivity.map((activity) => (
              <div key={activity.id} className="px-6 py-4 hover:bg-slate-700/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-slate-700 rounded-lg mt-0.5">
                    {getActivityIcon(activity.activity_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 text-sm">
                      <span className="text-white font-medium">{activity.user_email}</span>
                      {' '}
                      {getActivityDescription(activity)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(activity.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Activity Summary by Type */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <h3 className="font-semibold text-white mb-4">Activity Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { type: 'project_created', label: 'Projects Created', color: 'blue' },
            { type: 'quote_imported', label: 'Quotes Imported', color: 'green' },
            { type: 'report_generated', label: 'Reports Generated', color: 'purple' },
            { type: 'invitation_accepted', label: 'Team Joins', color: 'amber' }
          ].map(({ type, label, color }) => {
            const count = recentActivity.filter(a => a.activity_type === type).length;
            return (
              <div key={type} className="text-center">
                <div className="text-2xl font-bold text-white mb-1">{count}</div>
                <div className="text-sm text-slate-400">{label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
