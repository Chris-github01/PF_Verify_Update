import { GitMerge, AlertTriangle, CheckCircle2, Eye } from 'lucide-react';
import type { CrossTradePattern } from '../../lib/intelligence/learning/crossTradePatterns';
import { TRADE_MODULES, TRADE_COLORS } from '../../lib/modules/tradeRegistry';

interface CrossTradePatternPanelProps {
  patterns: CrossTradePattern[];
  onDismiss?: (id: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  total_row:            'Total Row',
  header_row:           'Header Row',
  unit_mismatch:        'Unit Mismatch',
  classification_error: 'Classification',
  price_format:         'Price Format',
  quantity_format:      'Quantity Format',
  scope_gap:            'Scope Gap',
  custom:               'Custom',
};

const STATUS_CONFIG = {
  active:     { icon: AlertTriangle, color: 'text-amber-300', bg: 'bg-amber-900/20 border-amber-700/30' },
  resolved:   { icon: CheckCircle2, color: 'text-teal-300',  bg: 'bg-teal-900/20 border-teal-700/30' },
  monitoring: { icon: Eye,          color: 'text-cyan-300',  bg: 'bg-cyan-900/20 border-cyan-700/30' },
  dismissed:  { icon: CheckCircle2, color: 'text-gray-600',  bg: 'bg-gray-900 border-gray-800' },
};

export default function CrossTradePatternPanel({ patterns, onDismiss }: CrossTradePatternPanelProps) {
  if (patterns.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-gray-600">
        No cross-trade patterns detected yet. They are identified as intelligence data accumulates across modules.
      </div>
    );
  }

  const active = patterns.filter((p) => p.status === 'active' || p.status === 'monitoring');
  const resolved = patterns.filter((p) => p.status === 'resolved' || p.status === 'dismissed');

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Active patterns ({active.length})</div>
          {active.map((p) => <PatternRow key={p.id} pattern={p} onDismiss={onDismiss} />)}
        </div>
      )}
      {resolved.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-medium text-gray-600 uppercase tracking-wider">Resolved ({resolved.length})</div>
          {resolved.map((p) => <PatternRow key={p.id} pattern={p} />)}
        </div>
      )}
    </div>
  );
}

function PatternRow({ pattern, onDismiss }: { pattern: CrossTradePattern; onDismiss?: (id: string) => void }) {
  const cfg = STATUS_CONFIG[pattern.status] ?? STATUS_CONFIG.active;
  const Icon = cfg.icon;
  const totalOccurrences = Object.values(pattern.occurrence_counts).reduce((s, v) => s + v, 0);

  return (
    <div className={`border rounded-xl p-4 ${cfg.bg}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-[10px] font-mono text-gray-300 bg-gray-800 px-1.5 py-0.5 rounded">{pattern.pattern_key}</code>
            <span className="text-[10px] text-gray-500">{TYPE_LABELS[pattern.pattern_type] ?? pattern.pattern_type}</span>
            <span className="text-[10px] text-gray-600">{totalOccurrences} occurrences</span>
            <span className="text-[10px] text-gray-600">confidence: {pattern.confidence_score.toFixed(1)}</span>
          </div>
          <p className="text-xs text-gray-300 mt-1 leading-relaxed">{pattern.description}</p>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <GitMerge className="w-3 h-3 text-gray-600 shrink-0" />
            {pattern.affected_modules.map((mk) => {
              const mod = TRADE_MODULES[mk];
              const color = mod ? TRADE_COLORS[mod.trade_category] : 'text-gray-500';
              const count = pattern.occurrence_counts[mk] ?? 0;
              return (
                <span key={mk} className={`text-[10px] ${color}`}>
                  {mod?.module_name ?? mk}{count > 0 ? ` (${count})` : ' (0)'}
                </span>
              );
            })}
          </div>
        </div>

        {onDismiss && pattern.status === 'active' && (
          <button
            onClick={() => onDismiss(pattern.id)}
            className="text-[10px] text-gray-600 hover:text-white border border-gray-700 px-2 py-1 rounded-lg transition-colors shrink-0"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
