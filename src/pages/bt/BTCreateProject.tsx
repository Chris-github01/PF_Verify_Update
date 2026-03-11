import { useState } from 'react';
import { ChevronLeft, Save, FolderOpen, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import type { BTSourceType, BTClaimFrequency } from '../../types/baselineTracker.types';

interface BTCreateProjectProps {
  onNavigate: (view: string, projectId?: string) => void;
}

export default function BTCreateProject({ onNavigate }: BTCreateProjectProps) {
  const { currentOrganisation } = useOrganisation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    project_name: '',
    project_code: '',
    client_name: '',
    main_contractor_name: '',
    site_address: '',
    contract_reference: '',
    linked_quote_audit_reference: '',
    source_type: 'manual' as BTSourceType,
    start_date: '',
    end_date: '',
    retention_percent: 5,
    payment_terms_days: 20,
    claim_frequency: 'monthly' as BTClaimFrequency,
    gst_rate: 0.15,
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganisation) return;
    if (!form.project_name.trim()) { setError('Project name is required'); return; }

    setSaving(true);
    setError(null);

    try {
      const { data: user } = await supabase.auth.getUser();

      const { data: project, error: projectError } = await supabase
        .from('bt_projects')
        .insert({
          organisation_id: currentOrganisation.id,
          project_name: form.project_name.trim(),
          project_code: form.project_code.trim() || null,
          client_name: form.client_name.trim() || null,
          main_contractor_name: form.main_contractor_name.trim() || null,
          site_address: form.site_address.trim() || null,
          contract_reference: form.contract_reference.trim() || null,
          linked_quote_audit_reference: form.linked_quote_audit_reference.trim() || null,
          source_type: form.source_type,
          status: 'draft',
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          retention_percent: form.retention_percent,
          payment_terms_days: form.payment_terms_days,
          claim_frequency: form.claim_frequency,
          gst_rate: form.gst_rate,
          notes: form.notes.trim() || null,
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (projectError) throw projectError;

      const { error: baselineError } = await supabase
        .from('bt_baseline_headers')
        .insert({
          project_id: project.id,
          organisation_id: currentOrganisation.id,
          baseline_reference: `BL-${form.project_code || form.project_name.substring(0, 6).toUpperCase().replace(/\s/g, '')}-001`,
          baseline_version: 1,
          contract_value_excl_gst: 0,
          contract_value_incl_gst: 0,
          retention_percent: form.retention_percent,
          payment_terms_days: form.payment_terms_days,
          claim_frequency: form.claim_frequency,
          baseline_status: 'draft',
        });

      if (baselineError) throw baselineError;

      await supabase.from('bt_activity_logs').insert({
        organisation_id: currentOrganisation.id,
        project_id: project.id,
        entity_type: 'project',
        entity_id: project.id,
        action_type: 'project_created',
        action_label: `Project "${form.project_name}" created`,
        action_by: user.user?.id,
      });

      onNavigate('bt-project-detail', project.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = 'text', required = false) => (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type={type}
        value={form[key] as string | number}
        onChange={(e) => setForm((f) => ({ ...f, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
        required={required}
        className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-600"
      />
    </div>
  );

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => onNavigate('bt-projects')}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-50">New Project</h1>
          <p className="text-xs text-slate-400 mt-0.5">Create a new Baseline Tracker project</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-xl bg-red-900/30 border border-red-700 px-4 py-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Project Details */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <FolderOpen size={15} className="text-cyan-400" />
            Project Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Project Name', 'project_name', 'text', true)}
            {field('Project Code', 'project_code')}
            {field('Client Name', 'client_name')}
            {field('Main Contractor', 'main_contractor_name')}
            <div className="sm:col-span-2">{field('Site Address', 'site_address')}</div>
            {field('Contract Reference', 'contract_reference')}
            {field('Linked Quote Audit Reference', 'linked_quote_audit_reference')}
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-400 mb-1">Source Type</label>
            <select
              value={form.source_type}
              onChange={(e) => setForm((f) => ({ ...f, source_type: e.target.value as BTSourceType }))}
              className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-cyan-600"
            >
              <option value="manual">Manual Entry</option>
              <option value="imported_from_quote_audit">Imported from Quote Audit</option>
              <option value="imported_from_file">Imported from File</option>
            </select>
          </div>
        </div>

        {/* Dates */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Project Dates</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Start Date', 'start_date', 'date')}
            {field('End Date', 'end_date', 'date')}
          </div>
        </div>

        {/* Commercial Settings */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Commercial Settings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Retention %', 'retention_percent', 'number')}
            {field('Payment Terms (days)', 'payment_terms_days', 'number')}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Claim Frequency</label>
              <select
                value={form.claim_frequency}
                onChange={(e) => setForm((f) => ({ ...f, claim_frequency: e.target.value as BTClaimFrequency }))}
                className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-cyan-600"
              >
                <option value="monthly">Monthly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="milestone">Milestone</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">GST Rate</label>
              <select
                value={form.gst_rate}
                onChange={(e) => setForm((f) => ({ ...f, gst_rate: parseFloat(e.target.value) }))}
                className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-cyan-600"
              >
                <option value={0.15}>15% (NZ GST)</option>
                <option value={0.10}>10% (AU GST)</option>
                <option value={0}>0% (No GST)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
          <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-600 resize-none"
            placeholder="Optional notes about this project..."
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <Save size={16} />
            )}
            {saving ? 'Creating...' : 'Create Project'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('bt-projects')}
            className="px-4 py-2.5 text-slate-400 hover:text-slate-200 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
