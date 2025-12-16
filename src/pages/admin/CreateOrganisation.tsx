import { useState } from 'react';
import { ArrowLeft, AlertCircle, X, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface TooltipProps {
  text: string;
}

function Tooltip({ text }: TooltipProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block ml-1">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="text-slate-400 hover:text-slate-600"
      >
        <Info size={14} />
      </button>
      {show && (
        <div className="absolute z-50 w-64 p-2 text-xs text-white bg-slate-900 rounded-lg shadow-lg -top-2 left-6">
          {text}
          <div className="absolute w-2 h-2 bg-slate-900 transform rotate-45 -left-1 top-3" />
        </div>
      )}
    </div>
  );
}

export default function CreateOrganisation() {
  // Section 1: Organisation Details
  const [legalName, setLegalName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [countryRegion, setCountryRegion] = useState('New Zealand');
  const [industryType, setIndustryType] = useState('Main Contractor');
  const [primaryTradeFocus, setPrimaryTradeFocus] = useState('passive_fire');

  // Section 2: Commercial & Compliance Context
  const [projectSizeRange, setProjectSizeRange] = useState('<$5m');
  const [jurisdictionCodeSet, setJurisdictionCodeSet] = useState('NZBC');
  const [complianceRole, setComplianceRole] = useState('Awarding party');

  // Section 3: Primary Owner Details
  const [ownerFullName, setOwnerFullName] = useState('');
  const [ownerRoleTitle, setOwnerRoleTitle] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');

  // Section 4: Billing & Trial Controls
  const [subscriptionPlan, setSubscriptionPlan] = useState('starter');
  const [trialDuration, setTrialDuration] = useState(14);
  const [seatLimit, setSeatLimit] = useState(5);
  const [billingContactEmail, setBillingContactEmail] = useState('');

  // Update seat limit when subscription plan changes
  const handlePlanChange = (plan: string) => {
    setSubscriptionPlan(plan);
    switch (plan) {
      case 'starter':
        setSeatLimit(5);
        break;
      case 'professional':
        setSeatLimit(15);
        break;
      case 'enterprise':
        setSeatLimit(999); // Unlimited represented as high number
        break;
    }
  };

  // Section 5: Governance
  const [complianceAcceptance, setComplianceAcceptance] = useState(false);

  // Advanced section toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleCreate = async () => {
    // Validation
    if (!legalName || !countryRegion || !industryType || !projectSizeRange ||
        !jurisdictionCodeSet || !complianceRole || !ownerFullName ||
        !ownerRoleTitle || !ownerEmail || !complianceAcceptance) {
      setToast({ type: 'error', message: 'Please fill in all required fields' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      setToast({ type: 'error', message: 'Please enter a valid owner email address' });
      return;
    }

    if (billingContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingContactEmail)) {
      setToast({ type: 'error', message: 'Please enter a valid billing contact email' });
      return;
    }

    if (!complianceAcceptance) {
      setToast({ type: 'error', message: 'Must accept compliance terms to continue' });
      return;
    }

    setCreating(true);
    try {
      // Generate audit namespace
      const auditNamespace = `ORG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      // Get current admin user
      const { data: { user } } = await supabase.auth.getUser();

      // Create organisation
      const { data: org, error: orgError } = await supabase
        .from('organisations')
        .insert({
          name: legalName,
          legal_name: legalName,
          trading_name: tradingName || null,
          country_region: countryRegion,
          industry_type: industryType,
          primary_trade_focus: primaryTradeFocus,
          project_size_range: projectSizeRange,
          jurisdiction_code_set: jurisdictionCodeSet,
          compliance_role: complianceRole,
          owner_full_name: ownerFullName,
          owner_role_title: ownerRoleTitle,
          owner_email: ownerEmail.toLowerCase().trim(),
          owner_phone: ownerPhone || null,
          trial_type: `${trialDuration}_day`,
          seat_limit: seatLimit,
          billing_contact_email: billingContactEmail || ownerEmail.toLowerCase().trim(),
          audit_namespace: auditNamespace,
          compliance_acceptance: complianceAcceptance,
          created_by_admin_id: user?.id || null,
          subscription_status: 'trial',
          pricing_tier: subscriptionPlan,
          trial_end_date: new Date(Date.now() + trialDuration * 24 * 60 * 60 * 1000).toISOString(),
          trade_type: primaryTradeFocus
        })
        .select()
        .single();

      if (orgError) throw orgError;

      // Now create the owner as a member using the RPC function
      const { error: memberError } = await supabase
        .rpc('create_organisation_with_owner_by_email', {
          p_name: legalName,
          p_status: 'trial',
          p_seat_limit: seatLimit,
          p_pricing_tier: subscriptionPlan,
          p_owner_email: ownerEmail.toLowerCase().trim()
        });

      // If member creation fails, we still have the org, so just warn
      if (memberError) {
        console.error('Warning: Failed to create owner member:', memberError);
      }

      setToast({ type: 'success', message: 'Organisation created successfully!' });
      setTimeout(() => {
        window.location.href = `/admin/organisations/${org.id}`;
      }, 1000);
    } catch (error: any) {
      console.error('Error creating organisation:', error);
      setToast({ type: 'error', message: error.message || 'Failed to create organisation' });
      setCreating(false);
    }
  };

  return (
    <div className="px-6 py-6 max-w-4xl mx-auto">
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

      <div className="rounded-xl border border-slate-200 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.06)] p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Enterprise Organisation Onboarding</h1>
          <p className="text-sm text-slate-600">
            Complete this form to set up a new organisation with full compliance context and audit readiness.
          </p>
        </div>

        <div className="space-y-8">
          {/* Section 1: Organisation Details */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-200">
              1. Organisation Details
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Legal Organisation Name <span className="text-rose-600">*</span>
                  <Tooltip text="Official registered business name as it appears on legal documents" />
                </label>
                <input
                  type="text"
                  placeholder="ABC Fire Protection Ltd"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] bg-white text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Trading Name (if different)
                  <Tooltip text="Public-facing name used for business operations, if different from legal name" />
                </label>
                <input
                  type="text"
                  placeholder="ABC Fire (optional)"
                  value={tradingName}
                  onChange={(e) => setTradingName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] bg-white text-gray-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Country / Region <span className="text-rose-600">*</span>
                    <Tooltip text="Used to determine applicable standards, compliance requirements, and local regulations" />
                  </label>
                  <select
                    value={countryRegion}
                    onChange={(e) => setCountryRegion(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Industry Type <span className="text-rose-600">*</span>
                    <Tooltip text="Primary business role in construction projects" />
                  </label>
                  <select
                    value={industryType}
                    onChange={(e) => setIndustryType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
                  >
                    <option value="Main Contractor">Main Contractor</option>
                    <option value="PQS">PQS (Professional Quantity Surveyor)</option>
                    <option value="Fire Engineer">Fire Engineer</option>
                    <option value="Subcontractor">Subcontractor</option>
                    <option value="Auditor">Auditor</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Primary Trade Focus <span className="text-rose-600">*</span>
                  <Tooltip text="Default trade module (extensible for future Verify+ modules)" />
                </label>
                <select
                  value={primaryTradeFocus}
                  onChange={(e) => setPrimaryTradeFocus(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
                >
                  <option value="passive_fire">Passive Fire Protection</option>
                  <option value="mechanical">Mechanical (Coming Soon)</option>
                  <option value="electrical">Electrical (Coming Soon)</option>
                  <option value="hydraulic">Hydraulic (Coming Soon)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Commercial & Compliance Context */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-200">
              2. Commercial & Compliance Context
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Typical Project Size Range <span className="text-rose-600">*</span>
                  <Tooltip text="Helps calibrate risk thresholds and analysis depth" />
                </label>
                <select
                  value={projectSizeRange}
                  onChange={(e) => setProjectSizeRange(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
                >
                  <option value="<$5m">Less than $5 million</option>
                  <option value="$5-20m">$5 - $20 million</option>
                  <option value="$20-50m">$20 - $50 million</option>
                  <option value="$50m+">$50 million+</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Jurisdiction / Code Set <span className="text-rose-600">*</span>
                    <Tooltip text="Building codes and standards this organisation operates under" />
                  </label>
                  <select
                    value={jurisdictionCodeSet}
                    onChange={(e) => setJurisdictionCodeSet(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
                  >
                    <option value="NZBC">NZBC (New Zealand Building Code)</option>
                    <option value="NCC">NCC (National Construction Code - Australia)</option>
                    <option value="Both">Both NZBC and NCC</option>
                    <option value="Other">Other / International</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Compliance Role <span className="text-rose-600">*</span>
                    <Tooltip text="Primary role in compliance verification process" />
                  </label>
                  <select
                    value={complianceRole}
                    onChange={(e) => setComplianceRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
                  >
                    <option value="Awarding party">Awarding Party</option>
                    <option value="Reviewing party">Reviewing Party</option>
                    <option value="Auditing party">Auditing Party</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Primary Owner Details */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-200">
              3. Primary Owner Details
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Owner Full Name <span className="text-rose-600">*</span>
                    <Tooltip text="Full name of the person who will own this organisation" />
                  </label>
                  <input
                    type="text"
                    placeholder="John Smith"
                    value={ownerFullName}
                    onChange={(e) => setOwnerFullName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] bg-white text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Owner Role / Title <span className="text-rose-600">*</span>
                    <Tooltip text="Owner's position within the organisation" />
                  </label>
                  <input
                    type="text"
                    placeholder="Managing Director"
                    value={ownerRoleTitle}
                    onChange={(e) => setOwnerRoleTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] bg-white text-gray-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Owner Email <span className="text-rose-600">*</span>
                    <Tooltip text="Email address for account access and verification" />
                  </label>
                  <input
                    type="email"
                    placeholder="john@company.com"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] bg-white text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Owner Phone
                    <Tooltip text="Contact phone number (optional but recommended)" />
                  </label>
                  <input
                    type="tel"
                    placeholder="+64 21 123 4567"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] bg-white text-gray-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Billing & Trial Controls - Collapsible */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-lg font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-200 hover:text-[#0A66C2] transition"
            >
              <span>4. Billing & Trial Controls</span>
              {showAdvanced ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            {showAdvanced && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Subscription Plan <span className="text-rose-600">*</span>
                      <Tooltip text="Select the pricing tier for this organisation" />
                    </label>
                    <select
                      value={subscriptionPlan}
                      onChange={(e) => handlePlanChange(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
                    >
                      <option value="starter">Starter - Up to 5 users ($11,988 NZD/year)</option>
                      <option value="professional">Professional - Up to 15 users ($23,988 NZD/year)</option>
                      <option value="enterprise">Enterprise - Unlimited users (From $33,600 NZD/year)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Trial Duration (Days) <span className="text-rose-600">*</span>
                      <Tooltip text="Number of days for the trial period" />
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="90"
                      value={trialDuration}
                      onChange={(e) => setTrialDuration(parseInt(e.target.value) || 14)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] bg-white text-gray-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      User Seat Limit <span className="text-rose-600">*</span>
                      <Tooltip text="Auto-set based on subscription plan. Can be adjusted if needed." />
                    </label>
                    <input
                      type="number"
                      value={seatLimit}
                      onChange={(e) => setSeatLimit(parseInt(e.target.value) || 0)}
                      min="1"
                      max="1000"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] bg-white text-gray-900"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      {subscriptionPlan === 'starter' && 'Starter plan includes up to 5 users'}
                      {subscriptionPlan === 'professional' && 'Professional plan includes up to 15 users'}
                      {subscriptionPlan === 'enterprise' && 'Enterprise plan includes unlimited users'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Billing Contact Email
                      <Tooltip text="Email for billing and invoicing (defaults to owner email if not provided)" />
                    </label>
                    <input
                      type="email"
                      placeholder="billing@company.com (optional)"
                      value={billingContactEmail}
                      onChange={(e) => setBillingContactEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] bg-white text-gray-900"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Governance & Audit Readiness */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-200">
              5. Governance & Audit Readiness
            </h2>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={complianceAcceptance}
                  onChange={(e) => setComplianceAcceptance(e.target.checked)}
                  className="mt-1 w-4 h-4 text-[#0A66C2] border-slate-300 rounded focus:ring-[#0A66C2]"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    Compliance Terms Acceptance <span className="text-rose-600">*</span>
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    This organisation understands that Verify+ provides audit intelligence and compliance analysis tools.
                    These tools do not replace professional judgment, engineering sign-off, or formal compliance certification.
                    Final responsibility for compliance decisions remains with qualified professionals within the organisation.
                  </p>
                </div>
              </label>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-900">
                <strong>Auto-generated upon creation:</strong> Organisation ID and unique Audit Namespace for blockchain-ready traceability
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-slate-200">
          <button
            onClick={() => (window.location.href = '/admin/organisations')}
            className="px-5 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition"
            disabled={creating}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !legalName || !ownerFullName || !ownerEmail || !complianceAcceptance}
            className="px-5 py-2.5 rounded-lg bg-[#0A66C2] text-sm font-semibold text-white hover:bg-[#0952A0] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
          >
            {creating ? 'Creating Organisation...' : 'Create Organisation'}
          </button>
        </div>
      </div>
    </div>
  );
}
