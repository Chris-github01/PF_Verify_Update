import { useState } from 'react';
import { ArrowLeft, AlertCircle, X, Info, ChevronDown, ChevronUp, Upload, Trash2 } from 'lucide-react';
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
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
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
  const [accountType, setAccountType] = useState<'trial' | 'subscription'>('trial');
  const [subscriptionPlan, setSubscriptionPlan] = useState('starter');
  const [trialDuration, setTrialDuration] = useState(14);
  const [seatLimit, setSeatLimit] = useState(5);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [billingContactEmail, setBillingContactEmail] = useState('');

  // Update account type
  const handleAccountTypeChange = (type: 'trial' | 'subscription') => {
    setAccountType(type);
    if (type === 'trial') {
      setSeatLimit(5);
      setPaymentConfirmed(false);
    }
  };

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

    setLogoFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
  };

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

    // Additional validation for subscription accounts
    if (accountType === 'subscription' && !paymentConfirmed) {
      setToast({ type: 'error', message: 'Please confirm payment has been received before creating a paid subscription' });
      return;
    }

    setCreating(true);
    try {
      // Generate audit namespace
      const auditNamespace = `ORG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      // Get current admin user
      const { data: { user } } = await supabase.auth.getUser();

      // Determine subscription status and trial end date
      const subscriptionStatus = accountType === 'trial' ? 'trial' : 'active';
      const trialEndDate = accountType === 'trial'
        ? new Date(Date.now() + trialDuration * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const pricingTier = accountType === 'trial' ? 'starter' : subscriptionPlan;

      // Upload logo if provided
      let logoUrl: string | null = null;
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `${auditNamespace}-logo.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('organisation-logos')
          .upload(filePath, logoFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Logo upload error:', uploadError);
          throw new Error('Failed to upload logo. Please try again.');
        }

        logoUrl = filePath;
      }

      // Create organisation
      const { data: org, error: orgError } = await supabase
        .from('organisations')
        .insert({
          name: legalName,
          legal_name: legalName,
          trading_name: tradingName || null,
          logo_url: logoUrl,
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
          trial_type: accountType === 'trial' ? `${trialDuration}_day` : null,
          seat_limit: seatLimit,
          billing_contact_email: billingContactEmail || ownerEmail.toLowerCase().trim(),
          audit_namespace: auditNamespace,
          compliance_acceptance: complianceAcceptance,
          created_by_admin_id: user?.id || null,
          subscription_status: subscriptionStatus,
          pricing_tier: pricingTier,
          trial_end_date: trialEndDate,
          trade_type: primaryTradeFocus
        })
        .select()
        .single();

      if (orgError) throw orgError;

      // Owner is automatically added by database trigger
      // Check if owner was added successfully
      const { data: ownerCheck } = await supabase
        .from('organisation_members')
        .select('id')
        .eq('organisation_id', org.id)
        .eq('role', 'owner')
        .maybeSingle();

      if (!ownerCheck) {
        console.warn('Warning: Owner was not automatically added. They may need to be added manually.');
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
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
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
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6"
      >
        <ArrowLeft size={16} />
        Back to organisations
      </button>

      <div className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white mb-2">Enterprise Organisation Onboarding</h1>
          <p className="text-sm text-gray-400">
            Complete this form to set up a new organisation with full compliance context and audit readiness.
          </p>
        </div>

        <div className="space-y-8">
          {/* Section 1: Organisation Details */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              1. Organisation Details
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Legal Organisation Name <span className="text-rose-400">*</span>
                  <Tooltip text="Official registered business name as it appears on legal documents" />
                </label>
                <input
                  type="text"
                  placeholder="ABC Fire Protection Ltd"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className="w-full rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-gray-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Trading Name (if different)
                  <Tooltip text="Public-facing name used for business operations, if different from legal name" />
                </label>
                <input
                  type="text"
                  placeholder="ABC Fire (optional)"
                  value={tradingName}
                  onChange={(e) => setTradingName(e.target.value)}
                  className="w-full rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-gray-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Organisation Logo
                  <Tooltip text="Your logo will appear in the header of all generated PDF reports. SVG preferred for best quality." />
                </label>
                <div className="space-y-2">
                  {!logoPreview ? (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:border-orange-500 hover:bg-slate-800/30 transition-colors">
                      <div className="flex flex-col items-center justify-center py-4">
                        <Upload size={24} className="text-gray-400 mb-2" />
                        <p className="text-xs text-gray-400 font-medium">Click to upload logo</p>
                        <p className="text-xs text-gray-400 mt-1">SVG or PNG, max 2MB</p>
                      </div>
                      <input
                        type="file"
                        accept="image/svg+xml,image/png"
                        onChange={handleLogoChange}
                        className="hidden"
                      />
                    </label>
                  ) : (
                    <div className="relative border border-slate-600 rounded-lg p-4 bg-slate-800/50">
                      <div className="flex items-center gap-4">
                        <div className="w-24 h-24 flex items-center justify-center bg-slate-900 border border-slate-600 rounded-lg p-2">
                          <img
                            src={logoPreview}
                            alt="Logo preview"
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white">{logoFile?.name}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {logoFile && `${(logoFile.size / 1024).toFixed(1)} KB`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="p-2 text-gray-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-lg transition-colors"
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
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Country / Region <span className="text-rose-400">*</span>
                    <Tooltip text="Used to determine applicable standards, compliance requirements, and local regulations" />
                  </label>
                  <select
                    value={countryRegion}
                    onChange={(e) => setCountryRegion(e.target.value)}
                    className="w-full rounded-lg bg-slate-800/50 border border-slate-600 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
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
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Industry Type <span className="text-rose-400">*</span>
                    <Tooltip text="Primary business role in construction projects" />
                  </label>
                  <select
                    value={industryType}
                    onChange={(e) => setIndustryType(e.target.value)}
                    className="w-full rounded-lg bg-slate-800/50 border border-slate-600 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
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
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Primary Trade Focus <span className="text-rose-400">*</span>
                  <Tooltip text="Default trade module (extensible for future Verify+ modules)" />
                </label>
                <select
                  value={primaryTradeFocus}
                  onChange={(e) => setPrimaryTradeFocus(e.target.value)}
                  className="w-full rounded-lg bg-slate-800/50 border border-slate-600 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
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
            <h2 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-slate-700">
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
            <h2 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-slate-700">
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
              <div className="space-y-6">
                {/* Account Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    Account Type <span className="text-rose-600">*</span>
                    <Tooltip text="Choose between trial account or paid subscription" />
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => handleAccountTypeChange('trial')}
                      className={`p-4 rounded-lg border-2 text-left transition ${
                        accountType === 'trial'
                          ? 'border-[#0A66C2] bg-blue-50'
                          : 'border-slate-300 bg-white hover:border-slate-400'
                      }`}
                    >
                      <div className="font-semibold text-slate-900 mb-1">Trial Account</div>
                      <div className="text-xs text-slate-600">14-day free trial with limited features</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAccountTypeChange('subscription')}
                      className={`p-4 rounded-lg border-2 text-left transition ${
                        accountType === 'subscription'
                          ? 'border-[#0A66C2] bg-blue-50'
                          : 'border-slate-300 bg-white hover:border-slate-400'
                      }`}
                    >
                      <div className="font-semibold text-slate-900 mb-1">Paid Subscription</div>
                      <div className="text-xs text-slate-600">Full access with paid plan</div>
                    </button>
                  </div>
                </div>

                {/* Trial Account Settings */}
                {accountType === 'trial' && (
                  <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="text-sm font-semibold text-slate-900">Trial Settings</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Trial Duration (Days) <span className="text-rose-600">*</span>
                          <Tooltip text="Number of days for the trial period" />
                        </label>
                        <input
                          type="number"
                          min="7"
                          max="90"
                          value={trialDuration}
                          onChange={(e) => setTrialDuration(parseInt(e.target.value) || 14)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] bg-white text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          User Seat Limit
                        </label>
                        <input
                          type="number"
                          value={seatLimit}
                          readOnly
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-slate-100 text-gray-600"
                        />
                        <p className="text-xs text-slate-500 mt-1">Trial accounts limited to 5 users</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Subscription Settings */}
                {accountType === 'subscription' && (
                  <div className="space-y-4 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                    <h3 className="text-sm font-semibold text-slate-900">Subscription Settings</h3>
                    <div className="space-y-4">
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

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            User Seat Limit <span className="text-rose-600">*</span>
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
                            {subscriptionPlan === 'starter' && 'Starter: up to 5 users'}
                            {subscriptionPlan === 'professional' && 'Professional: up to 15 users'}
                            {subscriptionPlan === 'enterprise' && 'Enterprise: unlimited users'}
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Billing Contact Email
                          </label>
                          <input
                            type="email"
                            placeholder="billing@company.com"
                            value={billingContactEmail}
                            onChange={(e) => setBillingContactEmail(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] bg-white text-gray-900"
                          />
                        </div>
                      </div>

                      {/* Payment Confirmation */}
                      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={paymentConfirmed}
                            onChange={(e) => setPaymentConfirmed(e.target.checked)}
                            className="mt-1 w-4 h-4 text-[#0A66C2] border-slate-300 rounded focus:ring-[#0A66C2]"
                          />
                          <div>
                            <div className="text-sm font-medium text-slate-900">
                              Payment Received <span className="text-rose-600">*</span>
                            </div>
                            <div className="text-xs text-slate-600 mt-1">
                              Confirm that payment has been received before activating this paid subscription.
                              The account will be immediately active with full access.
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 5: Governance & Audit Readiness */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              5. Governance & Audit Readiness
            </h2>
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={complianceAcceptance}
                  onChange={(e) => setComplianceAcceptance(e.target.checked)}
                  className="mt-1 w-4 h-4 text-orange-500 border-slate-600 rounded focus:ring-orange-500"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">
                    Compliance Terms Acceptance <span className="text-rose-400">*</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    This organisation understands that Verify+ provides audit intelligence and compliance analysis tools.
                    These tools do not replace professional judgment, engineering sign-off, or formal compliance certification.
                    Final responsibility for compliance decisions remains with qualified professionals within the organisation.
                  </p>
                </div>
              </label>
            </div>

            <div className="mt-4 p-3 bg-blue-500/20 rounded-lg border border-blue-500/30">
              <p className="text-xs text-blue-300">
                <strong>Auto-generated upon creation:</strong> Organisation ID and unique Audit Namespace for blockchain-ready traceability
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-slate-700">
          <button
            onClick={() => (window.location.href = '/admin/organisations')}
            className="px-5 py-2.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition"
            disabled={creating}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !legalName || !ownerFullName || !ownerEmail || !complianceAcceptance}
            className="px-5 py-2.5 rounded-lg bg-orange-500 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {creating ? 'Creating Organisation...' : 'Create Organisation'}
          </button>
        </div>
      </div>
    </div>
  );
}
