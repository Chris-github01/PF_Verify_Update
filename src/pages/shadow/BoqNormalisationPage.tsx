import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Play, Download, RefreshCw, AlertTriangle, Settings,
  ChevronDown, Info, Layers, CheckCircle2, Lock,
} from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import NormalisationAuditCards, { CommercialVerdictBanner } from '../../components/boq-normalisation/NormalisationAuditCards';
import DuplicationRiskTable from '../../components/boq-normalisation/DuplicationRiskTable';
import NormalisedBoqTable from '../../components/boq-normalisation/NormalisedBoqTable';
import SupplierSummaryPanel from '../../components/boq-normalisation/SupplierSummaryPanel';
import { runBoqNormalisation } from '../../lib/boq-normalisation/boqNormalisationEngine';
import { exportBoqNormalisationExcel } from '../../lib/boq-normalisation/boqNormalisationExport';
import type { BoqNormalisationResult, BoqNormalisationConfig } from '../../types/boqNormalisation.types';
import { DEFAULT_BOQ_NORMALISATION_CONFIG } from '../../types/boqNormalisation.types';
import { supabase } from '../../lib/supabase';

interface ProjectOption {
  id: string;
  name: string;
}

const TRADE_OPTIONS = [
  { value: 'passive_fire', label: 'Passive Fire' },
  { value: 'active_fire', label: 'Active Fire' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'electrical', label: 'Electrical' },
];

const TABS = ['Audit Summary', 'Normalised BOQ', 'Duplication Flags', 'Supplier Detail'] as const;
type TabType = typeof TABS[number];

