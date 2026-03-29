import React, { useState, useCallback } from 'react';
import { TrendingUp, ChevronDown, ChevronUp, RefreshCw, Shield, AlertCircle } from 'lucide-react';
import type { VariationRiskInputData, VariationRiskRunResult } from '../../lib/variation-risk/variationRiskTypes';
import { runVariationRiskPredictor } from '../../lib/variation-risk/variationRiskOrchestrator';
import { persistVariationRiskRun } from '../../lib/variation-risk/variationRiskPersistenceService';
import VariationRiskDecisionCard from './VariationRiskDecisionCard';
import SupplierVariationRiskComparison from './SupplierVariationRiskComparison';
import RiskDriverPanel from './RiskDriverPanel';
import RiskAdjustedRankingPanel from './RiskAdjustedRankingPanel';
import RecommendationImpactBanner from './RecommendationImpactBanner';

interface Props {
  projectId: string;
  trade: string;
  suppliers: VariationRiskInputData[];
  userId?: string;
  onRiskResultReady?: (result: VariationRiskRunResult) => void;
}

export default function VariationRiskPanel({
  projectId,
  trade,
  suppliers,
  userId,
  onRiskResultReady,
}: Props) {
  const [result, setResult] = useState<VariationRiskRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('comparison');
  const [selectedSupplierForDrivers, setSelectedSupplierForDrivers] = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    if (suppliers.length === 0) {
      setError('No supplier data available to run variation risk analysis.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const runResult = await runVariationRiskPredictor({
        project_id: projectId,
        trade,
        suppliers,
        run_by_user_id: userId,
      });

      setResult(runResult);

      if (runResult.supplier_results.length > 0) {
        setSelectedSupplierForDrivers(runResult.supplier_results[0].supplier_id);
      }

      persistVariationRiskRun(runResult).catch((e) => {
        console.warn('[VariationRisk] Persistence failed:', e);
      });

      onRiskResultReady?.(runResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Variation risk analysis failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [projectId, trade, suppliers, userId, onRiskResultReady]);

  function toggleSection(key: string) {
    setExpandedSection((prev) => (prev === key ? null : key));
  }

  const selectedDriverResult = result?.supplier_results.find(
    (s) => s.supplier_id === selectedSupplierForDrivers
  );

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-amber-400" />
          <span className="text-sm font-bold text-white">Variation Risk Predictor</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 border border-slate-600/40">
            Advisory
          </span>
        </div>
        <button
          onClick={handleRun}
          disabled={loading || suppliers.length === 0}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : (
            <TrendingUp size={13} />
          )}
          {result ? 'Re-run Analysis' : 'Run Analysis'}
        </button>
      </div>

      {!result && !loading && (
        <div className="px-5 py-8 text-center">
          <TrendingUp size={28} className="text-slate-600 mx-auto mb-3" />
          <div className="text-sm font-semibold text-slate-300 mb-1">
            Variation Risk Analysis
          </div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            Estimates post-award variation exposure per supplier based on scope coverage,
            exclusion density, behaviour profiles, and quantity comparability.
            Results are advisory and commercially explainable.
          </p>
          {suppliers.length === 0 && (
            <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-amber-400">
              <AlertCircle size={13} />
              <span>No supplier data available. Run Auto-Adjudication first.</span>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="px-5 py-8 text-center">
          <RefreshCw size={24} className="animate-spin text-amber-400 mx-auto mb-3" />
          <div className="text-sm text-slate-400">Computing variation risk scores...</div>
        </div>
      )}

      {error && (
        <div className="mx-5 my-4 flex items-start gap-2 text-sm text-red-300 bg-red-500/10 rounded-lg p-3 border border-red-500/30">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="divide-y divide-slate-800/60">
          <div className="px-5 py-4">
            <RecommendationImpactBanner comparison={result.comparison} />
          </div>

          <SectionAccordion
            id="cards"
            label="Per-Supplier Risk Cards"
            expanded={expandedSection === 'cards'}
            onToggle={() => toggleSection('cards')}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {result.supplier_results.map((s) => (
                <VariationRiskDecisionCard key={s.supplier_id} result={s} />
              ))}
            </div>
          </SectionAccordion>

          <SectionAccordion
            id="comparison"
            label="Supplier Comparison Table"
            expanded={expandedSection === 'comparison'}
            onToggle={() => toggleSection('comparison')}
          >
            <SupplierVariationRiskComparison
              results={result.supplier_results}
              cheapestSubmittedId={result.comparison.cheapest_submitted_supplier_id}
              cheapestRiskAdjustedId={result.comparison.cheapest_risk_adjusted_supplier_id}
            />
          </SectionAccordion>

          <SectionAccordion
            id="ranking"
            label="Submitted vs Risk-Adjusted Ranking"
            expanded={expandedSection === 'ranking'}
            onToggle={() => toggleSection('ranking')}
          >
            <RiskAdjustedRankingPanel results={result.supplier_results} />
          </SectionAccordion>

          <SectionAccordion
            id="drivers"
            label="Risk Driver Detail"
            expanded={expandedSection === 'drivers'}
            onToggle={() => toggleSection('drivers')}
          >
            {result.supplier_results.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {result.supplier_results.map((s) => (
                  <button
                    key={s.supplier_id}
                    onClick={() => setSelectedSupplierForDrivers(s.supplier_id)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      selectedSupplierForDrivers === s.supplier_id
                        ? 'bg-amber-500 text-gray-900'
                        : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {s.supplier_name}
                  </button>
                ))}
              </div>
            )}
            {selectedDriverResult && (
              <RiskDriverPanel
                supplierName={selectedDriverResult.supplier_name}
                drivers={selectedDriverResult.main_risk_drivers}
              />
            )}
          </SectionAccordion>

          <SectionAccordion
            id="summary"
            label="Executive Summary"
            expanded={expandedSection === 'summary'}
            onToggle={() => toggleSection('summary')}
          >
            <div className="space-y-3">
              <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/40">
                <div className="text-xs font-semibold text-slate-400 mb-1.5">Cross-Supplier Summary</div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {result.comparison.executive_variation_risk_summary}
                </p>
              </div>
              <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/40">
                <div className="text-xs font-semibold text-slate-400 mb-1.5">Risk-Adjusted Comparison</div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {result.comparison.risk_adjusted_comparison_summary}
                </p>
              </div>
            </div>
          </SectionAccordion>

          <div className="flex items-start gap-2 px-5 py-3 text-xs text-slate-500">
            <Shield size={12} className="shrink-0 mt-0.5" />
            <span>
              Variation risk predictions are advisory only. All estimates are based on available commercial evidence
              and should be reviewed by a qualified QS before influencing award decisions.
              Config version: {result.config_version} · Generated: {new Date(result.generated_at).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionAccordion({
  id,
  label,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-800/30 transition-colors text-left"
        onClick={onToggle}
      >
        <span className="text-sm font-semibold text-slate-200">{label}</span>
        {expanded ? (
          <ChevronUp size={15} className="text-slate-400" />
        ) : (
          <ChevronDown size={15} className="text-slate-400" />
        )}
      </button>
      {expanded && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}
