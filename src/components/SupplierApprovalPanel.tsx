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
  onApprovalComplete: () => void;
}

export default function SupplierApprovalPanel({
  projectId,
  supplierName,
  supplierQuoteId,
  totalValue,
  isApproved,
  onApprovalComplete,
}: SupplierApprovalPanelProps) {
  const [approving, setApproving] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({
          approved_quote_id: supplierQuoteId,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId);

      if (error) {
        console.error('Error approving supplier:', error);
        alert('Failed to approve supplier. Please try again.');
        return;
      }

      onApprovalComplete();
    } catch (error) {
      console.error('Error approving supplier:', error);
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
