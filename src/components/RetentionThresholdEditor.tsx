import { useState } from 'react';
import { Plus, Trash2, Save, X } from 'lucide-react';

export interface RetentionTier {
  threshold_nzd: number | null;
  rate_percent: number;
}

interface RetentionThresholdEditorProps {
  tiers: RetentionTier[];
  onChange: (tiers: RetentionTier[]) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export function RetentionThresholdEditor({
  tiers,
  onChange,
  onSave,
  onCancel,
  isSaving = false
}: RetentionThresholdEditorProps) {
  const [localTiers, setLocalTiers] = useState<RetentionTier[]>(
    tiers.length > 0 ? tiers : [
      { threshold_nzd: 100000, rate_percent: 5 },
      { threshold_nzd: 500000, rate_percent: 3 },
      { threshold_nzd: null, rate_percent: 2 }
    ]
  );

  const handleAddTier = () => {
    const newTier: RetentionTier = {
      threshold_nzd: localTiers.length > 0 ? (localTiers[localTiers.length - 2]?.threshold_nzd ?? 0) + 100000 : 100000,
      rate_percent: 3
    };
    const updatedTiers = [...localTiers];
    updatedTiers.splice(updatedTiers.length - 1, 0, newTier);
    setLocalTiers(updatedTiers);
    onChange(updatedTiers);
  };

  const handleRemoveTier = (index: number) => {
    if (localTiers.length <= 2) return;
    const updatedTiers = localTiers.filter((_, i) => i !== index);
    setLocalTiers(updatedTiers);
    onChange(updatedTiers);
  };

  const handleUpdateTier = (index: number, field: 'threshold_nzd' | 'rate_percent', value: number | null) => {
    const updatedTiers = [...localTiers];
    updatedTiers[index] = { ...updatedTiers[index], [field]: value };
    setLocalTiers(updatedTiers);
    onChange(updatedTiers);
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return 'Above';
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/50 rounded-lg border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/50 border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-300">
                  Contract Value Band (NZD)
                </th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-300">
                  Retention %
                </th>
                <th className="w-16 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {localTiers.map((tier, index) => (
                <tr key={index} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    {index === localTiers.length - 1 ? (
                      <div className="text-sm text-slate-300 font-medium">
                        Above {formatCurrency(localTiers[index - 1]?.threshold_nzd ?? 0)}
                      </div>
                    ) : index === 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-400">Up to</span>
                        <input
                          type="number"
                          value={tier.threshold_nzd ?? 0}
                          onChange={(e) => handleUpdateTier(index, 'threshold_nzd', parseFloat(e.target.value) || 0)}
                          className="w-32 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                          step="10000"
                          min="0"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-400">
                          {formatCurrency(localTiers[index - 1]?.threshold_nzd ?? 0)}
                        </span>
                        <span className="text-slate-500">–</span>
                        <input
                          type="number"
                          value={tier.threshold_nzd ?? 0}
                          onChange={(e) => handleUpdateTier(index, 'threshold_nzd', parseFloat(e.target.value) || 0)}
                          className="w-32 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                          step="10000"
                          min="0"
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={tier.rate_percent}
                        onChange={(e) => handleUpdateTier(index, 'rate_percent', parseFloat(e.target.value) || 0)}
                        className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                        step="0.5"
                        min="0"
                        max="10"
                      />
                      <span className="text-slate-400 text-sm">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {index !== localTiers.length - 1 && localTiers.length > 2 && (
                      <button
                        onClick={() => handleRemoveTier(index)}
                        className="p-1 text-red-400 hover:text-red-300"
                        title="Remove tier"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={handleAddTier}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add Threshold Band
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <X size={16} />
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save Thresholds'}
          </button>
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <p className="text-sm text-blue-300">
          <span className="font-semibold">Note:</span> Retention is calculated progressively (marginal bands), not retrospectively.
          Each band applies only to the amount within that range.
        </p>
      </div>
    </div>
  );
}