export default function BoqNormalisationPage() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedTrade, setSelectedTrade] = useState<string>('passive_fire');
  const [activeTab, setActiveTab] = useState<TabType>('Audit Summary');
  const [result, setResult] = useState<BoqNormalisationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<BoqNormalisationConfig>(DEFAULT_BOQ_NORMALISATION_CONFIG);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(50);
      setProjects(data || []);
      if (data && data.length > 0) setSelectedProject(data[0].id);
    })();
  }, []);

  const handleRun = useCallback(async () => {
    if (!selectedProject) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await runBoqNormalisation(selectedProject, selectedTrade, config);
      setResult(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedProject, selectedTrade, config]);

  const handleExport = async () => {
    if (!result) return;
    setExporting(true);
    try {
      await exportBoqNormalisationExcel(result);
    } finally {
      setExporting(false);
    }
  };

  const supplierNames: Record<string, string> = {};
  result?.auditSummaries.forEach(s => {
    supplierNames[s.supplierId] = s.supplierName;
  });

  const totalFlags = result?.duplicationFlags.length || 0;
  const criticalFlags = result?.duplicationFlags.filter(f => f.severity === 'critical').length || 0;
  const highFlags = result?.duplicationFlags.filter(f => f.severity === 'high').length || 0;

  return (
    <ShadowLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
              <Layers className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white">BOQ Normalisation Engine</h1>
                <span className="text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Advisory Only
                </span>
              </div>
              <p className="text-gray-400 text-sm mt-0.5">
                Reconstructs a safe comparable BOQ · Flags duplication, overlap and quantity inflation risk
              </p>
            </div>
          </div>
          {result && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export Excel'}
            </button>
          )}
        </div>

        <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Project</label>
              <select
                value={selectedProject}
                onChange={e => setSelectedProject(e.target.value)}
                className="w-full bg-slate-700/60 border border-slate-600/60 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Trade</label>
              <select
                value={selectedTrade}
                onChange={e => setSelectedTrade(e.target.value)}
                className="w-full bg-slate-700/60 border border-slate-600/60 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
              >
                {TRADE_OPTIONS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleRun}
                disabled={loading || !selectedProject}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {loading ? 'Running...' : 'Run Normalisation'}
              </button>
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="p-2 text-slate-400 hover:text-slate-200 bg-slate-700/40 hover:bg-slate-700/60 rounded-lg transition-colors"
                title="Configuration"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {showConfig && (
            <div className="mt-4 pt-4 border-t border-slate-700/40 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { key: 'includeProvisionalInScenarioTotals', label: 'Include Provisional in Scenario Totals' },
                { key: 'mergeUnitEntryIntoGeneral', label: 'Merge Unit Entry into General' },
                { key: 'strictSystemConflictMode', label: 'Strict System Conflict Mode' },
              ].map(item => (
                <label key={item.key} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config[item.key as keyof BoqNormalisationConfig] as boolean}
                    onChange={e => setConfig(prev => ({ ...prev, [item.key]: e.target.checked }))}
                    className="mt-0.5 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/30"
                  />
                  <span className="text-xs text-slate-300">{item.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-red-400">Engine Error</div>
              <p className="text-sm text-slate-300 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {!result && !loading && !error && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-12 text-center">
            <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-slate-300 font-medium mb-2">Ready to Normalise</h3>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              Select a project and trade, then run the normalisation engine to reconstruct a safe comparable BOQ from parsed quote items.
            </p>
            <div className="mt-4 p-3 bg-slate-800/60 rounded-lg border border-slate-700/40 max-w-lg mx-auto text-left">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400">
                  This engine is <strong className="text-slate-300">advisory-only</strong>. It does not modify live parser outputs, shadow parser logic, raw parsed data, or supplier quote data in the database. All outputs are traceable, reproducible, and for commercial audit purposes only.
                </p>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-12 text-center">
            <RefreshCw className="w-10 h-10 text-blue-400 mx-auto mb-3 animate-spin" />
            <p className="text-slate-300 text-sm font-medium">Running BOQ Normalisation Engine...</p>
            <p className="text-slate-500 text-xs mt-1">Grouping penetration signatures · Applying deduplication rules · Building commercial flags</p>
          </div>
        )}

        {result && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Run ID: <span className="text-slate-400 font-mono">{result.runId}</span></span>
              <span>·</span>
              <span>{new Date(result.runAt).toLocaleString()}</span>
              <span>·</span>
              <span>{result.auditSummaries.length} supplier(s)</span>
              <span>·</span>
              <span>{result.normalizedLines.length} normalised lines</span>
              {totalFlags > 0 && (
                <>
                  <span>·</span>
                  <span className="text-orange-400">{totalFlags} flag(s)</span>
                  {criticalFlags > 0 && <span className="text-red-400">({criticalFlags} critical)</span>}
                </>
              )}
            </div>

            <NormalisationAuditCards summaries={result.auditSummaries} />
            <CommercialVerdictBanner summaries={result.auditSummaries} />

            <div className="flex items-center gap-1 border-b border-slate-700/60">
              {TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                  {tab === 'Duplication Flags' && totalFlags > 0 && (
                    <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium ${criticalFlags > 0 || highFlags > 0 ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>
                      {totalFlags}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'Audit Summary' && (
              <NormalisationAuditCards summaries={result.auditSummaries} />
            )}

            {activeTab === 'Normalised BOQ' && (
              <NormalisedBoqTable lines={result.normalizedLines} supplierNames={supplierNames} />
            )}

            {activeTab === 'Duplication Flags' && (
              <DuplicationRiskTable flags={result.duplicationFlags} supplierNames={supplierNames} />
            )}

            {activeTab === 'Supplier Detail' && (
              <SupplierSummaryPanel summaries={result.auditSummaries} />
            )}

            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-start gap-3">
                <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-amber-400 mb-1">Advisory Module — Shadow Admin Only</div>
                  <p className="text-xs text-slate-400">
                    This module is advisory-only and visible in Shadow Admin. It does not affect live award calculations, supplier quote data, or parser outputs. Safe BOQ totals are commercially indicative only and require QS review before informing award decisions. Normalization does not constitute a best tenderer recommendation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ShadowLayout>
  );
}
