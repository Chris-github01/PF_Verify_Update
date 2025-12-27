import { useState, useEffect } from 'react';
import { Edit2, Check, X, Info, TrendingDown, Shield, Target, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ScoringWeights {
  price: number;
  compliance: number;
  coverage: number;
  risk: number;
}

interface ScoringWeightsEditorProps {
  projectId: string;
  onWeightsChanged?: (weights: ScoringWeights) => void;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  price: 60,
  compliance: 10,
  coverage: 15,
  risk: 15,
};

const RECOMMENDED_WEIGHTS: ScoringWeights = {
  price: 60,
  compliance: 10,
  coverage: 15,
  risk: 15,
};

export default function ScoringWeightsEditor({ projectId, onWeightsChanged }: ScoringWeightsEditorProps) {
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [isEditing, setIsEditing] = useState(false);
  const [editWeights, setEditWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadWeights();
  }, [projectId]);

  const loadWeights = async () => {
    const { data } = await supabase
      .from('projects')
      .select('scoring_weights')
      .eq('id', projectId)
      .maybeSingle();

    if (data?.scoring_weights) {
      const customWeights = data.scoring_weights as ScoringWeights;
      setWeights(customWeights);
      setEditWeights(customWeights);
    } else {
      setWeights(DEFAULT_WEIGHTS);
      setEditWeights(DEFAULT_WEIGHTS);
    }
  };

  const handleEdit = () => {
    setEditWeights(weights);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditWeights(weights);
    setIsEditing(false);
  };

  const handleSave = async () => {
    // Validate that weights sum to 100
    const total = editWeights.price + editWeights.compliance + editWeights.coverage + editWeights.risk;
    if (Math.abs(total - 100) > 0.01) {
      alert('Weights must sum to exactly 100%');
      return;
    }

    // Validate each weight is between 0 and 100
    if (Object.values(editWeights).some(w => w < 0 || w > 100)) {
      alert('Each weight must be between 0% and 100%');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ scoring_weights: editWeights })
        .eq('id', projectId);

      if (!error) {
        setWeights(editWeights);
        setIsEditing(false);
        if (onWeightsChanged) {
          onWeightsChanged(editWeights);
        }
      } else {
        alert('Failed to save weights');
      }
    } catch (error) {
      console.error('Error saving weights:', error);
      alert('Failed to save weights');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Reset to recommended weights (60/10/15/15)?')) {
      setEditWeights(DEFAULT_WEIGHTS);
    }
  };

  const totalWeight = editWeights.price + editWeights.compliance + editWeights.coverage + editWeights.risk;
  const isValidTotal = Math.abs(totalWeight - 100) < 0.01;

  const criteriaData = [
    {
      key: 'price' as keyof ScoringWeights,
      label: 'Price Competitiveness',
      icon: TrendingDown,
      color: 'orange',
      description: 'Inverse linear scaling. Lowest price = 10 points.',
    },
    {
      key: 'compliance' as keyof ScoringWeights,
      label: 'Technical Compliance',
      icon: Shield,
      color: 'blue',
      description: 'Based on specification adherence and risk factors.',
    },
    {
      key: 'coverage' as keyof ScoringWeights,
      label: 'Scope Coverage',
      icon: Target,
      color: 'green',
      description: 'Percentage of baseline items quoted by supplier.',
    },
    {
      key: 'risk' as keyof ScoringWeights,
      label: 'Risk Assessment',
      icon: AlertTriangle,
      color: 'red',
      description: 'Based on missing items and risk flags identified.',
    },
  ];

  return (
    <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-xl shadow-lg border border-slate-700/50">
      <div className="border-b border-slate-700/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
              Scoring & Weighting Criteria
            </h3>
            <p className="text-sm text-slate-400">
              Multi-Criteria Decision Analysis (MCDA) - Customize award evaluation weights
            </p>
          </div>
          {!isEditing && (
            <button
              onClick={handleEdit}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all font-medium"
            >
              <Edit2 size={16} />
              Edit Weights
            </button>
          )}
          {isEditing && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="px-3 py-2 text-slate-400 hover:text-white transition-all text-sm"
              >
                Reset to Default
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all"
              >
                <X size={16} />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!isValidTotal || saving}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <Check size={16} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        <div className="mb-4 bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-300">
              <p className="font-medium mb-1">How Scoring Works</p>
              <p className="text-blue-300/80">
                Each supplier is evaluated across four key dimensions with weighted scoring to identify the optimal choice.
                These weights are applied across all award reports and recommendations throughout the workflow.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {criteriaData.map((criteria) => {
            const Icon = criteria.icon;
            const currentWeight = isEditing ? editWeights[criteria.key] : weights[criteria.key];

            const colorClasses = {
              orange: 'border-orange-500/50 bg-orange-900/20',
              blue: 'border-blue-500/50 bg-blue-900/20',
              green: 'border-green-500/50 bg-green-900/20',
              red: 'border-red-500/50 bg-red-900/20',
            }[criteria.color];

            const iconColorClasses = {
              orange: 'text-orange-400',
              blue: 'text-blue-400',
              green: 'text-green-400',
              red: 'text-red-400',
            }[criteria.color];

            return (
              <div
                key={criteria.key}
                className={`rounded-lg border ${colorClasses} p-4 transition-all ${
                  isEditing ? 'hover:shadow-md' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-slate-800/50 ${iconColorClasses}`}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">{criteria.label}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">{criteria.description}</p>
                    </div>
                  </div>
                </div>

                {isEditing ? (
                  <div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={editWeights[criteria.key]}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setEditWeights({ ...editWeights, [criteria.key]: value });
                        }}
                        className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white font-bold text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-white font-bold text-xl">%</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500 italic">
                      Recommended: {RECOMMENDED_WEIGHTS[criteria.key]}%
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className={`text-4xl font-bold ${iconColorClasses}`}>
                      {currentWeight}%
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Recommended: {RECOMMENDED_WEIGHTS[criteria.key]}%
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && (
          <div className={`mt-4 p-4 rounded-lg border-2 ${
            isValidTotal
              ? 'bg-green-900/20 border-green-500/50'
              : 'bg-red-900/20 border-red-500/50'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Total Weight:</span>
              <span className={`text-2xl font-bold ${
                isValidTotal ? 'text-green-400' : 'text-red-400'
              }`}>
                {totalWeight.toFixed(1)}%
              </span>
            </div>
            {!isValidTotal && (
              <p className="text-sm text-red-300 mt-2">
                ⚠️ Weights must sum to exactly 100% (currently {totalWeight.toFixed(1)}%)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
