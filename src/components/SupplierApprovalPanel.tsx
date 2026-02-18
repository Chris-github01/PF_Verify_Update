import { useState } from 'react';
import { CheckCircle, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SupplierApprovalPanelProps {
  projectId: string;
  reportId: string;
  supplierName: string;
  supplierQuoteId: string;
  totalValue: number;
  isApproved: boolean;
  aiRecommendedSupplier?: string; // The AI's top recommendation
  onApprovalComplete: () => void;
}

export default function SupplierApprovalPanel({
  projectId,
  reportId,
  supplierName,
  supplierQuoteId,
  totalValue,
  isApproved,
  aiRecommendedSupplier,
  onApprovalComplete,
}: SupplierApprovalPanelProps) {
  const [approving, setApproving] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    try {
      console.log('[SupplierApproval] Starting approval process...', {
        projectId,
        supplierQuoteId,
        supplierName
      });

      // Get project and quote details
      const { data: project } = await supabase
        .from('projects')
        .select('organisation_id, trade')
        .eq('id', projectId)
        .single();

      const { data: quote } = await supabase
        .from('quotes')
        .select('supplier_id')
        .eq('id', supplierQuoteId)
        .single();

      if (!project || !quote) {
        alert('Failed to fetch project or quote details.');
        return;
      }

      console.log('[SupplierApproval] Project and quote details:', { project, quote });

      // Get current user for approval tracking
      const { data: { user } } = await supabase.auth.getUser();

      // Check if award_report exists, if not create a minimal one
      let awardReportId = reportId;
      if (!reportId) {
        console.log('[SupplierApproval] No reportId provided, creating minimal award report');
        const { data: newReport, error: reportError } = await supabase
          .from('award_reports')
          .insert({
            project_id: projectId,
            organisation_id: project.organisation_id,
            created_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (reportError || !newReport) {
          console.error('[SupplierApproval] Error creating award report:', reportError);
          alert('Failed to create award report. Please try again.');
          return;
        }
        awardReportId = newReport.id;
      }

      // Create or update award approval record
      const { data: existingApproval } = await supabase
        .from('award_approvals')
        .select('id')
        .eq('project_id', projectId)
        .maybeSingle();

      const aiRecommended = aiRecommendedSupplier || supplierName; // Fallback to approved supplier if AI recommendation not provided

      if (existingApproval) {
        console.log('[SupplierApproval] Updating existing award approval:', existingApproval.id);

        // Update existing approval
        const { error: updateError } = await supabase
          .from('award_approvals')
          .update({
            final_approved_supplier: supplierName,
            final_approved_quote_id: supplierQuoteId,
            approved_by_user_id: user?.id,
            approved_at: new Date().toISOString(),
            is_override: aiRecommended !== supplierName
          })
          .eq('id', existingApproval.id);

        if (updateError) {
          console.error('[SupplierApproval] Error updating award approval:', updateError);
          alert('Failed to update award approval. Please try again.');
          return;
        }
      } else {
        console.log('[SupplierApproval] Creating new award approval record');

        // Create new approval
        const { error: insertError } = await supabase
          .from('award_approvals')
          .insert({
            award_report_id: awardReportId,
            project_id: projectId,
            organisation_id: project.organisation_id,
            ai_recommended_supplier: aiRecommended,
            final_approved_supplier: supplierName,
            final_approved_quote_id: supplierQuoteId,
            approved_by_user_id: user?.id,
            approved_at: new Date().toISOString(),
            is_override: aiRecommended !== supplierName
          });

        if (insertError) {
          console.error('[SupplierApproval] Error creating award approval:', insertError);
          alert('Failed to create award approval. Please try again.');
          return;
        }
      }

      // Also update the projects table for backwards compatibility
      const { error: projectError } = await supabase
        .from('projects')
        .update({
          approved_quote_id: supplierQuoteId,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId);

      if (projectError) {
        console.error('[SupplierApproval] Error updating project:', projectError);
        alert('Failed to update project. Please try again.');
        return;
      }

      console.log('[SupplierApproval] ✅ Approval complete');
      onApprovalComplete();
    } catch (error) {
      console.error('[SupplierApproval] Error approving supplier:', error);
      alert('Failed to approve supplier. Please try again.');
    } finally {
      setApproving(false);
    }
  };

  if (isApproved) {
    return (
      <div className="bg-green-50 border-2 border-green-600 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-600" />
          <div>
            <h3 className="text-lg font-semibold text-green-900">
              {supplierName} Approved
            </h3>
            <p className="text-sm text-green-700">
              Contract value: ${totalValue.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-blue-900">
              Ready to Approve {supplierName}?
            </h3>
            <p className="text-sm text-blue-700">
              Contract value: ${totalValue.toLocaleString()}
            </p>
          </div>
        </div>
        <button
          onClick={handleApprove}
          disabled={approving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {approving ? 'Approving...' : 'Approve Supplier'}
        </button>
      </div>
    </div>
  );
}
