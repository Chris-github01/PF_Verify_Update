import { useState, useEffect } from 'react';
import { Lightbulb, ChevronDown } from 'lucide-react';
import ShadowLayout from '../../../components/shadow/ShadowLayout';
import RecommendationsTable from '../../../components/shadow/phase2/RecommendationsTable';
import { supabase } from '../../../lib/supabase';

interface ModuleOption {
  module_key: string;
  display_name: string;
}

export default function ShadowRecommendationsPage() {
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [selectedModule, setSelectedModule] = useState<string | undefined>(undefined);

  useEffect(() => {
    supabase
      .from('shadow_modules')
      .select('module_key, display_name')
      .eq('is_active', true)
      .order('display_name')
      .then(({ data }) => {
        if (data) setModules(data as ModuleOption[]);
      });
  }, []);

  return (
    <ShadowLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Lightbulb className="w-5 h-5 text-amber-400" />
              <h1 className="text-xl font-bold text-white">Improvement Recommendations</h1>
            </div>
            <p className="text-sm text-gray-500 max-w-xl">
              Ranked actionable recommendations generated from shadow run failure patterns, supplier fingerprints, and human adjudication signals. Generate new recommendations to refresh from latest evidence.
            </p>
          </div>
        </div>

        {/* Module filter */}
        {modules.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600">Filter by module:</span>
            <div className="relative">
              <select
                value={selectedModule ?? ''}
                onChange={(e) => setSelectedModule(e.target.value || undefined)}
                className="appearance-none bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white pr-8 cursor-pointer"
              >
                <option value="">All Modules</option>
                {modules.map((m) => (
                  <option key={m.module_key} value={m.module_key}>{m.display_name}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Recommendation table */}
        <RecommendationsTable
          moduleKey={selectedModule}
          showGenerateButton={!!selectedModule}
        />
      </div>
    </ShadowLayout>
  );
}
