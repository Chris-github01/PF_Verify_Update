import { useState } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PSSpendModalProps {
  allowance: {
    id: string;
    description: string;
    total: number;
    ps_cap?: number | null;
    ps_spend_to_date?: number;
    ps_conversion_rule?: string | null;
  };
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PSSpendModal({ allowance, projectId, onClose, onSuccess }: PSSpendModalProps) {
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState<string>('');
  const [evidenceNotes, setEvidenceNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  const cap = allowance.ps_cap || allowance.total;
  const spendToDate = allowance.ps_spend_to_date || 0;
  const remaining = cap - spendToDate;

  const handleSubmit = async () => {
    // Validation
    if (!amount || amount <= 0) {
      setError('Amount must be greater than zero');
      return;
    }
    if (!reference.trim()) {
      setError('Reference is required');
      return;
    }
    if (amount > remaining) {
      setError(`Amount exceeds remaining balance of $${remaining.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`);
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Update PS spend_to_date
      const newSpendToDate = spendToDate + amount;
      const { error: updateError } = await supabase
        .from('contract_allowances')
        .update({ ps_spend_to_date: newSpendToDate })
        .eq('id', allowance.id);

      if (updateError) throw updateError;

      // Create entry based on conversion rule
      const conversionRule = allowance.ps_conversion_rule || 'manual';

      if (conversionRule === 'variation') {
        // Generate variation number
        const { data: existingVariations } = await supabase
          .from('contract_variations')
          .select('variation_number')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(1);

        const lastNumber = existingVariations?.[0]?.variation_number?.match(/\d+$/)?.[0];
        const nextNumber = lastNumber ? parseInt(lastNumber) + 1 : 1;
        const variationNumber = `VAR-${String(nextNumber).padStart(3, '0')}`;

        const { error: variationError } = await supabase
          .from('contract_variations')
          .insert({
            project_id: projectId,
            allowance_id: allowance.id,
            variation_number: variationNumber,
            description: `PS Spend: ${allowance.description}`,
            amount,
            status: 'submitted',
            reference,
            evidence_notes: evidenceNotes,
            submitted_date: date
          });

        if (variationError) throw variationError;
      } else if (conversionRule === 'progress_claim') {
        // Generate claim number
        const { data: existingClaims } = await supabase
          .from('progress_claims')
          .select('claim_number')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(1);

        const lastNumber = existingClaims?.[0]?.claim_number?.match(/\d+$/)?.[0];
        const nextNumber = lastNumber ? parseInt(lastNumber) + 1 : 1;
        const claimNumber = `PC-${String(nextNumber).padStart(3, '0')}`;

        const { error: claimError } = await supabase
          .from('progress_claims')
          .insert({
            project_id: projectId,
            allowance_id: allowance.id,
            claim_number: claimNumber,
            description: `PS Spend: ${allowance.description}`,
            amount,
            claim_date: date,
            status: 'submitted',
            reference,
            evidence_notes: evidenceNotes
          });

        if (claimError) throw claimError;
      }
      // If 'manual', we just update ps_spend_to_date without creating a record

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error recording PS spend:', err);
      setError('Failed to record PS spend. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Record PS Spend</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* PS Info */}
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-2">
            <div className="text-sm text-slate-400">{allowance.description}</div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-slate-500">PS Value</div>
                <div className="text-white font-medium">
                  ${allowance.total.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Approved Spend</div>
                <div className="text-white font-medium">
                  ${spendToDate.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Remaining</div>
                <div className={`font-medium ${remaining < 0 ? 'text-red-400' : 'text-green-400'}`}>
                  ${remaining.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 flex items-start gap-2 text-sm text-red-300">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Amount <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                placeholder="0.00"
                step="0.01"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Reference (RFI / Site Instruction / NCR / Variation) <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                placeholder="e.g., RFI-001, SI-042, VAR-003"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Evidence Notes
              </label>
              <textarea
                value={evidenceNotes}
                onChange={(e) => setEvidenceNotes(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white min-h-[80px]"
                placeholder="Additional evidence or notes..."
              />
            </div>

            {allowance.ps_conversion_rule && allowance.ps_conversion_rule !== 'manual' && (
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3 text-sm text-blue-300">
                This spend will automatically create a {allowance.ps_conversion_rule === 'variation' ? 'Variation' : 'Progress Claim'} record.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {saving ? 'Recording...' : 'Record Spend'}
          </button>
        </div>
      </div>
    </div>
  );
}
