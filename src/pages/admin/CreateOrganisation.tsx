import { useState } from 'react';
import { ArrowLeft, AlertCircle, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function CreateOrganisation() {
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('Trial');
  const [seatLimit, setSeatLimit] = useState(5);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleCreate = async () => {
    if (!name || !ownerEmail) {
      setToast({ type: 'error', message: 'Please fill in all required fields' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      setToast({ type: 'error', message: 'Please enter a valid email address' });
      return;
    }

    setCreating(true);
    try {
      const planTierMap: Record<string, string> = {
        'Trial': 'trial',
        'Starter': 'standard',
        'Pro': 'professional',
        'Enterprise': 'enterprise'
      };

      const pricingTier = planTierMap[plan] || 'standard';
      const status = plan === 'Trial' ? 'trial' : 'active';

      const { data: result, error: createError } = await supabase
        .rpc('create_organisation_with_owner_by_email', {
          p_name: name,
          p_status: status,
          p_seat_limit: seatLimit,
          p_pricing_tier: pricingTier,
          p_owner_email: ownerEmail.toLowerCase().trim()
        });

      if (createError) throw createError;

      const orgId = result.id;
      setToast({ type: 'success', message: 'Organisation created successfully!' });
      setTimeout(() => {
        window.location.href = `/admin/organisations/${orgId}`;
      }, 1000);
    } catch (error: any) {
      console.error('Error creating organisation:', error);
      setToast({ type: 'error', message: error.message || 'Failed to create organisation' });
      setCreating(false);
    }
  };

  return (
    <div className="px-6 py-6 max-w-3xl mx-auto">
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
            <X size={16} />
          </button>
        </div>
      )}

      <button
        onClick={() => (window.location.href = '/admin/organisations')}
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft size={16} />
        Back to organisations
      </button>

      <div className="rounded-xl border border-slate-200 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.06)] p-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Create organisation</h1>
        <p className="text-sm text-slate-500 mb-6">
          Set up a new organisation with a primary owner who will receive an invite email.
        </p>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Organisation name <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              placeholder="Optimal Fire"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] bg-white text-gray-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Plan <span className="text-rose-600">*</span>
              </label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
              >
                <option value="Trial">Trial (14 days)</option>
                <option value="Starter">Starter</option>
                <option value="Pro">Pro</option>
                <option value="Enterprise">Enterprise</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Seat limit <span className="text-rose-600">*</span>
              </label>
              <input
                type="number"
                value={seatLimit}
                onChange={(e) => setSeatLimit(parseInt(e.target.value) || 0)}
                min="1"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] bg-white text-gray-900"
              />
              <p className="mt-1 text-xs text-slate-500">Owners, admins, and members use a seat. Viewers are free.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Primary owner email <span className="text-rose-600">*</span>
            </label>
            <input
              type="email"
              placeholder="owner@company.com"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] bg-white text-gray-900"
            />
            <p className="mt-1 text-xs text-slate-500">
              We'll send an invite to this email. They'll become the Organisation Owner.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Internal notes</label>
            <textarea
              placeholder="Optional admin-only notes about this organisation..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] resize-none"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            onClick={() => (window.location.href = '/admin/organisations')}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
            disabled={creating}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name || !ownerEmail}
            className="px-4 py-2 rounded-lg bg-[#0A66C2] text-sm font-semibold text-white hover:bg-[#0952A0] disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {creating ? 'Creating...' : 'Create organisation'}
          </button>
        </div>
      </div>
    </div>
  );
}
