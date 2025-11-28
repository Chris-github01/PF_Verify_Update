import { useState, useEffect } from 'react';
import { Shield, UserPlus, Trash2, Check, X as XIcon, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PlatformAdmin {
  user_id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

export default function PlatformAdminUsers() {
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: adminsData } = await supabase
        .from('platform_admins')
        .select('*')
        .order('created_at', { ascending: false });

      if (adminsData) {
        setAdmins(adminsData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAdmin = async () => {
    const email = emailInput.trim().toLowerCase();

    if (!email) {
      setToast({ type: 'error', message: 'Please enter an email address' });
      return;
    }

    if (!email.includes('@') || !email.includes('.')) {
      setToast({ type: 'error', message: 'Please enter a valid email address' });
      return;
    }

    const existingAdmin = admins.find(a => a.email.toLowerCase() === email);
    if (existingAdmin) {
      setToast({ type: 'error', message: 'User is already a platform admin' });
      return;
    }

    setAdding(true);
    try {
      const { data: userId, error: lookupError } = await supabase.rpc('get_user_id_by_email', {
        user_email: email
      });

      if (lookupError) throw lookupError;

      if (!userId) {
        setToast({ type: 'error', message: `No user found with email: ${email}. They must have an account first.` });
        setAdding(false);
        return;
      }

      const fullName = email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1);

      const { error: insertError } = await supabase
        .from('platform_admins')
        .insert({
          user_id: userId,
          email: email,
          full_name: fullName,
          is_active: true,
        });

      if (insertError) throw insertError;

      setToast({ type: 'success', message: 'Platform admin added successfully' });
      setShowAddModal(false);
      setEmailInput('');
      await loadData();
    } catch (error: any) {
      setToast({ type: 'error', message: error.message || 'Failed to add platform admin' });
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('platform_admins')
        .update({ is_active: !currentStatus })
        .eq('user_id', userId);

      if (error) throw error;

      setToast({
        type: 'success',
        message: `Admin ${!currentStatus ? 'activated' : 'deactivated'} successfully`
      });
      await loadData();
    } catch (error: any) {
      setToast({ type: 'error', message: error.message || 'Failed to update admin status' });
    }
  };

  const handleRemoveAdmin = async (userId: string, email: string) => {
    if (!confirm(`Remove platform admin access for ${email}?`)) return;

    try {
      const { error } = await supabase
        .from('platform_admins')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      setToast({ type: 'success', message: 'Platform admin removed successfully' });
      await loadData();
    } catch (error: any) {
      setToast({ type: 'error', message: error.message || 'Failed to remove admin' });
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="px-6 py-6 max-w-7xl mx-auto">
        <div className="text-center py-12 text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 shadow-lg flex items-center gap-3 ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {toast.type === 'error' && <AlertCircle size={18} />}
          <span className="text-sm font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2">
            <XIcon size={16} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Platform Administrators</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage users with platform admin access and permissions
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
        >
          <UserPlus size={18} />
          Add admin
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Administrator
                </th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Added
                </th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-500">
                    No platform administrators found
                  </td>
                </tr>
              ) : (
                admins.map((admin) => (
                  <tr key={admin.user_id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <Shield className="text-blue-600" size={18} />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {admin.full_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {admin.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          admin.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-50 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {admin.is_active ? (
                          <>
                            <Check size={12} />
                            Active
                          </>
                        ) : (
                          'Inactive'
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatDate(admin.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleActive(admin.user_id, admin.is_active)}
                          className={`text-sm font-medium ${
                            admin.is_active
                              ? 'text-slate-600 hover:text-slate-800'
                              : 'text-emerald-600 hover:text-emerald-800'
                          } transition`}
                        >
                          {admin.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          onClick={() => handleRemoveAdmin(admin.user_id, admin.email)}
                          className="text-sm font-medium text-rose-600 hover:text-rose-800 transition"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Add Platform Administrator</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEmailInput('');
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <XIcon size={20} />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Enter the email address of a user to grant platform administrator access. They will be able to manage organisations and view all data.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  User email address <span className="text-rose-600">*</span>
                </label>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  The user must already have an account in the system
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800">
                  <strong>Warning:</strong> Platform administrators have full access to all organisations, members, and data. Only grant this permission to trusted users.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEmailInput('');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
                disabled={adding}
              >
                Cancel
              </button>
              <button
                onClick={handleAddAdmin}
                disabled={adding || !emailInput.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {adding ? 'Adding...' : 'Add administrator'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
