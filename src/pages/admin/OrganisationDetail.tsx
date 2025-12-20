import { useState, useEffect } from 'react';
import { ArrowLeft, AlertCircle, X, UserPlus, Edit2, Trash2, Mail, Upload, Settings } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Organisation {
  id: string;
  name: string;
  legal_name?: string;
  trading_name?: string;
  logo_url?: string;
  country_region?: string;
  industry_type?: string;
  primary_trade_focus?: string;
  project_size_range?: string;
  jurisdiction_code_set?: string;
  compliance_role?: string;
  status: 'active' | 'trial' | 'suspended';
  seat_limit: number;
  created_at: string;
  created_by_user_id: string;
}

interface Member {
  id: string;
  email: string;
  full_name?: string;
  role: string;
  status: string;
  activated_at: string | null;
  archived_at?: string | null;
}

interface Project {
  id: string;
  name: string;
  status: string;
  updated_at: string;
  quote_count: number;
  owner_email?: string;
}

export default function OrganisationDetail({ organisationId }: { organisationId: string }) {
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [planName, setPlanName] = useState('');
  const [seatLimit, setSeatLimit] = useState(10);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'trial' | 'active' | 'expired' | 'suspended' | 'cancelled'>('trial');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [createdDate, setCreatedDate] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [inviting, setInviting] = useState(false);
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<string>('');

  // Edit organisation modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editLegalName, setEditLegalName] = useState('');
  const [editTradingName, setEditTradingName] = useState('');
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);
  const [editLogoPreview, setEditLogoPreview] = useState<string | null>(null);
  const [editCountryRegion, setEditCountryRegion] = useState('New Zealand');
  const [editIndustryType, setEditIndustryType] = useState('Main Contractor');
  const [editPrimaryTradeFocus, setEditPrimaryTradeFocus] = useState('passive_fire');
  const [editProjectSizeRange, setEditProjectSizeRange] = useState('<$5m');
  const [editJurisdictionCodeSet, setEditJurisdictionCodeSet] = useState('NZBC');
  const [editComplianceRole, setEditComplianceRole] = useState('Awarding party');
  const [updatingOrg, setUpdatingOrg] = useState(false);

  useEffect(() => {
    loadOrganisation();
  }, [organisationId]);

  const loadOrganisation = async () => {
    try {
      const { data: org, error } = await supabase
        .from('organisations')
        .select('*')
        .eq('id', organisationId)
        .single();

      if (error) throw error;

      const orgWithDefaults = {
        ...org,
        status: org.status || 'active'
      };

      setOrganisation(orgWithDefaults);
      setSeatLimit(org.seat_limit);
      setSubscriptionStatus(org.subscription_status || 'trial');
      setCreatedDate(new Date(org.created_at).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }));

      const sub = org ? {
        plan_name: org.pricing_tier || 'standard',
        seat_limit: org.seat_limit,
        organisation_id: org.id
      } : null;

      setSubscription(sub);
      setPlanName(sub?.plan_name || 'Trial');

      const { data: memberData } = await supabase
        .from('organisation_members')
        .select('*')
        .eq('organisation_id', organisationId)
        .is('archived_at', null)
        .order('activated_at', { ascending: false, nullsFirst: false });

      const membersWithDetails = await Promise.all(
        (memberData || []).map(async (member) => {
          try {
            const { data: profile } = await supabase
              .rpc('get_user_details', { p_user_id: member.user_id })
              .maybeSingle();

            if (member.role === 'owner') {
              setOwnerEmail(profile?.email || 'Unknown');
            }

            return {
              ...member,
              email: profile?.email || 'Unknown',
              full_name: profile?.full_name,
            };
          } catch (err) {
            console.warn('Could not fetch user details:', err);
            return {
              ...member,
              email: 'Unknown',
              full_name: undefined,
            };
          }
        })
      );

      setMembers(membersWithDetails as Member[]);

      const { data: projectData } = await supabase
        .from('projects')
        .select('*')
        .eq('organisation_id', organisationId)
        .order('updated_at', { ascending: false });

      const projectsWithDetails = await Promise.all(
        (projectData || []).map(async (project) => {
          try {
            const { count: quoteCount } = await supabase
              .from('quotes')
              .select('*', { count: 'exact', head: true })
              .eq('project_id', project.id);

            const { data: owner } = await supabase
              .rpc('get_user_details', { p_user_id: project.user_id })
              .maybeSingle();

            return {
              ...project,
              quote_count: quoteCount || 0,
              owner_email: owner?.email,
            };
          } catch (err) {
            console.warn('Could not fetch project details:', err);
            return {
              ...project,
              quote_count: 0,
              owner_email: undefined,
            };
          }
        })
      );

      setProjects(projectsWithDetails as Project[]);
    } catch (error) {
      console.error('Error loading organisation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!organisation) return;

    setSaving(true);
    try {
      const planTierMap: Record<string, string> = {
        'Trial': 'trial',
        'Starter': 'starter',
        'Pro': 'professional',
        'Enterprise': 'enterprise'
      };

      const pricingTier = planTierMap[planName] || 'starter';

      // Use the admin function to update subscription
      const { data, error } = await supabase.rpc('admin_update_subscription', {
        p_organisation_id: organisationId,
        p_pricing_tier: pricingTier,
        p_subscription_status: subscriptionStatus,
        p_monthly_quote_limit: planName === 'Starter' ? 100 : planName === 'Pro' ? 500 : planName === 'Enterprise' ? 99999 : null
      });

      if (error) throw error;

      // Also update seat limit separately
      const { error: seatError } = await supabase
        .from('organisations')
        .update({ seat_limit: seatLimit })
        .eq('id', organisationId);

      if (seatError) throw seatError;

      setToast({ type: 'success', message: 'Subscription updated successfully' });
      setEditMode(false);
      await loadOrganisation();
    } catch (error: any) {
      setToast({ type: 'error', message: error.message || 'Failed to update subscription' });
    } finally {
      setSaving(false);
    }
  };

  const handleSuspend = async () => {
    if (!confirm('Suspend this organisation? Members will lose access immediately.')) return;

    try {
      const { error } = await supabase
        .from('organisations')
        .update({ status: 'suspended' })
        .eq('id', organisationId);

      if (error) throw error;

      setToast({ type: 'success', message: 'Organisation suspended' });
      await loadOrganisation();
    } catch (error: any) {
      setToast({ type: 'error', message: error.message || 'Failed to suspend organisation' });
    }
  };

  const handleActivate = async () => {
    try {
      const { error } = await supabase
        .from('organisations')
        .update({ status: 'active' })
        .eq('id', organisationId);

      if (error) throw error;

      setToast({ type: 'success', message: 'Organisation activated' });
      await loadOrganisation();
    } catch (error: any) {
      setToast({ type: 'error', message: error.message || 'Failed to activate organisation' });
    }
  };

  const handleOpenEditModal = async () => {
    if (!organisation) return;

    // Populate form with current organization data
    setEditLegalName(organisation.legal_name || organisation.name || '');
    setEditTradingName(organisation.trading_name || '');
    setEditCountryRegion(organisation.country_region || 'New Zealand');
    setEditIndustryType(organisation.industry_type || 'Main Contractor');
    setEditPrimaryTradeFocus(organisation.primary_trade_focus || 'passive_fire');
    setEditProjectSizeRange(organisation.project_size_range || '<$5m');
    setEditJurisdictionCodeSet(organisation.jurisdiction_code_set || 'NZBC');
    setEditComplianceRole(organisation.compliance_role || 'Awarding party');

    // Load existing logo if available
    if (organisation.logo_url) {
      try {
        const { data: urlData } = supabase.storage
          .from('organisation-logos')
          .getPublicUrl(organisation.logo_url);

        if (urlData?.publicUrl) {
          setEditLogoPreview(urlData.publicUrl);
        }
      } catch (err) {
        console.error('Error loading logo:', err);
      }
    }

    setShowEditModal(true);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/svg+xml', 'image/png'].includes(file.type)) {
      setToast({ type: 'error', message: 'Please upload an SVG or PNG file' });
      return;
    }

    // Validate file size (2MB)
    if (file.size > 2097152) {
      setToast({ type: 'error', message: 'Logo file must be less than 2MB' });
      return;
    }

    setEditLogoFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setEditLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setEditLogoFile(null);
    setEditLogoPreview(null);
  };

  const handleSaveOrganisation = async () => {
    if (!organisation) return;

    // Validation
    if (!editLegalName) {
      setToast({ type: 'error', message: 'Legal organisation name is required' });
      return;
    }

    setUpdatingOrg(true);
    try {
      // Upload logo if changed
      let logoUrl = organisation.logo_url;

      if (editLogoFile) {
        const fileExt = editLogoFile.name.split('.').pop();
        const fileName = `${organisation.id}-logo.${fileExt}`;

        // Delete old logo if exists
        if (organisation.logo_url) {
          await supabase.storage
            .from('organisation-logos')
            .remove([organisation.logo_url]);
        }

        const { error: uploadError } = await supabase.storage
          .from('organisation-logos')
          .upload(fileName, editLogoFile, {
            cacheControl: '3600',
            upsert: true
          });

        if (uploadError) {
          throw new Error('Failed to upload logo');
        }

        logoUrl = fileName;
      } else if (editLogoPreview === null && organisation.logo_url) {
        // Logo was removed
        await supabase.storage
          .from('organisation-logos')
          .remove([organisation.logo_url]);
        logoUrl = null;
      }

      // Update organisation
      const { error: updateError } = await supabase
        .from('organisations')
        .update({
          name: editLegalName,
          legal_name: editLegalName,
          trading_name: editTradingName || null,
          logo_url: logoUrl,
          country_region: editCountryRegion,
          industry_type: editIndustryType,
          primary_trade_focus: editPrimaryTradeFocus,
          project_size_range: editProjectSizeRange,
          jurisdiction_code_set: editJurisdictionCodeSet,
          compliance_role: editComplianceRole
        })
        .eq('id', organisationId);

      if (updateError) throw updateError;

      setToast({ type: 'success', message: 'Organisation updated successfully' });
      setShowEditModal(false);
      setEditLogoFile(null);
      await loadOrganisation();
    } catch (error: any) {
      console.error('Update error:', error);
      setToast({ type: 'error', message: error.message || 'Failed to update organisation' });
    } finally {
      setUpdatingOrg(false);
    }
  };

  const handleInviteUser = async () => {
    if (!inviteEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
      setToast({ type: 'error', message: 'Please enter a valid email address' });
      return;
    }

    setInviting(true);
    try {
      // Use the new RPC function to add member
      const { data, error } = await supabase.rpc('add_member_to_organisation_by_email', {
        p_organisation_id: organisationId,
        p_email: inviteEmail.toLowerCase().trim(),
        p_role: inviteRole
      });

      if (error) throw error;

      if (data && !data.success) {
        setToast({ type: 'error', message: data.error || 'Failed to add member' });
        setInviting(false);
        return;
      }

      setToast({ type: 'success', message: 'User added successfully' });
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteRole('member');
      await loadOrganisation();
    } catch (error: any) {
      console.error('Error adding user:', error);
      setToast({ type: 'error', message: error.message || 'Failed to add user' });
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateMemberRole = async (memberId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('organisation_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;

      setToast({ type: 'success', message: 'Member role updated successfully' });
      setEditingMember(null);
      await loadOrganisation();
    } catch (error: any) {
      setToast({ type: 'error', message: error.message || 'Failed to update member role' });
    }
  };

  const handleRemoveMember = async (memberId: string, memberEmail: string) => {
    if (!confirm(`Remove ${memberEmail} from this organisation? They will lose access immediately.`)) return;

    try {
      const { error } = await supabase
        .from('organisation_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      setToast({ type: 'success', message: 'Member removed successfully' });
      await loadOrganisation();
    } catch (error: any) {
      setToast({ type: 'error', message: error.message || 'Failed to remove member' });
    }
  };

  const handleResendInvite = async (memberEmail: string) => {
    setToast({ type: 'success', message: `Invite email sent to ${memberEmail}` });
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'trial':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
      case 'suspended':
        return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
      default:
        return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    }
  };

  const seatsUsed = members.filter(
    m => m.status === 'active' && ['owner', 'admin', 'member'].includes(m.role) && !m.archived_at
  ).length;

  if (loading) {
    return (
      <div className="px-6 py-6 max-w-7xl mx-auto">
        <div className="text-center py-12 text-slate-400">Loading organisation...</div>
      </div>
    );
  }

  if (!organisation) {
    return (
      <div className="px-6 py-6 max-w-7xl mx-auto">
        <div className="text-center py-12 text-slate-400">Organisation not found</div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 shadow-lg flex items-center gap-3 ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
          }`}
        >
          {toast.type === 'error' && <AlertCircle size={18} />}
          <span className="text-sm font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-slate-300 hover:text-slate-100">
            <X size={16} />
          </button>
        </div>
      )}

      <button
        onClick={() => (window.location.href = '/admin/organisations')}
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-4 transition"
      >
        <ArrowLeft size={16} />
        Back to organisations
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">{organisation.name}</h1>
          <p className="mt-1 text-sm text-slate-400">
            Created {createdDate} · Owner: {ownerEmail}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenEditModal}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-slate-600 transition"
          >
            <Settings size={16} />
            Edit Details
          </button>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getStatusBadge(
              organisation.status
            )}`}
          >
            {(organisation.status || 'active').charAt(0).toUpperCase() + (organisation.status || 'active').slice(1)}
          </span>
          {organisation.status === 'suspended' ? (
            <button
              onClick={handleActivate}
              className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-emerald-700 transition"
            >
              Activate
            </button>
          ) : (
            <button
              onClick={handleSuspend}
              className="inline-flex items-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-rose-700 transition"
            >
              Suspend
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 shadow-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-100">Plan & seats</h2>
              {!editMode ? (
                <button
                  onClick={() => setEditMode(true)}
                  className="text-xs font-medium text-sky-400 hover:text-sky-300 hover:underline transition"
                >
                  Edit
                </button>
              ) : null}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Plan Tier</label>
                <select
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  disabled={!editMode}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/60 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-50"
                >
                  <option value="Trial">Trial (14 days)</option>
                  <option value="Starter">Starter - $299/mo (100 quotes)</option>
                  <option value="Pro">Professional - $599/mo (500 quotes)</option>
                  <option value="Enterprise">Enterprise - Custom (Unlimited)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Subscription Status</label>
                <select
                  value={subscriptionStatus}
                  onChange={(e) => setSubscriptionStatus(e.target.value as any)}
                  disabled={!editMode}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/60 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-50"
                >
                  <option value="trial">Trial</option>
                  <option value="active">Active (Paid)</option>
                  <option value="expired">Expired</option>
                  <option value="suspended">Suspended</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  {subscriptionStatus === 'trial' && 'Trial accounts expire after 14 days'}
                  {subscriptionStatus === 'active' && 'Active paid subscription with full access'}
                  {subscriptionStatus === 'expired' && 'Trial period has ended, user cannot access app'}
                  {subscriptionStatus === 'suspended' && 'Account suspended, no access'}
                  {subscriptionStatus === 'cancelled' && 'Subscription cancelled, no access'}
                </p>
                {organisation.subscription_status === 'trial' && organisation.trial_end_date && (
                  <p className="mt-1 text-xs text-amber-400">
                    Trial ends: {new Date(organisation.trial_end_date).toLocaleDateString()}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Seat limit</label>
                <input
                  type="number"
                  value={seatLimit}
                  onChange={(e) => setSeatLimit(parseInt(e.target.value) || 0)}
                  disabled={!editMode}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/60 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-50"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Currently using {seatsUsed} seats. Owners, admins, and members use a seat. Viewers are free.
                </p>
                {seatLimit < seatsUsed && (
                  <p className="mt-1 text-xs text-rose-400">
                    Warning: This organisation uses {seatsUsed} seats. Reducing to {seatLimit} will place them over
                    their limit.
                  </p>
                )}
              </div>

              {editMode && (
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSaveChanges}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl bg-sky-500 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50 transition"
                  >
                    {saving ? 'Saving...' : 'Save changes'}
                  </button>
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setSeatLimit(organisation.seat_limit);
                      setPlanName(subscription?.plan_name || 'Trial');
                      setSubscriptionStatus(organisation.subscription_status || 'trial');
                    }}
                    className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 transition"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/40 shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-100">Members</h2>
              <button
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-sky-500 hover:bg-sky-600 rounded-xl transition shadow-lg"
              >
                <UserPlus size={14} />
                Add member
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Manage organisation members, their roles, and access rights. Seat-consuming roles are highlighted.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full table-auto text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700/60">
                    <th className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Member</th>
                    <th className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Email</th>
                    <th className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Role</th>
                    <th className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Status</th>
                    <th className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Last active
                    </th>
                    <th className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-b border-slate-700/40">
                      <td className="px-2 py-2 text-sm text-slate-100">
                        {member.full_name || member.email.split('@')[0]}
                      </td>
                      <td className="px-2 py-2 text-sm text-slate-300">{member.email}</td>
                      <td className="px-2 py-2">
                        {editingMember === member.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value)}
                              className="text-xs px-2 py-1 border border-slate-700 rounded bg-slate-900/60 text-slate-200"
                            >
                              <option value="owner">Owner</option>
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                              <option value="viewer">Viewer</option>
                            </select>
                            <button
                              onClick={() => handleUpdateMemberRole(member.id, editRole)}
                              className="text-xs text-sky-400 hover:text-sky-300"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingMember(null)}
                              className="text-xs text-slate-400 hover:text-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              ['owner', 'admin', 'member'].includes(member.role)
                                ? 'bg-sky-500/10 text-sky-300 border border-sky-500/30'
                                : 'bg-slate-500/10 text-slate-300 border border-slate-500/30'
                            }`}
                          >
                            {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            member.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                              : member.status === 'invited'
                              ? 'bg-slate-500/10 text-slate-300 border border-slate-500/30'
                              : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-sm text-slate-300">
                        {member.activated_at ? formatDate(member.activated_at) : 'Never'}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          {member.role !== 'owner' && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingMember(member.id);
                                  setEditRole(member.role);
                                }}
                                className="text-slate-400 hover:text-sky-400 transition"
                                title="Edit role"
                              >
                                <Edit2 size={14} />
                              </button>
                              {member.status === 'invited' && (
                                <button
                                  onClick={() => handleResendInvite(member.email)}
                                  className="text-slate-400 hover:text-sky-400 transition"
                                  title="Resend invite"
                                >
                                  <Mail size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => handleRemoveMember(member.id, member.email)}
                                className="text-slate-400 hover:text-red-400 transition"
                                title="Remove member"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/40 shadow-lg p-4">
            <h2 className="text-sm font-semibold text-slate-100 mb-4">Projects</h2>

            <div className="overflow-x-auto">
              <table className="w-full table-auto text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700/60">
                    <th className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Project</th>
                    <th className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Status</th>
                    <th className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Last updated
                    </th>
                    <th className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Quotes</th>
                    <th className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-4 text-center text-sm text-slate-400">
                        No projects yet
                      </td>
                    </tr>
                  ) : (
                    projects.map((project) => (
                      <tr key={project.id} className="border-b border-slate-700/40">
                        <td className="px-2 py-2 font-medium text-sm text-slate-100">{project.name}</td>
                        <td className="px-2 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              project.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-500/10 text-slate-300 border border-slate-500/30'
                            }`}
                          >
                            {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-sm text-slate-300">{formatDate(project.updated_at)}</td>
                        <td className="px-2 py-2 text-sm text-slate-200">{project.quote_count}</td>
                        <td className="px-2 py-2 text-sm text-slate-300">{project.owner_email || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 shadow-lg p-4">
            <h2 className="text-sm font-semibold text-slate-100 mb-3">Quick actions</h2>
            <div className="space-y-2">
              <button
                onClick={() => navigator.clipboard.writeText(organisationId)}
                className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/40 rounded-xl transition"
              >
                Copy organisation ID
              </button>
            </div>
          </div>
        </div>
      </div>

      {showInviteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">Add member to organisation</h3>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteEmail('');
                  setInviteRole('member');
                }}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-4">
              Add an existing user or invite a new one to join this organisation.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Email address <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/60 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 placeholder:text-slate-500"
                />
                <p className="mt-1 text-xs text-slate-400">
                  If the user exists, they'll be added immediately. Otherwise, we'll create an account and send an invite.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Role <span className="text-rose-400">*</span>
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member' | 'viewer')}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/60 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                >
                  <option value="admin">Admin (can manage settings and members)</option>
                  <option value="member">Member (standard access)</option>
                  <option value="viewer">Viewer (read-only access, no seat used)</option>
                </select>
              </div>

              <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-3">
                <p className="text-xs text-sky-300">
                  <strong>Note:</strong> Admin and Member roles consume a seat. Current usage: {seatsUsed}/{seatLimit} seats.
                  {seatsUsed >= seatLimit && inviteRole !== 'viewer' && (
                    <span className="block mt-1 text-rose-400 font-semibold">
                      Warning: This organisation is at its seat limit!
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteEmail('');
                  setInviteRole('member');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 transition"
                disabled={inviting}
              >
                Cancel
              </button>
              <button
                onClick={handleInviteUser}
                disabled={inviting || !inviteEmail}
                className="px-4 py-2 rounded-xl bg-sky-500 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg"
              >
                {inviting ? 'Adding...' : 'Add member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Organisation Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm pt-20">
          <div className="relative w-full max-w-3xl mx-4 mb-20 bg-slate-900 rounded-2xl shadow-2xl border border-slate-700">
            <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-slate-700 bg-slate-900 rounded-t-2xl">
              <h2 className="text-xl font-semibold text-slate-50">Edit Organisation Details</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditLogoFile(null);
                  setEditLogoPreview(null);
                }}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Organisation Details */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Organisation Details</h3>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Legal Organisation Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={editLegalName}
                    onChange={(e) => setEditLegalName(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="ABC Fire Protection Ltd"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Trading Name (if different)
                  </label>
                  <input
                    type="text"
                    value={editTradingName}
                    onChange={(e) => setEditTradingName(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="ABC Fire (optional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Organisation Logo
                  </label>
                  <div className="space-y-2">
                    {!editLogoPreview ? (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-600 rounded-xl cursor-pointer hover:border-sky-500 hover:bg-slate-800/50 transition-colors">
                        <div className="flex flex-col items-center justify-center py-4">
                          <Upload size={24} className="text-slate-400 mb-2" />
                          <p className="text-xs text-slate-400 font-medium">Click to upload logo</p>
                          <p className="text-xs text-slate-500 mt-1">SVG or PNG, max 2MB</p>
                        </div>
                        <input
                          type="file"
                          accept="image/svg+xml,image/png"
                          onChange={handleLogoChange}
                          className="hidden"
                        />
                      </label>
                    ) : (
                      <div className="relative border border-slate-600 rounded-xl p-4 bg-slate-800/50">
                        <div className="flex items-center gap-4">
                          <div className="w-24 h-24 flex items-center justify-center bg-slate-900 border border-slate-700 rounded-lg p-2">
                            <img
                              src={editLogoPreview}
                              alt="Logo preview"
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-200">{editLogoFile?.name || 'Current logo'}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {editLogoFile && `${(editLogoFile.size / 1024).toFixed(1)} KB`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Country / Region</label>
                    <select
                      value={editCountryRegion}
                      onChange={(e) => setEditCountryRegion(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    >
                      <option value="New Zealand">New Zealand</option>
                      <option value="Australia">Australia</option>
                      <option value="United Kingdom">United Kingdom</option>
                      <option value="United States">United States</option>
                      <option value="Canada">Canada</option>
                      <option value="Singapore">Singapore</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Industry Type</label>
                    <select
                      value={editIndustryType}
                      onChange={(e) => setEditIndustryType(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    >
                      <option value="Main Contractor">Main Contractor</option>
                      <option value="Quantity Surveyor">Quantity Surveyor</option>
                      <option value="Fire Engineer">Fire Engineer</option>
                      <option value="Subcontractor">Subcontractor</option>
                      <option value="Consultant">Consultant</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Primary Trade Focus</label>
                  <select
                    value={editPrimaryTradeFocus}
                    onChange={(e) => setEditPrimaryTradeFocus(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  >
                    <option value="passive_fire">Passive Fire Protection</option>
                    <option value="active_fire">Active Fire Protection</option>
                    <option value="both">Both Passive & Active</option>
                  </select>
                </div>
              </div>

              {/* Commercial Context */}
              <div className="space-y-4 pt-4 border-t border-slate-700">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Commercial Context</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Project Size Range</label>
                    <select
                      value={editProjectSizeRange}
                      onChange={(e) => setEditProjectSizeRange(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    >
                      <option value="<$5m">&lt;$5m</option>
                      <option value="$5m–$20m">$5m–$20m</option>
                      <option value="$20m–$50m">$20m–$50m</option>
                      <option value=">$50m">&gt;$50m</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Jurisdiction Code Set</label>
                    <select
                      value={editJurisdictionCodeSet}
                      onChange={(e) => setEditJurisdictionCodeSet(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    >
                      <option value="NZBC">NZBC (New Zealand Building Code)</option>
                      <option value="NCC">NCC (Australia - National Construction Code)</option>
                      <option value="IBC">IBC (USA - International Building Code)</option>
                      <option value="UK">UK Building Regulations</option>
                      <option value="Other">Other / International</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Compliance Role</label>
                  <select
                    value={editComplianceRole}
                    onChange={(e) => setEditComplianceRole(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  >
                    <option value="Awarding party">Awarding party (evaluating subcontractor quotes)</option>
                    <option value="Bidding party">Bidding party (preparing tender submissions)</option>
                    <option value="Consultant/Auditor">Consultant/Auditor (third-party review)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-3 p-6 border-t border-slate-700 bg-slate-900 rounded-b-2xl">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditLogoFile(null);
                  setEditLogoPreview(null);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 transition"
                disabled={updatingOrg}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOrganisation}
                disabled={updatingOrg || !editLegalName}
                className="px-6 py-2 rounded-xl bg-sky-500 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg"
              >
                {updatingOrg ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
