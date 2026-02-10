import { useState, useEffect, useRef } from 'react';
import { Save, CheckCircle, AlertCircle, FileText, Eye, Loader2, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrganisation } from '../lib/organisationContext';
import PageHeader from '../components/PageHeader';
import SubcontractFormSection from '../components/SubcontractFormSection';
import SubcontractChecklist from '../components/SubcontractChecklist';
import { FieldDefinition, FieldValue } from '../components/SubcontractFormField';
import {
  SubcontractValidationEngine,
  ValidationError,
  groupErrorsBySection,
  formatValidationReport
} from '../lib/subcontract/validationEngine';
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

  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [sections, setSections] = useState<string[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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

    setShowValidation(true);
    setIsSaving(true);

    try {
      const validationEngine = new SubcontractValidationEngine(fields, values);
      const result = validationEngine.validate();

      await saveFieldValues();

      if (!result.isValid) {
        await updateAgreementStatus('in_review');
        showToast(
          `Saved for review. ${result.errors.length} validation issue${result.errors.length !== 1 ? 's' : ''} found.`,
          'error'
        );

        const firstError = result.errors[0];
        if (firstError) {
          scrollToSection(firstError.section);
        }
      } else {
        await updateAgreementStatus('in_review');
        showToast('Saved for review. All validation checks passed.', 'success');
      }
    } catch (error) {
      console.error('Error during review:', error);
      showToast('Failed to save for review', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = async () => {
    if (isLocked) return;

    const validationEngine = new SubcontractValidationEngine(fields, values);
    const { canComplete, blockingErrors } = validationEngine.canComplete();

    if (!canComplete) {
      setShowValidation(true);
      showToast(
        `Cannot complete: ${blockingErrors.length} required field${blockingErrors.length !== 1 ? 's' : ''} missing`,
        'error'
      );

      const firstError = blockingErrors[0];
      if (firstError) {
        scrollToSection(firstError.section);
      }
      return;
    }

    if (!confirm('Are you sure you want to complete this agreement? This will lock the agreement and prevent further edits.')) {
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
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const statusColors = {
    draft: 'bg-gray-100 text-gray-800',
    in_review: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800'
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title={`${template.template_name} - ${agreement.subcontractor_name}`}
        subtitle={`Agreement ${agreement.agreement_number || agreement.id}`}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-6">
          <div className="flex-1 space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[agreement.status]}`}>
                    {agreement.status.replace('_', ' ').toUpperCase()}
                  </span>
                  {isLocked && (
                    <div className="flex items-center gap-2 text-amber-600">
                      <Lock className="w-4 h-4" />
                      <span className="text-sm font-medium">Locked</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {template.master_pdf_url && (
                    <button
                      onClick={() => setShowPdfViewer(!showPdfViewer)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      {showPdfViewer ? 'Hide' : 'View'} Master PDF
                    </button>
                  )}
                  <button
                    onClick={handleSaveDraft}
                    disabled={isLocked || isSaving}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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

            {showPdfViewer && template.master_pdf_url && (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-600" />
                  Master PDF Reference
                </h3>
                <iframe
                  src={template.master_pdf_url}
                  className="w-full h-96 border border-gray-300 rounded"
                  title="Master PDF"
                />
              </div>
            )}

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
                      showValidation={showValidation}
                      defaultExpanded={false}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="w-96 flex-shrink-0 sticky top-6 self-start">
            <SubcontractChecklist
              sections={sections}
              fieldsBySection={getFieldsBySection()}
              values={values}
              allValues={getAllValuesMap()}
              onNavigateToSection={scrollToSection}
              showValidation={showValidation}
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
