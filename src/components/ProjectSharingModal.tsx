import { useState, useEffect } from 'react';
import { X, Share2, Calendar, AlertCircle, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toastStore } from '../lib/toastStore';

interface ProjectSharingModalProps {
  projectId: string;
  projectName: string;
  organisationId: string;
  onClose: () => void;
}

interface TeamMember {
  user_id: string;
  email: string;
  full_name: string | null;
}

interface ExistingShare {
  id: string;
  shared_with_user_id: string;
  shared_with_email: string;
  shared_with_name: string | null;
  permission_level: string;
  expires_at: string | null;
  reason: string | null;
  created_at: string;
}

export default function ProjectSharingModal({ projectId, projectName, organisationId, onClose }: ProjectSharingModalProps) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [existingShares, setExistingShares] = useState<ExistingShare[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [permissionLevel, setPermissionLevel] = useState<'view' | 'edit' | 'admin'>('view');
  const [reason, setReason] = useState('');
  const [expiryDays, setExpiryDays] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    loadData();
  }, [projectId, organisationId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load team members
      const { data: members } = await supabase
        .from('organisation_members')
        .select('user_id')
        .eq('organisation_id', organisationId)
        .eq('status', 'active')
        .is('archived_at', null);

      if (members) {
        const membersWithDetails = await Promise.all(
          members.map(async (member) => {
            const { data: userDetails } = await supabase.rpc('get_user_details', {
              p_user_id: member.user_id
            });
            return {
              user_id: member.user_id,
              email: userDetails?.email || 'Unknown',
              full_name: userDetails?.full_name || null
            };
          })
        );

        // Exclude current user
        const { data: { user } } = await supabase.auth.getUser();
        setTeamMembers(membersWithDetails.filter(m => m.user_id !== user?.id));
      }

      // Load existing shares
      const { data: shares } = await supabase
        .from('project_sharing')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_active', true);

      if (shares) {
        const sharesWithDetails = await Promise.all(
          shares.map(async (share) => {
            const { data: userDetails } = await supabase.rpc('get_user_details', {
              p_user_id: share.shared_with_user_id
            });
            return {
              ...share,
              shared_with_email: userDetails?.email || 'Unknown',
              shared_with_name: userDetails?.full_name || null
            };
          })
        );
        setExistingShares(sharesWithDetails);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!selectedUserId) {
      toastStore.show({ type: 'error', title: 'Please select a user' });
      return;
    }

    setSharing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const shareData: any = {
        project_id: projectId,
        shared_by_user_id: user.id,
        shared_with_user_id: selectedUserId,
        permission_level: permissionLevel,
        reason: reason || null,
        is_active: true
      };

      if (expiryDays) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + Number(expiryDays));
        shareData.expires_at = expiryDate.toISOString();
      }

      const { error } = await supabase
        .from('project_sharing')
        .insert(shareData);

      if (error) throw error;

      // Log activity
      await supabase
        .from('user_activity_log')
        .insert({
          organisation_id: organisationId,
          user_id: user.id,
          activity_type: 'project_shared',
          project_id: projectId,
          metadata: {
            shared_with_user_id: selectedUserId,
            permission_level: permissionLevel
          }
        });

      toastStore.show({
        type: 'success',
        title: 'Project shared',
        body: 'Team member can now access this project'
      });

      // Reset form
      setSelectedUserId('');
      setReason('');
      setExpiryDays('');
      loadData();
    } catch (error: any) {
      console.error('Error sharing project:', error);
      toastStore.show({
        type: 'error',
        title: 'Failed to share project',
        body: error.message
      });
    } finally {
      setSharing(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    try {
      const { error } = await supabase
        .from('project_sharing')
        .update({
          is_active: false,
          revoked_at: new Date().toISOString()
        })
        .eq('id', shareId);

      if (error) throw error;

      toastStore.show({
        type: 'success',
        title: 'Access revoked'
      });

      loadData();
    } catch (error: any) {
      console.error('Error revoking access:', error);
      toastStore.show({
        type: 'error',
        title: 'Failed to revoke access',
        body: error.message
      });
    }
  };

  const availableMembers = teamMembers.filter(
    member => !existingShares.some(share => share.shared_with_user_id === member.user_id)
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg max-w-2xl w-full border border-slate-700 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between sticky top-0 bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Share2 className="text-blue-400" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Share Project</h2>
              <p className="text-sm text-slate-400">{projectName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-6">
          {/* New Share Form */}
          <div>
            <h3 className="font-semibold text-white mb-4">Share with Team Member</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Team Member
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  disabled={availableMembers.length === 0}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">
                    {availableMembers.length === 0
                      ? 'No available team members'
                      : 'Select a team member...'}
                  </option>
                  {availableMembers.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name || member.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Permission Level
                  </label>
                  <select
                    value={permissionLevel}
                    onChange={(e) => setPermissionLevel(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="view">View Only</option>
                    <option value="edit">View & Edit</option>
                    <option value="admin">Full Access</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Expires In (days)
                  </label>
                  <input
                    type="number"
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Optional"
                    min="1"
                    max="365"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Reason (Optional)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Covering for leave, Collaboration"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={handleShare}
                disabled={sharing || !selectedUserId || availableMembers.length === 0}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {sharing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Sharing...
                  </>
                ) : (
                  <>
                    <UserPlus size={16} />
                    Share Project
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Existing Shares */}
          {existingShares.length > 0 && (
            <div>
              <h3 className="font-semibold text-white mb-4">Current Shares ({existingShares.length})</h3>
              <div className="space-y-3">
                {existingShares.map((share) => (
                  <div
                    key={share.id}
                    className="bg-slate-700/50 rounded-lg border border-slate-600 p-4 flex items-start justify-between"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-white">
                        {share.shared_with_name || share.shared_with_email}
                      </div>
                      <div className="text-sm text-slate-400 mt-1">
                        {share.permission_level} access
                        {share.reason && <> • {share.reason}</>}
                      </div>
                      {share.expires_at && (
                        <div className="flex items-center gap-1 text-xs text-amber-400 mt-1">
                          <Calendar size={12} />
                          Expires {new Date(share.expires_at).toLocaleDateString()}
                        </div>
                      )}
                      <div className="text-xs text-slate-500 mt-1">
                        Shared {new Date(share.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevoke(share.id)}
                      className="px-3 py-1 text-sm text-red-400 hover:text-red-300 transition-colors"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {existingShares.length === 0 && (
            <div className="bg-slate-700/30 rounded-lg p-6 text-center">
              <Share2 size={48} className="mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400">No active shares for this project</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-end sticky bottom-0 bg-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
