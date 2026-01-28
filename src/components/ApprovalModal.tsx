import { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, Award, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { EnhancedSupplierMetrics } from '../lib/reports/awardReportEnhancements';
import { formatCurrency } from '../lib/reports/awardReportEnhancements';

interface ApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: string;
  projectId: string;
  organisationId: string;
  aiRecommendedSupplier: EnhancedSupplierMetrics;
  allSuppliers: EnhancedSupplierMetrics[];
  onApprovalComplete: (approvalId: string) => void;
  onToast?: (message: string, type: 'success' | 'error') => void;
  existingApprovalId?: string | null;
}

const OVERRIDE_REASONS = [
  { value: 'past_relationship', label: 'Past Relationship' },
  { value: 'not_variation_hungry', label: 'Does not actively pursue variations' },
  { value: 'proven_performance', label: 'Proven Performance' },
  { value: 'local_presence', label: 'Local Presence' },
  { value: 'schedule_certainty', label: 'Schedule Certainty' },
  { value: 'capacity_availability', label: 'Capacity & Availability' },
  { value: 'multiple_reasons', label: 'Multiple reasons (select below)' },
  { value: 'other', label: 'Other' },
];

export default function ApprovalModal({
  isOpen,
  onClose,
  reportId,
  projectId,
  organisationId,
  aiRecommendedSupplier,
  allSuppliers,
  onApprovalComplete,
  onToast,
  existingApprovalId,
}: ApprovalModalProps) {
  const [selectedSupplier, setSelectedSupplier] = useState<string>(aiRecommendedSupplier.supplierName);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [selectedMultipleReasons, setSelectedMultipleReasons] = useState<string[]>([]);
  const [overrideDetail, setOverrideDetail] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCloseScoreWarning, setShowCloseScoreWarning] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedSupplier(aiRecommendedSupplier.supplierName);
      setOverrideReason('');
      setSelectedMultipleReasons([]);
      setOverrideDetail('');

      // Check if scores are close (within 10 points)
      const sortedByScore = [...allSuppliers].sort((a, b) => b.weightedTotal - a.weightedTotal);
      if (sortedByScore.length >= 2) {
        const scoreDiff = sortedByScore[0].weightedTotal - sortedByScore[1].weightedTotal;
        setShowCloseScoreWarning(scoreDiff <= 10);
      }
    }
  }, [isOpen, aiRecommendedSupplier, allSuppliers]);

  if (!isOpen) return null;

  const isOverride = selectedSupplier !== aiRecommendedSupplier.supplierName;
  const selectedSupplierData = allSuppliers.find(s => s.supplierName === selectedSupplier);
  const scoreDifference = allSuppliers.length >= 2
    ? allSuppliers[0].weightedTotal - allSuppliers[1].weightedTotal
    : 0;

  // Debug logging
  console.log('🎯 ApprovalModal State:', {
    selectedSupplier,
    aiRecommended: aiRecommendedSupplier.supplierName,
    isOverride,
    hasSelectedSupplierData: !!selectedSupplierData,
    overrideReason,
    overrideDetail: overrideDetail.substring(0, 50) + '...'
  });

  const handleSubmit = async () => {
    // Validation
    if (!selectedSupplier) {
      onToast?.('Please select a supplier', 'error');
      return;
    }

    if (isOverride && !overrideReason) {
      onToast?.('Override reason is required when selecting a different supplier', 'error');
      return;
    }

    if (isOverride && overrideReason === 'multiple_reasons' && selectedMultipleReasons.length === 0) {
      onToast?.('Please select at least one reason when choosing "Multiple reasons"', 'error');
      return;
    }

    if (isOverride && !overrideDetail.trim()) {
      onToast?.('Please provide detailed explanation for the override', 'error');
      return;
    }

    try {
      setIsSubmitting(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Get the quote ID for the selected supplier
      console.log('🔍 Fetching quote for supplier:', selectedSupplier);

      // Try exact match first
      let { data: quoteData, error: quoteError } = await supabase
        .from('quotes')
        .select('id')
        .eq('project_id', projectId)
        .eq('supplier_name', selectedSupplier)
        .eq('is_latest', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // If exact match fails, try case-insensitive ILIKE
      if (!quoteData && !quoteError) {
        console.log('🔍 Trying case-insensitive match for supplier:', selectedSupplier);
        const ilikeSafeSupplier = selectedSupplier.replace(/[%_]/g, '\\$&');
        const result = await supabase
          .from('quotes')
          .select('id')
          .eq('project_id', projectId)
          .ilike('supplier_name', ilikeSafeSupplier)
          .eq('is_latest', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        quoteData = result.data;
        quoteError = result.error;
      }

      if (quoteError) {
        console.error('❌ Error fetching quote:', quoteError);
        throw new Error(`Failed to find quote for supplier: ${quoteError.message}`);
      }

      if (!quoteData) {
        console.error('❌ No quote found for supplier:', selectedSupplier);
        throw new Error(`No quote found for supplier "${selectedSupplier}". Please ensure quotes have been imported for this supplier.`);
      }

      console.log('✅ Quote data fetched:', quoteData);

      // Create or update approval record
      let approvalData;
      let approvalError;

      // Determine the final override reason category to save
      const finalOverrideReason = isOverride
        ? overrideReason === 'multiple_reasons'
          ? selectedMultipleReasons.join(', ')
          : overrideReason
        : null;

      const approvalRecord = {
        award_report_id: reportId,
        project_id: projectId,
        organisation_id: organisationId,
        ai_recommended_supplier: aiRecommendedSupplier.supplierName,
        final_approved_supplier: selectedSupplier,
        final_approved_quote_id: quoteData?.id || null,
        is_override: isOverride,
        override_reason_category: finalOverrideReason,
        override_reason_detail: isOverride ? overrideDetail : null,
        approved_by_user_id: user.id,
        weighted_score_difference: scoreDifference,
        metadata_json: {
          top_three_suppliers: allSuppliers.slice(0, 3).map(s => ({
            name: s.supplierName,
            score: s.weightedTotal,
            price: s.totalPrice,
            coverage: s.coveragePercent,
          })),
        },
      };

      // Check if an approval already exists for this report
      const { data: existingApprovals } = await supabase
        .from('award_approvals')
        .select('id, approved_by_user_id')
        .eq('award_report_id', reportId);

      console.log('📋 Existing approvals:', existingApprovals);

      let approvalResult;

      if (existingApprovals && existingApprovals.length > 0) {
        // Update existing approval
        const existingId = existingApprovals[0].id;
        console.log('🔄 Updating approval:', existingId);

        // Perform the update
        const { error: updateError } = await supabase
          .from('award_approvals')
          .update({
            final_approved_supplier: selectedSupplier,
            final_approved_quote_id: quoteData?.id || null,
            is_override: isOverride,
            override_reason_category: finalOverrideReason,
            override_reason_detail: isOverride ? overrideDetail : null,
            approved_at: new Date().toISOString(),
            weighted_score_difference: scoreDifference,
            metadata_json: approvalRecord.metadata_json,
          })
          .eq('id', existingId);

        if (updateError) {
          console.error('❌ Error updating approval:', updateError);
          throw updateError;
        }

        // Fetch the updated record separately
        approvalResult = await supabase
          .from('award_approvals')
          .select('*')
          .eq('id', existingId)
          .maybeSingle();

        if (approvalResult.error) {
          console.error('❌ Error fetching updated approval:', approvalResult.error);
          throw approvalResult.error;
        }

        if (!approvalResult.data) {
          throw new Error('Failed to fetch updated approval record');
        }

        approvalData = approvalResult.data;
        console.log('✅ Approval updated successfully:', approvalData.id);
      } else {
        // Insert new approval
        console.log('➕ Creating new approval');
        approvalResult = await supabase
          .from('award_approvals')
          .insert(approvalRecord)
          .select()
          .maybeSingle();

        if (approvalResult.error) {
          console.error('❌ Error creating approval:', approvalResult.error);
          throw approvalResult.error;
        }

        if (!approvalResult.data) {
          throw new Error('Failed to create approval record');
        }

        approvalData = approvalResult.data;
        console.log('✅ Approval created successfully:', approvalData.id);
      }

      // Update award_reports table
      const { error: reportUpdateError } = await supabase
        .from('award_reports')
        .update({
          approved_supplier_id: quoteData?.id || null,
          approved_at: new Date().toISOString(),
          approval_id: approvalData.id,
        })
        .eq('id', reportId);

      if (reportUpdateError) throw reportUpdateError;

      // Update the project's approved quote
      if (quoteData?.id) {
        await supabase
          .from('projects')
          .update({
            approved_quote_id: quoteData.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId);

        // Mark quote as accepted
        await supabase
          .from('quotes')
          .update({
            status: 'accepted',
            updated_at: new Date().toISOString(),
          })
          .eq('id', quoteData.id);
      }

      onToast?.(
        isOverride
          ? `Award approved with override: ${selectedSupplier}`
          : `Award approved: ${selectedSupplier}`,
        'success'
      );

      onApprovalComplete(approvalData.id);
      onClose();
    } catch (error: any) {
      console.error('Error submitting approval:', error);
      onToast?.(error.message || 'Failed to submit approval', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-2xl shadow-2xl border-2 border-slate-700 max-w-3xl w-full flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-orange-900/40 to-orange-800/20 border-b-2 border-orange-600/30 px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-orange-600 rounded-xl flex items-center justify-center">
                <Award className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Approve Award Decision</h2>
                <p className="text-sm text-orange-200 mt-1">
                  Finalize supplier selection with qualitative review
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-2"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* Close Score Warning */}
          {showCloseScoreWarning && (
            <div className="bg-yellow-900/20 border-l-4 border-yellow-600 rounded-r-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-yellow-300">Close Scores Detected</p>
                  <p className="text-sm text-yellow-200 mt-1">
                    The top suppliers have weighted scores within 10 points. Consider qualitative factors carefully.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* AI Recommendation Summary */}
          <div className="bg-blue-900/20 border-2 border-blue-600/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-6 h-6 text-blue-400" />
              <h3 className="text-lg font-bold text-white">AI Recommendation</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-400 mb-1">Recommended Supplier</p>
                <p className="text-xl font-bold text-blue-300">{aiRecommendedSupplier.supplierName}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Weighted Score</p>
                <p className="text-xl font-bold text-blue-300">{aiRecommendedSupplier.weightedTotal.toFixed(1)}/100</p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Total Price</p>
                <p className="text-lg font-semibold text-white">{formatCurrency(aiRecommendedSupplier.totalPrice)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Coverage</p>
                <p className="text-lg font-semibold text-white">{aiRecommendedSupplier.coveragePercent.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          {/* Supplier Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-3">
              Select Final Supplier to Approve *
            </label>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              {allSuppliers.map((supplier) => (
                <option key={supplier.supplierName} value={supplier.supplierName}>
                  {supplier.supplierName} - Score: {supplier.weightedTotal.toFixed(1)} - {formatCurrency(supplier.totalPrice)}
                </option>
              ))}
            </select>
          </div>

          {/* Override Warning Banner */}
          {isOverride && (
            <div className="bg-yellow-600/20 border-2 border-yellow-500 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-bold text-yellow-300 mb-1">⚠️ OVERRIDE DETECTED</p>
                  <p className="text-sm text-yellow-200">
                    You are selecting <span className="font-bold">{selectedSupplier}</span> instead of the AI-recommended supplier <span className="font-bold">{aiRecommendedSupplier.supplierName}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Selected Supplier Details */}
          {selectedSupplierData && (
            <div className={`border-2 rounded-xl p-6 ${
              isOverride
                ? 'border-yellow-600/50 bg-yellow-900/10'
                : 'border-green-600/50 bg-green-900/10'
            }`}>
              <div className="flex items-center gap-3 mb-4">
                {isOverride ? (
                  <>
                    <AlertTriangle className="w-6 h-6 text-yellow-500" />
                    <h3 className="text-lg font-bold text-yellow-300">Override Selection</h3>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-6 h-6 text-green-500" />
                    <h3 className="text-lg font-bold text-green-300">Confirming AI Recommendation</h3>
                  </>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-slate-400 mb-1">Price Score</p>
                  <p className="font-bold text-white">{selectedSupplierData.priceScore.toFixed(1)}/10</p>
                </div>
                <div>
                  <p className="text-slate-400 mb-1">Compliance</p>
                  <p className="font-bold text-white">{selectedSupplierData.complianceScore.toFixed(1)}/10</p>
                </div>
                <div>
                  <p className="text-slate-400 mb-1">Risk Score</p>
                  <p className="font-bold text-white">{selectedSupplierData.riskMitigationScore.toFixed(1)}/10</p>
                </div>
              </div>
            </div>
          )}

          {/* Override Reason (only if different from AI) */}
          {isOverride && (
            <div className="space-y-4 bg-yellow-900/20 border-2 border-yellow-600/60 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-yellow-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-bold text-yellow-300 text-lg">Override Justification Required</p>
                  <p className="text-sm text-yellow-200/80">You must provide a reason for selecting a different supplier</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Override Reason Category *
                </label>
                <select
                  value={overrideReason}
                  onChange={(e) => {
                    setOverrideReason(e.target.value);
                    // Reset multiple selections when changing primary reason
                    if (e.target.value !== 'multiple_reasons') {
                      setSelectedMultipleReasons([]);
                    }
                  }}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  required
                >
                  <option value="">Select a reason...</option>
                  {OVERRIDE_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Multiple Reasons Checkboxes */}
              {overrideReason === 'multiple_reasons' && (
                <div className="bg-slate-800/50 border border-slate-600 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-slate-300 mb-3">
                    Select all applicable reasons *
                  </label>
                  <div className="space-y-2">
                    {OVERRIDE_REASONS.filter(r => r.value !== 'multiple_reasons' && r.value !== 'other').map((reason) => (
                      <label
                        key={reason.value}
                        className="flex items-center gap-3 p-2 rounded hover:bg-slate-700/50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMultipleReasons.includes(reason.value)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMultipleReasons([...selectedMultipleReasons, reason.value]);
                            } else {
                              setSelectedMultipleReasons(selectedMultipleReasons.filter(r => r !== reason.value));
                            }
                          }}
                          className="w-4 h-4 text-yellow-600 bg-slate-700 border-slate-500 rounded focus:ring-yellow-500 focus:ring-2"
                        />
                        <span className="text-sm text-slate-300">{reason.label}</span>
                      </label>
                    ))}
                  </div>
                  {selectedMultipleReasons.length > 0 && (
                    <p className="text-xs text-green-400 mt-3">
                      {selectedMultipleReasons.length} reason{selectedMultipleReasons.length !== 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Detailed Explanation *
                </label>
                <textarea
                  value={overrideDetail}
                  onChange={(e) => setOverrideDetail(e.target.value)}
                  placeholder="Provide specific reasons for overriding the AI recommendation..."
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none"
                  required
                />
                <p className="text-xs text-slate-400 mt-2">
                  This explanation will be included in the audit trail and PDF export.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-slate-800 border-t-2 border-slate-700 px-8 py-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">
              {isOverride ? (
                <span className="text-yellow-400">
                  <strong>Override:</strong> You are selecting a different supplier than recommended by Verify+
                </span>
              ) : (
                <span className="text-green-400">
                  <strong>Confirmed:</strong> You are approving the Verify+ recommendation
                </span>
              )}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="px-6 py-3 border-2 border-slate-600 bg-slate-700/50 text-slate-200 rounded-lg hover:bg-slate-700 transition-colors font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || (isOverride && (!overrideReason || !overrideDetail.trim()))}
                className="px-8 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Submitting...' : 'Approve Award'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
