import { useState, useEffect } from 'react';
import { X, Mail, FileText, Calendar, CheckCircle2, AlertCircle, User, Download, Hash, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generateSupplierGapReportHtml, downloadSupplierGapReport } from '../lib/reports/supplierGapReport';
import { generateRevisionRequestEmail } from '../lib/revisions/emailGenerator';

interface SupplierGapData {
  quoteId: string;
  supplierName: string;
  coveragePercent: number;
  itemsQuoted: number;
  totalItems: number;
  gapsCount: number;
  scopeGaps: Array<{
    system: string;
    category?: string;
    itemsCount: number;
    estimatedImpact: string;
    details: string[];
  }>;
}

interface RevisionRequestModalProps {
  projectId: string;
  projectName: string;
  clientName?: string;
  reportId?: string;
  suppliers: SupplierGapData[];
  onClose: () => void;
  onSuccess: (requestId: string) => void;
  onToast?: (message: string, type: 'success' | 'error') => void;
}

export default function RevisionRequestModal({
  projectId,
  projectName,
  clientName,
  reportId,
  suppliers,
  onClose,
  onSuccess,
  onToast
}: RevisionRequestModalProps) {
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set());
  const [deadline, setDeadline] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'select' | 'preview' | 'sending'>('select');
  const [emailPreviews, setEmailPreviews] = useState<Map<string, { subject: string; body: string }>>(new Map());
  const [generatingPreviews, setGeneratingPreviews] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [pdfQuantityDialog, setPdfQuantityDialog] = useState<{ supplier: SupplierGapData } | null>(null);

  useEffect(() => {
    const defaultDeadline = new Date();
    defaultDeadline.setDate(defaultDeadline.getDate() + 7);
    setDeadline(defaultDeadline.toISOString().split('T')[0]);

    // Auto-select suppliers with gaps > 0
    const autoSelect = new Set<string>();
    suppliers.forEach(s => {
      if (s.gapsCount > 0) {
        autoSelect.add(s.quoteId);
      }
    });
    setSelectedSuppliers(autoSelect);

    loadCurrentUser();
  }, [suppliers]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser(user);
    }
  };

  const toggleSupplier = (quoteId: string) => {
    const newSet = new Set(selectedSuppliers);
    if (newSet.has(quoteId)) {
      newSet.delete(quoteId);
    } else {
      newSet.add(quoteId);
    }
    setSelectedSuppliers(newSet);
  };

  const selectAll = () => {
    setSelectedSuppliers(new Set(suppliers.map(s => s.quoteId)));
  };

  const deselectAll = () => {
    setSelectedSuppliers(new Set());
  };

  const handlePreview = async () => {
    if (selectedSuppliers.size === 0) {
      onToast?.('Please select at least one supplier', 'error');
      return;
    }

    setGeneratingPreviews(true);
    const previews = new Map<string, { subject: string; body: string }>();

    const deadlineFormatted = new Date(deadline).toLocaleDateString('en-NZ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    for (const quoteId of Array.from(selectedSuppliers)) {
      const supplier = suppliers.find(s => s.quoteId === quoteId);
      if (!supplier) continue;

      try {
        const email = await generateRevisionRequestEmail({
          supplierName: supplier.supplierName,
          projectName,
          clientName,
          coveragePercent: supplier.coveragePercent,
          gapsCount: supplier.gapsCount,
          deadline: deadlineFormatted,
          scopeGaps: supplier.scopeGaps,
          senderName: currentUser?.user_metadata?.full_name,
          senderPosition: 'Quantity Surveyor',
          companyName: 'VerifyTrade'
        });

        previews.set(quoteId, email);
      } catch (error) {
        console.error(`Error generating email for ${supplier.supplierName}:`, error);
      }
    }

    setEmailPreviews(previews);
    setGeneratingPreviews(false);
    setStep('preview');
  };

  const handleDownloadPDF = (supplier: SupplierGapData) => {
    setPdfQuantityDialog({ supplier });
  };

  const generatePDF = (supplier: SupplierGapData, includeQuantities: boolean) => {
    const deadlineFormatted = new Date(deadline).toLocaleDateString('en-NZ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const html = generateSupplierGapReportHtml({
      supplierName: supplier.supplierName,
      projectName,
      clientName,
      coveragePercent: supplier.coveragePercent,
      itemsQuoted: supplier.itemsQuoted,
      totalItems: supplier.totalItems,
      gaps: supplier.scopeGaps,
      generatedDate: new Date().toLocaleDateString('en-NZ', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      deadline: deadlineFormatted,
      includeQuantities
    });

    downloadSupplierGapReport(html, supplier.supplierName, projectName);
    setPdfQuantityDialog(null);
    onToast?.(`PDF downloaded for ${supplier.supplierName}`, 'success');
  };

  const handleSend = async () => {
    if (!currentUser) {
      onToast?.('User not authenticated', 'error');
      return;
    }

    setLoading(true);
    setStep('sending');

    try {
      const { data: revisionRequest, error: requestError } = await supabase
        .from('revision_requests')
        .insert({
          project_id: projectId,
          award_report_id: reportId,
          requested_by_user_id: currentUser.id,
          deadline: new Date(deadline).toISOString(),
          status: 'pending',
          notes: `Revision request for ${selectedSuppliers.size} supplier(s)`
        })
        .select()
        .single();

      if (requestError) throw requestError;

      const supplierRecords = [];
      for (const quoteId of Array.from(selectedSuppliers)) {
        const supplier = suppliers.find(s => s.quoteId === quoteId);
        const email = emailPreviews.get(quoteId);
        if (!supplier || !email) continue;

        supplierRecords.push({
          revision_request_id: revisionRequest.id,
          quote_id: quoteId,
          supplier_name: supplier.supplierName,
          coverage_percent: supplier.coveragePercent,
          gaps_count: supplier.gapsCount,
          scope_gaps: supplier.scopeGaps,
          email_subject: email.subject,
          email_body: email.body,
          status: 'pending'
        });
      }

      const { error: suppliersError } = await supabase
        .from('revision_request_suppliers')
        .insert(supplierRecords);

      if (suppliersError) throw suppliersError;

      onToast?.(`Revision requests prepared for ${selectedSuppliers.size} supplier(s)`, 'success');
      onSuccess(revisionRequest.id);
    } catch (error: any) {
      console.error('Error creating revision requests:', error);
      onToast?.(error.message || 'Failed to create revision requests', 'error');
      setStep('preview');
    } finally {
      setLoading(false);
    }
  };

  const selectedSuppliersList = suppliers.filter(s => selectedSuppliers.has(s.quoteId));

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden border border-slate-700 relative">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-2xl font-bold text-white">Request Supplier Revisions</h2>
            <p className="text-slate-400 text-sm mt-1">
              {step === 'select' && 'Select suppliers and set deadline'}
              {step === 'preview' && 'Review and send revision requests'}
              {step === 'sending' && 'Sending revision requests...'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {step === 'select' && (
            <div className="space-y-6">
              {/* Compliance Notice */}
              <div className="bg-blue-900/20 border border-blue-600/50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="text-blue-400 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="text-blue-200 font-semibold mb-1">NZ Procurement Compliance</p>
                    <p className="text-blue-300 text-sm leading-relaxed">
                      This process complies with NZ Government Procurement Rules (Rule 40 - Post-tender clarifications).
                      Focus on scope completeness, not price negotiation. All suppliers receive equal opportunity for fair evaluation.
                    </p>
                  </div>
                </div>
              </div>

              {/* Deadline */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  <Calendar className="inline mr-2" size={16} />
                  Revision Deadline
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
                <p className="text-slate-400 text-xs mt-1">
                  Recommended: 5-7 days for sufficient response time (Rule 29)
                </p>
              </div>

              {/* Supplier Selection */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-slate-300">
                    Select Suppliers ({selectedSuppliers.size} of {suppliers.length} selected)
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAll}
                      className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                    >
                      Select All
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      onClick={deselectAll}
                      className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {suppliers.map(supplier => (
                    <div
                      key={supplier.quoteId}
                      onClick={() => toggleSupplier(supplier.quoteId)}
                      className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                        selectedSuppliers.has(supplier.quoteId)
                          ? 'bg-orange-900/20 border-orange-600'
                          : 'bg-slate-700/50 border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            selectedSuppliers.has(supplier.quoteId)
                              ? 'bg-orange-600 border-orange-600'
                              : 'border-slate-500'
                          }`}>
                            {selectedSuppliers.has(supplier.quoteId) && (
                              <CheckCircle2 size={14} className="text-white" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-white font-semibold">{supplier.supplierName}</p>
                            <div className="flex items-center gap-4 mt-1 text-sm">
                              <span className={`font-semibold ${
                                supplier.coveragePercent >= 90 ? 'text-green-400' :
                                supplier.coveragePercent >= 70 ? 'text-yellow-400' :
                                'text-red-400'
                              }`}>
                                {supplier.coveragePercent.toFixed(1)}% Coverage
                              </span>
                              <span className="text-slate-400">
                                {supplier.itemsQuoted} of {supplier.totalItems} items
                              </span>
                              <span className={`font-semibold ${
                                supplier.gapsCount === 0 ? 'text-green-400' : 'text-orange-400'
                              }`}>
                                {supplier.gapsCount === 0 ? 'No gaps' : `${supplier.gapsCount} gap${supplier.gapsCount !== 1 ? 's' : ''}`}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              <div className="bg-green-900/20 border border-green-600/50 rounded-lg p-4">
                <p className="text-green-200 text-sm">
                  <CheckCircle2 className="inline mr-2" size={16} />
                  Ready to send to {selectedSuppliers.size} supplier{selectedSuppliers.size !== 1 ? 's' : ''}
                </p>
              </div>

              {selectedSuppliersList.map(supplier => {
                const email = emailPreviews.get(supplier.quoteId);
                if (!email) return null;

                return (
                  <div key={supplier.quoteId} className="bg-slate-700/50 rounded-lg border border-slate-600 overflow-hidden">
                    <div className="p-4 border-b border-slate-600 bg-slate-700">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <User className="text-orange-400" size={20} />
                          <div>
                            <p className="text-white font-semibold">{supplier.supplierName}</p>
                            <p className="text-slate-400 text-sm">
                              {supplier.coveragePercent.toFixed(1)}% coverage • {supplier.gapsCount} gap{supplier.gapsCount !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDownloadPDF(supplier)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-md text-sm transition-colors"
                        >
                          <Download size={14} />
                          PDF
                        </button>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div>
                        <p className="text-slate-400 text-xs font-semibold mb-1">
                          <Mail className="inline mr-1" size={12} />
                          SUBJECT
                        </p>
                        <p className="text-white text-sm font-semibold">{email.subject}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs font-semibold mb-1">
                          <FileText className="inline mr-1" size={12} />
                          EMAIL BODY
                        </p>
                        <div className="bg-slate-800 rounded p-3 text-slate-300 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                          {email.body}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === 'sending' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-white font-semibold mb-2">Preparing revision requests...</p>
              <p className="text-slate-400 text-sm">This may take a moment</p>
            </div>
          )}
        </div>

        {/* PDF Quantity Selection Dialog */}
        {pdfQuantityDialog && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 rounded-lg">
            <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-md mx-6 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                <div>
                  <h3 className="text-white font-bold text-lg">PDF Report Options</h3>
                  <p className="text-slate-400 text-sm mt-0.5">{pdfQuantityDialog.supplier.supplierName}</p>
                </div>
                <button
                  onClick={() => setPdfQuantityDialog(null)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="px-6 py-5">
                <p className="text-slate-300 text-sm mb-5">
                  Choose whether to include quantities and estimated values for each scope gap in the report sent to the supplier.
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => generatePDF(pdfQuantityDialog.supplier, true)}
                    className="w-full flex items-center gap-4 p-4 bg-slate-700/60 hover:bg-slate-700 border-2 border-slate-600 hover:border-orange-500 rounded-xl transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-500/30 transition-colors">
                      <Hash size={20} className="text-orange-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">Include Quantities</p>
                      <p className="text-slate-400 text-xs mt-0.5">Show item counts and estimated values alongside each scope gap</p>
                    </div>
                  </button>
                  <button
                    onClick={() => generatePDF(pdfQuantityDialog.supplier, false)}
                    className="w-full flex items-center gap-4 p-4 bg-slate-700/60 hover:bg-slate-700 border-2 border-slate-600 hover:border-slate-400 rounded-xl transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-600/50 flex items-center justify-center flex-shrink-0 group-hover:bg-slate-600 transition-colors">
                      <EyeOff size={20} className="text-slate-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">Do Not Include Quantities</p>
                      <p className="text-slate-400 text-xs mt-0.5">Show only item descriptions — quantities and values are hidden</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-slate-700 bg-slate-800/50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <div className="flex gap-3">
            {step === 'select' && (
              <button
                onClick={handlePreview}
                disabled={selectedSuppliers.size === 0 || generatingPreviews}
                className="btn-primary"
              >
                {generatingPreviews ? 'Generating...' : 'Preview Emails →'}
              </button>
            )}
            {step === 'preview' && (
              <>
                <button
                  onClick={() => setStep('select')}
                  disabled={loading}
                  className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleSend}
                  disabled={loading}
                  className="btn-primary"
                >
                  <Mail className="inline mr-2" size={16} />
                  Prepare Requests
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
