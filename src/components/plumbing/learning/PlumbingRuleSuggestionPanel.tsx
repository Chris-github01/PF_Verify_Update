import { useState } from 'react';
import { CheckCircle2, XCircle, FlaskConical, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { RuleSuggestionRecord } from '../../../lib/modules/parsers/plumbing/learning/learningTypes';
import { dbUpdateSuggestionStatus } from '../../../lib/db/learningDb';

interface PlumbingRuleSuggestionPanelProps {
  suggestions: RuleSuggestionRecord[];
  onRefresh: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  approved: 'text-teal-300 bg-teal-500/10 border-teal-500/30',
  rejected: 'text-red-300 bg-red-500/10 border-red-500/30',
  testing: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
  tested: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  adopted: 'text-green-300 bg-green-500/10 border-green-500/30',
};

const TYPE_LABELS: Record<string, string> = {
  add_summary_phrase: 'Add phrase',
  remove_summary_phrase: 'Remove phrase',
  adjust_threshold: 'Adjust threshold',
  adjust_weighting: 'Adjust weighting',
  add_exclusion_rule: 'Add exclusion rule',
  adjust_window: 'Adjust window',
};

export default function PlumbingRuleSuggestionPanel({ suggestions, onRefresh }: PlumbingRuleSuggestionPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const pending = suggestions.filter((s) => s.status === 'pending');
  const others = suggestions.filter((s) => s.status !== 'pending');

  async function handleAction(id: string, action: 'approved' | 'rejected' | 'testing') {
    setBusy(id);
    try {
      await dbUpdateSuggestionStatus(id, action, notes[id]);
      onRefresh();
    } finally {
      setBusy(null);
    }
  }

  if (suggestions.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-600">
        No rule suggestions yet. Run pattern analysis to generate suggestions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <SuggestionGroup
          title={`Pending Review (${pending.length})`}
          suggestions={pending}
          expanded={expanded}
          onExpand={setExpanded}
          busy={busy}
          notes={notes}
          onNotesChange={(id, v) => setNotes((prev) => ({ ...prev, [id]: v }))}
          onAction={handleAction}
          showActions
        />
      )}
      {others.length > 0 && (
        <SuggestionGroup
          title={`Reviewed (${others.length})`}
          suggestions={others}
          expanded={expanded}
          onExpand={setExpanded}
          busy={busy}
          notes={notes}
          onNotesChange={(id, v) => setNotes((prev) => ({ ...prev, [id]: v }))}
          onAction={handleAction}
          showActions={false}
        />
      )}
    </div>
  );
}

function SuggestionGroup({
  title, suggestions, expanded, onExpand, busy, notes, onNotesChange, onAction, showActions,
}: {
  title: string;
  suggestions: RuleSuggestionRecord[];
  expanded: string | null;
  onExpand: (id: string | null) => void;
  busy: string | null;
  notes: Record<string, string>;
  onNotesChange: (id: string, v: string) => void;
  onAction: (id: string, action: 'approved' | 'rejected' | 'testing') => void;
  showActions: boolean;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-800 bg-gray-900/80">
        <h3 className="text-xs font-semibold text-gray-400">{title}</h3>
      </div>
      <div className="divide-y divide-gray-800">
        {suggestions.map((s) => {
          const isOpen = expanded === s.id;
          return (
            <div key={s.id}>
              <button
                onClick={() => onExpand(isOpen ? null : s.id)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-800/40 transition-colors text-left"
              >
                <div className="text-gray-600">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{s.description}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-500">{TYPE_LABELS[s.suggestion_type] ?? s.suggestion_type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <ConfidenceBar score={s.confidence_score} />
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[s.status] ?? 'text-gray-400 bg-gray-800 border-gray-700'}`}>
                    {s.status}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 space-y-4 bg-gray-900/50">
                  <ImpactDetails suggestion={s} />
                  <RuleDetails suggestion={s} />
                  {showActions && s.status === 'pending' && (
                    <ReviewActions
                      id={s.id}
                      busy={busy === s.id}
                      notes={notes[s.id] ?? ''}
                      onNotesChange={(v) => onNotesChange(s.id, v)}
                      onAction={onAction}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? 'bg-teal-500' : pct >= 45 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-500 tabular-nums">{pct}%</span>
    </div>
  );
}

function ImpactDetails({ suggestion }: { suggestion: RuleSuggestionRecord }) {
  const impact = suggestion.expected_impact_json;
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatBox label="Patterns fixed" value={String(impact.fixesPatternCount)} />
      <StatBox label="Regression cases" value={String(impact.affectsRegressionCases)} />
      <StatBox label="Failure reduction" value={`${(impact.estimatedFailureReduction * 100).toFixed(0)}%`} />
      <div className="col-span-3 text-xs text-gray-400 italic">{impact.description}</div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function RuleDetails({ suggestion }: { suggestion: RuleSuggestionRecord }) {
  const rule = suggestion.proposed_rule_json;
  return (
    <div>
      <div className="text-[10px] text-gray-500 mb-1.5">Proposed rule</div>
      <pre className="text-[10px] font-mono bg-gray-800 border border-gray-700 px-3 py-2.5 rounded-lg text-gray-300 overflow-x-auto">
        {JSON.stringify(rule, null, 2)}
      </pre>
    </div>
  );
}

function ReviewActions({
  id, busy, notes, onNotesChange, onAction,
}: {
  id: string;
  busy: boolean;
  notes: string;
  onNotesChange: (v: string) => void;
  onAction: (id: string, action: 'approved' | 'rejected' | 'testing') => void;
}) {
  return (
    <div className="border-t border-gray-800 pt-4 space-y-3">
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">Review notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Add notes..."
          className="w-full text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onAction(id, 'approved')}
          disabled={busy}
          className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-40 transition-colors"
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
        </button>
        <button
          onClick={() => onAction(id, 'testing')}
          disabled={busy}
          className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg bg-cyan-800 hover:bg-cyan-700 text-white disabled:opacity-40 transition-colors"
        >
          <FlaskConical className="w-3.5 h-3.5" /> Mark for Testing
        </button>
        <button
          onClick={() => onAction(id, 'rejected')}
          disabled={busy}
          className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 transition-colors"
        >
          <XCircle className="w-3.5 h-3.5" /> Reject
        </button>
      </div>
    </div>
  );
}
