import { useState } from 'react';
import { CheckCircle2, Save } from 'lucide-react';
import type { DecisionType, ReviewDecision, CorrectionPayload } from '../../../lib/modules/parsers/plumbing/review/reviewTypes';

interface PlumbingReviewDecisionPanelProps {
  caseId: string;
  existingDecisions: ReviewDecision[];
  onSubmit: (params: {
    decisionType: DecisionType;
    decisionSummary: string;
    decisionDetails: Record<string, unknown>;
    correctionPayload?: CorrectionPayload;
    confidenceScore?: number;
  }) => Promise<void>;
  disabled?: boolean;
}

const DECISION_OPTIONS: { key: DecisionType; label: string; description: string; requiresCorrection: boolean }[] = [
  { key: 'confirm_shadow_better',          label: 'Shadow parser is better',            description: 'Shadow output is more accurate than live. Strong regression candidate.',             requiresCorrection: false },
  { key: 'confirm_live_better',            label: 'Live parser is correct',             description: 'Live output is acceptable. Shadow deviation is acceptable.',                         requiresCorrection: false },
  { key: 'needs_rule_change',              label: 'Needs rule change',                  description: 'A specific parsing rule needs to be added or modified. Generates rule candidate.',   requiresCorrection: true  },
  { key: 'needs_manual_correction_pattern',label: 'Manual correction pattern',          description: 'A correction pattern was needed. Feeds pattern training library.',                   requiresCorrection: true  },
  { key: 'false_positive_alert',           label: 'False positive alert',               description: 'The risk/anomaly alert was incorrect. Improves predictive calibration.',             requiresCorrection: false },
  { key: 'false_negative_alert',           label: 'False negative alert',               description: 'An issue was missed by the alert system. Improves coverage.',                       requiresCorrection: false },
  { key: 'escalate',                       label: 'Escalate',                           description: 'Issue needs escalation to a senior reviewer or engineering.',                        requiresCorrection: false },
  { key: 'dismiss',                        label: 'Dismiss case',                       description: 'Case is not actionable or is a known non-issue.',                                   requiresCorrection: false },
];

const DECISION_LABEL_MAP: Record<DecisionType, string> = {
  confirm_shadow_better:           'Shadow is better',
  confirm_live_better:             'Live is correct',
  needs_rule_change:               'Rule change',
  needs_manual_correction_pattern: 'Correction pattern',
  false_positive_alert:            'False positive',
  false_negative_alert:            'False negative',
  escalate:                        'Escalated',
  dismiss:                         'Dismissed',
};

export default function PlumbingReviewDecisionPanel({
  existingDecisions,
  onSubmit,
  disabled,
}: PlumbingReviewDecisionPanelProps) {
  const [decisionType, setDecisionType] = useState<DecisionType | null>(null);
  const [summary, setSummary] = useState('');
  const [confidence, setConfidence] = useState<number>(7);
  const [correctionPhrase, setCorrectionPhrase] = useState('');
  const [correctionAction, setCorrectionAction] = useState<CorrectionPayload['correctAction']>('exclude');
  const [correctionNotes, setCorrectionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selected = DECISION_OPTIONS.find((d) => d.key === decisionType);

  async function handleSubmit() {
    if (!decisionType || !summary.trim()) return;
    setSubmitting(true);
    try {
      const correction: CorrectionPayload | undefined = selected?.requiresCorrection
        ? { targetRowPhrase: correctionPhrase, correctAction: correctionAction, notes: correctionNotes }
        : undefined;
      await onSubmit({ decisionType, decisionSummary: summary, decisionDetails: {}, correctionPayload: correction, confidenceScore: confidence });
      setDecisionType(null);
      setSummary('');
      setCorrectionPhrase('');
      setCorrectionNotes('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">Decision</h2>
      </div>

      {existingDecisions.length > 0 && (
        <div className="px-5 py-3 border-b border-gray-800">
          <div className="text-[10px] text-gray-500 mb-2">Previous decisions</div>
          <div className="space-y-1.5">
            {existingDecisions.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-xs bg-gray-800 border border-gray-700 px-3 py-2 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span className="text-gray-400 font-medium">{DECISION_LABEL_MAP[d.decision_type]}:</span>
                <span className="text-gray-300 flex-1 truncate">{d.decision_summary}</span>
                <span className="text-[10px] text-gray-600">{new Date(d.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-5 space-y-4">
        <div>
          <div className="text-[10px] text-gray-500 mb-2">Select decision type</div>
          <div className="grid grid-cols-1 gap-1.5">
            {DECISION_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setDecisionType(opt.key === decisionType ? null : opt.key)}
                className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  decisionType === opt.key
                    ? 'bg-teal-900/30 border-teal-600/50 text-white'
                    : 'border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white'
                }`}
              >
                <div className="text-xs font-medium">{opt.label}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{opt.description}</div>
              </button>
            ))}
          </div>
        </div>

        {decisionType && (
          <>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Decision summary *</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                placeholder="Describe what was found and what action is needed..."
                className="w-full text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none resize-none"
              />
            </div>

            {selected?.requiresCorrection && (
              <div className="space-y-3 bg-gray-800 border border-gray-700 rounded-xl p-4">
                <div className="text-[10px] text-gray-500">Correction payload</div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Target phrase or pattern</label>
                  <input
                    value={correctionPhrase}
                    onChange={(e) => setCorrectionPhrase(e.target.value)}
                    placeholder='e.g. "Total Incl GST"'
                    className="w-full text-xs bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Correct action</label>
                  <select
                    value={correctionAction}
                    onChange={(e) => setCorrectionAction(e.target.value as CorrectionPayload['correctAction'])}
                    className="w-full text-xs bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none"
                  >
                    <option value="exclude">Exclude from line items</option>
                    <option value="reclassify">Reclassify row</option>
                    <option value="flag_for_review">Flag for review</option>
                    <option value="create_rule">Create exclusion rule</option>
                    <option value="create_regression">Create regression case</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Additional notes</label>
                  <input
                    value={correctionNotes}
                    onChange={(e) => setCorrectionNotes(e.target.value)}
                    className="w-full text-xs bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none"
                    placeholder="Optional context for rule authors..."
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Reviewer confidence ({confidence}/10)</label>
              <input
                type="range"
                min={1}
                max={10}
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="w-full accent-teal-500"
              />
              <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                <span>Low</span><span>High</span>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!summary.trim() || submitting || disabled}
              className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-40 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {submitting ? 'Recording...' : 'Record decision'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
