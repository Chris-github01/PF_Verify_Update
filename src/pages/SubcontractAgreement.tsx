import { useState, useEffect, useRef } from 'react';
import { Save, CheckCircle, AlertCircle, FileText, Eye, Loader2, Lock, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrganisation } from '../lib/organisationContext';
import SubcontractFormSection from '../components/SubcontractFormSection';
import SubcontractChecklist from '../components/SubcontractChecklist';
import { FieldDefinition, FieldValue } from '../components/SubcontractFormField';
import Toast from '../components/Toast';

interface Agreement {
  id: string;
  template_id: string;
  project_id: string;
  agreement_number: string;
  subcontractor_name: string;
  status: 'draft' | 'in_review' | 'completed';
  is_locked: boolean;
  completed_at: string | null;
  created_at: string;
}

interface Template {
  id: string;
  template_code: string;
  template_name: string;
  master_pdf_url: string | null;
}

interface SubcontractAgreementProps {
  agreementId: string;
  onClose?: () => void;
}

export default function SubcontractAgreement({ agreementId, onClose }: SubcontractAgreementProps) {
  const { currentOrganisation } = useOrganisation();
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const autofillAttempted = useRef(false);

  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [sections, setSections] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isAutofilling, setIsAutofilling] = useState(false);

  const isLocked = agreement?.is_locked || false;
  const isCompleted = agreement?.status === 'completed';

  useEffect(() => {
    if (agreementId) {
      loadAgreement();
    }
  }, [agreementId]);

  useEffect(() => {
    if (agreement?.template_id) {
      loadTemplate();
      loadFieldDefinitions();
      loadFieldValues();
    }
  }, [agreement?.template_id]);

  const loadAgreement = async () => {
    const { data, error } = await supabase
      .from('subcontract_agreements')
      .select('*')
      .eq('id', agreementId)
      .single();

    if (error) {
      console.error('Error loading agreement:', error);
      showToast('Failed to load agreement', 'error');
      return;
    }

    setAgreement(data);
  };

  const loadTemplate = async () => {
    const { data, error } = await supabase
      .from('contract_templates')
      .select('*')
      .eq('id', agreement?.template_id)
      .single();

    if (error) {
      console.error('Error loading template:', error);
      return;
    }

    setTemplate(data);
  };

  const loadFieldDefinitions = async () => {
    const { data, error } = await supabase
      .from('subcontract_field_definitions')
      .select('*')
      .eq('template_id', agreement?.template_id)
      .order('field_order');

    if (error) {
      console.error('Error loading field definitions:', error);
      showToast('Failed to load form fields', 'error');
      return;
    }

    setFields(data || []);

    const uniqueSections = [...new Set(data?.map(f => f.section) || [])];
    setSections(uniqueSections);
  };

  const loadFieldValues = async () => {
    const { data, error } = await supabase
      .from('subcontract_field_values')
      .select('*, field_definition_id(field_key)')
      .eq('agreement_id', agreementId);

    if (error) {
      console.error('Error loading field values:', error);
      return;
    }

    const valuesMap: Record<string, FieldValue> = {};
    for (const row of data || []) {
      const fieldKey = (row.field_definition_id as any)?.field_key;
      if (fieldKey) {
        valuesMap[fieldKey] = {
          field_value: row.field_value || '',
          comment: row.comment || ''
        };
      }
    }

    setValues(valuesMap);
  };

  // Auto-fill Contract Identity and Parties sections when agreement is first opened
  useEffect(() => {
    const attemptAutofill = async () => {
      if (
        !autofillAttempted.current &&
        agreement &&
        agreement.project_id &&
        fields.length > 0 &&
        !isLocked &&
        Object.keys(values).length === 0
      ) {
        autofillAttempted.current = true;
        await autoFillFromContractSummary();
      }
    };

    attemptAutofill();
  }, [agreement, fields, values, isLocked]);

  const autoFillFromContractSummary = async () => {
    if (!agreement?.project_id) return;

    setIsAutofilling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No active session for autofill');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/autofill_sa2017_fields`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            agreement_id: agreementId,
            project_id: agreement.project_id,
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        console.log('[SA-2017 Autofill] Populated', result.fields_populated, 'fields');
        // Reload field values to show the autofilled data
        await loadFieldValues();
        showToast(`Auto-filled ${result.fields_populated} fields from Contract Summary`, 'success');
      } else {
        console.error('[SA-2017 Autofill] Failed:', result.error);
      }
    } catch (error) {
      console.error('[SA-2017 Autofill] Error:', error);
      // Don't show error toast to user - autofill is a nice-to-have
    } finally {
      setIsAutofilling(false);
    }
  };

  const handleFieldChange = (fieldKey: string, fieldValue: string, comment: string) => {
    setValues(prev => ({
      ...prev,
      [fieldKey]: { field_value: fieldValue, comment }
    }));
  };

  const getAllValuesMap = (): Record<string, string> => {
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      map[key] = value.field_value || '';
    }
    return map;
  };

  const getFieldsBySection = (): Record<string, FieldDefinition[]> => {
    const bySection: Record<string, FieldDefinition[]> = {};
    for (const field of fields) {
      if (!bySection[field.section]) {
        bySection[field.section] = [];
      }
      bySection[field.section].push(field);
    }
    return bySection;
  };

  const countFilledFields = (): { total: number; filled: number } => {
    const visibleFields = fields.filter(f => {
      if (!f.required_when_json || Object.keys(f.required_when_json).length === 0) {
        return true;
      }
      const allValues = getAllValuesMap();
      return Object.entries(f.required_when_json).every(([key, requiredValue]) => {
        return allValues[key] === requiredValue;
      });
    });

    const filled = visibleFields.filter(f => {
      const value = values[f.field_key]?.field_value;
      return value && value.trim() !== '';
    }).length;

    return { total: visibleFields.length, filled };
  };

  const handleSaveDraft = async () => {
    if (isLocked) return;

    setIsSaving(true);
    try {
      await saveFieldValues();
      await updateAgreementStatus('draft');
      showToast('Draft saved successfully', 'success');
    } catch (error) {
      console.error('Error saving draft:', error);
      showToast('Failed to save draft', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReviewAndSave = async () => {
    if (isLocked) return;

    setIsSaving(true);
    try {
      await saveFieldValues();
      await updateAgreementStatus('in_review');
      showToast('Saved for review successfully', 'success');
    } catch (error) {
      console.error('Error during review:', error);
      showToast('Failed to save for review', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = async () => {
    if (isLocked) return;

    const { total, filled } = countFilledFields();
    const percentage = total > 0 ? Math.round((filled / total) * 100) : 100;

    let confirmMessage = 'Are you sure you want to complete this agreement? This will lock the agreement and prevent further edits.';

    if (filled < total) {
      confirmMessage = `You are completing this agreement with ${filled} of ${total} fields filled (${percentage}%). This will lock the agreement and prevent further edits. Proceed?`;
    }

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsCompleting(true);
    try {
      await saveFieldValues();

      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('subcontract_agreements')
        .update({
          status: 'completed',
          is_locked: true,
          completed_at: new Date().toISOString(),
          completed_by: userData.user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', agreementId);

      if (error) throw error;

      showToast('Agreement completed and locked successfully', 'success');
      await loadAgreement();
    } catch (error) {
      console.error('Error completing agreement:', error);
      showToast('Failed to complete agreement', 'error');
    } finally {
      setIsCompleting(false);
    }
  };

  const saveFieldValues = async () => {
    const upsertPromises: Promise<any>[] = [];

    for (const field of fields) {
      const value = values[field.field_key];
      if (!value) continue;

      const promise = supabase
        .from('subcontract_field_values')
        .upsert({
          agreement_id: agreementId,
          field_definition_id: field.id,
          field_value: value.field_value || null,
          comment: value.comment || null,
          updated_by: (await supabase.auth.getUser()).data.user?.id,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'agreement_id,field_definition_id'
        });

      upsertPromises.push(promise);
    }

    await Promise.all(upsertPromises);
  };

  const updateAgreementStatus = async (status: 'draft' | 'in_review' | 'completed') => {
    const { error } = await supabase
      .from('subcontract_agreements')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', agreementId);

    if (error) throw error;

    setAgreement(prev => prev ? { ...prev, status } : null);
  };

  const scrollToSection = (sectionName: string) => {
    const sectionElement = sectionRefs.current[sectionName];
    if (sectionElement) {
      sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  if (!agreement || !template) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">Loading agreement...</p>
        </div>
      </div>
    );
  }

  const statusColors = {
    draft: 'bg-slate-800 text-slate-400 border border-slate-700',
    in_review: 'bg-blue-900/30 text-blue-400 border border-blue-700',
    completed: 'bg-green-900/30 text-green-400 border border-green-700'
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center gap-2 text-slate-300 hover:text-white mb-4 transition-colors"
            >
              <ArrowLeft size={20} />
              Back to Contract Manager
            </button>
          )}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">
                {template.template_name} - {agreement.subcontractor_name}
              </h1>
              <p className="text-slate-400">Agreement {agreement.agreement_number || agreement.id}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-6">
          <div className="flex-1 space-y-4">
            {/* Status Bar */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded text-sm font-medium ${statusColors[agreement.status]}`}>
                    {agreement.status === 'draft' && 'Draft'}
                    {agreement.status === 'in_review' && 'In Review'}
                    {agreement.status === 'completed' && 'Completed'}
                  </span>
                  {isAutofilling && (
                    <div className="flex items-center gap-2 text-blue-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm font-medium">Auto-filling fields...</span>
                    </div>
                  )}
                  {isLocked && (
                    <div className="flex items-center gap-2 text-orange-400">
                      <Lock className="w-4 h-4" />
                      <span className="text-sm font-medium">Locked</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {template.master_pdf_url && (
                    <button
                      onClick={() => setShowPdfViewer(!showPdfViewer)}
                      className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 border border-slate-600 transition-colors flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      {showPdfViewer ? 'Hide' : 'View'} Master PDF
                    </button>
                  )}
                  <button
                    onClick={handleSaveDraft}
                    disabled={isLocked || isSaving}
                    className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 border border-slate-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Draft
                  </button>
                  <button
                    onClick={handleReviewAndSave}
                    disabled={isLocked || isSaving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                    Review & Save
                  </button>
                  <button
                    onClick={handleComplete}
                    disabled={isLocked || isCompleting}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCompleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Complete
                  </button>
                </div>
              </div>
            </div>

            {/* PDF Viewer */}
            {showPdfViewer && template.master_pdf_url && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg shadow-lg p-4">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
                  <FileText className="w-5 h-5 text-slate-400" />
                  Master PDF Reference
                </h3>
                <iframe
                  src={template.master_pdf_url}
                  className="w-full h-96 border border-slate-600 rounded bg-white"
                  title="Master PDF"
                />
              </div>
            )}

            {/* Form Sections */}
            <div className="space-y-4">
              {sections.map(sectionName => {
                const sectionFields = fields.filter(f => f.section === sectionName);
                return (
                  <div
                    key={sectionName}
                    ref={el => { sectionRefs.current[sectionName] = el; }}
                  >
                    <SubcontractFormSection
                      sectionName={sectionName}
                      fields={sectionFields}
                      values={values}
                      allValues={getAllValuesMap()}
                      onChange={handleFieldChange}
                      disabled={isLocked}
                      defaultExpanded={false}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Checklist Sidebar */}
          <div className="w-96 flex-shrink-0 sticky top-6 self-start">
            <SubcontractChecklist
              sections={sections}
              fieldsBySection={getFieldsBySection()}
              values={values}
              allValues={getAllValuesMap()}
              onNavigateToSection={scrollToSection}
            />
          </div>
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
