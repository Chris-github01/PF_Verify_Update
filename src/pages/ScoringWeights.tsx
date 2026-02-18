import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Edit, Info, TrendingDown, Shield, Target, AlertTriangle, Check } from 'lucide-react';
import DashboardHeader from '../components/DashboardHeader';
import ScoringWeightsEditor from '../components/ScoringWeightsEditor';

interface ScoringWeights {
  price_weight: number;
  technical_weight: number;
  scope_weight: number;
  delivery_weight: number;
}

interface SelectedQuote {
  quote_id: string;
  supplier_name: string;
  total_amount: number;
  status: string;
  has_reference: boolean;
}

interface ScoringWeightsProps {
  projectId?: string | null;
  projectName?: string;
}

export default function ScoringWeights({ projectId, projectName: initialProjectName }: ScoringWeightsProps) {
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState(initialProjectName || '');
  const [weights, setWeights] = useState<ScoringWeights>({
    price_weight: 60,
    technical_weight: 10,
    scope_weight: 15,
    delivery_weight: 15
  });
  const [selectedQuotes, setSelectedQuotes] = useState<SelectedQuote[]>([]);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    loadData();
  }, [projectId]);

  async function loadData() {
    if (!projectId) {
      setLoading(false);
      return;
    }

    try {
      const { data: project } = await supabase
        .from('projects')
        .select('name, price_weight, technical_weight, scope_weight, delivery_weight')
        .eq('id', projectId)
        .single();

      if (project) {
        setProjectName(project.name);
        if (project.price_weight !== null) {
          setWeights({
            price_weight: project.price_weight,
            technical_weight: project.technical_weight,
            scope_weight: project.scope_weight,
            delivery_weight: project.delivery_weight
          });
        }
      }

      const { data: quotes } = await supabase
        .from('quotes')
        .select(`
          id,
          supplier:suppliers(name),
          total_amount,
          parse_status
        `)
        .eq('project_id', projectId)
        .eq('is_selected', true)
        .order('created_at', { ascending: false });

      if (quotes) {
        setSelectedQuotes(quotes.map(q => ({
          quote_id: q.id,
          supplier_name: q.supplier?.name || 'Unknown',
          total_amount: q.total_amount || 0,
          status: q.parse_status === 'completed' ? 'Ready' : 'Processing',
          has_reference: Math.random() > 0.5
        })));
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleWeightsUpdate(newWeights: ScoringWeights) {
    try {
      const { error } = await supabase
        .from('projects')
        .update(newWeights)
        .eq('id', projectId);

      if (error) throw error;

      setWeights(newWeights);
      setEditMode(false);
    } catch (error) {
      console.error('Error updating weights:', error);
      alert('Failed to update weights');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const scoringCards = [
    {
      title: 'Price & Cost Certainty',
      description: 'Inverse linear scaling. Lowest price = 10 points.',
      weight: weights.price_weight,
      recommended: 45,
      icon: TrendingDown,
      color: 'orange',
      borderColor: 'border-orange-600',
      bgColor: 'bg-orange-950/40',
      textColor: 'text-orange-400',
      iconBg: 'bg-orange-900'
    },
    {
      title: 'Technical Compliance',
      description: 'Based on specification adherence and risk factors.',
      weight: weights.technical_weight,
      recommended: 20,
      icon: Shield,
      color: 'blue',
      borderColor: 'border-blue-600',
      bgColor: 'bg-blue-950/40',
      textColor: 'text-blue-400',
      iconBg: 'bg-blue-900'
    },
    {
      title: 'Scope Coverage',
      description: 'Percentage of baseline items quoted by supplier.',
      weight: weights.scope_weight,
      recommended: 25,
      icon: Target,
      color: 'green',
      borderColor: 'border-green-600',
      bgColor: 'bg-green-950/40',
      textColor: 'text-green-400',
      iconBg: 'bg-green-900'
    },
    {
      title: 'Delivery & Risk',
      description: 'Based on missing items and risk flags identified.',
      weight: weights.delivery_weight,
      recommended: 10,
      icon: AlertTriangle,
      color: 'red',
      borderColor: 'border-red-600',
      bgColor: 'bg-red-950/40',
      textColor: 'text-red-400',
      iconBg: 'bg-red-900'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-900">
      <DashboardHeader
        title="Scoring & Weighting Criteria"
        subtitle="Multi-Criteria Decision Analysis (MCDA) - Customize award evaluation weights"
        projectName={projectName}
      />

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Edit Weights Button */}
        <div className="flex justify-end">
          <button
            onClick={() => setEditMode(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            Edit Weights
          </button>
        </div>

        {/* How Scoring Works */}
        <div className="bg-blue-950/30 border border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-blue-300 mb-1">How Scoring Works</h3>
              <p className="text-sm text-blue-400">
                Each supplier is evaluated across four key dimensions with weighted scoring to identify the optimal choice.
                These weights are applied across all award reports and recommendations throughout the workflow.
              </p>
            </div>
          </div>
        </div>

        {/* Scoring Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {scoringCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className={`${card.bgColor} border ${card.borderColor} rounded-lg p-6`}
              >
                <div className="flex items-start gap-4">
                  <div className={`${card.iconBg} rounded-lg p-3`}>
                    <Icon className={`w-6 h-6 ${card.textColor}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold mb-1">{card.title}</h3>
                    <p className="text-sm text-gray-400 mb-4">{card.description}</p>
                    <div className="text-center">
                      <div className={`text-5xl font-bold ${card.textColor} mb-2`}>
                        {card.weight}%
                      </div>
                      <div className="text-xs text-gray-500">
                        Recommended: {card.recommended}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Quotes Section */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-orange-900 rounded-lg p-2">
              <Check className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Selected Quotes</h2>
              <p className="text-sm text-gray-400">{selectedQuotes.length} quotes ready for review</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {selectedQuotes.map((quote) => (
              <div
                key={quote.quote_id}
                className="bg-gray-900 border border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-white font-semibold">{quote.supplier_name}</h3>
                    <p className="text-xs text-gray-500">
                      {quote.has_reference ? 'No reference' : 'Reference available'}
                    </p>
                  </div>
                  <button className="text-gray-500 hover:text-gray-400">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-2xl font-bold text-white">
                    ${quote.total_amount.toLocaleString('en-NZ', { minimumFractionDigits: 1 })}
                  </div>
                  <span className="px-2 py-1 bg-green-900 text-green-300 text-xs font-semibold rounded">
                    {quote.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editMode && (
        <ScoringWeightsEditor
          currentWeights={weights}
          onSave={handleWeightsUpdate}
          onCancel={() => setEditMode(false)}
        />
      )}
    </div>
  );
}
