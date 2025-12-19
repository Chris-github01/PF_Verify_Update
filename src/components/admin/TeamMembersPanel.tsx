import { useState, useEffect } from 'react';
import {
  Users,
  Mail,
  Shield,
  Archive,
  RotateCcw,
  Trash2,
  MoreVertical,
  AlertTriangle,
  Check,
  X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import TransferProjectsModal from './TransferProjectsModal';
import { toastStore } from '../../lib/toastStore';

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  archived_at: string | null;
  archived_by_user_id: string | null;
  notes: string | null;
  email: string;
  full_name: string | null;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  invited_by_email: string;
}

interface TeamMembersPanelProps {
  organisationId: string;
  onInvite: () => void;
  onRefresh: () => void;
}

export default function TeamMembersPanel({ organisationId, onInvite, onRefresh }: TeamMembersPanelProps) {
  const [activeMembers, setActiveMembers] = useState<TeamMember[]>([]);
  const [archivedMembers, setArchivedMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
    loadPendingInvites();
  }, [organisationId]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      // Load active members
      const { data: members } = await supabase
        .from('organisation_members')
        .select(`
          id,
          user_id,
          role,
          status,
          created_at,
          archived_at,
          archived_by_user_id,
          notes
        `)
        .eq('organisation_id', organisationId)
        .order('created_at', { ascending: false });

      if (members) {
        // Get user details for each member
        const membersWithDetails = await Promise.all(
          members.map(async (member) => {
            const { data: userData } = await supabase
              .from('auth.users')
              .select('email, raw_user_meta_data')
              .eq('id', member.user_id)
              .single();

            // Fallback to RPC if direct query fails
            let email = userData?.email;
            let full_name = userData?.raw_user_meta_data?.full_name;

            if (!email) {
              const { data: userDetails } = await supabase.rpc('get_user_details', {
                p_user_id: member.user_id
              });
              email = userDetails?.email || 'Unknown';
              full_name = userDetails?.full_name;
            }

            return {
              ...member,
              email: email || 'Unknown',
              full_name: full_name || null
            };
          })
        );

        setActiveMembers(membersWithDetails.filter(m => !m.archived_at));
        setArchivedMembers(membersWithDetails.filter(m => m.archived_at));
      }
    } catch (error) {
      console.error('Error loading members:', error);
      toastStore.show({ type: 'error', title: 'Failed to load team members' });
    } finally {
      setLoading(false);
    }
  };

  const loadPendingInvites = async () => {
    try {
      const { data: invites } = await supabase
        .from('team_invitations')
        .select(`
          id,
          email,
          role,
          status,
          created_at,
          expires_at,
          invited_by_user_id
        `)
        .eq('organisation_id', organisationId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());

      if (invites) {
        const invitesWithDetails = await Promise.all(
          invites.map(async (invite) => {
            const { data: inviterDetails } = await supabase.rpc('get_user_details', {
              p_user_id: invite.invited_by_user_id
            });

            return {
              ...invite,
              invited_by_email: inviterDetails?.email || 'Unknown'
            };
          })
        );

        setPendingInvites(invitesWithDetails);
      }
    } catch (error) {
      console.error('Error loading invites:', error);
    }
  };

  const handleArchiveMember = (member: TeamMember) => {
    setSelectedMember(member);
    setShowTransferModal(true);
    setActionMenuOpen(null);
  };

  const handleRestoreMember = async (member: TeamMember) => {
    try {
      const { error } = await supabase.rpc('restore_archived_user', {
        p_organisation_id: organisationId,
        p_user_id: member.user_id
      });

      if (error) throw error;

      toastStore.show({
        type: 'success',
        title: 'User restored',
        body: `${member.email} has been restored to active status`
      });

      loadMembers();
      onRefresh();
    } catch (error: any) {
      console.error('Error restoring user:', error);
      toastStore.show({
        type: 'error',
        title: 'Failed to restore user',
        body: error.message
      });
    }
  };

  const handleCancelInvitation = async (inviteId: string) => {
    try {
      const { error } = await supabase
        .from('team_invitations')
        .update({ status: 'cancelled' })
        .eq('id', inviteId);

      if (error) throw error;

      toastStore.show({
        type: 'success',
        title: 'Invitation cancelled'
      });

      loadPendingInvites();
    } catch (error: any) {
      console.error('Error cancelling invitation:', error);
      toastStore.show({
        type: 'error',
        title: 'Failed to cancel invitation',
        body: error.message
      });
    }
  };

  const handleResendInvitation = async (invite: PendingInvitation) => {
    try {
      // Update expiry
      const { error } = await supabase
        .from('team_invitations')
        .update({
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('id', invite.id);

      if (error) throw error;

      // TODO: Send email notification

      toastStore.show({
        type: 'success',
        title: 'Invitation resent',
        body: `Invitation sent to ${invite.email}`
      });

      loadPendingInvites();
    } catch (error: any) {
      console.error('Error resending invitation:', error);
      toastStore.show({
        type: 'error',
        title: 'Failed to resend invitation',
        body: error.message
      });
    }
  };

  const handleUpdateRole = async (member: TeamMember, newRole: string) => {
    try {
      const { error } = await supabase
        .from('organisation_members')
        .update({ role: newRole })
        .eq('id', member.id);

      if (error) throw error;

      toastStore.show({
        type: 'success',
        title: 'Role updated',
        body: `${member.email} is now a${newRole === 'admin' ? 'n' : ''} ${newRole}`
      });

      loadMembers();
      setActionMenuOpen(null);
    } catch (error: any) {
      console.error('Error updating role:', error);
      toastStore.show({
        type: 'error',
        title: 'Failed to update role',
        body: error.message
      });
    }
  };

  const handleTransferComplete = () => {
    setShowTransferModal(false);
    setSelectedMember(null);
    loadMembers();
    onRefresh();
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
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Team Members</h2>
          <p className="text-slate-400 mt-1">
            {activeMembers.length} active member{activeMembers.length !== 1 ? 's' : ''}
            {archivedMembers.length > 0 && `, ${archivedMembers.length} archived`}
          </p>
        </div>
        <button
          onClick={() => setShowArchived(!showArchived)}
          className="text-slate-400 hover:text-white text-sm font-medium"
        >
          {showArchived ? 'Hide' : 'Show'} Archived ({archivedMembers.length})
        </button>
      </div>

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Mail size={18} />
              Pending Invitations ({pendingInvites.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-700">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors">
                <div className="flex-1">
                  <div className="font-medium text-white">{invite.email}</div>
                  <div className="text-sm text-slate-400">
                    Invited by {invite.invited_by_email} •
                    Expires {new Date(invite.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-medium rounded">
                    {invite.role}
                  </span>
                  <button
                    onClick={() => handleResendInvitation(invite)}
                    className="text-slate-400 hover:text-white p-2"
                    title="Resend invitation"
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    onClick={() => handleCancelInvitation(invite.id)}
                    className="text-slate-400 hover:text-red-400 p-2"
                    title="Cancel invitation"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Members */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Users size={18} />
            Active Members ({activeMembers.length})
          </h3>
        </div>
        <div className="divide-y divide-slate-700">
          {activeMembers.map((member) => (
            <div key={member.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors">
              <div className="flex-1">
                <div className="font-medium text-white flex items-center gap-2">
                  {member.full_name || member.email}
                  {member.role === 'owner' && (
                    <Shield size={14} className="text-amber-500" />
                  )}
                </div>
                <div className="text-sm text-slate-400">{member.email}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Joined {new Date(member.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 text-xs font-medium rounded ${
                  member.role === 'owner'
                    ? 'bg-amber-500/20 text-amber-400'
                    : member.role === 'admin'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-slate-700 text-slate-300'
                }`}>
                  {member.role}
                </span>
                {member.role !== 'owner' && (
                  <div className="relative">
                    <button
                      onClick={() => setActionMenuOpen(actionMenuOpen === member.id ? null : member.id)}
                      className="text-slate-400 hover:text-white p-2"
                    >
                      <MoreVertical size={18} />
                    </button>
                    {actionMenuOpen === member.id && (
                      <div className="absolute right-0 mt-2 w-48 bg-slate-700 rounded-lg shadow-xl border border-slate-600 py-1 z-10">
                        {member.role !== 'admin' && (
                          <button
                            onClick={() => handleUpdateRole(member, 'admin')}
                            className="w-full px-4 py-2 text-left text-white hover:bg-slate-600 text-sm"
                          >
                            Make Admin
                          </button>
                        )}
                        {member.role === 'admin' && (
                          <button
                            onClick={() => handleUpdateRole(member, 'member')}
                            className="w-full px-4 py-2 text-left text-white hover:bg-slate-600 text-sm"
                          >
                            Remove Admin
                          </button>
                        )}
                        <button
                          onClick={() => handleArchiveMember(member)}
                          className="w-full px-4 py-2 text-left text-amber-400 hover:bg-slate-600 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Archive size={14} />
                            Archive User
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Archived Members */}
      {showArchived && archivedMembers.length > 0 && (
        <div className="bg-slate-800 rounded-lg border border-amber-500/30 overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-500/30 bg-amber-500/5">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Archive size={18} className="text-amber-500" />
              Archived Members ({archivedMembers.length})
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Archived users retain their data but cannot access the system
            </p>
          </div>
          <div className="divide-y divide-slate-700">
            {archivedMembers.map((member) => (
              <div key={member.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors">
                <div className="flex-1 opacity-60">
                  <div className="font-medium text-white">{member.full_name || member.email}</div>
                  <div className="text-sm text-slate-400">{member.email}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Archived {new Date(member.archived_at!).toLocaleDateString()}
                  </div>
                  {member.notes && (
                    <div className="text-xs text-slate-400 mt-1 italic">Note: {member.notes}</div>
                  )}
                </div>
                <button
                  onClick={() => handleRestoreMember(member)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm transition-colors"
                >
                  <RotateCcw size={14} />
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && selectedMember && (
        <TransferProjectsModal
          organisationId={organisationId}
          memberToArchive={selectedMember}
          activeMembers={activeMembers.filter(m => m.user_id !== selectedMember.user_id)}
          onClose={() => {
            setShowTransferModal(false);
            setSelectedMember(null);
          }}
          onComplete={handleTransferComplete}
        />
      )}
    </div>
  );
}
