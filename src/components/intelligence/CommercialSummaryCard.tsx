import { useState } from 'react';
import type { SupplierIntelligenceView } from '../../lib/intelligence/types';
import GateStatusBadge from './GateStatusBadge';
import BehaviourRiskBadge from './BehaviourRiskBadge';
import ScopeIntelligencePanel from './ScopeIntelligencePanel';
import BehaviourIntelligencePanel from './BehaviourIntelligencePanel';
import DecisionGatePanel from './DecisionGatePanel';

interface Props {
  view: SupplierIntelligenceView;
  isExpanded?: boolean;
}

type ActiveTab = 'scope' | 'behaviour' | 'gate';

function formatCurrency(val: number | null): string {
  if (val === null) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(val);
}

export default function CommercialSummaryCard({ view, isExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(isExpanded);
  const [activeTab, setActiveTab] = useState<ActiveTab>('scope');

  const { scopeSummary, behaviourProfile, gateResult, supplierName, isLowestPrice, isCheapestButGated } = view;
  const gateStatus = gateResult?.gateStatus ?? 'pending';

  return (
    <div className={`bg-slate-800/60 border rounded-xl overflow-hidden transition-all ${
      gateStatus === 'fail' ? 'border-red-500/30' :
      gateStatus === 'warn' ? 'border-amber-500/30' :
      gateStatus === 'pass' ? 'border-emerald-500/20' :
      'border-slate-600/40'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 hover:bg-slate-700/20 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h3 className="text-sm font-semibold text-white truncate">{supplierName}</h3>
              {isLowestPrice && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 font-medium flex-shrink-0">
                  Lowest Price
                </span>
              )}
              {isCheapestButGated && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 font-medium flex-shrink-0">
                  Price ≠ Recommendable
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <span className="text-xs text-slate-500">Submitted</span>
                <p className="text-sm font-semibold text-slate-200">{formatCurrency(view.submittedTotal)}</p>
              </div>
              {view.normalisedTotal !== null && view.normalisedTotal !== view.submittedTotal && (
                <div>
                  <span className="text-xs text-slate-500">Normalised</span>
                  <p className="text-sm font-semibold text-slate-200">{formatCurrency(view.normalisedTotal)}</p>
                </div>
              )}
              {scopeSummary && (
                <div>
                  <span className="text-xs text-slate-500">Core Coverage</span>
                  <p className={`text-sm font-semibold ${
                    scopeSummary.coreScope.coveragePct >= 80 ? 'text-emerald-400' :
                    scopeSummary.coreScope.coveragePct >= 60 ? 'text-amber-400' : 'text-red-400'
                  }`}>{scopeSummary.coreScope.coveragePct.toFixed(0)}%</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {behaviourProfile && (
              <BehaviourRiskBadge rating={behaviourProfile.behaviourRiskRating} size="sm" />
            )}
            <GateStatusBadge status={gateStatus} />
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-700/50">
          <div className="flex border-b border-slate-700/50">
            {(['scope', 'behaviour', 'gate'] as ActiveTab[]).map((tab) => {
              const labels: Record<ActiveTab, string> = {
                scope: 'Scope Analysis',
                behaviour: 'Behaviour Profile',
                gate: 'Decision Gate',
              };
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                    activeTab === tab
                      ? 'text-white border-b-2 border-sky-500 bg-sky-500/5'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>
          <div className="p-4">
            {activeTab === 'scope' && scopeSummary && (
              <ScopeIntelligencePanel summary={scopeSummary} supplierName={supplierName} />
            )}
            {activeTab === 'scope' && !scopeSummary && (
              <p className="text-sm text-slate-400 text-center py-6">No scope analysis data available.</p>
            )}
            {activeTab === 'behaviour' && (
              <BehaviourIntelligencePanel profile={behaviourProfile} />
            )}
            {activeTab === 'gate' && gateResult && (
              <DecisionGatePanel result={gateResult} />
            )}
            {activeTab === 'gate' && !gateResult && (
              <p className="text-sm text-slate-400 text-center py-6">Gate evaluation not yet run.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
