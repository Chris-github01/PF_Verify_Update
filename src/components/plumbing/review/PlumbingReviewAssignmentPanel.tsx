import { useState } from 'react';
import { UserCheck, UserX, RefreshCw } from 'lucide-react';
import type { ReviewAssignment } from '../../../lib/modules/parsers/plumbing/review/reviewTypes';

interface PlumbingReviewAssignmentPanelProps {
  activeAssignment: ReviewAssignment | null;
  allAssignments: ReviewAssignment[];
  adminUsers: { id: string; email: string }[];
  currentUserId?: string;
  onAssign: (userId: string, notes?: string) => Promise<void>;
  busy?: boolean;
}

export default function PlumbingReviewAssignmentPanel({
  activeAssignment,
  allAssignments,
  adminUsers,
  currentUserId,
  onAssign,
  busy,
}: PlumbingReviewAssignmentPanelProps) {
  const [selectedUser, setSelectedUser] = useState('');
  const [notes, setNotes] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  async function handleAssign() {
    if (!selectedUser) return;
    await onAssign(selectedUser, notes);
    setSelectedUser('');
    setNotes('');
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-white">Assignment</h2>
        </div>
        {allAssignments.length > 1 && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-[10px] text-gray-500 hover:text-white transition-colors"
          >
            {showHistory ? 'Hide history' : `History (${allAssignments.length})`}
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        {activeAssignment ? (
          <div className="flex items-center gap-3 bg-teal-900/20 border border-teal-700/30 rounded-xl px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-teal-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {activeAssignment.assigned_to.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="text-xs font-medium text-white">
                {activeAssignment.assigned_to === currentUserId ? 'Assigned to you' : `Assigned to ${activeAssignment.assigned_to.slice(0, 8)}…`}
              </div>
              <div className="text-[10px] text-gray-500">{new Date(activeAssignment.assigned_at).toLocaleString()}</div>
              {activeAssignment.notes && <div className="text-[10px] text-gray-400 mt-0.5">{activeAssignment.notes}</div>}
            </div>
            <RefreshCw className="w-4 h-4 text-gray-600 shrink-0" />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <UserX className="w-4 h-4" />
            Unassigned
          </div>
        )}

        <div className="space-y-2">
          <div className="text-[10px] text-gray-500">{activeAssignment ? 'Reassign to' : 'Assign to'}</div>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none"
          >
            <option value="">Select reviewer...</option>
            {adminUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.email}</option>
            ))}
            {currentUserId && !adminUsers.find((u) => u.id === currentUserId) && (
              <option value={currentUserId}>Me (self-assign)</option>
            )}
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Assignment note (optional)..."
            className="w-full text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none"
          />
          <button
            onClick={handleAssign}
            disabled={!selectedUser || busy}
            className="w-full text-xs font-medium px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-40 transition-colors"
          >
            {activeAssignment ? 'Reassign' : 'Assign'}
          </button>
        </div>

        {showHistory && allAssignments.length > 1 && (
          <div>
            <div className="text-[10px] text-gray-500 mb-1.5">Assignment history</div>
            <div className="space-y-1">
              {allAssignments.map((a) => (
                <div key={a.id} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${a.active ? 'border-teal-700/30' : 'border-gray-800'}`}>
                  <span className={`font-mono text-[10px] ${a.active ? 'text-teal-300' : 'text-gray-600'}`}>
                    {a.assigned_to.slice(0, 12)}…
                  </span>
                  <span className="text-gray-600 flex-1">{new Date(a.assigned_at).toLocaleDateString()}</span>
                  {a.active && <span className="text-[9px] text-teal-400">active</span>}
                  {a.unassigned_at && <span className="text-[9px] text-gray-600">removed {new Date(a.unassigned_at).toLocaleDateString()}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
