import { useState } from 'react';
import { X, Mail, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toastStore } from '../../lib/toastStore';

interface InviteTeamMemberModalProps {
  organisationId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function InviteTeamMemberModal({ organisationId, onClose, onSuccess }: InviteTeamMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setSending(true);
    setError('');

    try {
      // Check if user is already a member
      const { data: existingMember } = await supabase
        .from('organisation_members')
        .select('id')
        .eq('organisation_id', organisationId)
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .is('archived_at', null)
        .maybeSingle();

      if (existingMember) {
        setError('This user is already a member of your organisation');
        setSending(false);
        return;
      }

      // Check for pending invitation
      const { data: existingInvite } = await supabase
        .from('team_invitations')
        .select('id')
        .eq('organisation_id', organisationId)
        .eq('email', email.toLowerCase())
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (existingInvite) {
        setError('An invitation has already been sent to this email');
        setSending(false);
        return;
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create invitation
      const { data: invitation, error: inviteError } = await supabase
        .from('team_invitations')
        .insert({
          organisation_id: organisationId,
          email: email.toLowerCase(),
          role,
          invited_by_user_id: user.id,
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();

      if (inviteError) throw inviteError;

      // Send email via Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      const inviteUrl = `${window.location.origin}/accept-invitation?token=${invitation.invitation_token}`;

      try {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send_team_invitation`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: email.toLowerCase(),
              inviteUrl,
              role
            })
          }
        );
      } catch (emailError) {
        console.error('Failed to send email, but invitation was created:', emailError);
        // Continue anyway - invitation is in database
      }

      toastStore.show({
        type: 'success',
        title: 'Invitation sent',
        body: `An invitation has been sent to ${email}`
      });

      onSuccess();
    } catch (err: any) {
      console.error('Error sending invitation:', err);
      setError(err.message || 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setSending(true);
    setError('');

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) throw resetError;

      toastStore.show({
        type: 'success',
        title: 'Password reset sent',
        body: `A password reset link has been sent to ${email}`
      });

      onClose();
    } catch (err: any) {
      console.error('Error sending password reset:', err);
      setError(err.message || 'Failed to send password reset');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg max-w-md w-full border border-slate-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Invite Team Member</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              placeholder="colleague@example.com"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="member">Member - Can work on projects</option>
              <option value="admin">Admin - Can access Admin Center and manage team</option>
            </select>
            <div className="mt-2 p-3 bg-slate-700/50 rounded-lg">
              <p className="text-xs text-slate-300 font-medium mb-1">
                {role === 'admin' ? '✅ Admin Access' : '👤 Member Access'}
              </p>
              <p className="text-xs text-slate-400">
                {role === 'admin'
                  ? 'Can access Admin Center, invite team members, and manage organization settings'
                  : 'Can work on projects but cannot access Admin Center or invite members'}
              </p>
            </div>
          </div>

          <div className="bg-slate-700/50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-2">What happens next?</h3>
            <ul className="text-sm text-slate-300 space-y-1">
              <li>• Invitation email sent to {email || 'the user'}</li>
              <li>• They'll have 7 days to accept</li>
              <li>• Once accepted, they can access your organisation</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between gap-3">
          <button
            onClick={handleSendPasswordReset}
            disabled={sending || !email}
            className="text-sm text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send Password Reset Instead
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !email}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {sending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Mail size={16} />
                  Send Invitation
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
