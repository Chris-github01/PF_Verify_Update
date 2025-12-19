import { useState, useEffect } from 'react';
import { X, AlertTriangle, ArrowRight, Folder } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toastStore } from '../../lib/toastStore';

interface TransferProjectsModalProps {
  organisationId: string;
  memberToArchive: {
    user_id: string;
    email: string;
    full_name: string | null;
  };
  activeMembers: Array<{
    user_id: string;
    email: string;
    full_name: string | null;
  }>;
  onClose: () => void;
  onComplete: () => void;
}

export default function TransferProjectsModal({
  organisationId,
  memberToArchive,
  activeMembers,
  onClose,
  onComplete
}: TransferProjectsModalProps) {
  const [transferToUserId, setTransferToUserId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    loadUserProjects();
  }, [memberToArchive]);

  const loadUserProjects = async () => {
    try {
      const { data } = await supabase
        .from('projects')
        .select('id, name, created_at')
        .eq('organisation_id', organisationId)
        .eq('created_by_user_id', memberToArchive.user_id)
        .order('created_at', { ascending: false });

      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    if (projects.length > 0 && !transferToUserId) {
      toastStore.show({
        type: 'error',
        title: 'Transfer required',
        body: 'Please select a user to transfer projects to'
      });
      return;
    }

    setArchiving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('archive_user_and_transfer_projects', {
        p_organisation_id: organisationId,
        p_user_id: memberToArchive.user_id,
        p_transfer_to_user_id: transferToUserId || null,
        p_archived_by_user_id: user.id,
        p_notes: notes || null
      });

      if (error) throw error;

      toastStore.show({
        type: 'success',
        title: 'User archived',
        body: `${memberToArchive.email} has been archived${
          data.projects_transferred > 0
            ? ` and ${data.projects_transferred} project${data.projects_transferred !== 1 ? 's' : ''} transferred`
            : ''
        }`
      });

      onComplete();
    } catch (error: any) {
      console.error('Error archiving user:', error);
      toastStore.show({
        type: 'error',
        title: 'Failed to archive user',
        body: error.message
      });
    } finally {
      setArchiving(false);
    }
  };

  const selectedMember = activeMembers.find(m => m.user_id === transferToUserId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg max-w-2xl w-full border border-slate-700 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between sticky top-0 bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <AlertTriangle className="text-amber-500" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Archive User</h2>
              <p className="text-sm text-slate-400">Transfer projects and archive {memberToArchive.email}</p>
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
          {/* Warning */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
            <h3 className="font-semibold text-amber-400 mb-2 flex items-center gap-2">
              <AlertTriangle size={16} />
              Important Information
            </h3>
            <ul className="text-sm text-amber-300/80 space-y-1">
              <li>• User will no longer be able to access the system</li>
              <li>• All their data remains intact and accessible</li>
              <li>• Projects can be transferred to another team member</li>
              <li>• User can be restored later if needed</li>
            </ul>
          </div>

          {/* Projects to Transfer */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : projects.length > 0 ? (
            <div>
              <h3 className="font-semibold text-white mb-3">
                Projects to Transfer ({projects.length})
              </h3>
              <div className="bg-slate-700/50 rounded-lg border border-slate-600 max-h-48 overflow-y-auto">
                <div className="divide-y divide-slate-600">
                  {projects.map((project) => (
                    <div key={project.id} className="px-4 py-3 flex items-center gap-3">
                      <Folder size={16} className="text-slate-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate">{project.name}</div>
                        <div className="text-xs text-slate-400">
                          Created {new Date(project.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transfer To */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Transfer Projects To *
                </label>
                <select
                  value={transferToUserId}
                  onChange={(e) => setTransferToUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a team member...</option>
                  {activeMembers.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name || member.email}
                    </option>
                  ))}
                </select>
                {transferToUserId && selectedMember && (
                  <p className="text-sm text-slate-400 mt-2">
                    {projects.length} project{projects.length !== 1 ? 's' : ''} will be transferred to{' '}
                    <span className="text-white font-medium">{selectedMember.full_name || selectedMember.email}</span>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-700/30 rounded-lg p-4 text-center">
              <p className="text-slate-400">This user has no projects to transfer</p>
            </div>
          )}

          {/* Transfer Visualization */}
          {transferToUserId && selectedMember && projects.length > 0 && (
            <div className="bg-slate-700/30 rounded-lg p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-center flex-1">
                  <div className="text-sm text-slate-400 mb-1">From</div>
                  <div className="font-medium text-white truncate">
                    {memberToArchive.full_name || memberToArchive.email}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {projects.length} project{projects.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <ArrowRight className="text-blue-400 flex-shrink-0" size={24} />
                <div className="text-center flex-1">
                  <div className="text-sm text-slate-400 mb-1">To</div>
                  <div className="font-medium text-white truncate">
                    {selectedMember.full_name || selectedMember.email}
                  </div>
                  <div className="text-xs text-blue-400 mt-1">Will receive access</div>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Employee resigned, last day 2024-01-15"
              rows={3}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              These notes will be saved with the archived user record
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-end gap-3 sticky bottom-0 bg-slate-800">
          <button
            onClick={onClose}
            disabled={archiving}
            className="px-4 py-2 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleArchive}
            disabled={archiving || (projects.length > 0 && !transferToUserId)}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {archiving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block mr-2"></div>
                Archiving...
              </>
            ) : (
              'Archive User'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
