import { useState } from 'react';
import { ChevronDown, ChevronRight, Shield, AlertTriangle, Info, GitBranch } from 'lucide-react';
import type { NormalizedPenetrationLine } from '../../types/boqNormalisation.types';

interface Props {
  lines: NormalizedPenetrationLine[];
  supplierNames: Record<string, string>;
}

const RISK_BADGE: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-emerald-500/20 text-emerald-400',
  none: 'bg-slate-700/40 text-slate-400',
};

const INTENT_BADGE: Record<string, string> = {
  core_scope: 'bg-emerald-500/15 text-emerald-400',
  provisional_extra: 'bg-yellow-500/15 text-yellow-400',
  unit_entry_subset: 'bg-blue-500/15 text-blue-400',
  optional_scope: 'bg-slate-600/40 text-slate-400',
  insulation_dependency: 'bg-cyan-500/15 text-cyan-400',
  summary_only: 'bg-red-500/15 text-red-400',
  review_required: 'bg-orange-500/15 text-orange-400',
};

function fmtQty(v: number) {
  return v.toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}
function fmtCurrency(v: number) {
  return '$' + v.toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function NormalisedBoqTable({ lines, supplierNames }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [filterIntent, setFilterIntent] = useState<string>('all');

  const uniqueSuppliers = [...new Set(lines.map(l => l.supplierId))];
  const uniqueIntents = [...new Set(lines.map(l => l.intent))];

  const filtered = lines.filter(l => {
    if (filterSupplier !== 'all' && l.supplierId !== filterSupplier) return false;
    if (filterIntent !== 'all' && l.intent !== filterIntent) return false;
    return true;
  });

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (lines.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/60 p-8 text-center">
        <Info className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">No normalised BOQ lines available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-700/60 overflow-hidden">
      <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-700/60 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          Normalised BOQ ({filtered.length} lines)
        </h3>
        <div className="flex items-center gap-2 ml-auto">
          <select
            value={filterSupplier}
            onChange={e => setFilterSupplier(e.target.value)}
            className="text-xs bg-slate-700/60 border border-slate-600/60 rounded-md px-2 py-1.5 text-slate-300 focus:outline-none"
          >
            <option value="all">All Suppliers</option>
            {uniqueSuppliers.map(id => (
              <option key={id} value={id}>{supplierNames[id] || id}</option>
            ))}
          </select>
          <select
            value={filterIntent}
            onChange={e => setFilterIntent(e.target.value)}
            className="text-xs bg-slate-700/60 border border-slate-600/60 rounded-md px-2 py-1.5 text-slate-300 focus:outline-none"
          >
            <option value="all">All Intents</option>
            {uniqueIntents.map(i => (
              <option key={i} value={i}>{i.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-800/40 border-b border-slate-700/40">
            <tr>
              <th className="px-3 py-2 text-left text-slate-400 font-medium w-8"></th>
              <th className="px-3 py-2 text-left text-slate-400 font-medium">Description</th>
              <th className="px-3 py-2 text-left text-slate-400 font-medium">Supplier</th>
              <th className="px-3 py-2 text-left text-slate-400 font-medium">Intent</th>
              <th className="px-3 py-2 text-right text-slate-400 font-medium">Raw Qty</th>
              <th className="px-3 py-2 text-right text-slate-400 font-medium">Safe Qty</th>
              <th className="px-3 py-2 text-right text-slate-400 font-medium">Safe Value</th>
              <th className="px-3 py-2 text-center text-slate-400 font-medium">Dup Risk</th>
              <th className="px-3 py-2 text-left text-slate-400 font-medium">System</th>
              <th className="px-3 py-2 text-center text-slate-400 font-medium">Alts</th>
              <th className="px-3 py-2 text-center text-slate-400 font-medium">Sources</th>
              <th className="px-3 py-2 text-center text-slate-400 font-medium">Conf.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {filtered.map(line => {
              const isOpen = expanded.has(line.normalizedLineId);
              return (
                <>
                  <tr
                    key={line.normalizedLineId}
                    className="hover:bg-slate-800/30 cursor-pointer transition-colors"
                    onClick={() => toggle(line.normalizedLineId)}
                  >
                    <td className="px-3 py-2.5 text-center">
                      {isOpen ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-slate-200 font-medium">{line.canonicalDescription}</span>
                      {line.quantityProvisional > 0 && (
                        <span className="ml-2 text-yellow-400 text-[10px] font-medium">[+{fmtQty(line.quantityProvisional)} prov.]</span>
                      )}
                      {line.quantityOptional > 0 && (
                        <span className="ml-1 text-slate-500 text-[10px]">[opt.]</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">{supplierNames[line.supplierId] || line.supplierId}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${INTENT_BADGE[line.intent] || ''}`}>
                        {line.intent.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-400">{fmtQty(line.quantityRawSum)}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-400 font-medium">{fmtQty(line.quantitySafe)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-200">{fmtCurrency(line.safeValueTotal)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${RISK_BADGE[line.duplicateRiskLevel]}`}>
                        {line.duplicateRiskLevel}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 max-w-[120px] truncate">{line.chosenSystem || '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      {line.alternativeSystems.length > 0 ? (
                        <span className="flex items-center justify-center gap-1 text-orange-400">
                          <GitBranch className="w-3 h-3" />
                          {line.alternativeSystems.length}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-400">
                      {line.includedSourceRefs.length + line.excludedSourceRefs.length}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-[10px] font-medium ${line.confidence >= 0.8 ? 'text-emerald-400' : line.confidence >= 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {(line.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${line.normalizedLineId}-detail`} className="bg-slate-900/40">
                      <td colSpan={12} className="px-4 py-3">
                        <SourceTraceDrawer line={line} />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourceTraceDrawer({ line }: { line: NormalizedPenetrationLine }) {
  return (
    <div className="space-y-3">
      {line.reasoning.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-400 mb-1">Normalisation Reasoning</div>
          <ul className="space-y-1">
            {line.reasoning.map((r, i) => (
              <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                <span className="text-slate-500 flex-shrink-0 mt-0.5">→</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {line.includedSourceRefs.length > 0 && (
          <div>
            <div className="text-xs font-medium text-emerald-400 mb-1">Included Source Lines ({line.includedSourceRefs.length})</div>
            <div className="space-y-1">
              {line.includedSourceRefs.map((ref, i) => (
                <div key={i} className="text-xs bg-emerald-500/5 border border-emerald-500/20 rounded px-2 py-1">
                  <div className="text-slate-200">{ref.sourceDescription}</div>
                  {ref.sourceSection && <div className="text-slate-500">§ {ref.sourceSection}</div>}
                  <div className="text-slate-400 mt-0.5">Qty: {ref.rawQuantity} · Rate: ${ref.rawUnitRate} · Total: ${ref.rawTotal.toFixed(0)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {line.excludedSourceRefs.length > 0 && (
          <div>
            <div className="text-xs font-medium text-red-400 mb-1">Excluded Source Lines ({line.excludedSourceRefs.length})</div>
            <div className="space-y-1">
              {line.excludedSourceRefs.map((ref, i) => (
                <div key={i} className="text-xs bg-red-500/5 border border-red-500/20 rounded px-2 py-1">
                  <div className="text-slate-200">{ref.sourceDescription}</div>
                  {ref.sourceSection && <div className="text-slate-500">§ {ref.sourceSection}</div>}
                  <div className="text-slate-400 mt-0.5">Qty: {ref.rawQuantity} · Rate: ${ref.rawUnitRate} · Total: ${ref.rawTotal.toFixed(0)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {line.alternativeSystems.length > 0 && (
        <div>
          <div className="text-xs font-medium text-orange-400 mb-1">Alternative Systems</div>
          <div className="flex flex-wrap gap-1">
            {line.alternativeSystems.map((s, i) => (
              <span key={i} className="text-xs bg-orange-500/10 text-orange-300 border border-orange-500/20 rounded px-2 py-0.5">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
